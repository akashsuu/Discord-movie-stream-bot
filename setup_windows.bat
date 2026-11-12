@echo off
title Setup Discord Stream Bot (Windows)
cd /d "%~dp0"
echo ====================================================================
echo   COQUETTE DISCORD STREAM BOT - 1-CLICK WINDOWS SETUP
echo ====================================================================
echo.

:: 1. Check Node.js
echo [*] Checking Node.js installation...
node -v >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [-] Error: Node.js is NOT installed!
    echo Please download and install Node.js LTS from: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [+] Node.js detected: %NODE_VER%

:: 2. Check npm
for /f "tokens=*" %%v in ('npm -v') do set NPM_VER=%%v
echo [+] npm detected:     v%NPM_VER%
echo.

:: 3. Configure .env if missing
if not exist ".env" (
    if exist ".env.example" (
        echo [*] Creating .env from .env.example...
        copy /y ".env.example" ".env" >nul
        echo [+] Created .env. Please open .env and add your BOT_TOKEN and USER_TOKEN.
    )
) else (
    echo [+] Configuration file .env is present.
)
echo.

:: 4. Install Node.js Dependencies
echo [*] Installing project dependencies (npm install)...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [-] npm install encountered an error.
    pause
    exit /b 1
)
echo [+] npm dependencies installed successfully!
echo.

:: 5. Install Playwright Chromium
echo [*] Installing Playwright Chromium browser...
call npx playwright install chromium
if %ERRORLEVEL% NEQ 0 (
    echo [!] Warning: Playwright browser install had warnings, continuing...
) else (
    echo [+] Chromium browser installed!
)
echo.

:: 6. Check FFmpeg (Optional on Windows)
echo [*] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [+] FFmpeg detected on PATH!
) else (
    echo [!] Note: FFmpeg not detected in PATH. Bot will use native browser capture on Windows.
)
echo.

echo ====================================================================
echo   SETUP COMPLETE! YOU ARE READY TO RUN!
echo ====================================================================
echo  - To start the Discord Bot: Double-click "start.bat"
echo  - To direct-stream a movie: Double-click "run.bat"
echo ====================================================================
echo.
pause
