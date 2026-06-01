# Link Brief Bot

Link Brief is a Telegram bot that summarizes URLs sent by users. Send a webpage, x.com, or twitter.com link and the bot replies with exactly 3 sentences when the content can be accessed publicly.

## Commands

### /start

Shows quick instructions. It tells users to send any URL and explains that public x.com and twitter.com links are supported.

Usage:

/start

### /help

Explains supported webpage links, X/Twitter tweet and thread links, and common failure cases.

Usage:

/help

## Message behavior

Send any normal Telegram text message containing one or more URLs. The bot detects up to 3 URLs, processes each one, fetches readable content, and summarizes each source in exactly 3 sentences.

If no URL is found, the bot asks the user to send a link.

In group chats, the bot only responds when mentioned by username or when the message replies to the bot.

## Supported links

1) Public webpages with readable HTML or text content.
2) Public x.com or twitter.com tweet and thread links when CookMyBots X Gateway is configured.

## Known limitations

1) Private pages cannot be summarized.
2) Login walls and paywalls may block extraction.
3) Deleted tweets, protected tweets, unavailable threads, or rate-limited X content cannot be summarized.
4) PDFs, videos, images, downloads, and other non-text content are rejected.
5) Some websites block automated fetches or return very little readable text.
6) The bot does not execute page JavaScript.

## Environment variables

TELEGRAM_BOT_TOKEN is required. It is the Telegram bot token from BotFather.

COOKMYBOTS_AI_ENDPOINT is required. It must be the CookMyBots AI Gateway base URL, not a /chat route.

COOKMYBOTS_AI_KEY is required. It authenticates requests to the CookMyBots AI Gateway.

COOKMYBOTS_X_ENDPOINT is optional. It enables X/Twitter content retrieval through the CookMyBots X Gateway Proxy.

COOKMYBOTS_X_KEY is optional. It authenticates requests to the CookMyBots X Gateway Proxy. The user must also connect an X account in CookMyBots.

AI_TIMEOUT_MS is optional and defaults to 600000.

AI_MAX_RETRIES is optional and defaults to 2.

CONCURRENCY is optional and defaults to 20, but the bot caps AI summarization work conservatively to protect memory.

## Setup

1) Install dependencies with npm install.
2) Copy .env.sample to .env.
3) Fill TELEGRAM_BOT_TOKEN, COOKMYBOTS_AI_ENDPOINT, and COOKMYBOTS_AI_KEY.
4) Optionally fill COOKMYBOTS_X_ENDPOINT and COOKMYBOTS_X_KEY for X/Twitter links.
5) Run npm run dev locally or npm start in production.

## Deployment notes

The bot runs as one Node.js process. It uses grammY and long polling through @grammyjs/runner. On startup, it clears any Telegram webhook with drop_pending_updates to avoid polling conflicts.

## Troubleshooting

If the bot exits immediately, check that TELEGRAM_BOT_TOKEN, COOKMYBOTS_AI_ENDPOINT, and COOKMYBOTS_AI_KEY are set.

If X/Twitter links return a configuration message, set COOKMYBOTS_X_ENDPOINT and COOKMYBOTS_X_KEY and connect an X account in CookMyBots.

If a webpage cannot be summarized, it may be blocked, private, too large, unsupported, or missing readable text.

Logs print safe diagnostics only. They show whether environment variables are present but never print token or API key values.
