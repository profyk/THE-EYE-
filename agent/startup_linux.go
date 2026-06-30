//go:build linux

package main

import (
	"fmt"
	"os"
	"path/filepath"
)

func installStartup(_ string) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("executable path: %w", err)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}
	dir := filepath.Join(home, ".config", "autostart")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	desktop := fmt.Sprintf("[Desktop Entry]\nType=Application\nName=THE EYE Agent\nComment=THE EYE security monitoring agent\nExec=%s\nHidden=false\nX-GNOME-Autostart-enabled=true\n", exe)
	return os.WriteFile(filepath.Join(dir, "the-eye-agent.desktop"), []byte(desktop), 0644)
}

func uninstallStartup() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("home dir: %w", err)
	}
	path := filepath.Join(home, ".config", "autostart", "the-eye-agent.desktop")
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
