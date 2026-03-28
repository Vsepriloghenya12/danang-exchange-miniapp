import dotenv from "dotenv";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import express from "express";
import cors from "cors";

import { createApiRouter } from "./routes.js";
import { createBot } from "./bot.js";
import { startMarketUpdater } from "./marketRates.js";
import { ensureSchema, HAS_DATABASE } from "./db.js";

dotenv.config();

const ROLE = String(process.env.ROLE || "monolith").toLowerCase();

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

console.log("ROLE:", ROLE);
console.log("OWNER_TG_IDS parsed:", OWNER_TG_IDS, "OWNER_TG_ID:", OWNER_TG_ID);
console.log("WEBAPP_URL:", WEBAPP_URL || "(missing)");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDist = path.resolve(__dirname, "../../webapp/dist");
const runtimePublic = path.resolve(__dirname, "../public");


function setStaticCacheHeaders(res: express.Response, filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  const normalized = filePath.replace(/\\/g, "/");
  const isHtml = ext === ".html";
  const isHashedBundle = normalized.includes("/assets/");
  const isAfishaCategoryBrand = /\/brand\/afisha-[^/]+\.(png|jpg|jpeg|webp)$/i.test(normalized);
  const isMedia = [".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm"].includes(ext);

  if (isHtml) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return;
  }

  if (isHashedBundle) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return;
  }

  if (isAfishaCategoryBrand) {
    // Category covers are versioned in the client URL query string.
    // Keep them hot in cache for fast Afisha open; a version bump invalidates immediately.
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return;
  }

  if (isMedia) {
    // Logos, icons, fonts, banks, afisha images and short videos should stay snappy on reopen.
    // Versioned files still invalidate immediately via their query string or filename.
    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=300");
}


function getAfishaRuntimeDir(): string {
  const explicit = String(process.env.AFISHA_STORAGE_DIR || "").trim();
  if (explicit) return path.resolve(explicit);

  const volumeRoot = String(process.env.RAILWAY_VOLUME_MOUNT_PATH || "").trim();
  if (volumeRoot) return path.resolve(volumeRoot, "afisha");

  return path.join(runtimePublic, "afisha");
}

function mountAfishaStatic(app: express.Express) {
  const volumeAfishaDir = getAfishaRuntimeDir();
  const bundledAfishaDir = path.join(runtimePublic, "afisha");

  const staticOpts = {
    setHeaders(res: express.Response, filePath: string) {
      setStaticCacheHeaders(res, filePath);
    }
  };

  if (fs.existsSync(volumeAfishaDir)) {
    app.use("/afisha", express.static(volumeAfishaDir, staticOpts));
  }

  if (bundledAfishaDir !== volumeAfishaDir && fs.existsSync(bundledAfishaDir)) {
    app.use("/afisha", express.static(bundledAfishaDir, staticOpts));
  }
}

// Railway domain (preferred), or PUBLIC_URL if you set it manually
const BASE_URL =
  process.env.PUBLIC_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "");

// Secret webhook path (override via WEBHOOK_PATH if needed)
// Important: avoid characters like ":" from bot tokens in URL paths, because
// proxies / webhook clients may percent-encode them and Telegraf can answer 404.
const WEBHOOK_SECRET = createHash("sha256").update(BOT_TOKEN).digest("hex").slice(0, 24);
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || `/tg-webhook-${WEBHOOK_SECRET}`;

function httpLogger(app: express.Express) {
  // Basic HTTP request logging (visible in Railway logs)
  app.use((req, res, next) => {
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "")
        .split(",")[0]
        .trim();
      const ua = String(req.headers["user-agent"] || "");
      console.log(
        `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms.toFixed(1)}ms) ip=${ip} ua=${ua.slice(0, 80)}`
      );
    });
    next();
  });
}

async function startApiOnly() {
  if (HAS_DATABASE) await ensureSchema();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "15mb" }));
  httpLogger(app);

  // market snapshot updater (used by calculator)
  startMarketUpdater();

  app.use(
    "/api",
    createApiRouter({
      botToken: BOT_TOKEN,
      ownerTgIds: OWNER_TG_IDS,
      ownerTgId: OWNER_TG_ID
    })
  );

  if (fs.existsSync(webDist)) {
    // Runtime assets (no rebuild): put files into server/public
    mountAfishaStatic(app);

    if (fs.existsSync(runtimePublic)) {
      app.use(
        express.static(runtimePublic, {
          setHeaders(res, filePath) {
            setStaticCacheHeaders(res, filePath);
          }
        })
      );
    }

    app.use(
      express.static(webDist, {
        setHeaders(res, filePath) {
          setStaticCacheHeaders(res, filePath);
        }
      })
    );

    app.get("/admin", (_req, res) => res.sendFile(path.join(webDist, "admin.html")));
    app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  } else {
    app.get("/", (_req, res) => res.send("WebApp build not found. Run npm run build."));
  }

  const server = app.listen(PORT, () => {
    console.log(`✅ API server listening on port ${PORT}`);
    console.log(`ℹ️ webapp dist: ${webDist}`);
  });

  process.once("SIGINT", () => server.close());
  process.once("SIGTERM", () => server.close());
}

async function startBotOnly() {
  if (HAS_DATABASE) await ensureSchema();

  const bot = createBot({
    token: BOT_TOKEN,
    webappUrl: WEBAPP_URL,
    ownerTgIds: OWNER_TG_IDS.length ? OWNER_TG_IDS : OWNER_TG_ID ? [OWNER_TG_ID] : undefined
  });

  process.on("unhandledRejection", (e) => console.error("UNHANDLED REJECTION:", e));
  process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));
  bot.catch((err) => console.error("BOT ERROR:", err));

  const app = express();
  app.use(express.json({ limit: "5mb" }));
  httpLogger(app);
  app.get("/health", (_req, res) => res.json({ ok: true, role: "bot" }));

  // Telegram webhook
  app.use(bot.webhookCallback(WEBHOOK_PATH));

  const server = app.listen(PORT, async () => {
    console.log(`✅ BOT server listening on port ${PORT}`);

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
}

async function startMonolith() {
  // Backward compatible: run API + bot in one service (single domain).
  if (HAS_DATABASE) await ensureSchema();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "15mb" }));
  httpLogger(app);

  startMarketUpdater();

  app.use(
    "/api",
    createApiRouter({
      botToken: BOT_TOKEN,
      ownerTgIds: OWNER_TG_IDS,
      ownerTgId: OWNER_TG_ID
    })
  );

  if (fs.existsSync(webDist)) {
    mountAfishaStatic(app);

    if (fs.existsSync(runtimePublic)) {
      app.use(
        express.static(runtimePublic, {
          setHeaders(res, filePath) {
            setStaticCacheHeaders(res, filePath);
          }
        })
      );
    }
    app.use(
      express.static(webDist, {
        setHeaders(res, filePath) {
          setStaticCacheHeaders(res, filePath);
        }
      })
    );
    app.get("/admin", (_req, res) => res.sendFile(path.join(webDist, "admin.html")));
    app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  } else {
    app.get("/", (_req, res) => res.send("WebApp build not found. Run npm run build."));
  }

  console.log("➡️ Starting bot (monolith)...");
  const bot = createBot({
    token: BOT_TOKEN,
    webappUrl: WEBAPP_URL,
    ownerTgIds: OWNER_TG_IDS.length ? OWNER_TG_IDS : OWNER_TG_ID ? [OWNER_TG_ID] : undefined
  });

  process.on("unhandledRejection", (e) => console.error("UNHANDLED REJECTION:", e));
  process.on("uncaughtException", (e) => console.error("UNCAUGHT EXCEPTION:", e));
  bot.catch((err) => console.error("BOT ERROR:", err));
  app.use(bot.webhookCallback(WEBHOOK_PATH));

  const server = app.listen(PORT, async () => {
    console.log(`✅ Server listening on port ${PORT}`);
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
}

(async () => {
  if (ROLE === "api") return startApiOnly();
  if (ROLE === "bot") return startBotOnly();
  return startMonolith();
})();
