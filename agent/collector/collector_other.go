//go:build !windows

// Package collector provides a no-op stub on non-Windows platforms.
// Future: add macOS (unified log / BSM audit) and Linux (auditd / syslog) collectors.
package collector

import (
	"github.com/profyk/the-eye-agent/config"
	"github.com/profyk/the-eye-agent/queue"
)

type Collector struct{}

func New(_ *config.Config, _ *queue.Queue) *Collector {
	return &Collector{}
}

func (c *Collector) Run() {
	select {} // block forever; platform collector will be added here
}
