import { cfg } from "./config.js";
import { safeErr } from "./errors.js";
import { log } from "./log.js";

function trimBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

function isRetryable(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

export async function aiChat({ messages, meta = {}, timeoutMs = cfg.AI_TIMEOUT_MS, retries = cfg.AI_MAX_RETRIES }) {
  const base = trimBaseUrl(cfg.COOKMYBOTS_AI_ENDPOINT);
  const key = cfg.COOKMYBOTS_AI_KEY;

  if (!base || !key) {
    const error = "AI gateway is not configured";
    log.error("[ai] chat failure", { feature: "chat", configured: false, error });
    return { ok: false, error };
  }

  const safeTimeout = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0 ? Number(timeoutMs) : 600000;
  const safeRetries = Number.isFinite(Number(retries)) && Number(retries) >= 0 ? Number(retries) : 2;

  let attempt = 0;
  const startedAt = Date.now();

  while (attempt <= safeRetries) {
    attempt += 1;
    const timeout = timeoutSignal(safeTimeout);

    try {
      log.info("[ai] chat start", {
        platform: "telegram",
        feature: "url_summary",
        attempt,
        timeoutMs: safeTimeout
      });

      const response = await fetch(`${base}/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          meta: {
            platform: "telegram",
            feature: "url_summary",
            ...meta
          }
        }),
        signal: timeout.signal
      });

      const { json, text } = await readJson(response);

      if (!response.ok) {
        const error = json?.error?.message || json?.message || json?.error || text || `HTTP ${response.status}`;
        log.warn("[ai] chat failure", {
          platform: "telegram",
          feature: "url_summary",
          attempt,
          status: response.status,
          error: String(error).slice(0, 500)
        });

        if (attempt <= safeRetries && isRetryable(response.status)) {
          await sleep(750 * attempt);
          continue;
        }

        return { ok: false, error: String(error), status: response.status };
      }

      const content = json?.output?.content;

      if (typeof content !== "string" || !content.trim()) {
        const error = "AI gateway returned no chat content";
        log.warn("[ai] chat failure", {
          platform: "telegram",
          feature: "url_summary",
          attempt,
          status: response.status,
          error
        });
        return { ok: false, error, status: response.status };
      }

      log.info("[ai] chat success", {
        platform: "telegram",
        feature: "url_summary",
        attempt,
        status: response.status,
        ms: Date.now() - startedAt
      });

      return {
        ok: true,
        content: content.trim(),
        id: json?.id || "",
        usage: json?.usage || null
      };
    } catch (err) {
      const error = err?.name === "AbortError" ? "AI request timed out" : safeErr(err);
      log.warn("[ai] chat failure", {
        platform: "telegram",
        feature: "url_summary",
        attempt,
        error
      });

      if (attempt <= safeRetries) {
        await sleep(750 * attempt);
        continue;
      }

      return { ok: false, error };
    } finally {
      timeout.clear();
    }
  }

  return { ok: false, error: "AI request failed" };
}
