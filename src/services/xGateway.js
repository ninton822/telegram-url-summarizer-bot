const log = {
  info:  (...a) => console.log(...a),
  warn:  (...a) => console.warn(...a),
  error: (...a) => console.error(...a),
};

import { cfg } from "../lib/config.js";
import { safeErr } from "../lib/errors.js";

import { extractTweetId } from "./urlTools.js";

function trimBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function xProxy({ path, method = "GET", query, body }) {
  const base = trimBaseUrl(cfg.COOKMYBOTS_X_ENDPOINT);
  const key = cfg.COOKMYBOTS_X_KEY;

  if (!base || !key) {
    return {
      ok: false,
      status: 412,
      error: "X/Twitter summarization is not configured"
    };
  }

  const timeout = timeoutSignal(30_000);

  try {
    const response = await fetch(`${base}/proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path, method, query, body }),
      signal: timeout.signal
    });

    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!response.ok) {
      const error = json?.error?.message || json?.message || json?.error || text || `HTTP ${response.status}`;
      return { ok: false, status: response.status, error: String(error), json };
    }

    return { ok: true, status: response.status, json };
  } catch (err) {
    return { ok: false, status: err?.name === "AbortError" ? 408 : 0, error: safeErr(err), json: null };
  } finally {
    timeout.clear();
  }
}

function tweetData(json) {
  return json?.data || json?.result?.data || json?.response?.data || null;
}

function includesData(json) {
  return json?.includes || json?.result?.includes || json?.response?.includes || {};
}

function formatTweet(tweet, usersById = new Map()) {
  if (!tweet?.text) return "";
  const author = usersById.get(tweet.author_id);
  const name = author?.username ? `@${author.username}` : "tweet";
  return `${name}: ${tweet.text}`;
}

export async function fetchXContent(url) {
  const tweetId = extractTweetId(url);

  if (!tweetId) {
    return {
      ok: false,
      configured: Boolean(cfg.COOKMYBOTS_X_ENDPOINT && cfg.COOKMYBOTS_X_KEY),
      error: "No tweet status ID found"
    };
  }

  if (!cfg.COOKMYBOTS_X_ENDPOINT || !cfg.COOKMYBOTS_X_KEY) {
    log.warn("[x] content fetch failure", { configured: false, reason: "missing_x_gateway_env" });
    return {
      ok: false,
      configured: false,
      error: "X/Twitter summarization is not configured"
    };
  }

  log.info("[x] content fetch start", { tweetId });

  const single = await xProxy({
    path: `/2/tweets/${tweetId}`,
    method: "GET",
    query: {
      "tweet.fields": "author_id,conversation_id,created_at,text",
      expansions: "author_id",
      "user.fields": "username,name"
    }
  });

  if (!single.ok) {
    log.warn("[x] content fetch failure", { tweetId, status: single.status, error: String(single.error || "").slice(0, 300) });
    return {
      ok: false,
      configured: true,
      error: "The tweet or thread may be private, deleted, rate-limited, or inaccessible"
    };
  }

  const tweet = tweetData(single.json);
  if (!tweet?.text) {
    log.warn("[x] content fetch failure", { tweetId, status: single.status, error: "missing_tweet_text" });
    return {
      ok: false,
      configured: true,
      error: "The tweet or thread may be private, deleted, rate-limited, or inaccessible"
    };
  }

  const users = includesData(single.json)?.users || [];
  const usersById = new Map(users.map((user) => [user.id, user]));
  const lines = [formatTweet(tweet, usersById)];

  if (tweet.conversation_id && tweet.author_id) {
    const thread = await xProxy({
      path: "/2/tweets/search/recent",
      method: "GET",
      query: {
        query: `conversation_id:${tweet.conversation_id} from:${tweet.author_id} -is:retweet`,
        max_results: "10",
        "tweet.fields": "author_id,created_at,text",
        expansions: "author_id",
        "user.fields": "username,name"
      }
    });

    if (thread.ok) {
      const threadTweets = Array.isArray(tweetData(thread.json)) ? tweetData(thread.json) : [];
      const threadUsers = includesData(thread.json)?.users || [];
      const threadUsersById = new Map([...usersById, ...threadUsers.map((user) => [user.id, user])]);

      const sorted = threadTweets
        .filter((item) => item?.id && item?.text)
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

      for (const item of sorted) {
        const line = formatTweet(item, threadUsersById);
        if (line && !lines.includes(line)) lines.push(line);
      }
    } else {
      log.warn("[x] thread fetch fallback", { tweetId, status: thread.status, error: String(thread.error || "").slice(0, 300) });
    }
  }

  const text = lines.join("\n").trim();

  log.info("[x] content fetch success", { tweetId, chars: text.length, lines: lines.length });

  return {
    ok: true,
    configured: true,
    document: {
      sourceType: "x_twitter",
      title: "X/Twitter post",
      url,
      text: text.slice(0, 12_000)
    }
  };
}
