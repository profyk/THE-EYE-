//go:build windows

package tray

import (
	"syscall"
	"unsafe"
)

// openBrowser opens url in the default browser via ShellExecuteW.
func openBrowser(url string) {
	shell32 := syscall.NewLazyDLL("shell32.dll")
	shellExecuteW := shell32.NewProc("ShellExecuteW")

	verb, _ := syscall.UTF16PtrFromString("open")
	u, _ := syscall.UTF16PtrFromString(url)
	shellExecuteW.Call(
		0,
		uintptr(unsafe.Pointer(verb)),
		uintptr(unsafe.Pointer(u)),
		0, 0, 1,
	)
}
