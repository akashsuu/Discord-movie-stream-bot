#!/usr/bin/env bash
# ==============================================================================
#  ORACLE CLOUD VPS - XFCE RDP & PLAYWRIGHT STREAMER INSTALLATION SCRIPT
#  Supports: Ubuntu 22.04 / 24.04 (ARM64 & x86_64)
# ==============================================================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================================${NC}"
echo -e "${BLUE}  ORACLE CLOUD VPS - XFCE RDP & STREAMER AUTOMATED INSTALLER        ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# 1. System & Architecture Detection
echo -e "\n${YELLOW}[Step 1/11] Detecting System Environment...${NC}"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VER=$VERSION_ID
else
    echo -e "${RED}[-] Unsupported operating system.${NC}"
    exit 1
fi

ARCH=$(uname -m)
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
DISK_AVAIL_GB=$(df -BG / | awk 'NR==2{print $4}' | tr -d 'G')

echo -e "  * OS:           ${OS_NAME} ${OS_VER}"
echo -e "  * Architecture: ${ARCH}"
echo -e "  * Total RAM:    ${TOTAL_RAM_MB} MB"
echo -e "  * Disk Avail:   ${DISK_AVAIL_GB} GB"

if [ "$TOTAL_RAM_MB" -lt 1800 ]; then
    echo -e "${YELLOW}[!] Warning: System has less than 2 GB RAM. Performance may be constrained.${NC}"
fi

# 2. Fix IPv6 Precedence if needed (prevents Oracle Cloud timeout on IPv6)
if [ -f /etc/gai.conf ]; then
    sudo sed -i 's/^#precedence ::ffff:0:0\/96  100/precedence ::ffff:0:0\/96  100/' /etc/gai.conf || true
fi

# 3. Update Package Repositories
echo -e "\n${YELLOW}[Step 2/11] Updating System Repositories...${NC}"
sudo DEBIAN_FRONTEND=noninteractive apt-get update -y

# 4. Install Desktop Environment (XFCE4) & XRDP
echo -e "\n${YELLOW}[Step 3/11] Installing XFCE4 Desktop & XRDP Server...${NC}"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    xfce4 \
    xfce4-goodies \
    xrdp \
    xorgxrdp \
    dbus-x11 \
    pulseaudio \
    pulseaudio-utils \
    pavucontrol \
    ffmpeg \
    git \
    curl \
    ca-certificates \
    fonts-noto-color-emoji \
    fonts-liberation

# 5. Configure XRDP Sessions & Persistence
echo -e "\n${YELLOW}[Step 4/11] Configuring XRDP for Session Persistence...${NC}"
sudo adduser xrdp ssl-cert 2>/dev/null || true

# Configure user .xsession
TARGET_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~${TARGET_USER}")
echo "xfce4-session" > "${USER_HOME}/.xsession"
chown "${TARGET_USER}:${TARGET_USER}" "${USER_HOME}/.xsession"
chmod 644 "${USER_HOME}/.xsession"

# Configure startwm.sh
sudo cp -n /etc/xrdp/startwm.sh /etc/xrdp/startwm.sh.bak 2>/dev/null || true
sudo sed -i 's/^test -x \/etc\/X11\/Xsession/# test -x \/etc\/X11\/Xsession/' /etc/xrdp/startwm.sh || true
sudo sed -i 's/^exec \/bin\/sh \/etc\/X11\/Xsession/# exec \/bin\/sh \/etc\/X11\/Xsession/' /etc/xrdp/startwm.sh || true

if ! grep -q 'startxfce4' /etc/xrdp/startwm.sh; then
    sudo bash -c 'cat >> /etc/xrdp/startwm.sh << "EOF"
unset DBUS_SESSION_BUS_ADDRESS
unset XDG_RUNTIME_DIR
exec startxfce4
EOF'
fi

# Configure sesman.ini: Prevent session killing on disconnect
sudo cp -n /etc/xrdp/sesman.ini /etc/xrdp/sesman.ini.bak 2>/dev/null || true
sudo sed -i 's/^KillDisconnected=.*/KillDisconnected=false/' /etc/xrdp/sesman.ini || true
sudo sed -i 's/^DisconnectedTimeLimit=.*/DisconnectedTimeLimit=0/' /etc/xrdp/sesman.ini || true
sudo sed -i 's/^IdleTimeLimit=.*/IdleTimeLimit=0/' /etc/xrdp/sesman.ini || true

sudo systemctl enable xrdp
sudo systemctl restart xrdp

# Configure Virtual PulseAudio sink & source for Headed Streaming
if ! grep -q "Virtual_Sink" /etc/pulse/default.pa 2>/dev/null; then
    echo "load-module module-null-sink sink_name=Virtual_Sink sink_properties=device.description=Virtual_Sink" | sudo tee -a /etc/pulse/default.pa >/dev/null
    echo "load-module module-virtual-source source_name=Virtual_Mic master=Virtual_Sink.monitor" | sudo tee -a /etc/pulse/default.pa >/dev/null
    echo "set-default-sink Virtual_Sink" | sudo tee -a /etc/pulse/default.pa >/dev/null
    echo "set-default-source Virtual_Mic" | sudo tee -a /etc/pulse/default.pa >/dev/null
fi

# 6. Open Firewall Port 3389 for RDP
echo -e "\n${YELLOW}[Step 5/11] Configuring Firewall Rules for RDP (Port 3389)...${NC}"
if ! sudo iptables -C INPUT -p tcp --dport 3389 -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 4 -p tcp --dport 3389 -j ACCEPT
    echo -e "  [+] Port 3389 opened in iptables."
fi
sudo netfilter-persistent save 2>/dev/null || true

# 7. Install Node.js LTS (v20/v22)
echo -e "\n${YELLOW}[Step 6/11] Checking / Installing Node.js LTS...${NC}"
if ! command -v node >/dev/null 2>&1; then
    echo "  [*] Installing Node.js 20 LTS from NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo -e "  * Node.js version: $(node -v)"
echo -e "  * npm version:     $(npm -v)"

# 8. Install PM2 Globally
echo -e "\n${YELLOW}[Step 7/11] Installing PM2 Process Manager...${NC}"
if ! command -v pm2 >/dev/null 2>&1; then
    sudo npm install -g pm2
fi
echo -e "  * PM2 version: $(pm2 -v)"

# 9. Configure Project Directory
echo -e "\n${YELLOW}[Step 8/11] Setting up /opt/discord-streamer...${NC}"
sudo mkdir -p /opt/discord-streamer/{logs,browser-profile}
sudo chown -R "${TARGET_USER}:${TARGET_USER}" /opt/discord-streamer

cd /opt/discord-streamer

# Ensure package.json dependencies installed
if [ -f "package.json" ]; then
    npm install
fi

# 10. Install Playwright & Compatible Chromium
echo -e "\n${YELLOW}[Step 9/11] Installing Playwright Chromium for ${ARCH}...${NC}"
sudo npx playwright install-deps chromium 2>/dev/null || true
npx playwright install chromium

# Symlink Playwright Chromium globally
PW_CHROMIUM_DIR=$(ls -d ${USER_HOME}/.cache/ms-playwright/chromium-*/chrome-linux* 2>/dev/null | head -n 1)
if [ -n "$PW_CHROMIUM_DIR" ] && [ -f "${PW_CHROMIUM_DIR}/chrome" ]; then
    sudo ln -sf "${PW_CHROMIUM_DIR}/chrome" /usr/bin/chromium
    sudo ln -sf "${PW_CHROMIUM_DIR}/chrome" /usr/bin/google-chrome
    sudo ln -sf "${PW_CHROMIUM_DIR}/chrome" /usr/local/bin/chromium
    sudo ln -sf "${PW_CHROMIUM_DIR}/chrome" /usr/local/bin/google-chrome
    echo -e "  [+] Global browser symlinks created -> ${PW_CHROMIUM_DIR}/chrome"
fi

# 11. Verification & Diagnostics
echo -e "\n${YELLOW}[Step 10/11] Verifying System Installations...${NC}"
XRDP_ACTIVE=$(systemctl is-active xrdp || echo "inactive")
CHROME_VER=$(chromium --version 2>/dev/null || echo "not found")
NODE_VER=$(node -v 2>/dev/null || echo "not found")
PM2_VER=$(pm2 -v 2>/dev/null || echo "not found")
PULSE_VER=$(pulseaudio --version 2>/dev/null | head -n 1 || echo "not found")

echo -e "  [+] XRDP Service:   ${XRDP_ACTIVE}"
echo -e "  [+] Chromium:       ${CHROME_VER}"
echo -e "  [+] Node.js:        ${NODE_VER}"
echo -e "  [+] PM2:            ${PM2_VER}"
echo -e "  [+] PulseAudio:     ${PULSE_VER}"

# Check user password status
PASS_STATUS=$(sudo passwd -S "${TARGET_USER}" | awk '{print $2}')
if [ "$PASS_STATUS" != "P" ]; then
    echo -e "\n${YELLOW}[Step 11/11] Setting Password for RDP Login...${NC}"
    echo -e "  [!] User '${TARGET_USER}' does not have a password set."
    echo -e "  [!] Please enter a password for '${TARGET_USER}' to use when logging in via RDP:"
    sudo passwd "${TARGET_USER}"
else
    echo -e "\n${GREEN}[Step 11/11] User '${TARGET_USER}' has an active password set.${NC}"
fi

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}  INSTALLATION COMPLETE!                                            ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "  * RDP Port:     3389"
echo -e "  * RDP Username: ${TARGET_USER}"
echo -e "  * Project Dir:  /opt/discord-streamer/"
echo -e "  * Manage App:   pm2 start ecosystem.config.js"
echo -e "====================================================================\n"
