//go:build windows

package main

import (
	"fmt"
	"log"
	"os"
	"syscall"
)

// allocConsole attaches to the parent console (or creates one) so that
// --setup, --install, and --version can print output from a windowsgui binary.
func allocConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	attachConsole := kernel32.NewProc("AttachConsole")
	alloc := kernel32.NewProc("AllocConsole")

	const ATTACH_PARENT_PROCESS = ^uintptr(0)
	r, _, _ := attachConsole.Call(ATTACH_PARENT_PROCESS)
	if r == 0 {
		alloc.Call()
	}

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

func waitForKey() {
	fmt.Println("\nPress Enter to exit…")
	buf := make([]byte, 1)
	os.Stdin.Read(buf)
}
