//go:build windows

// THE EYE Agent — Windows security event collector with tamper-evident delivery.
// Runs silently in the system tray with no console window.
// Build: go build -ldflags="-H windowsgui -s -w" -o eye-agent.exe
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"syscall"
	"unsafe"

	"github.com/getlantern/systray"

	"github.com/profyk/the-eye-agent/collector"
	"github.com/profyk/the-eye-agent/config"
	"github.com/profyk/the-eye-agent/queue"
	"github.com/profyk/the-eye-agent/security"
	"github.com/profyk/the-eye-agent/shipper"
	eyetray "github.com/profyk/the-eye-agent/tray"
)

const Version = "1.1.0"

var (
	flagSetup     = flag.Bool("setup", false, "run interactive setup wizard (opens console)")
	flagInstall   = flag.Bool("install", false, "add agent to Windows startup registry")
	flagUninstall = flag.Bool("uninstall", false, "remove agent from Windows startup registry")
	flagVersion   = flag.Bool("version", false, "print version and exit")
)

func main() {
	flag.Parse()

	if *flagVersion {
		allocConsole()
		fmt.Println("the-eye-agent", Version)
		return
	}

	if *flagSetup {
		allocConsole()
		cfg, err := config.Setup()
		if err != nil {
			fmt.Fprintf(os.Stderr, "setup error: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Config saved to %s\n", cfg.DataDir)
		fmt.Println("Run eye-agent.exe --install to add to Windows startup.")
		waitForKey()
		return
	}

	dataDir, err := config.DataDirectory()
	if err != nil {
		log.Fatalf("data dir: %v", err)
	}

	if *flagInstall {
		allocConsole()
		if err := installStartup(dataDir); err != nil {
			fmt.Fprintf(os.Stderr, "install error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("THE EYE Agent added to Windows startup.")
		waitForKey()
		return
	}

	if *flagUninstall {
		allocConsole()
		if err := uninstallStartup(); err != nil {
			fmt.Fprintf(os.Stderr, "uninstall error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("THE EYE Agent removed from Windows startup.")
		waitForKey()
		return
	}

	// ── Normal (tray) mode ────────────────────────────────────────────────────

	// Redirect log to a size-capped log file. There is no console in windowsgui
	// mode. We cap at 10 MB and rotate once: agent.log → agent.log.1, then
	// start fresh. This keeps total log disk usage under ~20 MB indefinitely.
	logPath := filepath.Join(dataDir, "agent.log")
	rotateLogs(logPath, 10<<20) // 10 MB cap
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}
	log.Printf("THE EYE Agent %s starting", Version)

	// Binary integrity check.
	intact, currentHash := security.CheckIntegrity(dataDir)
	if !intact {
		log.Printf("WARN integrity mismatch — hash %s", currentHash)
	}

	// Config.
	cfg, cfgErr := config.Load()
	if cfgErr != nil {
		log.Printf("WARN config not found: %v — tray will show unconfigured state", cfgErr)
	}

	// Queue.
	q, err := queue.New(dataDir)
	if err != nil {
		log.Fatalf("queue: %v", err)
	}

	// Shipper (nil safe — shipper.New handles nil cfg gracefully via a no-op loop).
	var s *shipper.Shipper
	if cfg != nil {
		s = shipper.New(cfg, q)
		go s.Run()

		// Register this machine and start heartbeat for online presence.
		hostname, _ := os.Hostname()
		s.Register(hostname, runtime.GOOS, Version)
		go s.RunHeartbeat()

		// Report self-integrity to platform.
		severity := "info"
		eventType := "agent.startup"
		if !intact {
			severity = "critical"
			eventType = "agent.tampered"
		}
		q.Enqueue(&queue.Event{
			EventType:     eventType,
			EventCategory: "system",
			Outcome:       "success",
			Severity:      severity,
			ActorType:     "agent",
			ActorID:       cfg.AgentID,
			Metadata: map[string]interface{}{
				"agent_version": Version,
				"integrity_ok":  intact,
				"binary_hash":   currentHash,
				"machine_id":    cfg.MachineID,
			},
		})

		// Start event log collectors.
		cl := collector.New(cfg, q)
		go cl.Run()
	}

	// Graceful nil shipper for tray.
	if s == nil {
		s = shipper.New(&config.Config{ServerURL: "", AgentID: "unconfigured"}, q)
	}
	if cfg == nil {
		cfg = &config.Config{ServerURL: "#", AgentID: "unconfigured", DataDir: dataDir}
	}

	systray.Run(eyetray.OnReady(cfg, q, s, intact), eyetray.OnExit(cfg, q))
}

// ── Log rotation ─────────────────────────────────────────────────────────────

// rotateLogs renames path → path+".1" when the file exceeds maxBytes,
// capping total log disk usage at ~2× maxBytes.
func rotateLogs(path string, maxBytes int64) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxBytes {
		return
	}
	_ = os.Remove(path + ".1")
	_ = os.Rename(path, path+".1")
}

// ── Windows registry startup ──────────────────────────────────────────────────

var (
	regKeyPath = `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
	regValue   = "TheEyeAgent"
)

func installStartup(dataDir string) error {
	advapi32 := syscall.NewLazyDLL("advapi32.dll")
	regOpenKeyEx := advapi32.NewProc("RegOpenKeyExW")
	regSetValueEx := advapi32.NewProc("RegSetValueExW")
	regCloseKey := advapi32.NewProc("RegCloseKey")

	exe, _ := os.Executable()
	const HKEY_CURRENT_USER = 0x80000001
	const KEY_SET_VALUE = 0x0002

	var hKey uintptr
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	r, _, err := regOpenKeyEx.Call(HKEY_CURRENT_USER, uintptr(unsafe.Pointer(keyPath)), 0, KEY_SET_VALUE, uintptr(unsafe.Pointer(&hKey)))
	if r != 0 {
		return fmt.Errorf("RegOpenKeyEx: %v", err)
	}
	defer regCloseKey.Call(hKey)

	valueName, _ := syscall.UTF16PtrFromString(regValue)
	data, _ := syscall.UTF16FromString(`"` + exe + `"`)
	const REG_SZ = 1
	r, _, err = regSetValueEx.Call(
		hKey,
		uintptr(unsafe.Pointer(valueName)),
		0,
		REG_SZ,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)*2),
	)
	if r != 0 {
		return fmt.Errorf("RegSetValueEx: %v", err)
	}
	return nil
}

func uninstallStartup() error {
	advapi32 := syscall.NewLazyDLL("advapi32.dll")
	regOpenKeyEx := advapi32.NewProc("RegOpenKeyExW")
	regDeleteValue := advapi32.NewProc("RegDeleteValueW")
	regCloseKey := advapi32.NewProc("RegCloseKey")

	const HKEY_CURRENT_USER = 0x80000001
	const KEY_SET_VALUE = 0x0002

	var hKey uintptr
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	r, _, err := regOpenKeyEx.Call(HKEY_CURRENT_USER, uintptr(unsafe.Pointer(keyPath)), 0, KEY_SET_VALUE, uintptr(unsafe.Pointer(&hKey)))
	if r != 0 {
		return fmt.Errorf("RegOpenKeyEx: %v", err)
	}
	defer regCloseKey.Call(hKey)

	valueName, _ := syscall.UTF16PtrFromString(regValue)
	r, _, err = regDeleteValue.Call(hKey, uintptr(unsafe.Pointer(valueName)))
	if r != 0 {
		return fmt.Errorf("RegDeleteValue: %v", err)
	}
	return nil
}

// ── Console helpers ───────────────────────────────────────────────────────────

// allocConsole attaches to the parent console or creates a new one so that
// --setup, --install, and --version can print output from a windowsgui binary.
func allocConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	attachConsole := kernel32.NewProc("AttachConsole")
	allocConsole := kernel32.NewProc("AllocConsole")

	const ATTACH_PARENT_PROCESS = ^uintptr(0)
	r, _, _ := attachConsole.Call(ATTACH_PARENT_PROCESS)
	if r == 0 {
		allocConsole.Call()
	}

	// Reopen standard handles to the console.
	conin, _ := os.OpenFile("CONIN$", os.O_RDONLY, 0)
	conout, _ := os.OpenFile("CONOUT$", os.O_WRONLY, 0)
	if conin != nil {
		os.Stdin = conin
	}
	if conout != nil {
		os.Stdout = conout
		os.Stderr = conout
		log.SetOutput(conout)
	}
}

// waitForKey pauses so the user can read console output before the window closes.
func waitForKey() {
	fmt.Println("\nPress Enter to exit…")
	buf := make([]byte, 1)
	os.Stdin.Read(buf)
}
