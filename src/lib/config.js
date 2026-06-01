export const cfg = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  COOKMYBOTS_AI_ENDPOINT: process.env.COOKMYBOTS_AI_ENDPOINT || "",
  COOKMYBOTS_AI_KEY: process.env.COOKMYBOTS_AI_KEY || "",
  COOKMYBOTS_X_ENDPOINT: process.env.COOKMYBOTS_X_ENDPOINT || "",
  COOKMYBOTS_X_KEY: process.env.COOKMYBOTS_X_KEY || "",
  AI_TIMEOUT_MS: Number(process.env.AI_TIMEOUT_MS || 600000),
  AI_MAX_RETRIES: Number(process.env.AI_MAX_RETRIES || 2),
  CONCURRENCY: Number(process.env.CONCURRENCY || 20)
};
