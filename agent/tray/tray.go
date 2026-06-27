package tray

import (
	"fmt"
	"time"

	"github.com/getlantern/systray"

	"github.com/profyk/the-eye-agent/config"
	"github.com/profyk/the-eye-agent/queue"
	"github.com/profyk/the-eye-agent/shipper"
)

const (
	eyeOpenDuration   = 3 * time.Second
	eyeClosedDuration = 300 * time.Millisecond
)

// OnReady returns the systray onReady callback that wires up the tray UI.
func OnReady(cfg *config.Config, q *queue.Queue, s *shipper.Shipper, intact bool) func() {
	return func() {
		systray.SetIcon(EyeOpenICO())
		systray.SetTitle("THE EYE")
		systray.SetTooltip("THE EYE — Security Monitor")

		// ── Menu items ────────────────────────────────────────────────────
		mStatus := systray.AddMenuItem("● Status: connecting…", "Agent status")
		mStatus.Disable()

		mQueueDepth := systray.AddMenuItem("Queue: 0 events", "Events waiting to be shipped")
		mQueueDepth.Disable()

		systray.AddSeparator()

		mDashboard := systray.AddMenuItem("Open Dashboard", "Open THE EYE dashboard in browser")
		systray.AddSeparator()

		integrityLabel := "Integrity: ✓ OK"
		if !intact {
			integrityLabel = "Integrity: ✕ TAMPERED — see dashboard"
		}
		mIntegrity := systray.AddMenuItem(integrityLabel, "Binary self-integrity status")
		mIntegrity.Disable()

		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Quit THE EYE Agent", "Stop the agent")

		// ── Blink goroutine ───────────────────────────────────────────────
		go blink()

		// ── Status refresh goroutine ──────────────────────────────────────
		go func() {
			tick := time.NewTicker(5 * time.Second)
			defer tick.Stop()
			for range tick.C {
				sent, errs, lastErr := s.Stats()
				depth := q.Depth()
				dropped := q.Dropped()

				status := fmt.Sprintf("● Sent: %d | Errors: %d", sent, errs)
				if lastErr != "" {
					status = fmt.Sprintf("✕ Error: %s", truncStr(lastErr, 50))
				}
				mStatus.SetTitle(status)

				qStr := fmt.Sprintf("Queue: %d events", depth)
				if dropped > 0 {
					qStr += fmt.Sprintf(" (%d dropped)", dropped)
				}
				mQueueDepth.SetTitle(qStr)
			}
		}()

		// ── Menu click handlers ───────────────────────────────────────────
		go func() {
			for range mDashboard.ClickedCh {
				openBrowser(cfg.ServerURL)
			}
		}()

		go func() {
			<-mQuit.ClickedCh
			systray.Quit()
		}()
	}
}

// OnExit is called when the tray is about to quit.
func OnExit(cfg *config.Config, q *queue.Queue) func() {
	return func() {
		// Enqueue shutdown event before the process dies.
		// The queue flushes on next agent start.
		q.Enqueue(&queue.Event{
			EventType:     "agent.shutdown",
			EventCategory: "system",
			Outcome:       "success",
			Severity:      "info",
			ActorType:     "agent",
			ActorID:       cfg.AgentID,
		})
	}
}

// blink alternates between the open-eye and closed-eye icons.
func blink() {
	openIcon := EyeOpenICO()
	closedIcon := EyeClosedICO()
	for {
		systray.SetIcon(openIcon)
		time.Sleep(eyeOpenDuration)
		systray.SetIcon(closedIcon)
		time.Sleep(eyeClosedDuration)
	}
}

func truncStr(s string, max int) string {
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
