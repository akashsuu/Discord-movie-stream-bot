#!/usr/bin/env bash
# ==============================================================================
#  start.sh — Start Discord Stream Bot on Linux VPS
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "===================================================================="
echo "  COQUETTE DISCORD STREAM BOT (Linux Launcher)"
echo "===================================================================="

# Ensure Xvfb and PulseAudio are ready
export DISPLAY="${DISPLAY:-:99}"
export PULSE_SINK="${PULSE_SINK:-Virtual_Sink}"

pulseaudio --start --exit-idle-time=-1 2>/dev/null || true
pactl load-module module-null-sink sink_name=Virtual_Sink sink_properties=device.description=Virtual_Sink 2>/dev/null || true
pactl load-module module-virtual-source source_name=Virtual_Mic master=Virtual_Sink.monitor 2>/dev/null || true

if ! pgrep -x "Xvfb" >/dev/null 2>&1; then
    echo "[*] Launching Xvfb virtual display (:99)..."
    Xvfb :99 -screen 0 854x480x24 -ac +extension GLX -noreset >/dev/null 2>&1 &
    sleep 1
fi

if command -v pm2 >/dev/null 2>&1; then
    echo "[*] Starting via PM2..."
    pm2 start ecosystem.config.js
    pm2 logs discord-stream-bot
else
    echo "[*] Starting directly via node login.js..."
    node login.js
fi
