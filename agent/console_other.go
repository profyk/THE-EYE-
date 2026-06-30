//go:build !windows

package main

import (
	"fmt"
	"os"
)

// allocConsole is a no-op on non-Windows; stdin/stdout are always available.
func allocConsole() {}

func waitForKey() {
	fmt.Println("\nPress Enter to exit…")
	buf := make([]byte, 1)
	os.Stdin.Read(buf)
}
