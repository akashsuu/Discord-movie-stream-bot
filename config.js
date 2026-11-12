const fs = require("fs");
const path = require("path");

// 1. Lightweight fallback .env parser (works without external modules)
function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch (_) {}
}

// Attempt dotenv first if installed, then fallback parser
try {
  require("dotenv").config({ path: path.join(__dirname, ".env") });
} catch (_) {
  loadEnvFile(path.join(__dirname, ".env"));
}

// 2. Load config.json as fallback
const CONFIG_FILE = path.join(__dirname, "config.json");
let fileConfig = {};
try {
  if (fs.existsSync(CONFIG_FILE)) {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }
} catch (_) {}

// 3. Resolve user profile directory
const resolvedProfileDir =
  process.env.USER_DATA_DIR ||
  (fs.existsSync(path.join(__dirname, "browser-profile"))
    ? path.join(__dirname, "browser-profile")
    : (fs.existsSync(path.join(__dirname, "chrome_discord_profile"))
        ? path.join(__dirname, "chrome_discord_profile")
        : path.join(__dirname, "browser-profile")));

if (!fs.existsSync(resolvedProfileDir)) {
  try {
    fs.mkdirSync(resolvedProfileDir, { recursive: true });
  } catch (_) {}
}

// 4. Resolve default Chromium binary path (Linux & Windows)
function resolveBrowserPath() {
  if (process.env.BROWSER_PATH && fs.existsSync(process.env.BROWSER_PATH)) {
    return process.env.BROWSER_PATH;
  }
  if (process.platform === "linux") {
    const candidates = [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/snap/bin/chromium",
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
  } else if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${process.env.LOCALAPPDATA || ""}\\Google\\Chrome\\Application\\chrome.exe`,
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return p;
    }
  }
  // When null, Playwright uses its installed browser from `npx playwright install chromium`
  return null;
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN || fileConfig.BOT_TOKEN || "",
  USER_TOKEN: process.env.USER_TOKEN || fileConfig.USER_TOKEN || "",
  GUILD_ID: process.env.GUILD_ID || fileConfig.GUILD_ID || "1474805625018913043",
  VOICE_CHANNEL_ID: process.env.VOICE_CHANNEL_ID || fileConfig.VOICE_CHANNEL_ID || "1499087387320651919",
  PREFIX: process.env.PREFIX || fileConfig.PREFIX || ".",
  TMDB_API_KEY: process.env.TMDB_API_KEY || fileConfig.TMDB_API_KEY || "15d2ea6d0dc1d476efbca3eba2b9bbfb",

  // Display & Audio Settings
  DISPLAY: process.env.DISPLAY || (process.platform === "linux" ? ":99" : undefined),
  PULSE_SINK: process.env.PULSE_SINK || (process.platform === "linux" ? "Virtual_Sink" : undefined),
  HEADLESS: process.env.HEADLESS === "true", // Default false (headed mode)
  BROWSER_PATH: resolveBrowserPath(),
  USER_DATA_DIR: resolvedProfileDir,
  TAB_CAPTURE_KEYWORD: process.env.TAB_CAPTURE_KEYWORD || "Stream",

  // Helper to safely mask secrets in logs
  maskSecret(val) {
    if (!val || typeof val !== "string") return "[unset]";
    if (val.length <= 8) return "********";
    return val.slice(0, 4) + "..." + val.slice(-4);
  },
};
