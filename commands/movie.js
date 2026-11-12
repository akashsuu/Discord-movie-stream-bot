const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");
const { fetch, ProxyAgent } = require("undici");
const fs = require("fs");
const path = require("path");
const { TMDB_API_KEY } = require("../config");

const NO_MENTIONS = { parse: [], users: [], roles: [], repliedUser: false };
const PROXIES_FILE = path.join(__dirname, "..", "data", "proxies.json");

let activeProxyUrl = null;

function getProxyList() {
  const envProxies = process.env.TMDB_PROXIES
    ? process.env.TMDB_PROXIES.split(",").map((p) => p.trim()).filter(Boolean)
    : [];
  if (envProxies.length > 0) return envProxies;

  if (fs.existsSync(PROXIES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PROXIES_FILE, "utf-8"));
      if (Array.isArray(data.proxies)) {
        const urls = data.proxies.map((p) => p.url).filter(Boolean);
        if (urls.length > 0) return urls;
      }
    } catch (_) {}
  }
  return [];
}

async function searchTMDB(query) {
  const clean = query.replace(/^search\s+/i, "").trim();
  if (!clean) return [];

  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(clean)}&api_key=${TMDB_API_KEY}&include_adult=false`;

  const proxyList = getProxyList();
  const candidates = proxyList.length > 0
    ? [activeProxyUrl || proxyList[0], ...proxyList.filter((p) => p !== activeProxyUrl), null]
    : [null];

  for (const proxy of candidates) {
    try {
      const fetchOpts = {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      };
      if (proxy) {
        fetchOpts.dispatcher = new ProxyAgent(proxy);
      }

      const res = await fetch(url, fetchOpts);
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        const results = (data.results || []).filter(
          (item) => item.media_type === "movie" || item.media_type === "tv"
        );
        if (results.length > 0) {
          if (proxy) activeProxyUrl = proxy;
          return results;
        }
      }
    } catch (_) {}
  }

  return [];
}

module.exports = {
  name: "movie",
  aliases: ["tmdb", "film", "show"],
  description: "Search movies & TV shows for their TMDB ID and stream them into voice",
  guildOnly: false,
  searchTMDB,
  async execute(message, args) {
    const rawQuery = args.join(" ").trim();
    if (!rawQuery) {
      const helpMsg =
        "𝜗𝜚 **TMDB Search & Stream**\n" +
        "♡ Search any movie or TV series to get its TMDB ID and stream it live in voice.\n" +
        "• **Usage:** `.movie <name>` or `.movie search <name>`\n" +
        "-# Example: `.movie inception` or `.movie breaking bad`";

      try {
        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(helpMsg));
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
      } catch (_) {
        await message.reply({ content: helpMsg, allowedMentions: NO_MENTIONS });
      }
      return;
    }

    const results = await searchTMDB(rawQuery);

    if (results.length === 0) {
      const notFoundMsg =
        `✗ **No movies or TV shows found matching** \`${rawQuery}\`\n` +
        `-# Please check the spelling or try searching with simpler keywords.`;

      try {
        const container = new ContainerBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(notFoundMsg));
        await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: NO_MENTIONS });
      } catch (_) {
        await message.reply({ content: notFoundMsg, allowedMentions: NO_MENTIONS });
      }
      return;
    }

    const top = results[0];
    const topTitle = top.title || top.name || "Unknown";
    const topId = top.id;
    const topType = top.media_type === "tv" ? "tv" : "movie";
    const topTypeLabel = top.media_type === "tv" ? "TV Series" : "Movie";
    const rawDate = top.release_date || top.first_air_date || "";
    const topYear = rawDate ? rawDate.slice(0, 4) : "—";
    const topRating = top.vote_average ? `${top.vote_average.toFixed(1)}/10` : "No rating";
    const topOverview = top.overview
      ? (top.overview.length > 220 ? top.overview.slice(0, 217) + "..." : top.overview)
      : "No overview available.";
    const posterUrl = top.poster_path ? `https://image.tmdb.org/t/p/w500${top.poster_path}` : null;

    const similar = results.slice(1, 4);

    try {
      const container = new ContainerBuilder();

      // ── Main/Top Match Section ───────────────────────────────
      const topSection = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`𝜗𝜚 **${topTitle}** (${topYear})`),
        new TextDisplayBuilder().setContent(
          `♡ **TMDB ID:** \`${topId}\`  ·  **Type:** ${topTypeLabel}  ·  rating: ${topRating}\n\n` +
          `> *${topOverview}*`
        )
      );

      if (posterUrl) {
        topSection.setThumbnailAccessory(
          new ThumbnailBuilder().setURL(posterUrl).setDescription(`${topTitle} poster`)
        );
      }
      container.addSectionComponents(topSection);

      // Stream button for main title
      const topBtnLabel = `Stream: ${topTitle.length > 24 ? topTitle.slice(0, 22) + ".." : topTitle}`;
      const mainActionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_stream_movie:${topType}:${topId}`)
          .setLabel(topBtnLabel)
          .setStyle(ButtonStyle.Success)
      );
      container.addActionRowComponents(mainActionRow);

      // ── Similar Shows Section ────────────────────────────────
      if (similar.length > 0) {
        container
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("✦ **Similar Matches**")
          );

        for (const s of similar) {
          const sTitle = s.title || s.name || "Unknown";
          const sId = s.id;
          const sType = s.media_type === "tv" ? "tv" : "movie";
          const sTypeLabel = s.media_type === "tv" ? "TV Series" : "Movie";
          const sDate = s.release_date || s.first_air_date || "";
          const sYear = sDate ? sDate.slice(0, 4) : "—";
          const sRating = s.vote_average ? `${s.vote_average.toFixed(1)}/10` : "";
          const sPoster = s.poster_path ? `https://image.tmdb.org/t/p/w500${s.poster_path}` : null;
          const sOverview = s.overview
            ? (s.overview.length > 120 ? s.overview.slice(0, 117) + "..." : s.overview)
            : null;

          container.addSeparatorComponents(new SeparatorBuilder());

          const simSection = new SectionBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `⨾𓍢ִ໋ **${sTitle}** (${sYear})\n` +
              `• **TMDB ID:** \`${sId}\`  ·  **Type:** ${sTypeLabel}${sRating ? `  ·  rating: ${sRating}` : ""}` +
              (sOverview ? `\n> *${sOverview}*` : "")
            )
          );

          if (sPoster) {
            simSection.setThumbnailAccessory(
              new ThumbnailBuilder().setURL(sPoster).setDescription(`${sTitle} poster`)
            );
          }

          container.addSectionComponents(simSection);

          const simBtnLabel = `Stream: ${sTitle.length > 25 ? sTitle.slice(0, 23) + ".." : sTitle}`;
          container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`btn_stream_movie:${sType}:${sId}`)
                .setLabel(simBtnLabel)
                .setStyle(ButtonStyle.Secondary)
            )
          );
        }
      }

      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# 𝜗𝜚 Click any Stream button above to broadcast in voice  ·  Query: "${rawQuery}"`)
        );

      await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: NO_MENTIONS,
      });
    } catch (err) {
      console.error("[movie v2 error]", err);
      await message.reply({ content: `✗ Failed to display movie card: ${err.message}`, allowedMentions: NO_MENTIONS });
    }
  },
};
