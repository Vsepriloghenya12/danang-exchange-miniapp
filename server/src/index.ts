import dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";

import { createApiRouter } from "./routes.js";
import { createBot } from "./bot.js";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "";
const OWNER_TG_ID = process.env.OWNER_TG_ID ? Number(process.env.OWNER_TG_ID) : undefined;
const PORT = process.env.PORT ? Number(process.env.PORT) : 4001;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// путь к webapp/dist после сборки на Railway
const webDist = path.resolve(__dirname, "../../webapp/dist");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", createApiRouter({ botToken: BOT_TOKEN, ownerTgId: OWNER_TG_ID }));

if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("WebApp build not found. Run npm run build."));
}

console.log("➡️ Starting bot...");
const bot = createBot({ token: BOT_TOKEN, webappUrl: WEBAPP_URL, ownerTgId: OWNER_TG_ID });

process.on("unhandledRejection", (e) => console.error("UNHANDLED REJECTION:", e));
process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));
bot.catch((err) => console.error("BOT ERROR:", err));

const server = app.listen(PORT, async () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`ℹ️ webapp dist: ${webDist}`);

  const me = await bot.telegram.getMe();
  console.log(`✅ getMe OK: @${me.username} (id=${me.id})`);

  // КЛЮЧЕВО: если webhook где-то был настроен, он блокирует polling
  await bot.telegram.deleteWebhook({ drop_pending_updates: true });
  console.log("✅ deleteWebhook OK");

  await bot.launch({ dropPendingUpdates: true });
  console.log("✅ Bot polling started");
});

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
});
