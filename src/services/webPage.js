const log = {
  info:  (...a) => console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

import dns from "node:dns/promises";
import * as cheerio from "cheerio";
import { safeErr } from "../lib/errors.js";

const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 12_000;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "LinkBriefBot/1.0 (+https://cookmybots.com; Telegram URL summarizer)";

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function isPrivateIPv4(address) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isPrivateIPv6(address) {
  const value = address.toLowerCase();
  return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80") || value === "::";
}

async function assertSafeUrl(url) {
  const parsed = new URL(url);

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Unsupported URL scheme");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Local URLs are not supported");
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: false });
  if (!records.length) {
    throw new Error("Could not resolve hostname");
  }

  for (const record of records) {
    if (record.family === 4 && isPrivateIPv4(record.address)) {
      throw new Error("Private network URLs are not supported");
    }
    if (record.family === 6 && isPrivateIPv6(record.address)) {
      throw new Error("Private network URLs are not supported");
    }
  }
}

function ensureTextContent(contentType) {
  const type = String(contentType || "").toLowerCase();
  if (!type) return;

  const ok =
    type.includes("text/html") ||
    type.includes("application/xhtml+xml") ||
    type.includes("text/plain");

  if (!ok) {
    throw new Error("Unsupported content type");
  }
}

export async function fetchPageHtml(url) {
  let currentUrl = url;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertSafeUrl(currentUrl);
    const timeout = withTimeout(FETCH_TIMEOUT_MS);

    try {
      log.info("[fetch] page start", { host: new URL(currentUrl).hostname, redirect });

      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1"
        },
        signal: timeout.signal
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect missing location");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Fetch failed with HTTP ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      ensureTextContent(contentType);

      const length = Number(response.headers.get("content-length") || 0);
      if (Number.isFinite(length) && length > MAX_BYTES) {
        throw new Error("Page is too large to summarize safely");
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > MAX_BYTES) {
        throw new Error("Page is too large to summarize safely");
      }

      const html = Buffer.from(arrayBuffer).toString("utf8");
      log.info("[fetch] page success", {
        host: new URL(currentUrl).hostname,
        bytes: arrayBuffer.byteLength,
        contentType: contentType.slice(0, 80)
      });

      return {
        finalUrl: currentUrl,
        contentType,
        html
      };
    } catch (err) {
      log.warn("[fetch] page failure", {
        host: (() => {
          try {
            return new URL(currentUrl).hostname;
          } catch {
            return "unknown";
          }
        })(),
        error: safeErr(err)
      });
      throw err;
    } finally {
      timeout.clear();
    }
  }

  throw new Error("Too many redirects");
}

function normalizeWhitespace(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function extractReadableText({ html, finalUrl }) {
  const $ = cheerio.load(html || "");

  $("script, style, noscript, svg, canvas, iframe, nav, footer, header, aside, form, button, input, select, textarea").remove();
  $("[aria-hidden='true'], [hidden]").remove();

  const title = normalizeWhitespace($("meta[property='og:title']").attr("content") || $("title").first().text() || "");
  const description = normalizeWhitespace(
    $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || ""
  );

  const candidates = [
    "article",
    "main",
    "[role='main']",
    ".article",
    ".post",
    ".entry-content",
    ".content",
    "body"
  ];

  let bestText = "";

  for (const selector of candidates) {
    const node = $(selector).first();
    if (!node.length) continue;

    const parts = [];
    node.find("h1,h2,h3,p,li,blockquote,pre").each((_, element) => {
      const text = normalizeWhitespace($(element).text());
      if (text.length >= 20) parts.push(text);
    });

    const candidate = normalizeWhitespace(parts.join("\n"));
    if (candidate.length > bestText.length) bestText = candidate;
  }

  let text = bestText || normalizeWhitespace($("body").text());
  if (description && !text.includes(description)) {
    text = normalizeWhitespace(`${description}\n${text}`);
  }

  text = text.slice(0, MAX_TEXT_CHARS);

  if (text.length < 80) {
    throw new Error("Not enough readable text found");
  }

  return {
    sourceType: "webpage",
    title: title || new URL(finalUrl).hostname,
    url: finalUrl,
    text
  };
}
