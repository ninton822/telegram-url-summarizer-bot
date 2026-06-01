const URL_RE = /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;

function trimTrailingPunctuation(value) {
  return String(value || "").replace(/[),.;!?]+$/g, "");
}

export function extractUrls(text) {
  const found = [];
  const seen = new Set();
  const matches = String(text || "").matchAll(URL_RE);

  for (const match of matches) {
    const raw = trimTrailingPunctuation(match[0]);
    const withScheme = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;

    try {
      const parsed = new URL(withScheme);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;

      parsed.hash = "";
      const normalized = parsed.toString();

      if (!seen.has(normalized)) {
        seen.add(normalized);
        found.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return found.slice(0, 3);
}

export function isXUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com";
  } catch {
    return false;
  }
}

export function extractTweetId(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/status(?:es)?\/(\d+)/i);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "unknown";
  }
}
