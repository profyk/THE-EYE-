@echo off
setlocal

:: Add local Go SDK to PATH if go is not already on PATH
where go >nul 2>&1 || set PATH=%USERPROFILE%\go-sdk\bin;%PATH%

echo [THE EYE] Fetching dependencies...
go mod tidy
if errorlevel 1 (
    echo ERROR: go mod tidy failed
    exit /b 1
)

echo [THE EYE] Building agent for Windows (amd64)...
set CGO_ENABLED=0
set GOOS=windows
set GOARCH=amd64

go build ^
  -ldflags="-H windowsgui -s -w -X main.Version=1.1.0" ^
  -trimpath ^
  -o eye-agent.exe ^
  .

if errorlevel 1 (
    echo ERROR: build failed
    exit /b 1
)

echo.
echo  ===================================================
echo    THE EYE Agent built: eye-agent.exe
echo  ===================================================
echo.
echo  SETUP INSTRUCTIONS:
echo.
echo  1. Create %%APPDATA%%\TheEye\config.json:
echo     {
echo       "server_url": "https://your-eye-server.com",
echo       "api_key":    "eye_live_...",
echo       "agent_id":   "hostname-or-label"
echo     }
echo.
echo  2. Or run the interactive setup wizard:
echo     eye-agent.exe --setup
echo.
echo  3. Add to Windows startup (current user):
echo     eye-agent.exe --install
echo.
echo  4. Launch:
echo     eye-agent.exe
echo.
echo  The blinking eye icon will appear in the system tray.
echo.

endlocal
