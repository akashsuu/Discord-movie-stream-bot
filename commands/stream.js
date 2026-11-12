const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { spawn } = require("child_process");
const path = require("path");
const {
  USER_TOKEN,
  GUILD_ID,
  VOICE_CHANNEL_ID,
  DISPLAY,
  PULSE_SINK,
  BROWSER_PATH,
} = require("../config");

const NO_MENTIONS = { parse: [], users: [], roles: [], repliedUser: false };

// Track active streams: channelId -> { proc, url, title, channelId, guildId, startTime }
const activeStreams = new Map();

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

function buildStreamControlPayload({ streamUrl, youtubeUrl, title = "Media", voiceChannelId = VOICE_CHANNEL_ID }) {
  const targetUrl = streamUrl || youtubeUrl || "";
  const isCinejoy = targetUrl.toLowerCase().includes("cinejoy");

  let desc =
    `• **Playing:** **${title}**\n` +
    `• **Platform:** Cinejoy\n` +
    `• **Voice Channel:** <#${voiceChannelId}>\n` +
    `• **Quality:** 480p 24 FPS (Smooth Playback)\n` +
    `• **Status:** Active & streaming in full screen`;

  if (!isCinejoy && targetUrl) {
    desc =
      `• **Playing:** **${title}**\n` +
      `• **Source:** <${targetUrl}>\n` +
      `• **Voice Channel:** <#${voiceChannelId}>\n` +
      `• **Quality:** 480p 24 FPS (Smooth Playback)\n` +
      `• **Status:** Active & streaming in full screen`;
  }

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("✦ **Voice Media Streamer**")
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(desc)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("btn_stream_stop")
          .setLabel("Stop & Leave Voice")
          .setStyle(ButtonStyle.Danger)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("-# 𝜗𝜚 Click Stop above or use `.stream stop` anytime")
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildStreamControlComponents(opts) {
  const payload = buildStreamControlPayload(opts);
  return payload.components;
}

function getActiveStream(channelId = VOICE_CHANNEL_ID) {
  if (channelId && activeStreams.has(channelId)) {
    return activeStreams.get(channelId);
  }
  return [...activeStreams.values()][0] || null;
}

async function stopStream(channelId = VOICE_CHANNEL_ID) {
  const stream = getActiveStream(channelId);
  if (!stream) return false;

  try {
    if (stream.proc && stream.proc.connected) {
      stream.proc.send({ type: "stop" });
    }
  } catch (_) {}

  setTimeout(() => {
    try {
      if (stream.proc && !stream.proc.killed) {
        stream.proc.kill("SIGTERM");
      }
    } catch (_) {}
  }, 2500);

  if (stream.channelId) activeStreams.delete(stream.channelId);
  activeStreams.delete(VOICE_CHANNEL_ID);
  return true;
}

async function launchStreamProcess(streamUrl, title = "Movie", targetVoiceId = null, targetGuildId = null, feedbackChannel = null) {
  const token = USER_TOKEN;
  const guildId = targetGuildId || GUILD_ID;
  const voiceChannelId = targetVoiceId || VOICE_CHANNEL_ID;

  if (activeStreams.has(voiceChannelId)) {
    await stopStream(voiceChannelId);
    await new Promise((r) => setTimeout(r, 1500));
  }

  const scriptPath = path.join(__dirname, "..", "streamlogic.js");

  const childEnv = { ...process.env };
  if (process.platform === "linux") {
    if (!childEnv.DISPLAY) childEnv.DISPLAY = DISPLAY || ":99";
    if (!childEnv.PULSE_SINK) childEnv.PULSE_SINK = PULSE_SINK || "Virtual_Sink";
    if (BROWSER_PATH && !childEnv.BROWSER_PATH) childEnv.BROWSER_PATH = BROWSER_PATH;
  }

  const proc = spawn(
    process.execPath || "node",
    [scriptPath, token, guildId, voiceChannelId, streamUrl],
    {
      windowsHide: false,
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: childEnv,
    }
  );

  const streamEntry = {
    proc,
    url: streamUrl,
    title,
    channelId: voiceChannelId,
    guildId,
    startTime: Date.now(),
  };

  activeStreams.set(voiceChannelId, streamEntry);

  let lastError = "";

  proc.stdout.on("data", (chunk) => {
    const out = chunk.toString().trim();
    if (out) {
      console.log(`[stream] ${out}`);
      if (out.includes("[-]") || out.includes("[!]")) {
        lastError = out;
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    const err = chunk.toString().trim();
    if (err) {
      console.warn(`[stream err] ${err}`);
      lastError = err;
    }
  });

  proc.on("close", (code) => {
    activeStreams.delete(voiceChannelId);
    console.log(`[stream] Stream process exited for channel ${voiceChannelId} with code ${code}`);
    if (code !== 0 && feedbackChannel) {
      const cleanErr = lastError.replace(/\[\-\]|\[stream err\]/g, "").trim();
      feedbackChannel.send({
        content: `⚠️ **Stream failed to start:**\n> ${cleanErr || "Process exited with code " + code}\n-# Check if \`USER_TOKEN\` in \`.env\` is valid and has access to the server.`
      }).catch(() => {});
    }
  });

  proc.on("error", (err) => {
    activeStreams.delete(voiceChannelId);
    console.error(`[stream] Spawn error:`, err.message);
    if (feedbackChannel) {
      feedbackChannel.send({
        content: `⚠️ **Stream launch error:** ${err.message}`
      }).catch(() => {});
    }
  });

  return streamEntry;
}

module.exports = {
  name: "stream",
  aliases: ["ytstream", "streamyt", "playvideo", "playmovie", "watch"],
  description: "Stream a Cinejoy movie or video into voice channel",
  activeStreams,
  buildStreamControlPayload,
  buildStreamControlComponents,
  getActiveStream,
  stopStream,
  launchStreamProcess,
  async execute(message, args) {
    const input = args.join(" ").trim();

    // 1. Handle stop command
    if (input === "stop" || input === "end" || input === "kill" || input === "leave") {
      const channelId = message.member?.voice?.channelId || VOICE_CHANNEL_ID;
      const stopped = await stopStream(channelId);
      if (!stopped) {
        const errContainer = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent("✗ **No active stream running to stop.**")
        );
        await message.reply({ components: [errContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
        return;
      }
      const stopContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent("✓ **Stream stopped.** Left voice channel and closed browser.")
      );
      await message.reply({ components: [stopContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
      return;
    }

    // 2. No arguments -> show help
    if (!input) {
      const helpText =
        "𝜗𝜚 **Cinejoy Voice Streamer**\n" +
        "♡ Stream any Cinejoy title directly into voice in full screen.\n" +
        "• **Search & Stream:** `.movie <name>` (gives stream buttons!)\n" +
        "• **Direct TMDB ID Stream:** `.stream <tmdb_id>` (e.g. `.stream 969681`)\n" +
        "• **Direct URL Stream:** `.stream <url>`\n" +
        "• **Stop Stream:** `.stream stop`";

      try {
        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(helpText));
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
      } catch (_) {
        await message.reply({ content: helpText, allowedMentions: NO_MENTIONS });
      }
      return;
    }

    let streamUrl = "";
    let mediaTitle = input;

    const targetVoiceId = message.member?.voice?.channelId || VOICE_CHANNEL_ID;
    const targetGuildId = message.guild?.id || GUILD_ID;

    // 3. Numeric TMDB ID -> Cinejoy
    if (/^\d+$/.test(input)) {
      streamUrl = `https://cinejoy.pk/watch/movie/${input}`;
      mediaTitle = `TMDB #${input}`;
    }
    // 4. URL
    else if (isValidUrl(input)) {
      streamUrl = input;
      mediaTitle = "Stream Media";
    }
    // 5. Search query -> Cinejoy
    else {
      try {
        const { searchTMDB } = require("./movie");
        const results = await searchTMDB(input);
        if (results && results.length > 0) {
          const top = results[0];
          const type = top.media_type === "tv" ? "tv" : "movie";
          streamUrl =
            type === "tv"
              ? `https://cinejoy.pk/watch/tv/${top.id}/1/1`
              : `https://cinejoy.pk/watch/movie/${top.id}`;
          mediaTitle = `${top.title || top.name || "Media"} (#${top.id})`;
        }
      } catch (_) {}

      if (!streamUrl) {
        streamUrl = `https://cinejoy.pk/watch/movie/${encodeURIComponent(input)}`;
      }
    }

    try {
      const payload = buildStreamControlPayload({
        streamUrl,
        title: mediaTitle,
        voiceChannelId: targetVoiceId,
      });
      await message.reply({
        ...payload,
        allowedMentions: NO_MENTIONS,
      });
    } catch (_) {
      const fallbackContent = `✦ **Starting Stream...**\n• Title: **${mediaTitle}**\n• Source: Cinejoy\n• Voice: <#${targetVoiceId}>\n-# Click Stop or use .stream stop to end.`;
      await message.reply({
        content: fallbackContent,
        allowedMentions: NO_MENTIONS,
      });
    }

    await launchStreamProcess(streamUrl, mediaTitle, targetVoiceId, targetGuildId, message.channel);
  },
};
