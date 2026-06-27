// Package shipper batches queued events and sends them to the THE EYE backend.
package shipper

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync/atomic"
	"time"

	"github.com/profyk/the-eye-agent/config"
	"github.com/profyk/the-eye-agent/queue"
)

const (
	batchSize    = 100
	minRetryWait = 2 * time.Second
	maxRetryWait = 5 * time.Minute
	shipInterval = 3 * time.Second
)

type batchPayload struct {
	Events []*queue.Event `json:"events"`
}

// Shipper reads from the queue and ships batches to the backend.
type Shipper struct {
	cfg     *config.Config
	q       *queue.Queue
	client  *http.Client
	sent    atomic.Int64
	errors  atomic.Int64
	lastErr atomic.Value // string
}

// New creates a Shipper with a hardened HTTP client (TLS verification always on).
func New(cfg *config.Config, q *queue.Queue) *Shipper {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
		MaxIdleConns:       4,
		IdleConnTimeout:    90 * time.Second,
		DisableCompression: false,
	}
	return &Shipper{
		cfg: cfg,
		q:   q,
		client: &http.Client{
			Transport: transport,
			Timeout:   30 * time.Second,
		},
	}
}

// Run ships batches in a loop with exponential back-off on errors.
func (s *Shipper) Run() {
	wait := minRetryWait
	for {
		time.Sleep(shipInterval)
		if err := s.shipOne(); err != nil {
			s.errors.Add(1)
			s.lastErr.Store(err.Error())
			log.Printf("[shipper] error: %v — retry in %s", err, wait)
			time.Sleep(wait)
			wait = min(wait*2, maxRetryWait)
		} else {
			wait = minRetryWait
		}
	}
}

// shipOne sends one batch. Returns nil if queue is empty, unconfigured, or batch succeeds.
func (s *Shipper) shipOne() error {
	if s.cfg.ServerURL == "" {
		return nil // not configured yet
	}
	events, paths, err := s.q.ReadBatch(batchSize)
	if err != nil {
		return fmt.Errorf("queue read: %w", err)
	}
	if len(events) == 0 {
		return nil
	}

	body, err := json.Marshal(batchPayload{Events: events})
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}

	url := s.cfg.ServerURL + "/v1/events/batch"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return fmt.Errorf("server error %d", resp.StatusCode)
	}
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return fmt.Errorf("auth rejected (%d) — check API key", resp.StatusCode)
	}
	if resp.StatusCode >= 400 {
		// Client error (e.g. 422 validation) — events are unshippable, drop them.
		log.Printf("[shipper] dropping %d events: HTTP %d", len(events), resp.StatusCode)
		s.q.Ack(paths)
		return nil
	}

	s.q.Ack(paths)
	s.sent.Add(int64(len(events)))
	return nil
}

// Stats returns telemetry for the tray tooltip.
func (s *Shipper) Stats() (sent int64, errs int64, lastErr string) {
	sent = s.sent.Load()
	errs = s.errors.Load()
	if v := s.lastErr.Load(); v != nil {
		lastErr = v.(string)
	}
	return
}

func min(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
