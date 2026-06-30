//go:build windows

package main

import (
	"fmt"
	"os"
	"syscall"
	"unsafe"
)

var (
	regKeyPath = `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
	regValue   = "TheEyeAgent"
)

func installStartup(dataDir string) error {
	advapi32 := syscall.NewLazyDLL("advapi32.dll")
	regOpenKeyEx := advapi32.NewProc("RegOpenKeyExW")
	regSetValueEx := advapi32.NewProc("RegSetValueExW")
	regCloseKey := advapi32.NewProc("RegCloseKey")

	exe, _ := os.Executable()
	const HKEY_CURRENT_USER = 0x80000001
	const KEY_SET_VALUE = 0x0002

	var hKey uintptr
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	r, _, err := regOpenKeyEx.Call(HKEY_CURRENT_USER, uintptr(unsafe.Pointer(keyPath)), 0, KEY_SET_VALUE, uintptr(unsafe.Pointer(&hKey)))
	if r != 0 {
		return fmt.Errorf("RegOpenKeyEx: %v", err)
	}
	defer regCloseKey.Call(hKey)

	valueName, _ := syscall.UTF16PtrFromString(regValue)
	data, _ := syscall.UTF16FromString(`"` + exe + `"`)
	const REG_SZ = 1
	r, _, err = regSetValueEx.Call(
		hKey,
		uintptr(unsafe.Pointer(valueName)),
		0,
		REG_SZ,
		uintptr(unsafe.Pointer(&data[0])),
		uintptr(len(data)*2),
	)
	if r != 0 {
		return fmt.Errorf("RegSetValueEx: %v", err)
	}
	return nil
}

func uninstallStartup() error {
	advapi32 := syscall.NewLazyDLL("advapi32.dll")
	regOpenKeyEx := advapi32.NewProc("RegOpenKeyExW")
	regDeleteValue := advapi32.NewProc("RegDeleteValueW")
	regCloseKey := advapi32.NewProc("RegCloseKey")

	const HKEY_CURRENT_USER = 0x80000001
	const KEY_SET_VALUE = 0x0002

	var hKey uintptr
	keyPath, _ := syscall.UTF16PtrFromString(regKeyPath)
	r, _, err := regOpenKeyEx.Call(HKEY_CURRENT_USER, uintptr(unsafe.Pointer(keyPath)), 0, KEY_SET_VALUE, uintptr(unsafe.Pointer(&hKey)))
	if r != 0 {
		return fmt.Errorf("RegOpenKeyEx: %v", err)
	}
	defer regCloseKey.Call(hKey)

	valueName, _ := syscall.UTF16PtrFromString(regValue)
	r, _, err = regDeleteValue.Call(hKey, uintptr(unsafe.Pointer(valueName)))
	if r != 0 {
		return fmt.Errorf("RegDeleteValue: %v", err)
	}
	return nil
}
