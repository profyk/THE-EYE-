//go:build linux

package tray

import "os/exec"

func openBrowser(url string) {
	_ = exec.Command("xdg-open", url).Start()
}
