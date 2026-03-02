import dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";

import { createApiRouter } from "./routes.js";
import { createBot } from "./bot.js";
import { startMarketUpdater } from "./marketRates.js";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "";

// Owners:
// - preferred: OWNER_TG_IDS="111,222,333"
// - legacy: OWNER_TG_ID="111" (also accepts comma-separated for backward compatibility)
const OWNER_TG_ID_RAW = String(process.env.OWNER_TG_ID || "").trim();
const OWNER_TG_ID = OWNER_TG_ID_RAW && !OWNER_TG_ID_RAW.includes(",") ? Number(OWNER_TG_ID_RAW) : undefined;

const OWNER_TG_IDS = (process.env.OWNER_TG_IDS || OWNER_TG_ID_RAW || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s))
  .filter((n) => Number.isFinite(n));

console.log("OWNER_TG_IDS parsed:", OWNER_TG_IDS, "OWNER_TG_ID:", OWNER_TG_ID);


const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, "../../webapp/dist");
const runtimePublic = path.resolve(__dirname, "../public");

// Railway domain (предпочтительно), либо PUBLIC_URL если задашь вручную
const BASE_URL =
  process.env.PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");

// Секретный путь вебхука (лучше переопределить через WEBHOOK_PATH, чтобы токен не светился)
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || `/tg-webhook-${BOT_TOKEN.slice(0, 16)}`;

const app = express();
app.use(cors());
// For publishing rates with an optional image (base64 data URL)
app.use(express.json({ limit: "15mb" }));

// Basic HTTP request logging (visible in Railway logs)
app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    const ua = String(req.headers["user-agent"] || "");
    // Keep logs compact and readable
    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms) ip=${ip} ua=${ua.slice(0, 80)}`
    );
  });
  next();
});

// Рыночный курс "G" (кросс-пары) — обновление ~каждые 15 минут
startMarketUpdater();

// API: передаём ownerTgIds (и ownerTgId для совместимости)
app.use(
  "/api",
  createApiRouter({
    botToken: BOT_TOKEN,
    ownerTgIds: OWNER_TG_IDS,
    ownerTgId: OWNER_TG_ID
  })
);

if (fs.existsSync(webDist)) {
  // Runtime assets (no rebuild): put files into server/public (e.g. client-bg.jpg)
  // They will be served from /client-bg.jpg
  if (fs.existsSync(runtimePublic)) {
    app.use(
      express.static(runtimePublic, {
        setHeaders(res) {
          // Telegram WebView can be very aggressive with caching.
          // We disable caching so UI/CSS updates apply instantly after deploy.
          res.setHeader("Cache-Control", "no-store, max-age=0");
        },
      })
    );
  }
  app.use(
    express.static(webDist, {
      setHeaders(res) {
        res.setHeader("Cache-Control", "no-store, max-age=0");
      },
    })
  );
  // Standalone admin dashboard (PC). Served from the same build output.
  // Open: https://<domain>/admin
  app.get("/admin", (_req, res) => res.sendFile(path.join(webDist, "admin.html")));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.send("WebApp build not found. Run npm run build."));
}

console.log("➡️ Starting bot...");

// Bot: тоже получает список владельцев
const bot = createBot({
  token: BOT_TOKEN,
  webappUrl: WEBAPP_URL,
  ownerTgIds: OWNER_TG_IDS.length ? OWNER_TG_IDS : (OWNER_TG_ID ? [OWNER_TG_ID] : undefined)
});

process.on("unhandledRejection", (e) => console.error("UNHANDLED REJECTION:", e));
process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));
bot.catch((err) => console.error("BOT ERROR:", err));

// webhookCallback сам понимает путь, просто монтируем middleware
app.use(bot.webhookCallback(WEBHOOK_PATH));

const server = app.listen(PORT, async () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`ℹ️ webapp dist: ${webDist}`);

  const me = await bot.telegram.getMe();
  console.log(`✅ getMe OK: @${me.username} (id=${me.id})`);

  if (!BASE_URL) {
    console.log("⚠️ No BASE_URL. Using polling locally.");
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot polling started");
    return;
  }

  const full = `${BASE_URL}${WEBHOOK_PATH}`;
  await bot.telegram.setWebhook(full);
  console.log(`✅ Webhook set: ${full}`);
});

process.once("SIGINT", () => {
  bot.stop("SIGINT");
  server.close();
});
process.once("SIGTERM", () => {
  bot.stop("SIGTERM");
  server.close();
});
