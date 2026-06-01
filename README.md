# Link Brief Bot

Link Brief is a Telegram URL summarizer built with Node.js ES modules and grammY. Users send links, and the bot replies with exactly 3 sentences.

## Features

1) Summarizes public webpage URLs.
2) Extracts readable HTML or text content and rejects unsupported content types.
3) Supports public x.com and twitter.com tweet or thread links through the CookMyBots X Gateway Proxy when configured.
4) Uses the CookMyBots AI Gateway for summarization.
5) Includes /start and /help commands.
6) Runs as a single Node.js process with long polling.
7) Adds safe logs for startup, URL detection, fetches, X gateway calls, AI calls, polling, and runtime errors.

## Architecture

src/index.js starts the bot, validates required environment variables, clears Telegram webhooks, and starts long polling with @grammyjs/runner.

src/bot.js creates the grammY bot instance.

src/commands contains /start and /help.

src/features/urlSummarizer.js detects URLs, applies group reply rules, enforces backpressure, and routes links to the right extractor.

src/services/webPage.js safely fetches and extracts readable webpage text.

src/services/xGateway.js retrieves public tweet or thread content through the CookMyBots X Gateway Proxy.

src/services/summarizer.js calls the AI helper and enforces exactly 3 sentences.

src/lib/ai.js wraps CookMyBots AI Gateway /chat requests.

No database is used because this bot does not need long-term memory.

## Setup

1) Install Node.js 18 or newer.
2) Run npm install.
3) Copy .env.sample to .env.
4) Fill the required values.
5) Run npm run dev for local development.
6) Run npm start in production.

## Environment variables

TELEGRAM_BOT_TOKEN is required.

COOKMYBOTS_AI_ENDPOINT is required and must be the base URL, for example https://api.cookmybots.com/api/ai.

COOKMYBOTS_AI_KEY is required.

COOKMYBOTS_X_ENDPOINT is optional for X/Twitter support.

COOKMYBOTS_X_KEY is optional for X/Twitter support.

AI_TIMEOUT_MS is optional and defaults to 600000.

AI_MAX_RETRIES is optional and defaults to 2.

CONCURRENCY is optional and defaults to 20.

## Commands

/start replies with onboarding instructions.

/help explains supported links and common failure cases.

## Examples

User sends:

https://example.com/article

Bot replies with a 3-sentence summary.

User sends:

https://x.com/someone/status/1234567890

Bot retrieves public tweet or thread text through CookMyBots X Gateway if configured, then replies with a 3-sentence summary.

## External integrations

Telegram Bot API is accessed through grammY.

CookMyBots AI Gateway is called at POST {COOKMYBOTS_AI_ENDPOINT}/chat with Authorization: Bearer COOKMYBOTS_AI_KEY.

CookMyBots X Gateway Proxy is called at POST {COOKMYBOTS_X_ENDPOINT}/proxy with Authorization: Bearer COOKMYBOTS_X_KEY. The bot never calls api.x.com or api.twitter.com directly.

## Deployment

Deploy as one Node.js web service or worker-style service that runs npm start. Set TELEGRAM_BOT_TOKEN, COOKMYBOTS_AI_ENDPOINT, and COOKMYBOTS_AI_KEY in the deployment environment. Add COOKMYBOTS_X_ENDPOINT and COOKMYBOTS_X_KEY only if X/Twitter summarization is needed.

## Troubleshooting

If startup fails, check required env vars. Startup logs only print true or false for secret presence.

If Telegram polling conflicts happen during deploy overlap, the runner backs off and retries.

If a URL fails, the page may be private, blocked, too large, deleted, behind a login wall, rate-limited, or not text-based.

If X/Twitter fails, verify the X Gateway env vars and connect an X account in CookMyBots.
