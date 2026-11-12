@echo off
title Discord Stream Bot (Windows)
cd /d "%~dp0"
echo ====================================================================
echo   COQUETTE DISCORD STREAM BOT (Windows Launcher)
echo ====================================================================
echo.

if not exist "node_modules\" (
    echo [*] First-time launch detected. Running setup...
    call "%~dp0setup_windows.bat"
)

echo [*] Starting Discord Stream Bot service (bot.js)...
echo [*] Interactive commands: .movie <name>, .stream <id|url>, .help
echo.
node login.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Bot stopped or encountered an error.
    pause
)
