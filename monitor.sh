#!/usr/bin/env bash
# ==============================================================================
# monitor.sh — Real-Time Resource Monitor for Discord Movie Streamer
# Displays: System CPU/RAM, Stream Process Group (Chromium + FFmpeg + Node)
# ==============================================================================

set -e

SHOW_WATCH=false
if [ "$1" = "--watch" ] || [ "$1" = "-w" ]; then
  SHOW_WATCH=true
fi

display_stats() {
  clear 2>/dev/null || true
  echo "=============================================================================="
  echo "  DISCORD MOVIE STREAMER — LIVE PROCESS & RESOURCE MONITOR"
  echo "  Time: $(date '+%Y-%m-%d %H:%M:%S')  | Host: $(hostname)"
  echo "=============================================================================="

  # System CPU & Load
  LOAD=$(uptime | awk -F'load average:' '{print $2}')
  CPU_IDLE=$(top -bn1 | grep "%Cpu(s)" | awk '{print $8}')
  CPU_USAGE=$(awk "BEGIN {printf \"%.1f\", 100 - $CPU_IDLE}")

  echo -e "\n[+] SYSTEM SUMMARY:"
  echo "    CPU Utilization : ${CPU_USAGE}% (Load Average:${LOAD})"

  # System RAM
  free -m | awk 'NR==2{printf "    RAM Utilization : %s MB used / %s MB total (%.1f%% used | %s MB available)\n", $3, $2, $3*100/$2, $7}'
  free -m | awk 'NR==3{printf "    Swap Usage      : %s MB used / %s MB total\n", $3, $2}'

  # Stream specific processes
  echo -e "\n[+] STREAM PROCESSES (Chromium + FFmpeg + Node.js):"
  printf "    %-8s %-10s %-8s %-10s %-8s %s\n" "PID" "PROCESS" "CPU%" "RAM (MB)" "STATE" "COMMAND"
  echo "    --------------------------------------------------------------------------"

  STREAM_PIDS=$(pgrep -f "chrome|ffmpeg|streamlogic|discord-stream" 2>/dev/null || true)

  if [ -z "$STREAM_PIDS" ]; then
    echo "    (No active stream processes running right now)"
  else
    ps -p $STREAM_PIDS -o pid,comm,%cpu,rss,stat,args --sort=-%cpu 2>/dev/null | awk 'NR>1 {
      cmd = $6;
      for (i=7; i<=NF; i++) {
        if (i<=8) cmd = cmd " " $i;
        else if (i==9) cmd = cmd "...";
      }
      printf "    %-8s %-10s %-8s %-10.1f %-8s %s\n", $1, $2, $3"%", $4/1024, $5, cmd
    }'
  fi

  # Top 5 System CPU Consumers
  echo -e "\n[+] TOP 5 CPU CONSUMING PROCESSES:"
  printf "    %-8s %-12s %-8s %-8s %s\n" "PID" "USER" "CPU%" "MEM%" "COMMAND"
  echo "    --------------------------------------------------------------------------"
  ps -eo pid,user,%cpu,%mem,comm --sort=-%cpu | head -n 6 | awk 'NR>1 {
    printf "    %-8s %-12s %-8s %-8s %s\n", $1, $2, $3"%", $4"%", $5
  }'

  echo "=============================================================================="
}

if [ "$SHOW_WATCH" = true ]; then
  while true; do
    display_stats
    echo "Press [CTRL+C] to stop live monitoring..."
    sleep 2
  done
else
  display_stats
fi
