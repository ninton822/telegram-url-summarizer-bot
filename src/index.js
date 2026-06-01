import "dotenv/config";
import { run } from "@grammyjs/runner";
import { safeErr } from "./lib/errors.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let activeRunner = null;
let stopping = false;

process.on("unhandledRejection", (err) => {
  console.error("[runtime] unhandledRejection", { error: safeErr(err) });
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error("[runtime] uncaughtException", { error: safeErr(err) });
  process.exit(1);
});

async function importBootModule(path) {
  try {
    return await import(path);
  } catch (err) {
    console.error("[boot] module import failed", {
      path,
      code: err?.code || "UNKNOWN",
      error: safeErr(err)
    });

    if (err?.code === "ERR_MODULE_NOT_FOUND") {
      console.error("[boot] check that all relative imports include .js and referenced files exist under src");
    }

    throw err;
  }
}

async function stopRunner() {
  stopping = true;

  if (activeRunner) {
    try {
      activeRunner.stop();
      await activeRunner.task();
    } catch (err) {
      console.warn("[polling] runner stop warning", { error: safeErr(err) });
    }
  }
}

process.once("SIGINT", async () => {
  console.log("[shutdown] SIGINT received");
  await stopRunner();
  process.exit(0);
});

process.once("SIGTERM", async () => {
  console.log("[shutdown] SIGTERM received");
  await stopRunner();
  process.exit(0);
});

function startMemoryLog() {
  setInterval(() => {
    const m = process.memoryUsage();
    console.log("[mem]", {
      rssMB: Math.round(m.rss / 1e6),
      heapUsedMB: Math.round(m.heapUsed / 1e6)
    });
  }, 60_000).unref();
}

async function boot() {
  try {
    console.log("[boot] starting Link Brief Bot");

    const { cfg } = await importBootModule("./lib/config.js");
    const { createBot } = await importBootModule("./bot.js");
    const { registerCommands } = await importBootModule("./commands/loader.js");
    const { registerUrlSummarizer } = await importBootModule("./features/urlSummarizer.js");

    console.log("[boot] env sanity", {
      TELEGRAM_BOT_TOKEN_set: Boolean(cfg.TELEGRAM_BOT_TOKEN),
      COOKMYBOTS_AI_ENDPOINT_set: Boolean(cfg.COOKMYBOTS_AI_ENDPOINT),
      COOKMYBOTS_AI_KEY_set: Boolean(cfg.COOKMYBOTS_AI_KEY),
      COOKMYBOTS_X_ENDPOINT_set: Boolean(cfg.COOKMYBOTS_X_ENDPOINT),
      COOKMYBOTS_X_KEY_set: Boolean(cfg.COOKMYBOTS_X_KEY)
    });

    const missing = [];
    if (!cfg.TELEGRAM_BOT_TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
    if (!cfg.COOKMYBOTS_AI_ENDPOINT) missing.push("COOKMYBOTS_AI_ENDPOINT");
    if (!cfg.COOKMYBOTS_AI_KEY) missing.push("COOKMYBOTS_AI_KEY");

    if (missing.length > 0) {
      console.error("[boot] missing required env vars", { missing });
      console.error("[boot] add the missing keys in your environment or .env file, then redeploy");
      process.exit(1);
    }

    const bot = createBot(cfg.TELEGRAM_BOT_TOKEN);

    bot.catch((err) => {
      console.error("[telegram] bot middleware error", {
        updateId: err.ctx?.update?.update_id,
        error: safeErr(err.error || err)
      });
    });

    await bot.init();
    await registerCommands(bot);
    registerUrlSummarizer(bot);

    try {
      await bot.api.setMyCommands([
        { command: "start", description: "How to summarize links" },
        { command: "help", description: "Supported links and failures" }
      ]);
    } catch (err) {
      console.warn("[telegram] setMyCommands failed", { error: safeErr(err) });
    }

    startMemoryLog();

    let backoffMs = 2_000;

    while (!stopping) {
      try {
        console.log("[polling] clearing webhook before long polling");
        await bot.api.deleteWebhook({ drop_pending_updates: true });

        console.log("[polling] starting runner", { concurrency: 1 });
        activeRunner = run(bot, {
          runner: {
            sink: {
              concurrency: 1
            }
          }
        });

        console.log("[polling] runner started");
        await activeRunner.task();
        console.log("[polling] runner stopped");
        break;
      } catch (err) {
        const message = safeErr(err);
        const isConflict = message.includes("409") || message.toLowerCase().includes("conflict");

        console.warn("[polling] runner failure", {
          conflict: isConflict,
          backoffMs,
          error: message
        });

        if (activeRunner) {
          try {
            activeRunner.stop();
          } catch (stopErr) {
            console.warn("[polling] runner stop after failure warning", { error: safeErr(stopErr) });
          }
          activeRunner = null;
        }

        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs === 2_000 ? 5_000 : backoffMs * 2, 20_000);
      }
    }
  } catch (err) {
    console.error("[boot] fatal", { error: safeErr(err) });
    process.exit(1);
  }
}

boot();
