// Package shipper batches queued events and sends them to the THE EYE backend.
package shipper

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/binary"
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
	batchSize     = 100
	minRetryWait  = 2 * time.Second
	maxRetryWait  = 5 * time.Minute
	shipInterval  = 3 * time.Second
	heartbeatTick = 30 * time.Second
)

type batchPayload struct {
	Events []*queue.Event `json:"events"`
}

type registerPayload struct {
	MachineID    string `json:"machine_id"`
	Hostname     string `json:"hostname"`
	OS           string `json:"os"`
	AgentVersion string `json:"agent_version"`
	AgentLabel   string `json:"agent_label"`
}

type heartbeatPayload struct {
	MachineID string `json:"machine_id"`
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

// jitter returns a random duration in [0, d/2) so multiple agents that
// restart simultaneously don't all slam the server at the same instant.
func jitter(d time.Duration) time.Duration {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0
	}
	n := int64(binary.LittleEndian.Uint64(b[:]) % uint64(d/2))
	return time.Duration(n)
}

// Run ships batches in a loop with exponential back-off + jitter on errors.
func (s *Shipper) Run() {
	wait := minRetryWait
	for {
		time.Sleep(shipInterval)
		if err := s.shipOne(); err != nil {
			s.errors.Add(1)
			s.lastErr.Store(err.Error())
			sleep := wait + jitter(wait)
			log.Printf("[shipper] error: %v — retry in %s", err, sleep)
			time.Sleep(sleep)
			wait = minDuration(wait*2, maxRetryWait)
		} else {
			wait = minRetryWait
		}
	}
}

// shipOne sends one batch. Returns nil if queue is empty, unconfigured, or batch succeeds.
func (s *Shipper) shipOne() error {
	if s.cfg.ServerURL == "" || s.cfg.TenantID == "" {
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

	url := s.cfg.ServerURL + "/v1/agent/events"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", s.cfg.APIKey)
	req.Header.Set("X-Tenant-ID", s.cfg.TenantID)

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 500 {
		return fmt.Errorf("server error %d", resp.StatusCode)
	}
	if resp.StatusCode == 401 || resp.StatusCode == 403 {
		return fmt.Errorf("auth rejected (%d) — check API key and Tenant ID", resp.StatusCode)
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

// Register announces this machine to the backend once on startup.
// Best-effort — the agent continues even if this fails (network may not be ready).
func (s *Shipper) Register(hostname, osName, version string) {
	if s.cfg.ServerURL == "" || s.cfg.TenantID == "" {
		return
	}
	payload := registerPayload{
		MachineID:    s.cfg.MachineID,
		Hostname:     hostname,
		OS:           osName,
		AgentVersion: version,
		AgentLabel:   s.cfg.AgentID,
	}
	body, _ := json.Marshal(payload)
	url := s.cfg.ServerURL + "/v1/agent/register"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		log.Printf("[shipper] register build request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", s.cfg.APIKey)
	req.Header.Set("X-Tenant-ID", s.cfg.TenantID)
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("[shipper] register: %v", err)
		return
	}
	defer resp.Body.Close()
	log.Printf("[shipper] registered machine %s (HTTP %d)", s.cfg.MachineID, resp.StatusCode)
}

// RunHeartbeat sends a heartbeat every 30 seconds so the portal can show this
// machine as online. Runs until the process exits; call as go s.RunHeartbeat().
func (s *Shipper) RunHeartbeat() {
	if s.cfg.ServerURL == "" || s.cfg.TenantID == "" {
		return
	}
	// Send immediately on start, then tick every heartbeatTick.
	s.sendHeartbeat()
	ticker := time.NewTicker(heartbeatTick)
	defer ticker.Stop()
	for range ticker.C {
		s.sendHeartbeat()
	}
}

func (s *Shipper) sendHeartbeat() {
	body, _ := json.Marshal(heartbeatPayload{MachineID: s.cfg.MachineID})
	url := s.cfg.ServerURL + "/v1/agent/heartbeat"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Key", s.cfg.APIKey)
	req.Header.Set("X-Tenant-ID", s.cfg.TenantID)
	resp, err := s.client.Do(req)
	if err != nil {
		log.Printf("[heartbeat] %v", err)
		return
	}
	resp.Body.Close()
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

func minDuration(a, b time.Duration) time.Duration {
	if a < b {
		return a
	}
	return b
}
