@echo off
title Discord Direct Stream (Windows)
cd /d "%~dp0"
echo ====================================================================
echo   COQUETTE DISCORD DIRECT MOVIE STREAMER
echo ====================================================================
echo.

if not exist "node_modules\" (
    echo [*] First-time launch detected. Running setup...
    call "%~dp0setup_windows.bat"
)

echo [*] Launching direct stream...
echo Usage: run.bat "https://cinejoy.pk/watch/movie/969681"
echo.
node login.js stream %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [-] Stream ended or encountered an error.
    pause
)
