@echo off
title FoodBridge Live Online Sharing (Cloudflare Tunnel)
color 0B
echo ===================================================================
echo           FoodBridge Platform - Live Real-Time Sharer
echo ===================================================================
echo.
echo [1/2] Checking if FoodBridge Web Backend is running on port 5258...
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5258 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if %errorlevel% neq 0 (
    echo [!] Backend is not running yet. Starting ASP.NET Core Backend in background...
    start "FoodBridge Backend Server" cmd /k "dotnet run --project src\FoodBridge.Web --launch-profile http"
    echo [*] Waiting 8 seconds for server initialization...
    timeout /t 8 /nobreak >nul
) else (
    echo [V] Backend is already running and listening on port 5258.
)

echo.
echo [2/2] Generating Public Live HTTPS Tunnel via Cloudflare...
if not exist "%~dp0cloudflared.exe" (
    echo [*] Downloading cloudflared tunnel client...
    powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile '%~dp0cloudflared.exe'"
)
echo -------------------------------------------------------------------
echo  Look below for your Public Link:
echo  Example: "https://xxxx.trycloudflare.com"
echo  Copy that link and send it to your friend!
echo -------------------------------------------------------------------
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:5258
pause
