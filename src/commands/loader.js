import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export async function registerCommands(bot) {
  const files = fs
    .readdirSync(currentDir)
    .filter((file) => file.endsWith(".js") && file !== "loader.js" && !file.startsWith("_"))
    .sort();

  for (const file of files) {
    const mod = await import(new URL(`./${file}`, import.meta.url));
    const register = mod.default || mod.register;

    if (typeof register === "function") {
      await register(bot);
      console.log("[commands] registered", { file });
    } else {
      console.warn("[commands] skipped file without register export", { file });
    }
  }
}
