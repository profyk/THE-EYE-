package security

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
)

// SelfHash computes the SHA-256 hash of the running executable.
func SelfHash() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return "", err
	}

	f, err := os.Open(exe)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// CheckIntegrity computes the self-hash and compares it to the stored hash
// in the state file. Returns (true, hash) if intact or if no stored hash
// exists yet (first run), (false, hash) if tampering is detected.
func CheckIntegrity(dataDir string) (intact bool, currentHash string) {
	currentHash, err := SelfHash()
	if err != nil {
		return false, ""
	}

	hashFile := filepath.Join(dataDir, "agent.sha256")
	stored, err := os.ReadFile(hashFile)
	if err != nil {
		// First run — store the current hash and declare intact.
		_ = os.WriteFile(hashFile, []byte(currentHash), 0600)
		return true, currentHash
	}

	if string(stored) == currentHash {
		return true, currentHash
	}
	// Hash changed — tampering detected. Update the stored hash so we only
	// alert once per unique binary state.
	_ = os.WriteFile(hashFile, []byte(currentHash), 0600)
	return false, currentHash
}
