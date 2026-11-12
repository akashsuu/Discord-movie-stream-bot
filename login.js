/**
 * Discord Stream Bot - Main Unified Launcher / Entrypoint
 * - Runs Discord Bot (bot.js) for interactive commands (.movie, .stream, .help)
 * - Supports direct stream execution: node login.js stream "<url>"
 * - Fully Cross-Platform: Windows (10/11) & Linux VPS
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  BOT_TOKEN,
  USER_TOKEN,
  GUILD_ID,
  VOICE_CHANNEL_ID,
  USER_DATA_DIR,
  DISPLAY,
  PULSE_SINK,
  BROWSER_PATH,
  PREFIX,
  maskSecret,
} = require("./config");

const IS_WIN = process.platform === "win32";

console.log("====================================================================");
console.log("  COQUETTE DISCORD STREAM BOT - UNIFIED RUNTIME");
console.log("====================================================================");
console.log(`[*] Platform:     ${process.platform} (${process.arch})`);
console.log(`[*] Node.js:      ${process.version}`);
console.log(`[*] Display:      ${process.env.DISPLAY || DISPLAY || (IS_WIN ? "Native Windows Desktop" : ":99")}`);
console.log(`[*] Audio:        ${process.env.PULSE_SINK || PULSE_SINK || (IS_WIN ? "Default Windows Audio" : "Virtual_Sink")}`);
console.log(`[*] Chromium:     ${BROWSER_PATH || "Playwright Bundled Chromium"}`);
console.log(`[*] Profile Dir:  ${USER_DATA_DIR}`);
console.log(`[*] Bot Token:    ${maskSecret(BOT_TOKEN)}`);
console.log(`[*] User Token:   ${maskSecret(USER_TOKEN)}`);
console.log(`[*] Target Guild: ${GUILD_ID}`);
console.log(`[*] Voice Ch:     ${VOICE_CHANNEL_ID}`);
console.log(`[*] Prefix:       ${PREFIX}`);
console.log("====================================================================\n");

// Ensure directories exist
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

const args = process.argv.slice(2);
const firstArg = args[0]?.toLowerCase();

// Mode 1: Direct stream invocation
if (firstArg === "stream" || firstArg === "--stream" || firstArg?.startsWith("--url=")) {
  let streamUrl = args[1];
  if (firstArg.startsWith("--url=")) streamUrl = firstArg.substring(6);
  if (!streamUrl) streamUrl = process.env.STREAM_URL || "https://cinejoy.pk/watch/movie/969681";

  console.log(`[*] Direct Stream Mode invoked for: ${streamUrl}`);
  const { startDiscord } = require("./streamlogic");
  startDiscord(USER_TOKEN, GUILD_ID, VOICE_CHANNEL_ID, streamUrl).catch((err) => {
    console.error("[-] Direct stream failed:", err.message);
    process.exit(1);
  });
}
// Mode 2: Interactive login / profile setup
else if (firstArg === "setup" || firstArg === "--setup" || firstArg === "auth") {
  console.log("[*] Interactive Session Setup Mode.");
  const { chromium } = require("playwright");
  (async () => {
    const launchOpts = {
      headless: false,
      executablePath: BROWSER_PATH || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--window-size=1280,720"]
    };
    const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, launchOpts);
    const page = (await ctx.pages())[0] || (await ctx.newPage());
    await page.goto("https://discord.com/login", { timeout: 60000 });
    console.log("[+] Discord opened in persistent profile:", USER_DATA_DIR);
  })().catch((err) => {
    console.error("[-] Setup failed:", err.message);
    process.exit(1);
  });
}
// Mode 3: Discord Bot Service (Default - Handles .movie, .stream, buttons)
else {
  console.log("[*] Starting Discord Bot Service (bot.js)...");
  require("./bot");
}
