/**
 * Discord Automated Media Streamer - Playwright Headed Mode
 * Cross-Platform: Windows (10/11) & Linux VPS (Ubuntu/Debian ARM64/x86_64)
 * Resolution: 854x480 (480p 24 FPS - Maximum CPU Optimization & 100% Fullscreen)
 * Platform: Cinejoy & Universal HTML5 Video
 */

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const WebSocket = require("ws");
const {
  USER_TOKEN: DEFAULT_TOKEN,
  GUILD_ID: DEFAULT_GUILD_ID,
  VOICE_CHANNEL_ID: DEFAULT_VOICE_ID,
  USER_DATA_DIR,
  BROWSER_PATH,
  DISPLAY,
  maskSecret,
} = require("./config");

const DEFAULT_STREAM_URL = "https://cinejoy.pk/watch/movie/969681";
const PID_FILE = path.resolve(__dirname, "streamer.pid");
const IS_WIN = process.platform === "win32";

// Pre-allocated JPEG magic markers (avoid constant allocation in hot loop)
const JPEG_SOI = Buffer.from([0xff, 0xd8]);
const JPEG_EOI = Buffer.from([0xff, 0xd9]);

// Ensure virtual display is active on Linux (detects XRDP or spawns Xvfb :99)
function getOrStartDisplay() {
  if (IS_WIN) {
    return null; // Windows uses native desktop display
  }
  if (process.env.DISPLAY) {
    const dispNum = process.env.DISPLAY.replace(":", "").split(".")[0];
    if (fs.existsSync(`/tmp/.X11-unix/X${dispNum}`)) {
      return process.env.DISPLAY;
    }
  }
  try {
    if (fs.existsSync("/tmp/.X11-unix")) {
      const sockets = fs.readdirSync("/tmp/.X11-unix").filter((f) => f.startsWith("X"));
      if (sockets.length > 0) {
        const rdpSock = sockets.find((s) => parseInt(s.substring(1), 10) >= 10);
        const chosen = rdpSock || sockets[0];
        return `:${chosen.substring(1)}`;
      }
    }
  } catch (_) {}

  try {
    execSync("Xvfb :99 -screen 0 854x480x24 -ac +extension GLX -noreset >/dev/null 2>&1 &", { stdio: "ignore" });
    const start = Date.now();
    while (Date.now() - start < 1000) {}
    if (fs.existsSync("/tmp/.X11-unix/X99")) {
      return ":99";
    }
  } catch (_) {}

  return process.env.DISPLAY || ":99";
}

function ensurePulseAudio() {
  if (IS_WIN) {
    return; // Windows uses native DirectShow/WASAPI audio
  }
  try {
    execSync("pulseaudio --start --exit-idle-time=-1 2>/dev/null || true", { stdio: "ignore" });
    execSync("pactl load-module module-null-sink sink_name=Virtual_Sink sink_properties=device.description=Virtual_Sink 2>/dev/null || true", { stdio: "ignore" });
    execSync("pactl load-module module-virtual-source source_name=Virtual_Mic master=Virtual_Sink.monitor 2>/dev/null || true", { stdio: "ignore" });
    execSync("pactl set-default-sink Virtual_Sink 2>/dev/null || true", { stdio: "ignore" });
    execSync("pactl set-default-source Virtual_Mic 2>/dev/null || true", { stdio: "ignore" });
  } catch (_) {}
}

function checkSingleInstance() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, "utf8").trim(), 10);
      if (!isNaN(oldPid) && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          console.warn(`[!] Terminating existing streamer (PID ${oldPid})...`);
          process.kill(oldPid, "SIGTERM");
        } catch (_) {}
      }
    } catch (_) {}
  }
  fs.writeFileSync(PID_FILE, process.pid.toString(), "utf8");
}

/**
 * Creates ultra-low CPU WebSocket frame bridge for Discord WebRTC.
 * Automatically adapts between Linux (x11grab) and Windows (gdigrab).
 */
function createVirtualDisplayBridge(display, port = 9092) {
  let wss;
  try {
    wss = new WebSocket.Server({ port });
    console.log(`[*] Display WebSocket bridge listening on 127.0.0.1:${port}`);
  } catch (_) {
    wss = new WebSocket.Server({ port: 0 });
    port = wss.address().port;
    console.log(`[*] Display WebSocket bridge listening on 127.0.0.1:${port}`);
  }

  let activeFfmpeg = null;

  wss.on("connection", (ws) => {
    console.log("[*] Discord Web screen capture connected to display bridge.");

    const ffmpegArgs = IS_WIN
      ? [
          "-f", "gdigrab",
          "-draw_mouse", "0",
          "-framerate", "24",
          "-i", "desktop",
          "-vf", "scale=854:480",
          "-f", "image2pipe",
          "-vcodec", "mjpeg",
          "-pix_fmt", "yuvj420p",
          "-q:v", "11",
          "-threads", "1",
          "pipe:1",
        ]
      : [
          "-f", "x11grab",
          "-draw_mouse", "0",
          "-video_size", "854x480",
          "-framerate", "24",
          "-i", display || ":99",
          "-f", "image2pipe",
          "-vcodec", "mjpeg",
          "-pix_fmt", "yuvj420p",
          "-q:v", "11",
          "-threads", "1",
          "pipe:1",
        ];

    let ffmpeg;
    try {
      ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "ignore"] });
      activeFfmpeg = ffmpeg;
      if (!IS_WIN) {
        try { execSync(`renice -n 5 -p ${ffmpeg.pid} 2>/dev/null || true`); } catch (_) {}
      }
    } catch (err) {
      console.warn("[!] FFmpeg spawn warning:", err.message);
      return;
    }

    let buffer = Buffer.alloc(0);

    ffmpeg.stdout.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const startIdx = buffer.indexOf(JPEG_SOI);
        if (startIdx === -1) {
          if (buffer.length > 2) buffer = buffer.slice(-2);
          break;
        }
        const endIdx = buffer.indexOf(JPEG_EOI, startIdx + 2);
        if (endIdx === -1) {
          if (startIdx > 0) buffer = buffer.slice(startIdx);
          break;
        }
        const frame = buffer.slice(startIdx, endIdx + 2);
        buffer = buffer.slice(endIdx + 2);

        if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 524288) {
          ws.send(frame);
        }
      }
    });

    ws.on("close", () => {
      try { if (ffmpeg) ffmpeg.kill("SIGKILL"); } catch (_) {}
      if (activeFfmpeg === ffmpeg) activeFfmpeg = null;
    });

    ws.on("error", () => {
      try { if (ffmpeg) ffmpeg.kill("SIGKILL"); } catch (_) {}
    });
  });

  return {
    port,
    close() {
      try {
        if (activeFfmpeg) activeFfmpeg.kill("SIGKILL");
        wss.close();
      } catch (_) {}
    },
  };
}

async function prepareStreamTab(page, streamUrl) {
  let validUrl = streamUrl.trim();
  if (!/^https?:\/\//i.test(validUrl)) validUrl = "https://" + validUrl;

  console.log(`[*] Opening stream target: ${validUrl}`);
  if (!page.url() || page.url() === "about:blank") {
    await page.goto(validUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  }

  // Set title for native tab capture targeting
  await page.evaluate(() => {
    document.title = "StreamSource";
    setInterval(() => {
      if (document.title !== "StreamSource") document.title = "StreamSource";
    }, 1000);
  });

  // Inject borderless styling & strip non-video DOM elements
  await page.evaluate(() => {
    if (!document.getElementById("stream-expand-css")) {
      const style = document.createElement("style");
      style.id = "stream-expand-css";
      style.innerHTML = `
        *, *::before, *::after {
          animation: none !important;
          transition: none !important;
        }
        header, nav, footer, .sidebar, #comments, .comments, .related-videos, #secondary, .navbar, .ad, .ads, [class*="banner"], [class*="header"], [class*="nav"] {
          display: none !important;
          visibility: hidden !important;
        }
        video, iframe, .html5-video-player, .video-js, .plyr, #player, .player, [class*="player"] {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 2147483647 !important;
          max-width: none !important;
          max-height: none !important;
          background: #000 !important;
          border: none !important;
          margin: 0 !important;
          padding: 0 !important;
          object-fit: contain !important;
        }
        html, body {
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
          background: #000 !important;
          width: 100vw !important;
          height: 100vh !important;
        }
      `;
      document.documentElement.appendChild(style);
    }
  });

  // Automated playback activation loop & fullscreen trigger
  console.log("[*] Initializing automated Cinejoy video playback & fullscreen...");
  let isPlaying = false;

  for (let s = 1; s <= 12; s++) {
    await new Promise((r) => setTimeout(r, 1000));

    if (s === 3 || s === 6 || s === 9) {
      await page.mouse.click(427, 240).catch(() => {});
    }

    const res = await page.evaluate(() => {
      // 1. Accept cookies/terms
      const buttons = Array.from(document.querySelectorAll("button, svg, div[role='button']"));
      const acceptBtn = buttons.find((b) => {
        const t = (b.innerText || "").toLowerCase();
        return t.includes("accept all") || t.includes("i agree") || t.includes("reject all");
      });
      if (acceptBtn) acceptBtn.click();

      // 2. Click play targets
      const playTargets = document.querySelectorAll(
        "button[aria-label*='play' i], [class*='play-btn' i], [class*='playButton' i], .play, svg.lucide-play"
      );
      for (const el of playTargets) {
        const btn = el.closest("button") || el;
        if (btn && typeof btn.click === "function") btn.click();
      }

      // 3. Play video elements
      const videos = document.querySelectorAll("video");
      let active = false;
      let currTime = 0;

      videos.forEach((v) => {
        v.muted = false;
        if (v.paused) {
          v.play().catch(() => {
            v.muted = true;
            v.play().then(() => { v.muted = false; }).catch(() => {});
          });
        }
        if (!v.paused && v.currentTime > 0) {
          active = true;
          currTime = v.currentTime;
        }
      });

      // 4. Click player fullscreen button
      const fsBtn = buttons.find((b) => {
        const aria = (b.getAttribute("aria-label") || "").toLowerCase();
        const title = (b.getAttribute("title") || "").toLowerCase();
        const cls = (b.className || "").toString().toLowerCase();
        return aria.includes("fullscreen") || title.includes("fullscreen") || cls.includes("fullscreen") || cls.includes("maximize");
      });
      if (fsBtn) {
        try { fsBtn.click(); } catch (_) {}
      }

      return { hasVideos: videos.length > 0, isPlaying: active, currentTime: currTime };
    });

    if (res.isPlaying && res.currentTime > 0.2) {
      console.log(`[+] Cinejoy playback active at ${res.currentTime.toFixed(1)}s!`);
      isPlaying = true;
      break;
    }
  }

  // Move mouse to bottom-right corner out of the way so all player controls auto-hide
  await page.mouse.move(854, 480).catch(() => {});

  if (!isPlaying) {
    console.log("[*] Cinejoy player initialized in borderless mode.");
  }
}

async function startScreenShare(discordPage, streamPage) {
  console.log("[*] Preparing Discord screen sharing...");

  // Dismiss tooltips, popups, or orb alerts
  await discordPage.evaluate(() => {
    const closeBtns = document.querySelectorAll('button[aria-label*="Close" i], button[aria-label*="Dismiss" i]');
    closeBtns.forEach((b) => b.click());
    const popovers = document.querySelectorAll('div[class*="popout"], div[class*="tooltip"], div[class*="layerContainer"]');
    popovers.forEach((p) => {
      if (p.innerText && (p.innerText.includes("Orbs") || p.innerText.includes("Challenges"))) {
        p.remove();
      }
    });
  });
  await discordPage.keyboard.press("Escape").catch(() => {});
  await new Promise((r) => setTimeout(r, 1000));

  // Click "Share Your Screen"
  let clickedShare = false;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const actionBtns = discordPage.locator('div[class*="actionButtons"] button');
      const count = await actionBtns.count();
      if (count >= 2) {
        await actionBtns.nth(1).click({ timeout: 2000 });
        console.log(`[+] Clicked "Share Your Screen" via actionButtons[1] (attempt ${attempt}).`);
        clickedShare = true;
        break;
      }
    } catch (_) {}

    clickedShare = await discordPage.evaluate(() => {
      const span = Array.from(document.querySelectorAll("span")).find((s) => (s.textContent || "").trim() === "Share Your Screen");
      if (span) {
        const btn = span.id ? document.querySelector(`button[aria-describedby="${span.id}"]`) : null;
        if (btn) { btn.click(); return true; }
        const pBtn = span.closest("button");
        if (pBtn) { pBtn.click(); return true; }
      }

      const ariaBtn = document.querySelector('button[aria-label*="Share Your Screen" i], button[aria-label*="Share Screen" i]');
      if (ariaBtn) { ariaBtn.click(); return true; }

      return false;
    });

    if (clickedShare) {
      console.log(`[+] Clicked "Share Your Screen" (attempt ${attempt}).`);
      break;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Confirm Discord is Streaming or handle "Go Live" dialog
  console.log("[*] Verifying stream activation on Discord...");
  let isLive = false;

  for (let attempt = 1; attempt <= 12; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));

    const check = await discordPage.evaluate(() => {
      const text = document.body.innerText || "";
      if (text.includes("Screenshare active") || text.includes("Stop Streaming")) {
        return "already_live";
      }

      const dialog = document.querySelector('[role="dialog"], div[class*="modal"]');
      if (dialog) {
        const buttons = Array.from(dialog.querySelectorAll("button"));
        const goLive = buttons.find((b) => {
          const t = (b.innerText || "").trim().toLowerCase();
          return t === "go live" || t.includes("go live") || t === "share";
        });
        if (goLive) {
          goLive.click();
          return "clicked_go_live";
        }
      }

      return "waiting";
    });

    if (check === "already_live" || check === "clicked_go_live") {
      console.log(`[+] Discord screen share is ACTIVE! (${check})`);
      isLive = true;
      break;
    }
  }

  // Switch movie window to front
  if (streamPage) {
    try {
      await streamPage.bringToFront();
      await streamPage.evaluate(() => window.focus());
      await streamPage.mouse.move(854, 480);
      // Ensure player is fullscreen after switching tabs
      await streamPage.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll("button, svg, div[role='button']"));
        const fsBtn = buttons.find((b) => {
          const aria = (b.getAttribute("aria-label") || "").toLowerCase();
          const title = (b.getAttribute("title") || "").toLowerCase();
          const cls = (b.className || "").toString().toLowerCase();
          return aria.includes("fullscreen") || title.includes("fullscreen") || cls.includes("fullscreen") || cls.includes("maximize");
        });
        if (fsBtn) {
          try { fsBtn.click(); } catch (_) {}
        }
      });
    } catch (_) {}
  }

  // CPU OPTIMIZATION: Hide Discord UI completely & pause WebRTC self-preview to eliminate background CPU waste
  try {
    await discordPage.evaluate(() => {
      const appMount = document.getElementById("app-mount");
      if (appMount) {
        appMount.style.visibility = "hidden";
      }

      // Stop all CSS animations & transitions
      const style = document.createElement("style");
      style.innerHTML = "* { animation: none !important; transition: none !important; }";
      document.head.appendChild(style);

      // Pause any self-preview video elements
      document.querySelectorAll("video").forEach((v) => {
        try {
          if (v.srcObject && !v.paused) {
            v.pause();
            v.muted = true;
            v.style.display = "none";
          }
        } catch (_) {}
      });
    });
    console.log("[+] Discord Web UI visibility hidden (React rendering frozen, zero UI CPU waste).");
  } catch (_) {}

  return isLive;
}

async function startDiscord(token, guildId, channelId, streamUrl) {
  checkSingleInstance();
  ensurePulseAudio();

  if (!IS_WIN) {
    try { execSync(`renice -n -2 -p ${process.pid} 2>/dev/null || true`); } catch (_) {}
  }

  const cleanToken = (token || DEFAULT_TOKEN).trim().replace(/^["']|["']$/g, "");
  const activeGuildId = guildId || DEFAULT_GUILD_ID;
  const activeChannelId = channelId || DEFAULT_VOICE_ID;
  const activeStreamUrl = streamUrl || DEFAULT_STREAM_URL;

  const activeDisplay = getOrStartDisplay();
  if (activeDisplay) process.env.DISPLAY = activeDisplay;

  console.log("====================================================");
  console.log("  Discord Media Streamer (480p 24 FPS - Cinejoy)");
  console.log(`  100% Fullscreen Mode [${IS_WIN ? "Windows" : "Linux VPS"}]`);
  console.log("====================================================");
  console.log(`[*] Platform: ${process.platform} (${process.arch})`);
  console.log(`[*] Display:  ${activeDisplay || "Native Desktop"}`);
  console.log(`[*] Profile:  ${USER_DATA_DIR}`);
  console.log(`[*] Guild:    ${activeGuildId}`);
  console.log(`[*] Channel:  ${activeChannelId}`);
  console.log(`[*] URL:      ${activeStreamUrl}`);
  console.log(`[*] Token:    ${maskSecret(cleanToken)}`);

  const bridge = createVirtualDisplayBridge(activeDisplay, 9092);

  // Maximum CPU-Optimized & 100% Fullscreen Chromium Launch Arguments
  const launchOptions = {
    headless: false,
    executablePath: BROWSER_PATH || undefined,
    viewport: null,
    permissions: ["microphone", "notifications"],
    args: [
      `--app=${activeStreamUrl}`,
      "--start-fullscreen",
      "--kiosk",
      "--window-size=854,480",
      "--window-position=0,0",
      "--no-default-browser-check",
      "--no-first-run",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--num-raster-threads=1",
      "--renderer-process-limit=2",
      "--disable-crash-reporter",
      "--disable-breakpad",
      "--autoplay-policy=no-user-gesture-required",
      "--use-fake-ui-for-media-stream",
      "--allow-http-screen-capture",
      "--enable-usermedia-screen-capturing",
      "--auto-select-tab-capture-source-by-title=StreamSource",
      "--disable-web-security",
      "--disable-smooth-scrolling",
      "--disable-composited-antialiasing",
      "--enable-low-res-tiling",
      "--force-device-scale-factor=1",
      "--disable-features=Translate,OptimizationHints,MediaRouter,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,AutofillServerCommunication",
      "--disable-extensions",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      "--disable-session-crashed-bubble",
      "--hide-crash-restore-bubble"
    ],
    ignoreDefaultArgs: ["--enable-automation"],
  };

  console.log("[*] Launching 100% Fullscreen Chromium App instance...");
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, launchOptions);

  // Hook getDisplayMedia with event-driven low-overhead canvas draw / native tab fallback
  await context.addInitScript((bridgePort) => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    if (navigator.mediaDevices) {
      const origGet = navigator.mediaDevices.getDisplayMedia
        ? navigator.mediaDevices.getDisplayMedia.bind(navigator.mediaDevices)
        : null;

      navigator.mediaDevices.getDisplayMedia = async function (constraints) {
        console.log("[bridge] Attaching 480p 24 FPS video & audio stream...");
        const canvas = document.createElement("canvas");
        canvas.width = 854;
        canvas.height = 480;
        const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true, willReadFrequently: false });

        let receivedWsFrames = false;
        const ws = new WebSocket(`ws://127.0.0.1:${bridgePort}`);
        ws.binaryType = "blob";

        let isRendering = false;

        ws.onmessage = async (e) => {
          receivedWsFrames = true;
          if (isRendering) return;
          isRendering = true;
          try {
            const bmp = await createImageBitmap(e.data, { resizeWidth: 854, resizeHeight: 480, resizeQuality: "pixelated" });
            ctx.drawImage(bmp, 0, 0, 854, 480);
            bmp.close();
          } catch (_) {}
          isRendering = false;
        };

        // Allow 1.5s for WebSocket frames; if none (e.g. Windows non-FFmpeg), fall back to native tab capture
        await new Promise((r) => setTimeout(r, 1200));

        if (!receivedWsFrames && origGet) {
          try {
            console.log("[bridge] Falling back to native browser tab capture...");
            const nativeStream = await origGet({
              video: { displaySurface: "browser", width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
              audio: true
            });
            return nativeStream;
          } catch (_) {}
        }

        const canvasStream = canvas.captureStream(24);
        const vTrack = canvasStream.getVideoTracks()[0];

        let aTrack = null;
        try {
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });
          aTrack = mic.getAudioTracks()[0];
        } catch (_) {}

        const tracks = [vTrack];
        if (aTrack) tracks.push(aTrack);
        return new MediaStream(tracks);
      };
    }
  }, bridge.port);

  // Page 1: Movie (App Window)
  const pages = context.pages();
  const streamPage = pages[0] || (await context.newPage());
  await prepareStreamTab(streamPage, activeStreamUrl);

  // Page 2: Discord Web
  console.log("[*] Opening Discord Web in background...");
  const discordPage = await context.newPage();
  await discordPage.bringToFront();

  await discordPage.goto("https://discord.com/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  await discordPage.evaluate((tok) => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    document.body.appendChild(iframe);
    iframe.contentWindow.localStorage.setItem("token", JSON.stringify(tok));
    try { window.localStorage.setItem("token", JSON.stringify(tok)); } catch (_) {}
  }, cleanToken);

  const voiceUrl = `https://discord.com/channels/${activeGuildId}/${activeChannelId}`;
  console.log(`[*] Navigating to voice: ${voiceUrl}`);
  await discordPage.goto(voiceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Connect to voice
  console.log("[*] Connecting to voice channel...");
  for (let attempt = 1; attempt <= 15; attempt++) {
    await new Promise((r) => setTimeout(r, 2000));
    const connected = await discordPage.evaluate((chId) => {
      const disc = document.querySelector('button[aria-label*="Disconnect"]');
      if (disc) return true;
      const joinBtn = Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.innerText || "").toLowerCase();
        return t.includes("join voice") || t.includes("connect to voice");
      });
      if (joinBtn) { joinBtn.click(); return "clicked"; }
      const ch = document.querySelector(`[data-list-item-id*="${chId}"]`);
      if (ch) { ch.click(); return "clicked"; }
      return false;
    }, activeChannelId);

    if (connected === true) {
      console.log("[+] Connected to voice successfully!");
      break;
    }
  }

  // Start Screen Sharing
  await startScreenShare(discordPage, streamPage);

  // Bring movie window to front so screen grab captures the video
  await streamPage.bringToFront();
  await streamPage.evaluate(() => window.focus());
  await streamPage.mouse.move(854, 480);
  console.log("[+] Cinejoy media stream is LIVE in 100% FULLSCREEN! (480p 24 FPS - CPU Optimized)");

  async function cleanup() {
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (_) {}
    try {
      await discordPage.evaluate(() => {
        const disc = document.querySelector('button[aria-label*="Disconnect"]');
        if (disc) disc.click();
      });
    } catch (_) {}
    try { bridge.close(); } catch (_) {}
    try { await context.close(); } catch (_) {}
    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("message", (msg) => {
    if (msg && msg.type === "stop") cleanup();
  });
  context.on("close", cleanup);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const token = args[0] || DEFAULT_TOKEN;
  const guild = args[1] || DEFAULT_GUILD_ID;
  const channel = args[2] || DEFAULT_VOICE_ID;
  const url = args[3] || DEFAULT_STREAM_URL;

  startDiscord(token, guild, channel, url).catch((err) => {
    console.error("[-] Error:", err.message);
    try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { startDiscord };
