const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const { PREFIX } = require("../config");

const NO_MENTIONS = { parse: [], users: [], roles: [], repliedUser: false };

module.exports = {
  name: "help",
  aliases: ["commands", "h"],
  description: "Display help information for the Stream Bot",
  async execute(message) {
    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `𝜗𝜚 **Stream Bot — Commands**\n-# prefix: \`${PREFIX}\`  ·  voice movie & media streamer`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "♡ **Media & Voice Stream**\n" +
          `• \`${PREFIX}movie <name>\` (\`.tmdb\`) — search movie/show to get TMDB ID & stream buttons\n` +
          `• \`${PREFIX}stream <url>\` — stream YouTube or custom video link in voice\n` +
          `• \`${PREFIX}stream <tmdb_id>\` — stream directly by TMDB movie or TV ID\n` +
          `• \`${PREFIX}stream <name>\` — search title and stream top match directly\n` +
          `• \`${PREFIX}stream stop\` — disconnect from voice and close browser\n` +
          `• \`${PREFIX}help\` — view this command reference`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          "✦ **Access & Features**\n" +
          "• Automatic full-screen playback & tab capture\n" +
          "• Interactive stream & stop buttons in channel\n" +
          "• Automatically connects to your active voice channel or `.public`"
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# 𝜗𝜚 type \`${PREFIX}movie <title>\` to start streaming in voice`
        )
      );

    try {
      await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_MENTIONS,
      });
    } catch (_) {
      const fallback =
        `𝜗𝜚 **Stream Bot — Commands**\n` +
        `• \`${PREFIX}movie <name>\` — search movie/show with stream buttons\n` +
        `• \`${PREFIX}stream <url|id>\` — stream video or TMDB ID\n` +
        `• \`${PREFIX}stream stop\` — stop stream and leave voice`;
      await message.reply({ content: fallback, allowedMentions: NO_MENTIONS });
    }
  },
};
