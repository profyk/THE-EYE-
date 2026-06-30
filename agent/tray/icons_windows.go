//go:build windows

package tray

// Windows system tray requires ICO-wrapped image data.
func EyeOpenICO() []byte  { return icoOpen }
func EyeClosedICO() []byte { return icoClosed }
