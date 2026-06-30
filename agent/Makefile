# THE EYE Agent — cross-platform build targets
#
# Windows builds: CGO_ENABLED=0 so they can be cross-compiled from anywhere.
# macOS/Linux builds: CGO_ENABLED=1 (default) required for the systray CGO shim.
#   Run these targets on the respective platform, or in a CI container
#   with the native SDK available.

VERSION ?= 1.1.0
LDFLAGS_WIN  = -H windowsgui -s -w -X main.Version=$(VERSION)
LDFLAGS_UNIX = -s -w -X main.Version=$(VERSION)

.PHONY: all windows darwin-amd64 darwin-arm64 linux clean

all: windows

dist:
	mkdir -p dist

windows: dist
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 \
		go build -ldflags="$(LDFLAGS_WIN)" -trimpath -o dist/eye-agent.exe .

darwin-amd64: dist
	GOOS=darwin GOARCH=amd64 \
		go build -ldflags="$(LDFLAGS_UNIX)" -trimpath -o dist/eye-agent-mac-amd64 .

darwin-arm64: dist
	GOOS=darwin GOARCH=arm64 \
		go build -ldflags="$(LDFLAGS_UNIX)" -trimpath -o dist/eye-agent-mac-arm64 .

linux: dist
	GOOS=linux GOARCH=amd64 \
		go build -ldflags="$(LDFLAGS_UNIX)" -trimpath -o dist/eye-agent-linux-amd64 .
	GOOS=linux GOARCH=arm64 \
		go build -ldflags="$(LDFLAGS_UNIX)" -trimpath -o dist/eye-agent-linux-arm64 .

clean:
	rm -rf dist/
