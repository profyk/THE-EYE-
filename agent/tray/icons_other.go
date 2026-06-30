//go:build !windows

package tray

// macOS and Linux systray accept raw PNG bytes directly.
func EyeOpenICO() []byte  { return pngOpen }
func EyeClosedICO() []byte { return pngClosed }
