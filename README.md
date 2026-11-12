# 🎬 Coquette Discord Movie & Video Streamer

A high-performance, cross-platform Discord Media Streamer bot that streams **Cinejoy movies, TV series, and web videos** directly into Discord Voice & Video channels in **100% borderless full screen** at **480p 24 FPS** with ultra-low CPU utilization.

Works out of the box on **Windows 10 / 11** and **any Linux VPS (Ubuntu / Debian, x86_64 & ARM64)**.

---

## ⚡ Quick Start: Windows (1-Click)

### 1. Requirements
- [Node.js v18+](https://nodejs.org/) installed.
- (Optional) [FFmpeg](https://ffmpeg.org/download.html) in your Windows PATH.

### 2. Run the Bot
- **First Time Setup**: Double-click `setup_windows.bat`  
  *(Installs npm dependencies, Playwright Chromium, and sets up `.env`)*
- **Start Bot**: Double-click `start.bat`  
  *(Launches the Discord bot. Users can use `.movie <title>` and `.stream <id>` in Discord)*
- **Direct Stream (No Bot)**: Double-click `run.bat`  
  *(Instantly streams a movie URL into voice)*

---

## 🚀 Quick Start: Any Linux VPS (1-Click Setup)

To deploy on any fresh Ubuntu/Debian VPS (Oracle Cloud, DigitalOcean, Hetzner, AWS, etc.):

1. Upload this folder to your VPS (e.g. `/opt/discord-streamer/`).
2. Run the automated installer:
   ```bash
   bash setup_vps.sh
   ```
   **What `setup_vps.sh` does automatically:**
   - Installs FFmpeg, Xvfb virtual display, and PulseAudio virtual audio sink.
   - Installs Node.js LTS and PM2 process manager.
   - Installs npm packages and Playwright Chromium.
   - Configures audio loopback (`Virtual_Sink` -> `Virtual_Mic`).
   - Starts the bot under PM2 with automatic crash recovery & reboot persistence.

3. Useful VPS Management Commands:
   ```bash
   pm2 status                          # View bot process status
   pm2 logs discord-stream-bot        # View live logs
   pm2 restart discord-stream-bot     # Restart bot
   pm2 stop discord-stream-bot        # Stop bot
   bash monitor.sh -w                  # Live CPU, RAM & Stream monitor
   ```

---

## 🎮 Discord Bot Commands

| Command | Example | Description |
|---|---|---|
| `.movie <query>` | `.movie inception` | Searches TMDB for movies/shows and displays rich cards with **one-click Stream buttons**. |
| `.stream <tmdb_id>` | `.stream 969681` | Streams directly by TMDB movie or TV series ID. |
| `.stream <url>` | `.stream https://...` | Streams any custom Cinejoy or HTML5 video link. |
| `.stream <name>` | `.stream spider man` | Searches and streams the top matching title directly. |
| `.stream stop` | `.stream stop` | Leaves voice channel, closes the stream browser, and frees CPU. |
| `.help` | `.help` | Displays the interactive help menu. |

---

## ⚙️ Configuration (`.env`)

Edit `.env` (or copy `.env.example` to `.env`) with your tokens:

```env
# Discord Application Bot Token (from Discord Developer Portal)
BOT_TOKEN=your_bot_token_here

# User/Self Token (used by headless browser to join voice and share screen)
USER_TOKEN=your_user_token_here

# Target Server & Voice Channel
GUILD_ID=1474805625018913043
VOICE_CHANNEL_ID=1499087387320651919

# Prefix for bot commands (default: .)
PREFIX=.

# TMDB API Key (default free key included)
TMDB_API_KEY=15d2ea6d0dc1d476efbca3eba2b9bbfb
```

---

## 📁 Project Directory Structure

```
stream bot/
├── commands/
│   ├── help.js             # .help command
│   ├── movie.js            # .movie TMDB search & stream cards
│   └── stream.js           # .stream launch & controls
├── .env                    # Active credentials (tokens, channel IDs)
├── .env.example            # Template credentials
├── bot.js                  # Main Discord.js bot client
├── config.js               # Cross-platform config loader
├── ecosystem.config.js     # PM2 cluster configuration
├── login.js                # Unified launcher (bot mode, stream mode, setup mode)
├── streamlogic.js          # Playwright & FFmpeg 100% fullscreen engine
├── setup_windows.bat       # 1-click Windows setup script
├── start.bat               # 1-click Windows bot launcher
├── run.bat                 # 1-click Windows direct streamer
├── setup_vps.sh            # 1-click Linux VPS installer
├── start.sh                # Linux VPS launcher
├── monitor.sh              # Real-time resource & process monitor
├── benchmark.sh            # 25-second performance benchmark tool
└── package.json            # Project dependencies
```

---

## 🌟 Key Performance & Fullscreen Features

1. **100% Borderless Fullscreen**:
   - Launches in Chromium Application Kiosk Mode (`--app`, `--start-fullscreen`, `--kiosk`).
   - Zero Chrome tabs, zero address bars, zero buttons, and zero window borders.
   - Automatically hides HTML5 player controls and progress bars.

2. **Featherlight CPU Optimization**:
   - Capped at 1 software raster thread (`--num-raster-threads=1`) and 1 FFmpeg thread (`-threads 1`).
   - Eliminates process contention on 2-vCPU VPS instances.
   - React UI in Discord Web is frozen (`visibility: hidden`) and local self-preview `<video>` tags are paused to eliminate duplicate decoding.

3. **Rock-Solid Audio Sync**:
   - Linux: PulseAudio virtual sink loopback (`Virtual_Sink.monitor` -> `Virtual_Mic`).
   - Windows: Direct WebRTC audio capture from browser media stream.
