#!/usr/bin/env bash
# ==============================================================================
#  COQUETTE DISCORD STREAM BOT — 1-CLICK LINUX VPS INSTALLER
#  Supports: Ubuntu 20.04 / 22.04 / 24.04 & Debian (ARM64 & x86_64)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}  COQUETTE DISCORD STREAM BOT — 1-CLICK LINUX VPS INSTALLER         ${NC}"
echo -e "${BLUE}====================================================================${NC}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# 1. Check Root / Sudo
if [ "$EUID" -ne 0 ] && ! command -v sudo >/dev/null 2>&1; then
    echo -e "${RED}[-] Please run this script as root or with sudo installed.${NC}"
    exit 1
fi
SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
fi

# 2. System Architecture
ARCH=$(uname -m)
echo -e "\n${YELLOW}[Step 1/8] Detecting System Architecture...${NC}"
echo -e "  * Architecture: ${ARCH}"
echo -e "  * Target Dir:   ${DIR}"

# 3. Update Repositories & Install Core Tools
echo -e "\n${YELLOW}[Step 2/8] Installing System Packages (FFmpeg, Xvfb, PulseAudio)...${NC}"
$SUDO DEBIAN_FRONTEND=noninteractive apt-get update -y
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    git \
    ca-certificates \
    ffmpeg \
    xvfb \
    pulseaudio \
    pulseaudio-utils \
    fonts-noto-color-emoji \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 2>/dev/null || $SUDO apt-get install -y libasound2 2>/dev/null || true

# 4. Configure Virtual PulseAudio Sink & Mic
echo -e "\n${YELLOW}[Step 3/8] Configuring Virtual Audio Loopback...${NC}"
pulseaudio --start --exit-idle-time=-1 2>/dev/null || true
pactl load-module module-null-sink sink_name=Virtual_Sink sink_properties=device.description=Virtual_Sink 2>/dev/null || true
pactl load-module module-virtual-source source_name=Virtual_Mic master=Virtual_Sink.monitor 2>/dev/null || true
pactl set-default-sink Virtual_Sink 2>/dev/null || true
pactl set-default-source Virtual_Mic 2>/dev/null || true

if [ -f /etc/pulse/default.pa ] && ! grep -q "Virtual_Sink" /etc/pulse/default.pa 2>/dev/null; then
    echo "load-module module-null-sink sink_name=Virtual_Sink sink_properties=device.description=Virtual_Sink" | $SUDO tee -a /etc/pulse/default.pa >/dev/null
    echo "load-module module-virtual-source source_name=Virtual_Mic master=Virtual_Sink.monitor" | $SUDO tee -a /etc/pulse/default.pa >/dev/null
    echo "set-default-sink Virtual_Sink" | $SUDO tee -a /etc/pulse/default.pa >/dev/null
    echo "set-default-source Virtual_Mic" | $SUDO tee -a /etc/pulse/default.pa >/dev/null
fi
echo -e "  [+] Virtual audio configured (Virtual_Sink -> Virtual_Mic)"

# 5. Check or Install Node.js
echo -e "\n${YELLOW}[Step 4/8] Checking Node.js Environment...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo "  [*] Installing Node.js LTS (v20)..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
fi
echo -e "  * Node.js: $(node -v)"
echo -e "  * npm:     $(npm -v)"

# 6. Install PM2
echo -e "\n${YELLOW}[Step 5/8] Checking PM2 Process Manager...${NC}"
if ! command -v pm2 >/dev/null 2>&1; then
    echo "  [*] Installing PM2 globally..."
    $SUDO npm install -g pm2
fi
echo -e "  * PM2:     v$(pm2 -v)"

# 7. Install Project Dependencies & Playwright
echo -e "\n${YELLOW}[Step 6/8] Installing Project Dependencies & Playwright...${NC}"
npm install
$SUDO npx playwright install-deps chromium 2>/dev/null || true
npx playwright install chromium

# Create symlinks if needed
PW_CHROME=$(ls -d $HOME/.cache/ms-playwright/chromium-*/chrome-linux* 2>/dev/null | head -n 1)
if [ -n "$PW_CHROME" ] && [ -f "${PW_CHROME}/chrome" ]; then
    $SUDO ln -sf "${PW_CHROME}/chrome" /usr/bin/chromium 2>/dev/null || true
    $SUDO ln -sf "${PW_CHROME}/chrome" /usr/local/bin/chromium 2>/dev/null || true
fi

# 8. Check Configuration (.env)
echo -e "\n${YELLOW}[Step 7/8] Verifying Configuration...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${YELLOW}  [!] Created .env from .env.example. Please update your tokens inside .env.${NC}"
    else
        echo -e "${RED}  [-] .env file missing! Please create a .env file with your tokens.${NC}"
    fi
else
    echo -e "  [+] .env file is present."
fi

mkdir -p logs browser-profile

# 9. Start with PM2
echo -e "\n${YELLOW}[Step 8/8] Starting Bot with PM2...${NC}"
pm2 delete discord-stream-bot 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}  INSTALLATION COMPLETE! BOT IS ONLINE!                             ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "  * Status:      pm2 status"
echo -e "  * Logs:        pm2 logs discord-stream-bot"
echo -e "  * Stop:        pm2 stop discord-stream-bot"
echo -e "  * Restart:     pm2 restart discord-stream-bot"
echo -e "  * Monitor:     bash monitor.sh"
echo -e "====================================================================\n"
