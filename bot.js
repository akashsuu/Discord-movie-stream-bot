const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  ActivityType,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const {
  BOT_TOKEN,
  PREFIX,
  GUILD_ID,
  VOICE_CHANNEL_ID,
} = require("./config");

// Setup Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Load Commands
client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");

if (fs.existsSync(commandsDir)) {
  const commandFiles = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));
  for (const file of commandFiles) {
    const cmd = require(path.join(commandsDir, file));
    if (cmd.name) {
      client.commands.set(cmd.name, cmd);
      if (Array.isArray(cmd.aliases)) {
        for (const alias of cmd.aliases) {
          client.commands.set(alias, cmd);
        }
      }
      console.log(`[commands] Loaded: ${cmd.name}`);
    }
  }
}

// Ready Event
client.once(Events.ClientReady, (c) => {
  console.log("==================================================");
  console.log(`[+] Discord Stream Bot is ONLINE as: ${c.user.tag}`);
  console.log(`[+] Default Guild: ${GUILD_ID}`);
  console.log(`[+] Default Voice Channel: ${VOICE_CHANNEL_ID}`);
  console.log(`[+] Prefix: ${PREFIX}`);
  console.log("==================================================");

  c.user.setPresence({
    activities: [{ name: `${PREFIX}movie | ${PREFIX}stream`, type: ActivityType.Watching }],
    status: "online",
  });
});

// Message Command Handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const cmdName = args.shift()?.toLowerCase();
  if (!cmdName) return;

  const command = client.commands.get(cmdName);
  if (!command) return;

  try {
    await command.execute(message, args, { client });
  } catch (err) {
    console.error(`[command error] in ${cmdName}:`, err);
    await message.reply("Something went wrong while executing this command.").catch(() => {});
  }
});

// Interaction (Button) Handler
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const { customId } = interaction;

  // 1. Stop button
  if (customId === "btn_stream_stop") {
    const { stopStream } = require("./commands/stream");
    const voiceChannelId = interaction.member?.voice?.channelId || VOICE_CHANNEL_ID;
    const stopped = await stopStream(voiceChannelId);

    if (stopped) {
      const stopContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent("✓ **Stream stopped.** Left voice channel and closed browser.")
      );
      await interaction.update({
        components: [stopContainer],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    } else {
      const errContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent("✗ **No active stream found running.**")
      );
      await interaction.reply({
        components: [errContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
    }
    return;
  }

  // 2. Stream Movie/Show button (Cinejoy exclusively)
  if (customId.startsWith("btn_stream_movie:")) {
    const { launchStreamProcess, buildStreamControlPayload } = require("./commands/stream");
    const parts = customId.split(":");
    const mediaType = parts[1] || "movie";
    const tmdbId = parts[2];

    const streamUrl =
      mediaType === "tv"
        ? `https://cinejoy.pk/watch/tv/${tmdbId}/1/1`
        : `https://cinejoy.pk/watch/movie/${tmdbId}`;

    const voiceChannelId = interaction.member?.voice?.channelId || VOICE_CHANNEL_ID;
    const guildId = interaction.guildId || GUILD_ID;
    const mediaTitle = `TMDB #${tmdbId}`;

    await interaction.deferReply().catch(() => {});

    try {
      launchStreamProcess(streamUrl, mediaTitle, voiceChannelId, guildId, interaction.channel).catch((err) => {
        console.error("[stream] Launch error:", err.message);
      });

      const payload = buildStreamControlPayload({
        streamUrl,
        title: mediaTitle,
        voiceChannelId,
      });

      await interaction.editReply(payload);
    } catch (err) {
      console.error("[stream button] Reply error:", err);
      const errContainer = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`✗ **Failed to start stream:** ${err.message}`)
      );
      await interaction.followUp({
        components: [errContainer],
        flags: MessageFlags.IsComponentsV2,
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// Graceful Shutdown
function handleShutdown() {
  console.log("\n[*] Shutting down Stream Bot...");
  try {
    const { stopStream } = require("./commands/stream");
    stopStream();
  } catch (_) {}
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", handleShutdown);
process.on("SIGTERM", handleShutdown);

// Login to Discord
client.login(BOT_TOKEN).catch((err) => {
  console.error("[-] Failed to login to Discord Bot:", err.message);
  process.exit(1);
});
