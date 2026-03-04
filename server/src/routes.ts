import express from "express";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  defaultBonuses,
  defaultGFormulas,
  normUsername,
  type Contact,
  type UserStatus,
  type RequestState,
  type StoredRequest,
  type StoredReview,
  type ReviewState,
  type BonusesConfig,
  type BonusesTier,
  normalizeStatus,
  parseStatusInput
} from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";
import { getMarketSnapshot } from "./marketRates.js";
import { HAS_DATABASE, ensureSchema, getPool } from "./db.js";


// --------------------
// Weather (OpenWeatherMap)
// --------------------
type WeatherPayload = {
  city: string;
  tempC: number;
  feelsC: number;
  desc: string;
  humidity: number;
  windMs: number;
  emoji: string;
  icon?: string;
  updatedAt: string;
};

const DANANG = { lat: 16.0544, lon: 108.2022 };
const WEATHER_TTL_MS = 10 * 60 * 1000;
let weatherCache: { ts: number; data: WeatherPayload } | null = null;

function weatherEmoji(main: string) {
  const m = String(main || "").toLowerCase();
  if (m.includes("thunder")) return "⛈️";
  if (m.includes("drizzle")) return "🌦️";
  if (m.includes("rain")) return "🌧️";
  if (m.includes("snow")) return "❄️";
  if (m.includes("mist") || m.includes("fog") || m.includes("haze")) return "🌫️";
  if (m.includes("cloud")) return "☁️";
  if (m.includes("clear")) return "☀️";
  return "🌤️";
}

type ReceiveMethod = "cash" | "transfer" | "atm";
type Currency = "RUB" | "USD" | "USDT" | "VND" | "EUR" | "THB";

type PublicReview = {
  id: string;
  created_at: string;
  text: string;
  displayName: string;
  anonymous: boolean;
  company_reply?: { text: string; created_at: string };
};

const statusLabel: Record<UserStatus, string> = {
  standard: "стандарт",
  silver: "серебро",
  gold: "золото"
};

const requestStateLabel: Record<RequestState, string> = {
  in_progress: "в работе",
  done: "готова",
  canceled: "отклонена",
  new: "в работе" // legacy
};

function parseRequestState(s: any): RequestState | null {
  const v = String(s ?? "").toLowerCase().trim();
  if (!v) return null;
  // legacy alias: treat "new" as "in_progress" (в работе)
  if (["new", "принята", "новая", "создана"].includes(v)) return "in_progress";
  if (["in_progress", "inprogress", "process", "в работе", "вработе"].includes(v)) return "in_progress";
  if (["done", "готово", "готова", "выполнена"].includes(v)) return "done";
  if (["canceled", "cancelled", "отменена", "отмена"].includes(v)) return "canceled";
  return null;
}

export function createApiRouter(opts: {
  botToken: string;
  ownerTgId?: number;
  ownerTgIds?: number[];
}) {
  const router = express.Router();

  function isOwnerId(userId: number) {
    const list = Array.isArray(opts.ownerTgIds) ? opts.ownerTgIds : [];
    if (list.length > 0) return list.includes(userId);
    if (opts.ownerTgId) return userId === opts.ownerTgId;
    return false;
  }

  async function requireAuth(req: express.Request) {
    const auth = (req.headers.authorization as string | undefined) || "";
    const initFromAuth = auth.startsWith("tma ") ? auth.slice(4) : undefined;
    const initFromHeader = req.headers["x-telegram-init-data"] as string | undefined;
    const initFromBody =
      (req.body?.initData as string | undefined) || (req.body?.init_data as string | undefined);

    const initData = initFromAuth || initFromHeader || initFromBody;
    if (!initData) throw new Error("No initData");

    const v = validateTelegramInitData(initData, opts.botToken);

    const up = await upsertUserFromTelegram(v.user);
    const status = (up?.status ?? "standard") as UserStatus;
    const isOwner = isOwnerId(v.user.id);

    const store = await readStore();
    const adminIds = Array.isArray((store.config as any)?.adminTgIds) ? (store.config as any).adminTgIds : [];
    const isAdmin = adminIds.includes(v.user.id);

    const bl = Array.isArray((store.config as any)?.blacklistUsernames)
      ? ((store.config as any).blacklistUsernames as any[])
      : [];
    const uname = normUsername(v.user.username);
    const blockedRaw = !!uname && bl.map((x) => normUsername(String(x)) || "").includes(uname);
    // Blacklist should not lock out staff/owner.
    const blocked = !isOwner && !isAdmin && blockedRaw;

    return { user: v.user, status, isOwner, isAdmin, blocked };
  }

  // Admin access for a standalone PC dashboard.
  // If ADMIN_WEB_KEY is set, requests with header `x-admin-key: <key>` are treated as owner.
  async function requireAdmin(req: express.Request) {
    const envKey = String(process.env.ADMIN_WEB_KEY || "").trim();
    const key = String(req.headers["x-admin-key"] || "").trim();

    // If caller provided x-admin-key, never fall back to Telegram auth.
    // This avoids confusing "No initData" errors on /admin when the key is missing/wrong.
    if (key) {
      if (!envKey) throw new Error("admin_key_not_configured");
      if (key !== envKey) throw new Error("bad_admin_key");
      return {
        user: { id: 0, username: "admin", first_name: "Admin" },
        status: "standard" as UserStatus,
        isOwner: true,
        isAdmin: true
      };
    }

    // Otherwise allow Telegram owner access (if someone calls /admin API from inside the miniapp).
    return await requireAuth(req);
  }

  async function requireStaff(req: express.Request) {
    const a = await requireAuth(req);
    if (!a.isAdmin) throw new Error("not_admin");
    return a;
  }

  router.get("/health", async (_req, res) => res.json({ ok: true }));

  // --------------------
  // Analytics events (tab opens, clicks, sessions)
  // Client sends: { name, sessionId, props, path, platform, appVersion }
  // --------------------
  router.post("/events", async (req, res) => {
    try {
      const { user, blocked } = await requireAuth(req);
      if (blocked) return res.status(403).json({ ok: false, error: "blocked" });

      const body: any = req.body || {};
      const name = String(body.name || body.event || "").trim();
      const sessionId = String(body.sessionId || body.session_id || "").trim() || undefined;
      const props = typeof body.props === "object" && body.props ? body.props : undefined;
      const pathStr = String(body.path || "").trim() || undefined;
      const platform = String(body.platform || "").trim() || undefined;
      const appVersion = String(body.appVersion || body.app_version || "").trim() || undefined;

      if (!name) return res.status(400).json({ ok: false, error: "missing_name" });

      if (HAS_DATABASE) {
        await ensureSchema();
        await getPool().query(
          "INSERT INTO app_events (tg_id, session_id, event_name, props, app_version, platform, path) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [user.id, sessionId || null, name, props || null, appVersion || null, platform || null, pathStr || null]
        );
      } else {
        console.log("[EVENT]", { tg_id: user.id, name, sessionId, platform, appVersion, path: pathStr, props });
      }

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "unauthorized" });
    }
  });

  // Basic metrics for owner/admin (requires DB)
  router.get("/metrics", async (req, res) => {
    try {
      const { isOwner, isAdmin } = await requireAuth(req);
      if (!isOwner && !isAdmin) return res.status(403).json({ ok: false, error: "forbidden" });
      if (!HAS_DATABASE) return res.json({ ok: true, db: false, note: "DATABASE_URL not set" });

      await ensureSchema();
      const pool = getPool();

      const last24 = await pool.query(
        "SELECT count(*)::int AS events, count(distinct tg_id)::int AS users FROM app_events WHERE ts > now() - interval '24 hours'"
      );
      const byEvent = await pool.query(
        "SELECT event_name, count(*)::int AS cnt FROM app_events WHERE ts > now() - interval '24 hours' GROUP BY event_name ORDER BY cnt DESC LIMIT 50"
      );

      return res.json({
        ok: true,
        db: true,
        last24: last24.rows[0],
        byEvent: byEvent.rows
      });

    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "unauthorized" });
    }
  });

  // Detailed analytics summary for owner/admin (requires DB)
  // GET /api/admin/events/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  router.get("/admin/events/summary", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      // Disable caching to avoid 304 responses breaking JSON fetch in browsers
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      // Force a changing ETag so intermediaries/browsers never respond with 304
      res.setHeader("ETag", `"${Date.now().toString(36)}"`);

      if (!HAS_DATABASE) {
        return res.json({ ok: true, db: false, note: "DATABASE_URL not set" });
      }

      await ensureSchema();
      const pool = getPool();

      // Total users in the app (from the shared store).
      // This is different from "unique users in period".
      const store = await readStore();
      const usersObj = (store as any)?.users;
      const allUsers = usersObj && typeof usersObj === 'object' ? Object.keys(usersObj).length : 0;

      const qFrom = String((req.query as any)?.from || "").slice(0, 10);
      const qTo = String((req.query as any)?.to || "").slice(0, 10);

      // default range: last 7 days
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const defFromDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
      const defFrom = defFromDate.toISOString().slice(0, 10);

      const from = /^\d{4}-\d{2}-\d{2}$/.test(qFrom) ? qFrom : defFrom;
      const to = /^\d{4}-\d{2}-\d{2}$/.test(qTo) ? qTo : today;

      const totals = await pool.query(
        "SELECT count(*)::int AS events, count(distinct tg_id)::int AS users, count(distinct session_id)::int AS sessions FROM app_events WHERE ts >= $1::date AND ts < ($2::date + interval '1 day')",
        [from, to]
      );

      const byEvent = await pool.query(
        "SELECT event_name, count(*)::int AS cnt FROM app_events WHERE ts >= $1::date AND ts < ($2::date + interval '1 day') GROUP BY event_name ORDER BY cnt DESC LIMIT 100",
        [from, to]
      );

      const byScreen = await pool.query(
        "SELECT COALESCE(props->>'screen','') AS screen, count(*)::int AS cnt FROM app_events WHERE event_name='screen_open' AND ts >= $1::date AND ts < ($2::date + interval '1 day') GROUP BY screen ORDER BY cnt DESC",
        [from, to]
      );

      const byClick = await pool.query(
        "SELECT COALESCE(props->>'target','') AS target, count(*)::int AS cnt FROM app_events WHERE event_name='click' AND ts >= $1::date AND ts < ($2::date + interval '1 day') GROUP BY target ORDER BY cnt DESC LIMIT 200",
        [from, to]
      );

      return res.json({
        ok: true,
        db: true,
        from,
        to,
        totals: { ...(totals.rows[0] || {}), all_users: allUsers },
        byEvent: byEvent.rows,
        byScreen: byScreen.rows,
        byClick: byClick.rows
      });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Public: current weather for Da Nang (cached)
  // --------------------
  router.get("/weather", async (_req, res) => {
    try {
      if (weatherCache && Date.now() - weatherCache.ts < WEATHER_TTL_MS) {
        return res.json({ ok: true, data: weatherCache.data, cached: true });
      }

      const apiKey = String(process.env.OWM_API_KEY || process.env.OPENWEATHER_API_KEY || "7da2b17df52f2ac9059c7165598237cb").trim();
      if (!apiKey) return res.status(500).json({ ok: false, error: "owm_key_missing" });

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${DANANG.lat}&lon=${DANANG.lon}&appid=${apiKey}&units=metric&lang=ru`;
      const r = await fetch(url);
      const j: any = await r.json();
      if (!r.ok) return res.status(502).json({ ok: false, error: j?.message || "owm_failed" });

      const w0 = Array.isArray(j?.weather) ? j.weather[0] : null;
      const main = String(w0?.main || "");
      const payload: WeatherPayload = {
        city: String(j?.name || "Da Nang"),
        tempC: Math.round(Number(j?.main?.temp ?? 0)),
        feelsC: Math.round(Number(j?.main?.feels_like ?? 0)),
        desc: String(w0?.description || ""),
        humidity: Number(j?.main?.humidity ?? 0),
        windMs: Number(j?.wind?.speed ?? 0),
        emoji: weatherEmoji(main),
        icon: String(w0?.icon || "") || undefined,
        updatedAt: new Date().toISOString()
      };

      weatherCache = { ts: Date.now(), data: payload };
      return res.json({ ok: true, data: payload, cached: false });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "weather_failed" });
    }
  });

  // --------------------
  // Public: list bank icon filenames from webapp/public/banks (or dist/banks)
  // --------------------
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const banksCandidates = [
    path.resolve(__dirname, "../../webapp/dist/banks"),
    path.resolve(__dirname, "../../webapp/public/banks")
  ];

  router.get("/banks/icons", async (_req, res) => {
    try {
      const dir = banksCandidates.find((d) => fs.existsSync(d));
      if (!dir) return res.json({ ok: true, icons: [] });
      const icons = fs
        .readdirSync(dir)
        .filter((x) => !x.startsWith("."))
        .filter((x) => /\.(png|jpg|jpeg|webp|svg)$/i.test(x));
      return res.json({ ok: true, icons });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || "icons_failed", icons: [] });
    }
  });

  router.post("/auth", async (req, res) => {
    try {
      const { user, status, isOwner, isAdmin, blocked } = await requireAuth(req);
      const store = await readStore();
      const adminIds = Array.isArray((store.config as any)?.adminTgIds) ? ((store.config as any).adminTgIds as number[]) : [];
      const adminTgId = adminIds[0] ?? opts.ownerTgId ?? null;
      const adminUsername = String((store.config as any)?.adminUsername || "").trim();
      const adminDeepLink = String((store.config as any)?.adminDeepLink || "").trim();
      res.json({
        ok: true,
        user,
        status,
        statusLabel: statusLabel[status],
        isOwner,
        isAdmin,
        blocked,
        adminChat: {
          tgId: adminTgId,
          username: adminUsername || undefined,
          deepLink: adminDeepLink || undefined
        }
      });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/me", async (req, res) => {
    try {
      const { user, status, isOwner, isAdmin, blocked } = await requireAuth(req);
      const store = await readStore();
      const adminIds = Array.isArray((store.config as any)?.adminTgIds) ? ((store.config as any).adminTgIds as number[]) : [];
      const adminTgId = adminIds[0] ?? opts.ownerTgId ?? null;
      const adminUsername = String((store.config as any)?.adminUsername || "").trim();
      const adminDeepLink = String((store.config as any)?.adminDeepLink || "").trim();
      res.json({
        ok: true,
        data: {
          user,
          status,
          statusLabel: statusLabel[normalizeStatus(status)],
          isOwner,
          isAdmin,
          blocked,
          adminChat: {
            tgId: adminTgId,
            username: adminUsername || undefined,
            deepLink: adminDeepLink || undefined
          }
        }
      });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner config: blacklist (usernames)
  // --------------------
  router.get("/admin/blacklist", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = await readStore();
      const usernames = Array.isArray((store.config as any).blacklistUsernames)
        ? ((store.config as any).blacklistUsernames as any[])
            .map((x) => normUsername(String(x)))
            .filter((x): x is string => Boolean(x))
        : [];
      return res.json({ ok: true, usernames });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/blacklist", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const raw =
        (req.body as any)?.usernames ??
        (req.body as any)?.blacklist ??
        (req.body as any)?.list ??
        (req.body as any)?.text;

      const parts: string[] = Array.isArray(raw)
        ? raw.map((x: any) => String(x))
        : String(raw || "")
            .split(/[\n,;\s]+/)
            .map((x) => x.trim())
            .filter(Boolean);

      const normalized = Array.from(
        new Set(
          parts
            .map((x) => normUsername(x))
            .filter((x): x is string => Boolean(x))
        )
      );

      const store = await readStore();
      store.config = { ...(store.config || {}), blacklistUsernames: normalized };
      await writeStore(store);
      return res.json({ ok: true, usernames: normalized });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });



  // --------------------
  // Afisha (events)
  // --------------------
  function todayISOInVN() {
    // Vietnam is UTC+7. We compare YYYY-MM-DD lexicographically.
    const d = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
  }

  function normUrl(u: any): string {
    const s = String(u || '').trim();
    return s;
  }

  function normCategory(c: any): any {
    const v = String(c || '').trim().toLowerCase();
    if (['sport', 'спорт'].includes(v)) return 'sport';
    if (['party', 'вечеринки', 'вечеринка'].includes(v)) return 'party';
    if (['culture', 'культура', 'culture_art', 'искусство'].includes(v)) return 'culture';
    // legacy removed category: map to culture so old events remain visible
    if (['city', 'город', 'городские', 'мероприятия', 'city_events'].includes(v)) return 'culture';
    if (['games', 'game', 'игры', 'игра'].includes(v)) return 'games';
    if (['market', 'fair', 'ярмарки', 'ярмарка', 'marketplace'].includes(v)) return 'market';
    if (['food', 'еда'].includes(v)) return 'food';
    if (['music', 'музыка'].includes(v)) return 'music';
    return null;
  }

  // Save a base64 data URL image into server/public/afisha and return a public URL like /afisha/<id>.jpg
  function saveAfishaImage(id: string, dataUrl: string): string {
    const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/i);
    if (!m) throw new Error('bad_image');
    const mime = String(m[1] || '').toLowerCase();
    const b64 = String(m[2] || '');
    const isOk = /image\/(jpeg|jpg|png|webp)/i.test(mime);
    if (!isOk) throw new Error('bad_image');

    const ext = mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    const buf = Buffer.from(b64, 'base64');
    if (!buf || buf.length < 10) throw new Error('bad_image');
    if (buf.length > 5 * 1024 * 1024) throw new Error('bad_image');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const runtimePublic = path.resolve(__dirname, '../public');
    const dir = path.join(runtimePublic, 'afisha');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${id}${ext}`;
    fs.writeFileSync(path.join(dir, filename), buf);
    return `/afisha/${filename}`;
  }

  // Public list (only future+today)
  router.get('/afisha', async (req, res) => {
    try {
      const today = todayISOInVN();
      const category = String((req.query as any)?.category || 'all').toLowerCase();
      const from = String((req.query as any)?.from || '').slice(0, 10);
      const to = String((req.query as any)?.to || '').slice(0, 10);

      const store = await readStore();
      const items = Array.isArray((store as any).afisha) ? ((store as any).afisha as any[]) : [];

      let out = items.filter((ev) => ev && typeof ev === 'object');
      // hide past
      out = out.filter((ev) => String(ev.date || '') >= today);

      const cat = category === 'all' ? null : normCategory(category);
      if (cat) out = out.filter((ev) => {
        const cats = Array.isArray((ev as any).categories)
          ? ((ev as any).categories as any[])
          : (ev as any).category
          ? [(ev as any).category]
          : [];
        return cats.map((x) => String(x || '')).includes(cat);
      });

      if (from) out = out.filter((ev) => String(ev.date || '') >= from);
      if (to) out = out.filter((ev) => String(ev.date || '') <= to);

      // sort by date ASC
      out.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      return res.json({ ok: true, today, events: out });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e?.message || 'afisha_failed' });
    }
  });

  // Click tracking
  router.post('/afisha/click', async (req, res) => {
    try {
      await requireAuth(req); // count only real users
      const id = String((req.body as any)?.id || '').trim();
      const kind = String((req.body as any)?.kind || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'bad_id' });
      if (kind !== 'details' && kind !== 'location') return res.status(400).json({ ok: false, error: 'bad_kind' });

      const store = await readStore();
      const items = Array.isArray((store as any).afisha) ? ((store as any).afisha as any[]) : [];
      const ev = items.find((x) => String(x?.id || '') === id);
      if (!ev) return res.status(404).json({ ok: false, error: 'not_found' });
      ev.clicks = ev.clicks || { details: 0, location: 0 };
      ev.clicks[kind] = Number(ev.clicks[kind] || 0) + 1;
      ev.updated_at = new Date().toISOString();
      (store as any).afisha = items;
      await writeStore(store);
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || 'auth_failed' });
    }
  });

  // Owner management
  router.get('/admin/afisha', async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: 'not_owner' });

      const today = todayISOInVN();
      const scope = String((req.query as any)?.scope || 'all').toLowerCase();
      const from = String((req.query as any)?.from || '').slice(0, 10);
      const to = String((req.query as any)?.to || '').slice(0, 10);

      const store = await readStore();
      let items = Array.isArray((store as any).afisha) ? ((store as any).afisha as any[]) : [];
      items = items.filter((ev) => ev && typeof ev === 'object');

      if (scope === 'active') items = items.filter((ev) => String(ev.date || '') >= today);
      if (scope === 'history') items = items.filter((ev) => String(ev.date || '') < today);

      if (from) items = items.filter((ev) => String(ev.date || '') >= from);
      if (to) items = items.filter((ev) => String(ev.date || '') <= to);

      // newest first for history, soonest first for active
      if (scope === 'active') items.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
      else items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      return res.json({ ok: true, today, events: items });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || 'auth_failed' });
    }
  });

  router.post('/admin/afisha', async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: 'not_owner' });

      const catsRaw: any = (req.body as any)?.categories ?? (req.body as any)?.category;
      const catsIn: any[] = Array.isArray(catsRaw) ? catsRaw : catsRaw != null ? [catsRaw] : [];
      const catsNorm = Array.from(new Set(catsIn.map((x) => normCategory(x)).filter(Boolean)));
      const category = catsNorm[0] || null;
      const date = String((req.body as any)?.date || '').slice(0, 10);
      const title = String((req.body as any)?.title || '').trim();
      const comment = String((req.body as any)?.comment || '').trim();
      const detailsUrl = normUrl((req.body as any)?.detailsUrl);
      const locationUrl = normUrl((req.body as any)?.locationUrl);
      const imageDataUrl = typeof (req.body as any)?.imageDataUrl === 'string' ? String((req.body as any).imageDataUrl) : '';

      if (!category) return res.status(400).json({ ok: false, error: 'bad_category' });
      if (catsNorm.length < 1 || catsNorm.length > 3) return res.status(400).json({ ok: false, error: 'bad_categories' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: 'bad_date' });
      if (title.length < 2) return res.status(400).json({ ok: false, error: 'bad_title' });
      if (comment && comment.length > 300) return res.status(400).json({ ok: false, error: 'bad_comment' });
      if (!detailsUrl) return res.status(400).json({ ok: false, error: 'bad_details_url' });
      if (!locationUrl) return res.status(400).json({ ok: false, error: 'bad_location_url' });

      const now = new Date().toISOString();
      const id = randomUUID();
      const imageUrl = imageDataUrl && imageDataUrl.startsWith('data:') ? saveAfishaImage(id, imageDataUrl) : undefined;

      const ev: any = {
        id,
        category,
        categories: catsNorm,
        date,
        title,
        ...(comment ? { comment } : {}),
        detailsUrl,
        locationUrl,
        ...(imageUrl ? { imageUrl } : {}),
        created_at: now,
        updated_at: now,
        clicks: { details: 0, location: 0 },
        created_by: user?.id || 0
      };

      const store = await readStore();
      const items = Array.isArray((store as any).afisha) ? ((store as any).afisha as any[]) : [];
      items.push(ev);
      (store as any).afisha = items;
      await writeStore(store);
      return res.json({ ok: true, event: ev });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || 'auth_failed' });
    }
  });

  router.put('/admin/afisha/:id', async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: 'not_owner' });

      const id = String((req.params as any)?.id || '').trim();
      if (!id) return res.status(400).json({ ok: false, error: 'bad_id' });

      const categoriesRaw: any = (req.body as any)?.categories;
      const categoryRaw: any = (req.body as any)?.category;
      const catsSrc: any[] = categoriesRaw != null ? (Array.isArray(categoriesRaw) ? categoriesRaw : [categoriesRaw]) : (categoryRaw != null ? (Array.isArray(categoryRaw) ? categoryRaw : [categoryRaw]) : []);
      const catsNorm = catsSrc.length ? Array.from(new Set(catsSrc.map((x) => normCategory(x)).filter(Boolean))) : [];
      const category = catsNorm.length ? catsNorm[0] : (categoryRaw != null ? normCategory(categoryRaw) : null);
      const dateRaw = (req.body as any)?.date;
      const date = dateRaw != null ? String(dateRaw || '').slice(0, 10) : null;
      const titleRaw = (req.body as any)?.title;
      const title = titleRaw != null ? String(titleRaw || '').trim() : null;

      const commentRaw = (req.body as any)?.comment;
      const comment = commentRaw != null ? String(commentRaw || '').trim() : null;
      const detailsUrlRaw = (req.body as any)?.detailsUrl;
      const detailsUrl = detailsUrlRaw != null ? normUrl(detailsUrlRaw) : null;
      const locationUrlRaw = (req.body as any)?.locationUrl;
      const locationUrl = locationUrlRaw != null ? normUrl(locationUrlRaw) : null;

      const imageDataUrlRaw = (req.body as any)?.imageDataUrl;
      const imageDataUrl = typeof imageDataUrlRaw === 'string' ? String(imageDataUrlRaw) : null;

      const store = await readStore();
      const items = Array.isArray((store as any).afisha) ? ((store as any).afisha as any[]) : [];
      const ev = items.find((x) => String(x?.id || '') === id);
      if (!ev) return res.status(404).json({ ok: false, error: 'not_found' });

      if (categoryRaw != null) {
        if (!category) return res.status(400).json({ ok: false, error: 'bad_category' });
      if (catsNorm.length < 1 || catsNorm.length > 3) return res.status(400).json({ ok: false, error: 'bad_categories' });
        ev.category = category;
      }
      if (dateRaw != null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return res.status(400).json({ ok: false, error: 'bad_date' });
        ev.date = date;
      }
      if (titleRaw != null) {
        if (!title || title.length < 2) return res.status(400).json({ ok: false, error: 'bad_title' });
        ev.title = title;
      }

      if (commentRaw != null) {
        if (comment && comment.length > 300) return res.status(400).json({ ok: false, error: 'bad_comment' });
        ev.comment = comment || '';
      }
      if (detailsUrlRaw != null) {
        if (!detailsUrl) return res.status(400).json({ ok: false, error: 'bad_details_url' });
        ev.detailsUrl = detailsUrl;
      }
      if (locationUrlRaw != null) {
        if (!locationUrl) return res.status(400).json({ ok: false, error: 'bad_location_url' });
        ev.locationUrl = locationUrl;
      }

      if (imageDataUrl != null) {
        if (imageDataUrl && imageDataUrl.startsWith('data:')) {
          ev.imageUrl = saveAfishaImage(id, imageDataUrl);
        }
      }

      ev.updated_at = new Date().toISOString();
      (store as any).afisha = items;
      await writeStore(store);
      return res.json({ ok: true, event: ev });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || 'auth_failed' });
    }
  });
  // --------------------
  // Rates
  // --------------------
  router.get("/rates/today", async (_req, res) => {
    const store = await readStore();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const data = store.ratesByDate?.[today] || null;
    res.json({ ok: true, date: today, data });
  });

  // Рыночные курсы "G" для кросс-пар (обновление ~каждые 15 минут)
  router.get("/market", async (_req, res) => {
    const snap = await getMarketSnapshot();
    if (snap.ok) return res.json(snap);
    return res.status(503).json(snap);
  });

  // --------------------
  // G-formulas (multipliers for cross-pairs)
  // BUY = G * buyMul, SELL = G * sellMul
  // --------------------
  function cleanGFormulas(input: any) {
    const def = defaultGFormulas();
    const src = input && typeof input === "object" ? input : {};
    const out: any = {};
    for (const k of Object.keys(def)) {
      const v = (src as any)[k];
      const buy = Number(String(v?.buyMul ?? def[k].buyMul).replace(",", "."));
      const sell = Number(String(v?.sellMul ?? def[k].sellMul).replace(",", "."));
      out[k] = {
        buyMul: Number.isFinite(buy) && buy > 0 ? buy : def[k].buyMul,
        sellMul: Number.isFinite(sell) && sell > 0 ? sell : def[k].sellMul
      };
    }
    return out as Record<string, { buyMul: number; sellMul: number }>;
  }

  // Public: client uses it for Rates/Calculator
  router.get("/g-formulas", async (_req, res) => {
    const store = await readStore();
    const current = (store.config as any)?.gFormulas;
    const formulas = cleanGFormulas(current);
    if (JSON.stringify(current ?? null) !== JSON.stringify(formulas)) {
      store.config = { ...(store.config || {}), gFormulas: formulas };
      await writeStore(store);
    }
    res.json({ ok: true, formulas });
  });

  router.get("/admin/g-formulas", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = await readStore();
      const current = (store.config as any)?.gFormulas;
      const formulas = cleanGFormulas(current);
      if (JSON.stringify(current ?? null) !== JSON.stringify(formulas)) {
        store.config = { ...(store.config || {}), gFormulas: formulas };
        await writeStore(store);
      }
      res.json({ ok: true, formulas });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/g-formulas", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const body: any = req.body || {};
      const next = cleanGFormulas(body.formulas);
      const store = await readStore();
      store.config = { ...(store.config || {}), gFormulas: next };
      await writeStore(store);
      res.json({ ok: true, formulas: next });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Bonuses (надбавки)
  // --------------------
  router.get("/bonuses", async (_req, res) => {
    const store = await readStore();
    // Нормализуем/мигрируем, чтобы старые store.json (где bonuses мог быть пустым объектом)
    // не ломали фронт (например, bonuses.enabled может отсутствовать).
    const current = (store.config as any)?.bonuses;
    const bonuses = cleanBonuses(current);

    // Если по дороге что-то «починили» — сохраним обратно, чтобы больше не повторялось.
    if (JSON.stringify(current ?? null) !== JSON.stringify(bonuses)) {
      store.config = { ...(store.config || {}), bonuses };
      await writeStore(store);
    }

    res.json({ ok: true, bonuses });
  });

  router.get("/admin/bonuses", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      const current = (store.config as any)?.bonuses;
      const bonuses = cleanBonuses(current);

      if (JSON.stringify(current ?? null) !== JSON.stringify(bonuses)) {
        store.config = { ...(store.config || {}), bonuses };
        await writeStore(store);
      }

      res.json({ ok: true, bonuses });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  function cleanBonuses(input: any): BonusesConfig {
    const src = input && typeof input === "object" ? input : {};
    const base = defaultBonuses();

    const bool = (v: any, d: boolean) => (typeof v === "boolean" ? v : d);
    const num = (v: any, d: number) => {
      const n = Number(String(v ?? "").replace(",", ".").trim());
      return Number.isFinite(n) ? n : d;
    };

    const cleanTier = (t: any): BonusesTier | null => {
      const min = num(t?.min, NaN);
      const maxRaw = t?.max;
      const max = maxRaw === "" || maxRaw == null ? undefined : num(maxRaw, NaN);
      if (!Number.isFinite(min) || min < 0) return null;
      if (max !== undefined && (!Number.isFinite(max) || max <= min)) return null;

      return {
        min,
        ...(max !== undefined ? { max } : {}),
        standard: num(t?.standard, 0),
        silver: num(t?.silver, 0),
        gold: num(t?.gold, 0)
      };
    };

    const cleanTierList = (arr: any, fallback: BonusesTier[]) => {
      if (!Array.isArray(arr)) return fallback;
      const list = arr.map(cleanTier).filter(Boolean) as BonusesTier[];
      if (list.length === 0) return fallback;
      // сортируем по min
      list.sort((a, b) => a.min - b.min);
      return list;
    };

    const cleanMethodRow = (row: any, fb: { RUB: number; USD: number; USDT: number }) => {
      return {
        RUB: num(row?.RUB, fb.RUB),
        USD: num(row?.USD, fb.USD),
        USDT: num(row?.USDT, fb.USDT)
      };
    };

    const out: BonusesConfig = {
      enabled: {
        tiers: bool(src?.enabled?.tiers, base.enabled.tiers),
        methods: bool(src?.enabled?.methods, base.enabled.methods)
      },
      tiers: {
        RUB: cleanTierList(src?.tiers?.RUB, base.tiers.RUB),
        USD: cleanTierList(src?.tiers?.USD, base.tiers.USD),
        USDT: cleanTierList(src?.tiers?.USDT, base.tiers.USDT)
      },
      methods: {
        transfer: cleanMethodRow(src?.methods?.transfer, base.methods.transfer),
        atm: cleanMethodRow(src?.methods?.atm, base.methods.atm)
      }
    };

    return out;
  }

  router.post("/admin/bonuses", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body || {};
      const bonuses = cleanBonuses(body.bonuses ?? body);

      const store = await readStore();
      store.config = { ...(store.config || {}), bonuses };
      await writeStore(store);
      res.json({ ok: true, bonuses });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // ATMs
  // --------------------
  // публичный список банкоматов
  router.get("/atms", async (_req, res) => {
    const store = await readStore();
    res.json({ ok: true, atms: Array.isArray((store as any).atms) ? (store as any).atms : [] });
  });

  // список для владельца (через Telegram initData или x-admin-key)
  router.get("/admin/atms", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      res.json({ ok: true, atms: Array.isArray((store as any).atms) ? (store as any).atms : [] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // сохранить список (полностью перезаписываем)
  router.post("/admin/atms", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body || {};
      const list = body.atms ?? body.items ?? body.list;
      if (!Array.isArray(list)) {
        return res.status(400).json({ ok: false, error: "bad_atms_list" });
      }

      const cleaned = list.map((x: any) => {
        const title = String(x?.title ?? "").trim();
        const mapUrl = String(x?.mapUrl ?? x?.map_url ?? "").trim();
        const address = String(x?.address ?? "").trim();
        const note = String(x?.note ?? "").trim();

        return {
          id: String(x?.id ?? "").trim() || randomUUID(),
          title,
          mapUrl,
          ...(address ? { address } : {}),
          ...(note ? { note } : {})
        };
      });

      for (const a of cleaned) {
        if (!a.title || !a.mapUrl) {
          return res.status(400).json({ ok: false, error: "atm_title_or_map_missing" });
        }
      }

      const store: any = await readStore();
      store.atms = cleaned;
      await writeStore(store);
      res.json({ ok: true, atms: store.atms });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });


  // предложить новый банкомат (клиент -> менеджеру)
  router.post("/atms/suggest", async (req, res) => {
    try {
      const { user, blocked } = await requireAuth(req);
      if (blocked) return res.status(403).json({ ok: false, error: "blocked" });

      const textIn = String(req.body?.text || req.body?.location || req.body?.url || "").trim();
      if (!textIn) return res.status(400).json({ ok: false, error: "missing_text" });

      const store = await readStore();

      const dtDaNang = new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date()).replace(",", "");

      const who =
        (user.username
          ? `@${user.username}`
          : `${user.first_name || ""} ${user.last_name || ""}`.trim() || `id ${user.id}`);

      const msg =
        `🏧 Новый банкомат\n` +
        `👤 ${who}\n` +
        `📍 Новый банкомат тут: ${textIn}\n` +
        `🕒 ${dtDaNang}`;

      const envReqGroup = process.env.REQUESTS_GROUP_CHAT_ID ? Number(process.env.REQUESTS_GROUP_CHAT_ID) : undefined;
      const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
      const reqGroupChatId =
        Number((store.config as any)?.requestsGroupChatId) || envReqGroup || Number((store.config as any)?.groupChatId) || envGroup;

      if (reqGroupChatId && Number.isFinite(reqGroupChatId)) {
        await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: reqGroupChatId, text: msg, disable_web_page_preview: true })
        });
      } else {
        const recipients = (Array.isArray(opts.ownerTgIds) && opts.ownerTgIds.length)
          ? opts.ownerTgIds
          : opts.ownerTgId
          ? [opts.ownerTgId]
          : Array.isArray((store.config as any)?.adminTgIds)
          ? ((store.config as any).adminTgIds as number[])
          : [];

        for (const rid of recipients) {
          await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: rid, text: msg, disable_web_page_preview: true })
          });
        }
      }

      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });
  router.get("/admin/rates/today", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const data = store.ratesByDate?.[today] || null;
      res.json({ ok: true, date: today, data });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/rates/today", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body || {};
      const rates = body.rates || body;

      const USD = rates?.USD;
      const RUB = rates?.RUB;
      const USDT = rates?.USDT;

      if (!USD || !RUB || !USDT) {
        return res.status(400).json({ ok: false, error: "rates_missing" });
      }

      const num = (x: any) => Number(x);

      const data: any = {
        USD: { buy_vnd: num(USD.buy_vnd), sell_vnd: num(USD.sell_vnd) },
        RUB: { buy_vnd: num(RUB.buy_vnd), sell_vnd: num(RUB.sell_vnd) },
        USDT: { buy_vnd: num(USDT.buy_vnd), sell_vnd: num(USDT.sell_vnd) }
      };

      // EUR/THB — опционально: сохраняем только если обе цифры > 0
      const EUR = rates?.EUR;
      const THB = rates?.THB;

      const eurBuy = num(EUR?.buy_vnd);
      const eurSell = num(EUR?.sell_vnd);
      if (Number.isFinite(eurBuy) && Number.isFinite(eurSell) && eurBuy > 0 && eurSell > 0) {
        data.EUR = { buy_vnd: eurBuy, sell_vnd: eurSell };
      }

      const thbBuy = num(THB?.buy_vnd);
      const thbSell = num(THB?.sell_vnd);
      if (Number.isFinite(thbBuy) && Number.isFinite(thbSell) && thbBuy > 0 && thbSell > 0) {
        data.THB = { buy_vnd: thbBuy, sell_vnd: thbSell };
      }

      const required = [
        data.USD.buy_vnd, data.USD.sell_vnd,
        data.RUB.buy_vnd, data.RUB.sell_vnd,
        data.USDT.buy_vnd, data.USDT.sell_vnd
      ];
      if (!required.every((n) => Number.isFinite(n) && n > 0)) {
        return res.status(400).json({ ok: false, error: "bad_numbers" });
      }

      const store = await readStore();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

      store.ratesByDate[today] = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        rates: data
      };

      await writeStore(store);
      res.json({ ok: true, date: today, data: store.ratesByDate[today] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: set rates for any date (manual backfill for cashbox)
  // --------------------
  router.post("/admin/rates/date", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body || {};
      const date = String(body.date || body.day || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ ok: false, error: "bad_date" });
      }

      const rates = body.rates || body;

      const USD = rates?.USD;
      const RUB = rates?.RUB;
      const USDT = rates?.USDT;

      if (!USD || !RUB || !USDT) {
        return res.status(400).json({ ok: false, error: "rates_missing" });
      }

      const num = (x: any) => Number(x);

      const data: any = {
        USD: { buy_vnd: num(USD.buy_vnd), sell_vnd: num(USD.sell_vnd) },
        RUB: { buy_vnd: num(RUB.buy_vnd), sell_vnd: num(RUB.sell_vnd) },
        USDT: { buy_vnd: num(USDT.buy_vnd), sell_vnd: num(USDT.sell_vnd) }
      };

      // EUR/THB — optional
      const EUR = rates?.EUR;
      const THB = rates?.THB;
      const eurBuy = num(EUR?.buy_vnd);
      const eurSell = num(EUR?.sell_vnd);
      if (Number.isFinite(eurBuy) && Number.isFinite(eurSell) && eurBuy > 0 && eurSell > 0) {
        data.EUR = { buy_vnd: eurBuy, sell_vnd: eurSell };
      }
      const thbBuy = num(THB?.buy_vnd);
      const thbSell = num(THB?.sell_vnd);
      if (Number.isFinite(thbBuy) && Number.isFinite(thbSell) && thbBuy > 0 && thbSell > 0) {
        data.THB = { buy_vnd: thbBuy, sell_vnd: thbSell };
      }

      const required = [
        data.USD.buy_vnd, data.USD.sell_vnd,
        data.RUB.buy_vnd, data.RUB.sell_vnd,
        data.USDT.buy_vnd, data.USDT.sell_vnd
      ];
      if (!required.every((n) => Number.isFinite(n) && n > 0)) {
        return res.status(400).json({ ok: false, error: "bad_numbers" });
      }

      const store: any = await readStore();
      if (!store.ratesByDate || typeof store.ratesByDate !== "object") store.ratesByDate = {};

      store.ratesByDate[date] = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        rates: data
      };

      await writeStore(store);
      return res.json({ ok: true, date, data: store.ratesByDate[date] });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: rates by date range (for profit/cashbox calculator)
  // --------------------
  router.get("/admin/rates/range", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ ok: false, error: "bad_date" });
      }

      const store = await readStore();
      const src = (store as any).ratesByDate || {};
      const items = Object.keys(src)
        .filter((d) => typeof d === "string" && d >= from && d <= to)
        .sort((a, b) => a.localeCompare(b))
        .map((date) => ({ date, ...(src[date] || {}) }));

      return res.json({ ok: true, from, to, items });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner config: admins list
  // --------------------
  router.get("/admin/admins", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = await readStore();
      const adminTgIds = Array.isArray((store.config as any).adminTgIds) ? (store.config as any).adminTgIds : [];
      return res.json({ ok: true, adminTgIds });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/admins", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const raw = (req.body as any)?.adminTgIds ?? (req.body as any)?.admins;
      const list: number[] = Array.isArray(raw)
        ? raw
        : String(raw || "")
            .split(/[,\s]+/)
            .map((x) => x.trim())
            .filter(Boolean);

      const adminTgIds = (list as any[])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n) && n > 0);

      const store = await readStore();
      store.config = { ...(store.config || {}), adminTgIds };
      await writeStore(store);
      return res.json({ ok: true, adminTgIds });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: publish template
  // --------------------
  router.get("/admin/publish-template", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = await readStore();
      const template = String((store.config as any)?.publishTemplate || "");
      return res.json({ ok: true, template });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/publish-template", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const template = String((req.body as any)?.template || "");
      const store = await readStore();
      store.config = { ...(store.config || {}), publishTemplate: template };
      await writeStore(store);
      return res.json({ ok: true, template });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: contacts
  // --------------------
  router.get("/admin/contacts", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = await readStore();
      return res.json({ ok: true, contacts: Array.isArray(store.contacts) ? store.contacts : [] });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/contacts/upsert", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      const tg_id = req.body?.tg_id ? Number(req.body.tg_id) : undefined;
      const username = normUsername(req.body?.username);
      const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
      const banksInput = (req.body as any)?.banks;
      const banks = Array.isArray(banksInput) ? (banksInput as any[]).map(String) : undefined;
      const status = parseStatusInput(req.body?.status);

      if (!tg_id && !username) return res.status(400).json({ ok: false, error: "tg_id_or_username_required" });

      const now = new Date().toISOString();

      const list = store.contacts || [];
      const byTg = tg_id ? list.find((x) => x && Number(x.tg_id) === tg_id) : undefined;
      const byU = username ? list.find((x) => x && normUsername(x.username) === username) : undefined;

      let c = byTg || byU;

      // if we have two duplicates (tg_id and username variants) — merge into tg_id record
      if (byTg && byU && byTg !== byU) {
        const primary = byTg as Contact;
        const secondary = byU as Contact;
        primary.username = primary.username || secondary.username;
        primary.fullName = primary.fullName || secondary.fullName;
        primary.banks = (Array.isArray(primary.banks) && primary.banks.length) ? primary.banks : secondary.banks;
        primary.status = primary.status || secondary.status;
        primary.created_at = primary.created_at || secondary.created_at;

        const i = list.indexOf(secondary as any);
        if (i >= 0) list.splice(i, 1);
        c = primary;
      }

      if (!c) {
        const id = tg_id ? `tg_${tg_id}` : `u_${username}`;
        c = { id, created_at: now, updated_at: now } as Contact;
        (store.contacts || []).push(c);
      } else {
        const desiredId = tg_id ? `tg_${tg_id}` : `u_${username}`;
        if (!c.id) c.id = desiredId;
        // promote id when we learned tg_id/username (avoid future duplicates)
        if (desiredId && c.id !== desiredId && !(store.contacts || []).some((x) => x && x !== c && x.id === desiredId)) {
          c.id = desiredId;
        }
      }
      c.updated_at = now;
      if (tg_id) c.tg_id = tg_id;
      if (username) c.username = username;
      if (fullName || fullName === "") c.fullName = fullName;
      if (banks !== undefined) c.banks = banks;
      if (status) c.status = status;

      // If the user already exists in users, sync status immediately
      if (status && tg_id && store.users?.[String(tg_id)]) {
        store.users[String(tg_id)].status = status;
      }

      await writeStore(store);
      return res.json({ ok: true, contact: c });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: reports
  // --------------------
  router.get("/admin/reports", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const onlyDone = String(req.query.onlyDone || "1") !== "0";
      const tgId = req.query.tgId ? Number(req.query.tgId) : undefined;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ ok: false, error: "bad_date" });
      }

      const store = await readStore();
      const fromTs = new Date(from + "T00:00:00.000Z").getTime();
      const toTs = new Date(to + "T23:59:59.999Z").getTime();

      const list = (store.requests || [])
        .filter((r) => {
          const ts = new Date(String(r.created_at)).getTime();
          if (!Number.isFinite(ts)) return false;
          if (ts < fromTs || ts > toTs) return false;
          if (onlyDone && r.state !== "done") return false;
          if (tgId && r.from?.id !== tgId) return false;
          return true;
        })
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      const metrics: any = {
        total: list.length,
        states: { new: 0, in_progress: 0, done: 0, canceled: 0 },
        pay: { cash: 0, transfer: 0, other: 0 },
        receive: { cash: 0, transfer: 0, atm: 0, other: 0 },
        sellCurrency: {},
        buyCurrency: {},
      };
      for (const r of list) {
        (metrics.states as any)[r.state] = ((metrics.states as any)[r.state] || 0) + 1;
        const pm = String((r as any).payMethod || "");
        if (pm === "cash" || pm === "transfer") metrics.pay[pm]++;
        else metrics.pay.other++;
        const rm = String((r as any).receiveMethod || "");
        if (rm === "cash" || rm === "transfer" || rm === "atm") metrics.receive[rm]++;
        else metrics.receive.other++;
        metrics.sellCurrency[r.sellCurrency] = (metrics.sellCurrency[r.sellCurrency] || 0) + 1;
        metrics.buyCurrency[r.buyCurrency] = (metrics.buyCurrency[r.buyCurrency] || 0) + 1;
      }

      return res.json({ ok: true, from, to, onlyDone, ...(tgId ? { tgId } : {}), metrics, requests: list });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: publish rates to group (text + optional image + webapp button)
  // --------------------
  router.post("/admin/publish", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();

      // Group chat to publish into.
      // Priority: store.config.groupChatId (editable by owner) -> env GROUP_CHAT_ID
      const groupChatIdRaw = (store.config as any)?.groupChatId ?? process.env.GROUP_CHAT_ID;
      const groupChatId = Number(groupChatIdRaw);
      if (!groupChatId || Number.isNaN(groupChatId)) {
        return res.status(400).json({ ok: false, error: "group_not_set" });
      }

      const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const todayRates = store.ratesByDate?.[todayKey]?.rates;
      if (!todayRates?.RUB || !todayRates?.USDT || !todayRates?.USD) {
        return res.status(400).json({ ok: false, error: "rates_missing" });
      }

      const fmtSpaces = (n: number) => String(Math.trunc(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      const rubLine = `10 000 ₽   💸 ${fmtSpaces(10_000 * Number(todayRates.RUB.buy_vnd))} vnd`;
      const usdtLine = `100 USDT   💵 ${fmtSpaces(100 * Number(todayRates.USDT.buy_vnd))} vnd`;
      const usdLine = `100 USD    💵 ${fmtSpaces(100 * Number(todayRates.USD.buy_vnd))} vnd`;
      const ratesBlock = `${rubLine}\n\n${usdtLine}\n\n${usdLine}`;

      // "16 февраля 2026" (без "г.")
      const dateHuman = (() => {
        const s = new Date().toLocaleDateString("ru-RU", {
          timeZone: "Asia/Ho_Chi_Minh",
          day: "numeric",
          month: "long",
          year: "numeric"
        });
        return s.replace(/\s*г\.?$/i, "").trim();
      })();

      const templateFromBody = typeof req.body?.template === "string" ? String(req.body.template) : undefined;
      const templateStored = String((store.config as any)?.publishTemplate || "");
      const tpl =
        (templateFromBody ?? templateStored).trim() ||
        "Доброе утро!\n\nКурс на {{date}}:\n\n{{rates}}";

      const text = tpl
        .replace(/\{\{\s*date\s*\}\}/gi, dateHuman)
        .replace(/\{\{\s*rates\s*\}\}/gi, ratesBlock);

      // IMPORTANT:
      // InlineKeyboardButton.web_app is **available only in private chats**.
      // For group posts we must use a URL button.
      // To open the Mini App **inside Telegram** (so initData is present), use the t.me deep link.
      // Docs: https://core.telegram.org/bots/webapps

      const webappUrl = String(process.env.WEBAPP_URL || "").trim();

      // Allow overriding the Telegram deep link if the owner wants.
      // Example: https://t.me/<botusername>?startapp=rates
      const overrideTmaLink = String(process.env.TMA_LINK || "").trim();

      // Fetch bot username once (best-effort) to build t.me deep link.
      let cachedBotUsername: string | null = null;
      async function getBotUsername(): Promise<string | null> {
        if (cachedBotUsername) return cachedBotUsername;
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/getMe`);
          const tgJson: any = await tgRes.json();
          const uname = tgJson?.ok ? String(tgJson?.result?.username || "") : "";
          if (uname) {
            cachedBotUsername = uname;
            return uname;
          }
        } catch {}
        return null;
      }

      const startParam = "rates";
      const tmaLink = overrideTmaLink
        ? overrideTmaLink
        : (await (async () => {
            const uname = await getBotUsername();
            return uname ? `https://t.me/${uname}?startapp=${encodeURIComponent(startParam)}` : "";
          })());

      // Final link priority:
      // 1) explicit TMA_LINK
      // 2) generated t.me deep link from getMe
      // 3) WEBAPP_URL (will open in browser, but at least it's something)
      const openLink = tmaLink || webappUrl || "https://t.me";
      const markupUrl = {
        inline_keyboard: [[{ text: "Открыть приложение", url: openLink }]]
      };

      const imageDataUrl = typeof req.body?.imageDataUrl === "string" ? String(req.body.imageDataUrl) : "";

      async function tgSendMessage(markup?: any) {
        const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: groupChatId,
            text,
            disable_web_page_preview: true,
            ...(markup ? { reply_markup: markup } : {})
          })
        });
        const tgJson: any = await tgRes.json();
        return tgJson;
      }

      async function tgSendPhotoOrDoc(markup?: any) {
        const m = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return { ok: false, description: "bad_image" };
        const mime = m[1];
        const b64 = m[2];
        const buf = Buffer.from(b64, "base64");

        // Telegram sendPhoto is safest with jpeg/png. For other types use sendDocument.
        const isPhoto = /image\/(jpeg|jpg|png)/i.test(mime);
        const method = isPhoto ? "sendPhoto" : "sendDocument";

        const form = new FormData();
        form.append("chat_id", String(groupChatId));
        // Caption limits are smaller (1024). If too long, we'll fall back to a text message.
        form.append(isPhoto ? "caption" : "caption", text);
        if (markup) form.append("reply_markup", JSON.stringify(markup));

        const ext = mime.includes("png") ? ".png" : mime.includes("jpeg") || mime.includes("jpg") ? ".jpg" : ".bin";
        const field = isPhoto ? "photo" : "document";
        form.append(field, new Blob([buf], { type: mime }), "image" + ext);

        const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/${method}`, {
          method: "POST",
          body: form as any
        });
        const tgJson: any = await tgRes.json();
        return tgJson;
      }

      // For group posts we use URL button only.
      // We try (1) url button, (2) no buttons.
      async function sendMessageWithFallbacks() {
        let tgJson = await tgSendMessage(markupUrl);
        if (!tgJson?.ok) tgJson = await tgSendMessage(undefined);
        return tgJson;
      }

      async function sendPhotoWithFallbacks() {
        let tgJson = await tgSendPhotoOrDoc(markupUrl);
        if (!tgJson?.ok) tgJson = await tgSendPhotoOrDoc(undefined);
        return tgJson;
      }

      // --- Send with image if provided
      if (imageDataUrl && imageDataUrl.startsWith("data:")) {
        let tgJson = await sendPhotoWithFallbacks();

        // If caption too long (common), retry without image (sendMessage)
        if (!tgJson?.ok && /caption/i.test(String(tgJson?.description || ""))) {
          const tgMsg = await sendMessageWithFallbacks();
          if (!tgMsg?.ok) {
            return res
              .status(500)
              .json({ ok: false, error: tgMsg?.description || "tg_send_failed", debug: { photo_error: tgJson, msg_error: tgMsg } });
          }
          return res.json({
            ok: true,
            message_id: tgMsg?.result?.message_id,
            mode: "message_fallback",
            warn: String(tgJson?.description || "")
          });
        }

        if (!tgJson?.ok) {
          // Final fallback: send without image so at least the post is published
          const tgMsg = await sendMessageWithFallbacks();
          if (!tgMsg?.ok) {
            return res.status(500).json({
              ok: false,
              error: tgJson?.description || tgMsg?.description || "tg_send_failed",
              debug: { photo_error: tgJson, msg_error: tgMsg }
            });
          }
          return res.json({
            ok: true,
            message_id: tgMsg?.result?.message_id,
            mode: "message_fallback",
            warn: String(tgJson?.description || "")
          });
        }

        return res.json({ ok: true, message_id: tgJson?.result?.message_id, mode: "image" });
      }

      // --- Send as a normal message
      const tgJson = await sendMessageWithFallbacks();
      if (!tgJson?.ok) {
        return res.status(500).json({ ok: false, error: tgJson?.description || "tg_send_failed", debug: { msg_error: tgJson } });
      }
      return res.json({ ok: true, message_id: tgJson?.result?.message_id, mode: "message" });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });


  // --------------------
  // Admin users
  // --------------------
  router.get("/admin/users", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      res.json({ ok: true, users: Object.values(store.users || {}) });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/users/:tgId/status", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const tgId = Number(req.params.tgId);
      if (!Number.isFinite(tgId) || tgId <= 0) {
        return res.status(400).json({ ok: false, error: "bad_tg_id" });
      }

      const next = parseStatusInput(req.body?.status);
      if (!next) {
        return res.status(400).json({
          ok: false,
          error: "bad_status",
          hint: "status: standard|silver|gold (можно: стандарт/серебро/золото)"
        });
      }

      const store = await readStore();
      const key = String(tgId);
      if (!store.users?.[key]) return res.status(404).json({ ok: false, error: "user_not_found" });

      store.users[key].status = next;
      await writeStore(store);

      res.json({ ok: true, status: next, statusLabel: statusLabel[next] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Requests
  // --------------------
  // список заявок (для админов внутри miniapp)
  router.get("/staff/requests", async (req, res) => {
    try {
      await requireStaff(req);
      const store = await readStore();
      // legacy: migrate any "new" to "in_progress"
      const requests = [...(store.requests || [])]
        .map((r) => ({ ...r, state: (r as any).state === "new" ? "in_progress" : (r as any).state }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const contacts: Record<string, any> = {};
      for (const c of store.contacts || []) {
        if (c?.tg_id) contacts[String(c.tg_id)] = c;
      }
      return res.json({ ok: true, requests, contacts });
    } catch (e: any) {
      return res.status(e?.message === "not_admin" ? 403 : 401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // изменить статус заявки (админ внутри miniapp)
  router.post("/staff/requests/:id/state", async (req, res) => {
    try {
      const { user } = await requireStaff(req);
      const id = String(req.params.id || "");
      const next = parseRequestState(req.body?.state);
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
      if (!next) return res.status(400).json({ ok: false, error: "bad_state" });

      const store = await readStore();
      const r = (store.requests || []).find((x) => String((x as any).id) === id) as StoredRequest | undefined;
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = next;
      r.state_updated_at = new Date().toISOString();
      r.state_updated_by = user.id;
      await writeStore(store);

      // notify user
      try {
        const shortId = id.slice(-6);
        const text =
          `📣 Статус заявки обновлён\n` +
          `🆔 #${shortId}\n` +
          `🔁 ${r.sellCurrency} → ${r.buyCurrency}\n` +
          `💸 Отдаёте: ${r.sellAmount}\n` +
          `🎯 Получаете: ${r.buyAmount}\n` +
          `📌 Сейчас: ${requestStateLabel[next]}`;

        await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ chat_id: r.from.id, text, disable_web_page_preview: true })
        });
      } catch {}

      return res.json({ ok: true, request: r });
    } catch (e: any) {
      return res.status(e?.message === "not_admin" ? 403 : 401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // контакты (админ внутри miniapp)
  router.post("/staff/contacts/upsert", async (req, res) => {
    try {
      const { user } = await requireStaff(req);
      const store = await readStore();

      const tg_id = req.body?.tg_id ? Number(req.body.tg_id) : undefined;
      const username = normUsername(req.body?.username);
      const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
      const banksInput = (req.body as any)?.banks;
      const banks = Array.isArray(banksInput) ? (banksInput as any[]).map(String) : undefined;

      if (!tg_id && !username) return res.status(400).json({ ok: false, error: "tg_id_or_username_required" });

      const now = new Date().toISOString();

      const list = store.contacts || [];
      const byTg = tg_id ? list.find((x) => x && Number(x.tg_id) === tg_id) : undefined;
      const byU = username ? list.find((x) => x && normUsername(x.username) === username) : undefined;

      let c = byTg || byU;

      if (byTg && byU && byTg !== byU) {
        const primary = byTg as Contact;
        const secondary = byU as Contact;
        primary.username = primary.username || secondary.username;
        primary.fullName = primary.fullName || secondary.fullName;
        primary.banks = (Array.isArray(primary.banks) && primary.banks.length) ? primary.banks : secondary.banks;
        primary.created_at = primary.created_at || secondary.created_at;

        const i = list.indexOf(secondary as any);
        if (i >= 0) list.splice(i, 1);
        c = primary;
      }

      if (!c) {
        const id = tg_id ? `tg_${tg_id}` : `u_${username}`;
        c = { id, created_at: now, updated_at: now } as Contact;
        (store.contacts || []).push(c);
      } else {
        const desiredId = tg_id ? `tg_${tg_id}` : `u_${username}`;
        if (!c.id) c.id = desiredId;
        if (desiredId && c.id !== desiredId && !(store.contacts || []).some((x) => x && x !== c && x.id === desiredId)) {
          c.id = desiredId;
        }
      }
      c.updated_at = now;
      if (tg_id) c.tg_id = tg_id;
      if (username) c.username = username;
      if (fullName || fullName === "") c.fullName = fullName;
      if (banks !== undefined) c.banks = banks;

      // note: staff doesn't change status here
      await writeStore(store);
      return res.json({ ok: true, contact: c, by: user.id });
    } catch (e: any) {
      return res.status(e?.message === "not_admin" ? 403 : 401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // список заявок (для владельца)
  router.get("/admin/requests", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      const requests = [...(store.requests || [])].sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      );

      return res.json({ ok: true, requests });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // изменить статус заявки (и отправить пуш пользователю через Telegram)
  router.post("/admin/requests/:id/state", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const id = String(req.params.id || "");
      const next = parseRequestState(req.body?.state);
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
      if (!next) {
        return res.status(400).json({
          ok: false,
          error: "bad_state",
          hint: "state: new | in_progress | done | canceled"
        });
      }

      const store = await readStore();
      const r = (store.requests || []).find((x) => String((x as any).id) === id) as StoredRequest | undefined;
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = next;
      r.state_updated_at = new Date().toISOString();
      r.state_updated_by = user.id;
      await writeStore(store);

      // Уведомление пользователю (это и будет "push" на телефоне через Telegram)
      const shortId = id.slice(-6);
      const text =
        `📣 Статус заявки обновлён\n` +
        `🆔 #${shortId}\n` +
        `🔁 ${r.sellCurrency} → ${r.buyCurrency}\n` +
        `💸 Отдаёте: ${r.sellAmount}\n` +
        `🎯 Получаете: ${r.buyAmount}\n` +
        `📌 Сейчас: ${requestStateLabel[next]}`;

      // бот может писать пользователю только если он уже нажал /start (в нашем случае это так)
      const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: r.from.id,
          text,
          disable_web_page_preview: true
        })
      });
      const tgJson: any = await tgRes.json();
      if (!tgJson?.ok) {
        // не фейлим весь запрос, но возвращаем предупреждение
        return res.json({ ok: true, request: r, warn: tgJson?.description || "tg_send_failed" });
      }

      return res.json({ ok: true, request: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/requests", async (req, res) => {
    try {
      const { user, status } = await requireAuth(req);

      const p = req.body || {};
      const sellCurrency = String(p.sellCurrency || "") as Currency;
      const buyCurrency = String(p.buyCurrency || "") as Currency;
      const sellAmount = Number(p.sellAmount);
      const buyAmount = Number(p.buyAmount);
      const receiveMethod = String(p.receiveMethod || "").toLowerCase() as ReceiveMethod;

      const allowedCur = new Set<Currency>(["RUB", "USD", "USDT", "VND", "EUR", "THB"]);
      const allowedMethod = new Set<ReceiveMethod>(["cash", "transfer", "atm"]);

      if (!allowedCur.has(sellCurrency) || !allowedCur.has(buyCurrency) || sellCurrency === buyCurrency) {
        return res.status(400).json({ ok: false, error: "bad_currency" });
      }
      if (!(sellAmount > 0) || !(buyAmount > 0)) {
        return res.status(400).json({ ok: false, error: "bad_amount" });
      }
      if (!allowedMethod.has(receiveMethod)) {
        return res.status(400).json({ ok: false, error: "bad_method" });
      }

      const store = await readStore();

      // Requests are posted into a dedicated managers group (preferred).
      // The bot may also publish rates into another group, so we support 2 separate chat IDs.

      const dtDaNang = new Intl.DateTimeFormat("ru-RU", {
        timeZone: "Asia/Ho_Chi_Minh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(new Date()).replace(",", "");

      const methodMap: Record<ReceiveMethod, string> = {
        cash: "наличные",
        transfer: "перевод",
        atm: "банкомат"
      };

      store.requests = store.requests || [];
      const request: StoredRequest = {
        id: randomUUID(),
        // By default заявки сразу "в работе"
        state: "in_progress",
        sellCurrency,
        buyCurrency,
        sellAmount,
        buyAmount,
        payMethod: String(p.payMethod || ""),
        receiveMethod,
        from: user,
        status: normalizeStatus(status),
        created_at: new Date().toISOString()
      };
      store.requests.push(request);
      await writeStore(store);

      // Notify: post into requests group (preferred), fallback to private admins if not configured
      try {
        const shortId = request.id.slice(-6);
        const who =
          (user.username
            ? `@${user.username}`
            : `${user.first_name || ""} ${user.last_name || ""}`.trim() || `id ${user.id}`) +
          ` • статус: ${statusLabel[normalizeStatus(status)]}`;

        const payMap: Record<string, string> = { cash: "наличные", transfer: "перевод", other: "другое" };

        const text =
          `💱 Новая заявка (в работе)\n` +
          `🆔 #${shortId}\n` +
          `👤 ${who}\n` +
          `🔁 ${sellCurrency} → ${buyCurrency}\n` +
          `💸 Отдаёт: ${sellAmount}\n` +
          `🎯 Получит: ${buyAmount}\n` +
          `💳 Оплата: ${payMap[String(p.payMethod || "")] || String(p.payMethod || "—")}\n` +
          `📦 Получение: ${methodMap[receiveMethod]}\n` +
          `🕒 ${dtDaNang}`;

        const envReqGroup = process.env.REQUESTS_GROUP_CHAT_ID ? Number(process.env.REQUESTS_GROUP_CHAT_ID) : undefined;
        const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
        const reqGroupChatId =
          Number((store.config as any)?.requestsGroupChatId) || envReqGroup || Number((store.config as any)?.groupChatId) || envGroup;

        if (reqGroupChatId && Number.isFinite(reqGroupChatId)) {
          await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ chat_id: reqGroupChatId, text, disable_web_page_preview: true })
          });
        } else {
          const recipients = (Array.isArray(opts.ownerTgIds) && opts.ownerTgIds.length)
            ? opts.ownerTgIds
            : opts.ownerTgId
            ? [opts.ownerTgId]
            : Array.isArray((store.config as any)?.adminTgIds)
            ? ((store.config as any).adminTgIds as number[])
            : [];
          for (const rid of recipients) {
            await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ chat_id: rid, text, disable_web_page_preview: true })
            });
          }
        }
      } catch {}

      res.json({ ok: true, id: request.id, state: request.state });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Client: my requests history
  // --------------------
  router.get("/requests/mine", async (req, res) => {
    try {
      const { user } = await requireAuth(req);
      const store = await readStore();
      const list = (store.requests || [])
        .filter((r) => Number((r as any)?.from?.id) === Number(user.id))
        .slice()
        .sort((a, b) => String((b as any)?.created_at || "").localeCompare(String((a as any)?.created_at || "")));
      return res.json({ ok: true, requests: list });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Reviews (без звёзд):
  // - оставить отзыв можно только по выполненной заявке (state=done)
  // - отзыв сначала попадает на модерацию (pending)
  // - виден пользователям только после approve
  // - владелец может отвечать от имени компании
  // --------------------

  function reviewDisplayName(r: StoredReview): string {
    if (r.anonymous) return "Анонимно";
    if (r.username) return `@${r.username}`;
    const fn = String(r.first_name || "").trim();
    const ln = String(r.last_name || "").trim();
    const full = [fn, ln].filter(Boolean).join(" ").trim();
    if (full) return full;
    return `ID ${r.tg_id}`;
  }

  function toPublicReview(r: StoredReview): PublicReview {
    return {
      id: r.id,
      created_at: r.created_at,
      text: r.text,
      displayName: reviewDisplayName(r),
      anonymous: Boolean(r.anonymous),
      ...(r.company_reply?.text
        ? { company_reply: { text: r.company_reply.text, created_at: r.company_reply.created_at } }
        : {})
    };
  }

  // Публичный список: только одобренные
  router.get("/reviews", async (_req, res) => {
    const store = await readStore();
    const list = (store.reviews || [])
      .filter((r) => r && r.state === "approved")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(toPublicReview);
    res.json({ ok: true, reviews: list });
  });

  // Список сделок, по которым пользователь МОЖЕТ оставить отзыв
  router.get("/reviews/eligible", async (req, res) => {
    try {
      const { user } = await requireAuth(req);
      const store = await readStore();

      const mineDone = (store.requests || [])
        .filter((x) => x?.from?.id === user.id && x.state === "done")
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      const reviewed = new Set(
        (store.reviews || [])
          .filter((r) => r && (r.state === "pending" || r.state === "approved"))
          .map((r) => String(r.requestId))
      );

      const eligible = mineDone
        .filter((r) => !reviewed.has(String(r.id)))
        .map((r) => ({
          id: r.id,
          created_at: r.created_at,
          sellCurrency: r.sellCurrency,
          buyCurrency: r.buyCurrency,
          sellAmount: r.sellAmount,
          buyAmount: r.buyAmount
        }));

      return res.json({ ok: true, eligible });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // Создать отзыв (pending)
  router.post("/reviews", async (req, res) => {
    try {
      const { user } = await requireAuth(req);
      const text = String(req.body?.text || "").trim();
      const anonymous = Boolean(req.body?.anonymous);
      const requestId = String(req.body?.requestId || req.body?.request_id || "").trim();

      if (!requestId) return res.status(400).json({ ok: false, error: "request_id_missing" });
      if (text.length < 3) return res.status(400).json({ ok: false, error: "text_too_short" });

      const store = await readStore();
      const reqObj = (store.requests || []).find((x) => String(x.id) === requestId);
      if (!reqObj) return res.status(404).json({ ok: false, error: "request_not_found" });
      if (reqObj.from?.id !== user.id) return res.status(403).json({ ok: false, error: "not_your_request" });
      if (reqObj.state !== "done") return res.status(400).json({ ok: false, error: "request_not_done" });

      const exists = (store.reviews || []).some(
        (r) => r && String(r.requestId) === requestId && (r.state === "pending" || r.state === "approved")
      );
      if (exists) return res.status(400).json({ ok: false, error: "already_reviewed" });

      const review: StoredReview = {
        id: randomUUID(),
        requestId,
        tg_id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        text,
        anonymous,
        state: "pending" as ReviewState,
        created_at: new Date().toISOString()
      };

      store.reviews = store.reviews || [];
      store.reviews.push(review);
      await writeStore(store);

      return res.json({ ok: true, id: review.id, state: review.state });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ---- Admin moderation ----
  router.get("/admin/reviews", async (req, res) => {
    try {
      const { isOwner } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = await readStore();
      const list = (store.reviews || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const counts = {
        pending: list.filter((r) => r.state === "pending").length,
        approved: list.filter((r) => r.state === "approved").length,
        rejected: list.filter((r) => r.state === "rejected").length
      };

      return res.json({ ok: true, reviews: list, counts });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/reviews/:id/approve", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const store = await readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = "approved";
      r.approved_at = new Date().toISOString();
      r.approved_by = user.id;
      await writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/reviews/:id/reject", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const store = await readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = "rejected";
      r.rejected_at = new Date().toISOString();
      r.rejected_by = user.id;
      await writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/reviews/:id/reply", async (req, res) => {
    try {
      const { isOwner, user } = await requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const text = String(req.body?.text || "").trim();
      if (text.length < 1) return res.status(400).json({ ok: false, error: "text_required" });

      const store = await readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.company_reply = { text, created_at: new Date().toISOString(), by: user.id };
      await writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  return router;
}
