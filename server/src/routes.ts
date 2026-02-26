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
  new: "принята",
  in_progress: "в работе",
  done: "готово",
  canceled: "отменена"
};

function parseRequestState(s: any): RequestState | null {
  const v = String(s ?? "").toLowerCase().trim();
  if (!v) return null;
  if (["new", "принята", "новая", "создана"].includes(v)) return "new";
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

  function requireAuth(req: express.Request) {
    const auth = (req.headers.authorization as string | undefined) || "";
    const initFromAuth = auth.startsWith("tma ") ? auth.slice(4) : undefined;
    const initFromHeader = req.headers["x-telegram-init-data"] as string | undefined;
    const initFromBody =
      (req.body?.initData as string | undefined) || (req.body?.init_data as string | undefined);

    const initData = initFromAuth || initFromHeader || initFromBody;
    if (!initData) throw new Error("No initData");

    const v = validateTelegramInitData(initData, opts.botToken);

    const up = upsertUserFromTelegram(v.user);
    const status = (up?.status ?? "standard") as UserStatus;
    const isOwner = isOwnerId(v.user.id);

    const store = readStore();
    const adminIds = Array.isArray((store.config as any)?.adminTgIds) ? (store.config as any).adminTgIds : [];
    const isAdmin = adminIds.includes(v.user.id);

    return { user: v.user, status, isOwner, isAdmin };
  }

  // Admin access for a standalone PC dashboard.
  // If ADMIN_WEB_KEY is set, requests with header `x-admin-key: <key>` are treated as owner.
  function requireAdmin(req: express.Request) {
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
    return requireAuth(req);
  }

  function requireStaff(req: express.Request) {
    const a = requireAuth(req);
    if (!a.isAdmin) throw new Error("not_admin");
    return a;
  }

  router.get("/health", (_req, res) => res.json({ ok: true }));

  // --------------------
  // Public: list bank icon filenames from webapp/public/banks (or dist/banks)
  // --------------------
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const banksCandidates = [
    path.resolve(__dirname, "../../webapp/dist/banks"),
    path.resolve(__dirname, "../../webapp/public/banks")
  ];

  router.get("/banks/icons", (_req, res) => {
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

  router.post("/auth", (req, res) => {
    try {
      const { user, status, isOwner, isAdmin } = requireAuth(req);
      res.json({ ok: true, user, status, statusLabel: statusLabel[status], isOwner, isAdmin });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/me", (req, res) => {
    try {
      const { user, status, isOwner, isAdmin } = requireAuth(req);
      res.json({
        ok: true,
        data: {
          user,
          status,
          statusLabel: statusLabel[normalizeStatus(status)],
          isOwner,
          isAdmin
        }
      });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Rates
  // --------------------
  router.get("/rates/today", (_req, res) => {
    const store = readStore();
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
  // Bonuses (надбавки)
  // --------------------
  router.get("/bonuses", (_req, res) => {
    const store = readStore();
    // Нормализуем/мигрируем, чтобы старые store.json (где bonuses мог быть пустым объектом)
    // не ломали фронт (например, bonuses.enabled может отсутствовать).
    const current = (store.config as any)?.bonuses;
    const bonuses = cleanBonuses(current);

    // Если по дороге что-то «починили» — сохраним обратно, чтобы больше не повторялось.
    if (JSON.stringify(current ?? null) !== JSON.stringify(bonuses)) {
      store.config = { ...(store.config || {}), bonuses };
      writeStore(store);
    }

    res.json({ ok: true, bonuses });
  });

  router.get("/admin/bonuses", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const current = (store.config as any)?.bonuses;
      const bonuses = cleanBonuses(current);

      if (JSON.stringify(current ?? null) !== JSON.stringify(bonuses)) {
        store.config = { ...(store.config || {}), bonuses };
        writeStore(store);
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

  router.post("/admin/bonuses", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body || {};
      const bonuses = cleanBonuses(body.bonuses ?? body);

      const store = readStore();
      store.config = { ...(store.config || {}), bonuses };
      writeStore(store);
      res.json({ ok: true, bonuses });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // ATMs
  // --------------------
  // публичный список банкоматов
  router.get("/atms", (_req, res) => {
    const store = readStore();
    res.json({ ok: true, atms: Array.isArray((store as any).atms) ? (store as any).atms : [] });
  });

  // список для владельца (через Telegram initData или x-admin-key)
  router.get("/admin/atms", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      res.json({ ok: true, atms: Array.isArray((store as any).atms) ? (store as any).atms : [] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // сохранить список (полностью перезаписываем)
  router.post("/admin/atms", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
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

      const store: any = readStore();
      store.atms = cleaned;
      writeStore(store);
      res.json({ ok: true, atms: store.atms });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/admin/rates/today", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      const data = store.ratesByDate?.[today] || null;
      res.json({ ok: true, date: today, data });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/rates/today", (req, res) => {
    try {
      const { isOwner, user } = requireAdmin(req);
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

      const store = readStore();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

      store.ratesByDate[today] = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        rates: data
      };

      writeStore(store);
      res.json({ ok: true, date: today, data: store.ratesByDate[today] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner config: admins list
  // --------------------
  router.get("/admin/admins", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = readStore();
      const adminTgIds = Array.isArray((store.config as any).adminTgIds) ? (store.config as any).adminTgIds : [];
      return res.json({ ok: true, adminTgIds });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/admins", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
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

      const store = readStore();
      store.config = { ...(store.config || {}), adminTgIds };
      writeStore(store);
      return res.json({ ok: true, adminTgIds });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: publish template
  // --------------------
  router.get("/admin/publish-template", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = readStore();
      const template = String((store.config as any)?.publishTemplate || "");
      return res.json({ ok: true, template });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/publish-template", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const template = String((req.body as any)?.template || "");
      const store = readStore();
      store.config = { ...(store.config || {}), publishTemplate: template };
      writeStore(store);
      return res.json({ ok: true, template });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: contacts
  // --------------------
  router.get("/admin/contacts", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = readStore();
      return res.json({ ok: true, contacts: Array.isArray(store.contacts) ? store.contacts : [] });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/contacts/upsert", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const tg_id = req.body?.tg_id ? Number(req.body.tg_id) : undefined;
      const username = normUsername(req.body?.username);
      const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
      const banks = Array.isArray(req.body?.banks) ? (req.body.banks as any[]).map(String) : [];
      const status = parseStatusInput(req.body?.status) ?? undefined;

      if (!tg_id && !username) return res.status(400).json({ ok: false, error: "tg_id_or_username_required" });

      const now = new Date().toISOString();
      const id = tg_id ? `tg_${tg_id}` : `u_${username}`;

      let c = (store.contacts || []).find((x) => x && x.id === id);
      if (!c) {
        c = { id, created_at: now, updated_at: now } as Contact;
        (store.contacts || []).push(c);
      }
      c.updated_at = now;
      if (tg_id) c.tg_id = tg_id;
      if (username) c.username = username;
      if (fullName || fullName === "") c.fullName = fullName;
      if (banks) c.banks = banks;
      if (status) c.status = status;

      // If the user already exists in users, sync status immediately
      if (status && tg_id && store.users?.[String(tg_id)]) {
        store.users[String(tg_id)].status = status;
      }

      writeStore(store);
      return res.json({ ok: true, contact: c });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Owner: reports
  // --------------------
  router.get("/admin/reports", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const from = String(req.query.from || "").trim();
      const to = String(req.query.to || "").trim();
      const onlyDone = String(req.query.onlyDone || "1") !== "0";
      const tgId = req.query.tgId ? Number(req.query.tgId) : undefined;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ ok: false, error: "bad_date" });
      }

      const store = readStore();
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

  // Quick diagnostics for group configuration & bot access.
  router.get("/admin/group", async (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
      const storeGroup = store.config?.groupChatId;
      const groupChatId = storeGroup || envGroup;

      const out: any = {
        ok: true,
        storeGroupChatId: storeGroup ?? null,
        envGroupChatId: envGroup ?? null,
        groupChatId: groupChatId ?? null,
        telegram: null
      };

      if (!groupChatId) return res.json(out);

      try {
        const tgRes = await fetch(
          `https://api.telegram.org/bot${opts.botToken}/getChat?chat_id=${encodeURIComponent(String(groupChatId))}`
        );
        const tgJson: any = await tgRes.json();
        if (tgJson?.ok) {
          out.telegram = {
            ok: true,
            id: tgJson?.result?.id,
            type: tgJson?.result?.type,
            title: tgJson?.result?.title,
            username: tgJson?.result?.username
          };
        } else {
          out.telegram = { ok: false, error: tgJson?.description || "tg_getchat_failed" };
        }
      } catch (e: any) {
        out.telegram = { ok: false, error: e?.message || "tg_getchat_failed" };
      }

      return res.json(out);
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/group/test", async (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
      const groupChatId = store.config?.groupChatId || envGroup;
      if (!groupChatId) return res.status(400).json({ ok: false, error: "group_not_set" });

      const text = "✅ Тест: бот может писать в эту группу";
      const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: groupChatId, text })
      });
      const tgJson: any = await tgRes.json();
      if (!tgJson?.ok) return res.status(500).json({ ok: false, error: tgJson?.description || "tg_send_failed" });
      return res.json({ ok: true, message_id: tgJson?.result?.message_id });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });
  router.post("/admin/publish", async (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
      const groupChatId = store.config?.groupChatId || envGroup;
      if (!groupChatId) return res.status(400).json({ ok: false, error: "group_not_set" });

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

      const webappUrl = String(process.env.WEBAPP_URL || "").trim();

      // Prefer web_app button, but some chats/types may reject it. We'll fall back to a URL button.
      const markupWebApp = {
        inline_keyboard: [
          [
            webappUrl
              ? { text: "Открыть приложение", web_app: { url: webappUrl } }
              : { text: "Открыть приложение", url: "https://t.me" }
          ]
        ]
      };
      const markupUrl = {
        inline_keyboard: [
          [
            webappUrl
              ? { text: "Открыть приложение", url: webappUrl }
              : { text: "Открыть приложение", url: "https://t.me" }
          ]
        ]
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

      // Some chat types (esp. groups/channels) can reject certain button types.
      // We try (1) web_app, (2) url, (3) no buttons.
      async function sendMessageWithFallbacks() {
        let tgJson = await tgSendMessage(markupWebApp);
        if (!tgJson?.ok) tgJson = await tgSendMessage(markupUrl);
        if (!tgJson?.ok) tgJson = await tgSendMessage(undefined);
        return tgJson;
      }

      async function sendPhotoWithFallbacks() {
        let tgJson = await tgSendPhotoOrDoc(markupWebApp);
        if (!tgJson?.ok) tgJson = await tgSendPhotoOrDoc(markupUrl);
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
  router.get("/admin/users", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      res.json({ ok: true, users: Object.values(store.users || {}) });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/users/:tgId/status", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
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

      const store = readStore();
      const key = String(tgId);
      if (!store.users?.[key]) return res.status(404).json({ ok: false, error: "user_not_found" });

      store.users[key].status = next;
      writeStore(store);

      res.json({ ok: true, status: next, statusLabel: statusLabel[next] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // --------------------
  // Requests
  // --------------------
  // список заявок (для админов внутри miniapp)
  router.get("/staff/requests", (req, res) => {
    try {
      requireStaff(req);
      const store = readStore();
      const requests = [...(store.requests || [])].sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      );
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
      const { user } = requireStaff(req);
      const id = String(req.params.id || "");
      const next = parseRequestState(req.body?.state);
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });
      if (!next) return res.status(400).json({ ok: false, error: "bad_state" });

      const store = readStore();
      const r = (store.requests || []).find((x) => String((x as any).id) === id) as StoredRequest | undefined;
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = next;
      r.state_updated_at = new Date().toISOString();
      r.state_updated_by = user.id;
      writeStore(store);

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
  router.post("/staff/contacts/upsert", (req, res) => {
    try {
      const { user } = requireStaff(req);
      const store = readStore();

      const tg_id = req.body?.tg_id ? Number(req.body.tg_id) : undefined;
      const username = normUsername(req.body?.username);
      const fullName = String(req.body?.fullName || req.body?.full_name || "").trim();
      const banks = Array.isArray(req.body?.banks) ? (req.body.banks as any[]).map(String) : [];

      if (!tg_id && !username) return res.status(400).json({ ok: false, error: "tg_id_or_username_required" });

      const now = new Date().toISOString();
      const id = tg_id ? `tg_${tg_id}` : `u_${username}`;

      let c = (store.contacts || []).find((x) => x && x.id === id);
      if (!c) {
        c = { id, created_at: now, updated_at: now } as Contact;
        (store.contacts || []).push(c);
      }
      c.updated_at = now;
      if (tg_id) c.tg_id = tg_id;
      if (username) c.username = username;
      if (fullName || fullName === "") c.fullName = fullName;
      if (banks) c.banks = banks;

      // note: staff doesn't change status here
      writeStore(store);
      return res.json({ ok: true, contact: c, by: user.id });
    } catch (e: any) {
      return res.status(e?.message === "not_admin" ? 403 : 401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // список заявок (для владельца)
  router.get("/admin/requests", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
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
      const { isOwner, user } = requireAdmin(req);
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

      const store = readStore();
      const r = (store.requests || []).find((x) => String((x as any).id) === id) as StoredRequest | undefined;
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = next;
      r.state_updated_at = new Date().toISOString();
      r.state_updated_by = user.id;
      writeStore(store);

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
      const { user, status } = requireAuth(req);

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

      const store = readStore();
      const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
      const groupChatId = store.config?.groupChatId || envGroup;
      if (!groupChatId) return res.status(400).json({ ok: false, error: "group_not_set" });

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

      const who =
        (user.username
          ? `@${user.username}`
          : `${user.first_name || ""} ${user.last_name || ""}`.trim() || `id ${user.id}`) +
        ` • статус: ${statusLabel[normalizeStatus(status)]}`;

      const text =
        `💱 Заявка\n` +
        `👤 ${who}\n` +
        `🔁 ${sellCurrency} → ${buyCurrency}\n` +
        `💸 Отдаёт: ${sellAmount}\n` +
        `🎯 Получит: ${buyAmount}\n` +
        `📦 Способ: ${methodMap[receiveMethod]}\n` +
        `🕒 ${dtDaNang}`;

      const tgRes = await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: groupChatId,
          text,
          disable_web_page_preview: true
        })
      });

      const tgJson: any = await tgRes.json();
      if (!tgJson?.ok) {
        return res.status(500).json({ ok: false, error: tgJson?.description || "tg_send_failed" });
      }

      store.requests = store.requests || [];
      const request: StoredRequest = {
        id: randomUUID(),
        state: "new",
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
      writeStore(store);

      // Доп. подтверждение пользователю в личку (тоже пуш): можно выключить, если не нужно.
      // Важно: бот сможет написать только тем, кто уже нажал /start.
      try {
        const shortId = request.id.slice(-6);
        await fetch(`https://api.telegram.org/bot${opts.botToken}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: user.id,
            text: `✅ Заявка принята\n🆔 #${shortId}\nМы скоро напишем, когда изменится статус.`
          })
        });
      } catch {}

      res.json({ ok: true, id: request.id, state: request.state });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
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
  router.get("/reviews", (_req, res) => {
    const store = readStore();
    const list = (store.reviews || [])
      .filter((r) => r && r.state === "approved")
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(toPublicReview);
    res.json({ ok: true, reviews: list });
  });

  // Список сделок, по которым пользователь МОЖЕТ оставить отзыв
  router.get("/reviews/eligible", (req, res) => {
    try {
      const { user } = requireAuth(req);
      const store = readStore();

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
  router.post("/reviews", (req, res) => {
    try {
      const { user } = requireAuth(req);
      const text = String(req.body?.text || "").trim();
      const anonymous = Boolean(req.body?.anonymous);
      const requestId = String(req.body?.requestId || req.body?.request_id || "").trim();

      if (!requestId) return res.status(400).json({ ok: false, error: "request_id_missing" });
      if (text.length < 3) return res.status(400).json({ ok: false, error: "text_too_short" });

      const store = readStore();
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
      writeStore(store);

      return res.json({ ok: true, id: review.id, state: review.state });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ---- Admin moderation ----
  router.get("/admin/reviews", (req, res) => {
    try {
      const { isOwner } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
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

  router.post("/admin/reviews/:id/approve", (req, res) => {
    try {
      const { isOwner, user } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const store = readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = "approved";
      r.approved_at = new Date().toISOString();
      r.approved_by = user.id;
      writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/reviews/:id/reject", (req, res) => {
    try {
      const { isOwner, user } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const store = readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.state = "rejected";
      r.rejected_at = new Date().toISOString();
      r.rejected_by = user.id;
      writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/reviews/:id/reply", (req, res) => {
    try {
      const { isOwner, user } = requireAdmin(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const id = String(req.params.id || "").trim();
      if (!id) return res.status(400).json({ ok: false, error: "bad_id" });

      const text = String(req.body?.text || "").trim();
      if (text.length < 1) return res.status(400).json({ ok: false, error: "text_required" });

      const store = readStore();
      const r = (store.reviews || []).find((x) => String(x.id) === id);
      if (!r) return res.status(404).json({ ok: false, error: "not_found" });

      r.company_reply = { text, created_at: new Date().toISOString(), by: user.id };
      writeStore(store);
      return res.json({ ok: true, review: r });
    } catch (e: any) {
      return res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  return router;
}
