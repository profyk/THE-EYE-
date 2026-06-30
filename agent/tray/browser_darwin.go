//go:build darwin

package tray

import "os/exec"

func openBrowser(url string) {
	_ = exec.Command("open", url).Start()
}
