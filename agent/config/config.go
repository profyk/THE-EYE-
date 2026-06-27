package config

import (
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/crypto/pbkdf2"
	"golang.org/x/sys/windows/registry"
)

const (
	pbkdf2Iter   = 600_000
	pbkdf2KeyLen = 32
	encSalt      = "the-eye-agent-v1-config-seal"
)

// Config is the agent runtime configuration.
type Config struct {
	ServerURL string `json:"server_url"`
	APIKey    string `json:"api_key"`
	AgentID   string `json:"agent_id"`
	DataDir   string `json:"-"`
}

// DataDirectory returns %APPDATA%\TheEye (creates if absent).
func DataDirectory() (string, error) {
	base := os.Getenv("APPDATA")
	if base == "" {
		base = os.TempDir()
	}
	dir := filepath.Join(base, "TheEye")
	return dir, os.MkdirAll(dir, 0700)
}

// Load attempts to read the encrypted config, falling back to a plaintext
// bootstrap file that is sealed and deleted on first use.
func Load() (*Config, error) {
	dir, err := DataDirectory()
	if err != nil {
		return nil, err
	}

	encPath := filepath.Join(dir, "config.enc")
	plainPath := filepath.Join(dir, "config.json")

	// Sealed config exists — decrypt and return.
	if data, err := os.ReadFile(encPath); err == nil {
		key, err := machineKey()
		if err != nil {
			return nil, fmt.Errorf("machine key: %w", err)
		}
		plain, err := decryptGCM(key, data)
		if err != nil {
			return nil, fmt.Errorf("decrypt config: %w", err)
		}
		var cfg Config
		if err := json.Unmarshal(plain, &cfg); err != nil {
			return nil, fmt.Errorf("parse config: %w", err)
		}
		cfg.DataDir = dir
		return &cfg, nil
	}

	// Plaintext bootstrap — seal it and delete.
	if data, err := os.ReadFile(plainPath); err == nil {
		var cfg Config
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("parse bootstrap config: %w", err)
		}
		cfg.DataDir = dir
		if err := save(&cfg); err != nil {
			return nil, fmt.Errorf("seal config: %w", err)
		}
		_ = os.Remove(plainPath) // remove plaintext
		return &cfg, nil
	}

	return nil, errors.New("no config found")
}

// Setup runs an interactive console wizard to create the config.
func Setup() (*Config, error) {
	r := bufio.NewReader(os.Stdin)
	prompt := func(label, def string) string {
		if def != "" {
			fmt.Printf("%s [%s]: ", label, def)
		} else {
			fmt.Printf("%s: ", label)
		}
		line, _ := r.ReadString('\n')
		line = strings.TrimSpace(line)
		if line == "" {
			return def
		}
		return line
	}

	dir, _ := DataDirectory()
	hostname, _ := os.Hostname()

	fmt.Println("\n  ═══ THE EYE — Agent Setup ═══\n")
	cfg := &Config{
		ServerURL: prompt("Server URL (e.g. https://eye.company.com)", ""),
		APIKey:    prompt("Source API key (eye_live_…)", ""),
		AgentID:   prompt("Agent ID / hostname", hostname),
		DataDir:   dir,
	}

	if cfg.ServerURL == "" || cfg.APIKey == "" {
		return nil, errors.New("server_url and api_key are required")
	}

	if err := save(cfg); err != nil {
		return nil, err
	}
	fmt.Println("\n  Config sealed with machine key. Agent is ready.\n")
	return cfg, nil
}

// save encrypts the config and writes it to disk.
func save(cfg *Config) error {
	dir := cfg.DataDir
	if dir == "" {
		var err error
		dir, err = DataDirectory()
		if err != nil {
			return err
		}
	}
	plain, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	key, err := machineKey()
	if err != nil {
		return err
	}
	sealed, err := encryptGCM(key, plain)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "config.enc"), sealed, 0600)
}

// machineKey derives a 256-bit key from the Windows MachineGuid via PBKDF2-SHA256.
// The key is unique per machine and cannot be transferred to another machine.
func machineKey() ([]byte, error) {
	guid, err := machineGUID()
	if err != nil {
		return nil, fmt.Errorf("machine guid: %w", err)
	}
	salt := sha256.Sum256([]byte(encSalt))
	key := pbkdf2.Key([]byte(guid), salt[:], pbkdf2Iter, pbkdf2KeyLen, sha256.New)
	return key, nil
}

// machineGUID reads the Windows MachineGuid from the registry.
func machineGUID() (string, error) {
	k, err := registry.OpenKey(
		registry.LOCAL_MACHINE,
		`SOFTWARE\Microsoft\Cryptography`,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return "", err
	}
	defer k.Close()
	guid, _, err := k.GetStringValue("MachineGuid")
	return guid, err
}

// encryptGCM encrypts plaintext with AES-256-GCM. Output: nonce (12 bytes) || ciphertext.
func encryptGCM(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return sealed, nil
}

// decryptGCM decrypts AES-256-GCM data produced by encryptGCM.
func decryptGCM(key, data []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, errors.New("ciphertext too short")
	}
	return gcm.Open(nil, data[:nonceSize], data[nonceSize:], nil)
}
