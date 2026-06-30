//go:build windows

package collector

// USB / removable-media monitor.
// Polls for new drive letters every 2 seconds, emits usb.connected /
// usb.disconnected events, and starts a watchDirectory goroutine per
// newly inserted drive so every file copy is captured as file.copied_to_usb.

import (
	"log"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"

	"github.com/profyk/the-eye-agent/queue"
)

const (
	driveTypeRemovable = uint32(2)
)

var (
	procGetLogicalDrives = kernel32Fw.NewProc("GetLogicalDrives")
	procGetDriveTypeW    = kernel32Fw.NewProc("GetDriveTypeW")
	procGetVolumeInfoW   = kernel32Fw.NewProc("GetVolumeInformationW")
)

// runUSBMonitor polls every 2 s for removable drives.
// Blocks forever; call in a goroutine.
func (c *Collector) runUSBMonitor() {
	known := c.snapshotRemovableDrives()
	log.Printf("[usb] monitor started, initial drives=%v", driveList(known))

	for {
		time.Sleep(2 * time.Second)
		current := c.snapshotRemovableDrives()
		user := windowsCurrentUser()

		// Newly inserted drives
		for letter, label := range current {
			if _, ok := known[letter]; !ok {
				log.Printf("[usb] connected %s (%s)", letter, label)
				c.q.Enqueue(&queue.Event{
					EventType:     "usb.connected",
					EventCategory: "removable_media",
					Outcome:       "success",
					Severity:      "high",
					ActorType:     "user",
					ActorID:       user,
					Metadata: map[string]interface{}{
						"drive_letter": letter,
						"volume_label": label,
						"host":         c.host,
					},
				})
				// Watch for files copied TO this drive.
				go c.watchDirectory(letter+`\`, true, user, label)
			}
		}

		// Removed drives
		for letter, label := range known {
			if _, ok := current[letter]; !ok {
				log.Printf("[usb] disconnected %s (%s)", letter, label)
				c.q.Enqueue(&queue.Event{
					EventType:     "usb.disconnected",
					EventCategory: "removable_media",
					Outcome:       "success",
					Severity:      "info",
					ActorType:     "user",
					ActorID:       user,
					Metadata: map[string]interface{}{
						"drive_letter": letter,
						"volume_label": label,
						"host":         c.host,
					},
				})
			}
		}

		known = current
	}
}

// snapshotRemovableDrives returns a map of drive letter → volume label
// for all currently connected removable drives.
func (c *Collector) snapshotRemovableDrives() map[string]string {
	drives := make(map[string]string)
	r, _, _ := procGetLogicalDrives.Call()
	mask := uint32(r)
	for i := 0; i < 26; i++ {
		if mask&(1<<uint(i)) == 0 {
			continue
		}
		letter := string(rune('A'+i)) + ":"
		rootPtr, _ := syscall.UTF16PtrFromString(letter + `\`)
		t, _, _ := procGetDriveTypeW.Call(uintptr(unsafe.Pointer(rootPtr)))
		if uint32(t) == driveTypeRemovable {
			drives[letter] = volumeLabel(letter)
		}
	}
	return drives
}

func volumeLabel(driveLetter string) string {
	rootPtr, _ := syscall.UTF16PtrFromString(driveLetter + `\`)
	var nameBuf [256]uint16
	var fsName [256]uint16
	var serial, maxComp, flags uint32
	r, _, _ := procGetVolumeInfoW.Call(
		uintptr(unsafe.Pointer(rootPtr)),
		uintptr(unsafe.Pointer(&nameBuf[0])),
		uintptr(len(nameBuf)),
		uintptr(unsafe.Pointer(&serial)),
		uintptr(unsafe.Pointer(&maxComp)),
		uintptr(unsafe.Pointer(&flags)),
		uintptr(unsafe.Pointer(&fsName[0])),
		uintptr(len(fsName)),
	)
	if r != 0 {
		lbl := windows.UTF16ToString(nameBuf[:])
		if lbl != "" {
			return lbl
		}
	}
	return "USB Drive"
}

func driveList(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
