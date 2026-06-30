//go:build windows

package collector

// File-system activity monitoring via ReadDirectoryChangesW.
// Watches all user profile directories recursively and emits structured
// audit events for file creates, deletes, modifications, and renames.
// USB drive monitoring lives in usb_windows.go.

import (
	"encoding/binary"
	"log"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/profyk/the-eye-agent/queue"
)

// ── Win32 handles (shared within this package) ────────────────────────────────

var (
	kernel32Fw       = windows.NewLazySystemDLL("kernel32.dll")
	procRDCW         = kernel32Fw.NewProc("ReadDirectoryChangesW")
	advapi32Fw       = windows.NewLazySystemDLL("advapi32.dll")
	procGetUserNameW = advapi32Fw.NewProc("GetUserNameW")
)

// ── Constants ─────────────────────────────────────────────────────────────────

const (
	fileListDirectory       = uint32(0x0001)
	fileShareReadWriteDel   = uint32(0x01 | 0x02 | 0x04)
	openExistingFlag        = uint32(3)
	fileFlagBackupSemantics = uint32(0x02000000)

	notifyChangeName     = uint32(0x01 | 0x02) // FILE_NOTIFY_CHANGE_FILE_NAME | DIR_NAME
	notifyChangeSize     = uint32(0x00000008)
	notifyChangeWrite    = uint32(0x00000010)
	notifyChangeCreation = uint32(0x00000040)
	watchAllNotify       = notifyChangeName | notifyChangeSize | notifyChangeWrite | notifyChangeCreation

	actionAdded       = uint32(1)
	actionRemoved     = uint32(2)
	actionModified    = uint32(3)
	actionRenameOld   = uint32(4)
	actionRenameNew   = uint32(5)
)

// noisyExts skips extensions that generate constant noise with no audit value.
var noisyExts = map[string]bool{
	".tmp": true, ".temp": true, ".log": true, ".db-shm": true,
	".db-wal": true, ".lock": true, ".etl": true, ".bak": true,
	".crdownload": true, ".part": true, ".partial": true,
	".swp": true, ".swo": true, ".pyc": true,
}

// noisyPathParts: paths containing these segments are suppressed.
var noisyPathParts = []string{
	`\AppData\Local\Temp\`,
	`\AppData\Local\Microsoft\Windows\INetCache\`,
	`\AppData\Local\Microsoft\Windows\WebCache\`,
	`\AppData\Roaming\Microsoft\Windows\Recent\`,
	`\AppData\Local\Packages\`,
	`\AppData\Local\CrashDumps\`,
	`\Windows\Temp\`,
	`\Windows\Prefetch\`,
	`\Microsoft\Windows\UsrClass\`,
	`\.git\`, `\node_modules\`, `\__pycache__\`,
}

// ── Entry point ───────────────────────────────────────────────────────────────

// runFileWatcher starts file-system activity monitoring for user directories.
// Blocks forever; call in a goroutine.
func (c *Collector) runFileWatcher() {
	user := windowsCurrentUser()

	// Watch all user profile directories (C:\Users) — covers Desktop,
	// Documents, Downloads, AppData (filtered), etc. for every account.
	sysRoot := os.Getenv("SYSTEMDRIVE")
	if sysRoot == "" {
		sysRoot = "C:"
	}
	usersRoot := filepath.Join(sysRoot, "Users")

	log.Printf("[filewatcher] starting, root=%s user=%s", usersRoot, user)
	c.watchDirectory(usersRoot, true, user, "")

	select {} // keep goroutine alive if watchDirectory ever returns
}

// ── Directory watcher ─────────────────────────────────────────────────────────

// watchDirectory opens a ReadDirectoryChangesW loop on dir.
// driveLabel is non-empty when watching a removable (USB) drive.
func (c *Collector) watchDirectory(dir string, recursive bool, user, driveLabel string) {
	dirPtr, err := syscall.UTF16PtrFromString(dir)
	if err != nil {
		log.Printf("[filewatcher] invalid path %s: %v", dir, err)
		return
	}

	handle, err := windows.CreateFile(
		dirPtr,
		fileListDirectory,
		fileShareReadWriteDel,
		nil,
		openExistingFlag,
		fileFlagBackupSemantics,
		0,
	)
	if err != nil {
		log.Printf("[filewatcher] open %s: %v", dir, err)
		return
	}
	defer windows.CloseHandle(handle)
	log.Printf("[filewatcher] watching %s", dir)

	buf := make([]byte, 131072) // 128 KB — handles busy directories without overflow
	var renamedOld string

	for {
		var returned uint32
		subTree := uintptr(0)
		if recursive {
			subTree = 1
		}
		r, _, e := procRDCW.Call(
			uintptr(handle),
			uintptr(unsafe.Pointer(&buf[0])),
			uintptr(len(buf)),
			subTree,
			uintptr(watchAllNotify),
			uintptr(unsafe.Pointer(&returned)),
			0, 0,
		)
		if r == 0 {
			log.Printf("[filewatcher] ReadDirectoryChangesW on %s: %v", dir, e)
			time.Sleep(5 * time.Second)
			return // caller goroutine in usb_windows will exit cleanly on USB removal
		}
		if returned == 0 {
			continue
		}

		offset := 0
		for {
			if offset+12 > int(returned) {
				break
			}
			next   := binary.LittleEndian.Uint32(buf[offset:])
			action := binary.LittleEndian.Uint32(buf[offset+4:])
			nlen   := binary.LittleEndian.Uint32(buf[offset+8:])
			if offset+12+int(nlen) > int(returned) {
				break
			}
			u16 := make([]uint16, nlen/2)
			for i := range u16 {
				u16[i] = binary.LittleEndian.Uint16(buf[offset+12+i*2:])
			}
			relPath := windows.UTF16ToString(u16)
			full := filepath.Join(dir, relPath)

			if !isNoisyPath(full) {
				switch action {
				case actionAdded:
					evType := "file.created"
					if driveLabel != "" {
						evType = "file.copied_to_usb"
					}
					sev := "info"
					if driveLabel != "" {
						sev = "critical"
					}
					c.emitFileEvent(evType, categoryFor(driveLabel), sev, full, "", user, driveLabel)

				case actionRemoved:
					c.emitFileEvent("file.deleted", "file_activity", "high", full, "", user, driveLabel)

				case actionModified:
					if driveLabel == "" { // skip USB modifications, only care about copies (adds)
						c.emitFileEvent("file.modified", "file_activity", "info", full, "", user, "")
					}

				case actionRenameOld:
					renamedOld = full

				case actionRenameNew:
					if renamedOld != "" {
						if strings.Contains(strings.ToLower(full), `$recycle.bin`) {
							// Sent to Recycle Bin — semantically a delete
							c.emitFileEvent("file.deleted", "file_activity", "high", renamedOld, full, user, "")
						} else {
							c.emitFileEvent("file.renamed", "file_activity", "info", renamedOld, full, user, "")
						}
						renamedOld = ""
					}
				}
			}

			if next == 0 {
				break
			}
			offset += int(next)
		}
	}
}

// ── Event emission ────────────────────────────────────────────────────────────

func (c *Collector) emitFileEvent(evType, category, severity, path, newPath, user, driveLabel string) {
	fileName := filepath.Base(path)
	meta := map[string]interface{}{
		"file_path": path,
		"file_name": fileName,
		"file_ext":  strings.ToLower(filepath.Ext(path)),
		"directory": filepath.Dir(path),
		"host":      c.host,
	}
	if newPath != "" {
		meta["new_path"] = newPath
		meta["new_name"] = filepath.Base(newPath)
	}
	if driveLabel != "" {
		meta["drive_label"] = driveLabel
		meta["drive_type"] = "removable"
	}

	c.q.Enqueue(&queue.Event{
		EventType:     evType,
		EventCategory: category,
		Outcome:       "success",
		Severity:      severity,
		ActorType:     "user",
		ActorID:       user,
		Metadata:      meta,
	})
}

func categoryFor(driveLabel string) string {
	if driveLabel != "" {
		return "data_exfiltration"
	}
	return "file_activity"
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func windowsCurrentUser() string {
	var buf [256]uint16
	size := uint32(len(buf))
	procGetUserNameW.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if size > 0 {
		return windows.UTF16ToString(buf[:size])
	}
	return "unknown"
}

func isNoisyPath(path string) bool {
	base := strings.ToLower(filepath.Base(path))
	ext := strings.ToLower(filepath.Ext(path))
	if noisyExts[ext] {
		return true
	}
	if strings.HasPrefix(base, "~$") { // Office temp files
		return true
	}
	if base == "thumbs.db" || base == ".ds_store" || base == "desktop.ini" {
		return true
	}
	low := strings.ToLower(path)
	for _, seg := range noisyPathParts {
		if strings.Contains(low, strings.ToLower(seg)) {
			return true
		}
	}
	return false
}
