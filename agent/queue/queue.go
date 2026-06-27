// Package queue provides a durable file-backed event queue that survives
// agent restarts and network outages.
package queue

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

const (
	maxQueueFiles = 100_000
	maxFileAgeDays = 7
)

// Event is the canonical shape sent to THE EYE backend /v1/events/batch.
type Event struct {
	OccurredAt    string                 `json:"occurred_at"`
	EventType     string                 `json:"event_type"`
	EventCategory string                 `json:"event_category"`
	Outcome       string                 `json:"outcome"`
	Severity      string                 `json:"severity"`
	ActorType     string                 `json:"actor_type"`
	ActorID       string                 `json:"actor_id"`
	OriginIP      string                 `json:"origin_ip,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

// Queue manages a directory of JSON event files.
type Queue struct {
	dir     string
	mu      sync.Mutex
	counter uint64
	dropped atomic.Int64
}

// New creates (or reopens) the queue directory and returns a ready Queue.
func New(dataDir string) (*Queue, error) {
	dir := filepath.Join(dataDir, "queue")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("queue dir: %w", err)
	}
	q := &Queue{dir: dir}
	// Seed counter from existing files so we never collide.
	if files, _ := os.ReadDir(dir); len(files) > 0 {
		q.counter = uint64(len(files)) + uint64(time.Now().UnixNano()%1_000_000)
	}
	// Purge files older than maxFileAgeDays to bound disk usage.
	go q.purgeStale()
	return q, nil
}

// Enqueue writes a single event to the queue. Non-blocking; drops silently
// if the queue is full.
func (q *Queue) Enqueue(e *Event) {
	if e.OccurredAt == "" {
		e.OccurredAt = time.Now().UTC().Format(time.RFC3339Nano)
	}
	data, err := json.Marshal(e)
	if err != nil {
		return
	}

	q.mu.Lock()
	defer q.mu.Unlock()

	entries, _ := os.ReadDir(q.dir)
	if len(entries) >= maxQueueFiles {
		q.dropped.Add(1)
		return
	}

	q.counter++
	name := fmt.Sprintf("%020d.json", q.counter)
	_ = os.WriteFile(filepath.Join(q.dir, name), data, 0600)
}

// Peek returns up to n event filenames (oldest first) without removing them.
func (q *Queue) Peek(n int) ([]string, error) {
	q.mu.Lock()
	defer q.mu.Unlock()

	entries, err := os.ReadDir(q.dir)
	if err != nil {
		return nil, err
	}
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name() < entries[j].Name()
	})
	names := make([]string, 0, n)
	for _, e := range entries {
		if !e.IsDir() && filepath.Ext(e.Name()) == ".json" {
			names = append(names, filepath.Join(q.dir, e.Name()))
			if len(names) == n {
				break
			}
		}
	}
	return names, nil
}

// ReadBatch reads up to n events (oldest first) and returns them along with
// their file paths. Does not remove files.
func (q *Queue) ReadBatch(n int) ([]*Event, []string, error) {
	paths, err := q.Peek(n)
	if err != nil {
		return nil, nil, err
	}
	events := make([]*Event, 0, len(paths))
	kept := make([]string, 0, len(paths))
	for _, p := range paths {
		data, err := os.ReadFile(p)
		if err != nil {
			continue
		}
		var e Event
		if err := json.Unmarshal(data, &e); err != nil {
			_ = os.Remove(p) // corrupt — drop it
			continue
		}
		events = append(events, &e)
		kept = append(kept, p)
	}
	return events, kept, nil
}

// Ack removes files that were successfully shipped.
func (q *Queue) Ack(paths []string) {
	for _, p := range paths {
		_ = os.Remove(p)
	}
}

// Depth returns the current number of queued events.
func (q *Queue) Depth() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	entries, _ := os.ReadDir(q.dir)
	return len(entries)
}

// Dropped returns the cumulative drop count since process start.
func (q *Queue) Dropped() int64 { return q.dropped.Load() }

func (q *Queue) purgeStale() {
	cutoff := time.Now().Add(-time.Duration(maxFileAgeDays) * 24 * time.Hour)
	entries, _ := os.ReadDir(q.dir)
	for _, e := range entries {
		info, err := e.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(q.dir, e.Name()))
		}
	}
}
