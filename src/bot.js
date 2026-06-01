import { Bot } from "grammy";

export function createBot(token) {
  return new Bot(token);
}
