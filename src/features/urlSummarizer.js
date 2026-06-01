const log = {
  info:  (...a) => console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

import { cfg } from "../lib/config.js";
import { safeErr } from "../lib/errors.js";

import { fetchPageHtml, extractReadableText } from "../services/webPage.js";
import { summarizeDocument } from "../services/summarizer.js";
import { extractUrls, hostnameOf, isXUrl } from "../services/urlTools.js";
import { fetchXContent } from "../services/xGateway.js";

const chatLocks = new Set();
let globalInFlight = 0;

function chatKey(ctx) {
  return String(ctx.chat?.id || ctx.from?.id || "unknown");
}

function globalCap() {
  const configured = Number(cfg.CONCURRENCY || 20);
  if (!Number.isFinite(configured) || configured <= 0) return 1;
  return Math.max(1, Math.min(configured, 2));
}

function shouldHandleGroupMessage(ctx, text) {
  const chatType = ctx.chat?.type || "private";
  if (chatType === "private") return { ok: true, text };

  const botUsername = ctx.me?.username || ctx.botInfo?.username || "";
  const replyTo = ctx.message?.reply_to_message;
  const isReplyToBot = Boolean(replyTo?.from?.is_bot && botUsername && replyTo.from.username?.toLowerCase() === botUsername.toLowerCase());
  const mention = botUsername ? `@${botUsername}` : "";
  const isMentioned = mention ? text.toLowerCase().includes(mention.toLowerCase()) : false;

  if (!isMentioned && !isReplyToBot) return { ok: false, text };

  const cleaned = mention ? text.replace(new RegExp(`${mention}\\b`, "ig"), "").trim() : text;
  return { ok: true, text: cleaned };
}

async function summarizeUrl(ctx, url) {
  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  await ctx.reply(`Processing ${hostnameOf(url)}...`);

  let document;

  if (isXUrl(url)) {
    const xResult = await fetchXContent(url);

    if (!xResult.ok && !xResult.configured) {
      await ctx.reply("X/Twitter summarization is not configured. Set COOKMYBOTS_X_ENDPOINT and COOKMYBOTS_X_KEY, then connect an X account in CookMyBots.");
      return;
    }

    if (!xResult.ok) {
      await ctx.reply("I could not retrieve that tweet or thread. It may be private, deleted, rate-limited, or inaccessible.");
      return;
    }

    document = xResult.document;
  } else {
    const page = await fetchPageHtml(url);
    document = extractReadableText(page);
  }

  await ctx.api.sendChatAction(ctx.chat.id, "typing");
  const summary = await summarizeDocument(document);

  if (!summary.ok) {
    log.warn("[summary] failure", { host: hostnameOf(url), error: String(summary.error || "unknown").slice(0, 300) });
    await ctx.reply("I could not summarize this link right now. Please try again later.");
    return;
  }

  await ctx.reply(summary.content);
}

export function registerUrlSummarizer(bot) {
  bot.on("message:text", async (ctx, next) => {
    const raw = ctx.message?.text || "";
    if (raw.startsWith("/")) return next();

    const groupDecision = shouldHandleGroupMessage(ctx, raw);
    if (!groupDecision.ok) return next();

    const urls = extractUrls(groupDecision.text);
    log.info("[url] detection", {
      chatId: String(ctx.chat?.id || ""),
      count: urls.length,
      hosts: urls.map(hostnameOf)
    });

    if (urls.length === 0) {
      await ctx.reply("Send me a webpage, x.com, or twitter.com link and I will summarize it in 3 sentences.");
      return;
    }

    const key = chatKey(ctx);
    if (chatLocks.has(key)) {
      await ctx.reply("I’m working on your last request. Please wait a moment.");
      return;
    }

    if (globalInFlight >= globalCap()) {
      await ctx.reply("I’m busy summarizing another link. Please try again in a moment.");
      return;
    }

    chatLocks.add(key);
    globalInFlight += 1;

    try {
      for (const url of urls) {
        try {
          await summarizeUrl(ctx, url);
        } catch (err) {
          log.warn("[url] processing failure", {
            host: hostnameOf(url),
            error: safeErr(err)
          });
          await ctx.reply("I could not access or summarize that URL. It may be private, blocked, deleted, behind a login wall, or unsupported.");
        }
      }
    } finally {
      chatLocks.delete(key);
      globalInFlight = Math.max(0, globalInFlight - 1);
    }
  });
}
