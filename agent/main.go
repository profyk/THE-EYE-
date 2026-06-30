// THE EYE Agent — cross-platform security event collector with tamper-evident delivery.
// Runs in the system tray (Windows/macOS) or notification area (Linux).
//
// Build:
//   Windows: go build -ldflags="-H windowsgui -s -w" -o eye-agent.exe .
//   macOS:   go build -ldflags="-s -w" -o eye-agent-mac .
//   Linux:   go build -ldflags="-s -w" -o eye-agent-linux .
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"

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
	flagSetup     = flag.Bool("setup", false, "run interactive setup wizard")
	flagInstall   = flag.Bool("install", false, "add agent to system startup")
	flagUninstall = flag.Bool("uninstall", false, "remove agent from system startup")
	flagVersion   = flag.Bool("version", false, "print version and exit")
)

func main() {
	flag.Parse()

	if *flagVersion {
		allocConsole()
		fmt.Println("the-eye-agent", Version, runtime.GOOS+"/"+runtime.GOARCH)
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
		fmt.Println("Run with --install to add to system startup.")
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
		fmt.Println("THE EYE Agent added to system startup.")
		waitForKey()
		return
	}

	if *flagUninstall {
		allocConsole()
		if err := uninstallStartup(); err != nil {
			fmt.Fprintf(os.Stderr, "uninstall error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("THE EYE Agent removed from system startup.")
		waitForKey()
		return
	}

	// ── Normal (tray) mode ────────────────────────────────────────────────────

	logPath := filepath.Join(dataDir, "agent.log")
	rotateLogs(logPath, 10<<20)
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err == nil {
		log.SetOutput(logFile)
		defer logFile.Close()
	}
	log.Printf("THE EYE Agent %s starting on %s/%s", Version, runtime.GOOS, runtime.GOARCH)

	intact, currentHash := security.CheckIntegrity(dataDir)
	if !intact {
		log.Printf("WARN integrity mismatch — hash %s", currentHash)
	}

	cfg, cfgErr := config.Load()
	if cfgErr != nil {
		log.Printf("WARN config not found: %v — tray will show unconfigured state", cfgErr)
	}

	q, err := queue.New(dataDir)
	if err != nil {
		log.Fatalf("queue: %v", err)
	}

	var s *shipper.Shipper
	if cfg != nil {
		s = shipper.New(cfg, q)
		go s.Run()

		hostname, _ := os.Hostname()
		s.Register(hostname, runtime.GOOS, Version)
		go s.RunHeartbeat()

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
				"platform":      runtime.GOOS + "/" + runtime.GOARCH,
			},
		})

		cl := collector.New(cfg, q)
		go cl.Run()
	}

	if s == nil {
		s = shipper.New(&config.Config{ServerURL: "", AgentID: "unconfigured"}, q)
	}
	if cfg == nil {
		cfg = &config.Config{ServerURL: "#", AgentID: "unconfigured", DataDir: dataDir}
	}

	systray.Run(eyetray.OnReady(cfg, q, s, intact), eyetray.OnExit(cfg, q))
}

// rotateLogs renames path → path+".1" when the file exceeds maxBytes.
func rotateLogs(path string, maxBytes int64) {
	info, err := os.Stat(path)
	if err != nil || info.Size() < maxBytes {
		return
	}
	_ = os.Remove(path + ".1")
	_ = os.Rename(path, path+".1")
}
