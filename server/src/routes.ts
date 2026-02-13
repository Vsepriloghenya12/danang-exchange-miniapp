import express from "express";
import { readStore, writeStore, upsertUserFromTelegram } from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";
import { formatRequestMessage } from "./format.js";


export function createApiRouter(opts: {
  botToken: string;
  ownerTgId?: number;      // старый вариант (1 владелец)
  ownerTgIds?: number[];   // новый вариант (несколько владельцев)
}) {
  const router = express.Router();

  function isOwnerId(userId: number) {
    const list = Array.isArray(opts.ownerTgIds) ? opts.ownerTgIds : [];
    if (list.length > 0) return list.includes(userId);
    if (opts.ownerTgId) return userId === opts.ownerTgId;
    return false; // безопасно: если владелец(ы) не задан(ы) — админка закрыта
  }

  // auth helper (каждый запрос можно проверять по initData)
  function requireAuth(req: express.Request) {
    // 1) Authorization: tma <initData>
    const auth = (req.headers.authorization as string | undefined) || "";
    const initFromAuth = auth.startsWith("tma ") ? auth.slice(4) : undefined;

    // 2) X header
    const initFromHeader = req.headers["x-telegram-init-data"] as string | undefined;

    // 3) body
    const initFromBody =
      (req.body?.initData as string | undefined) ||
      (req.body?.init_data as string | undefined);

    const initData = initFromAuth || initFromHeader || initFromBody;

    if (!initData) throw new Error("No initData");

    const v = validateTelegramInitData(initData, opts.botToken);
    const { status } = upsertUserFromTelegram(v.user);
    const isOwner = isOwnerId(v.user.id);

    return { user: v.user, status, isOwner, initData };
  }

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.post("/auth", (req, res) => {
    try {
      const { user, status, isOwner } = requireAuth(req);
      res.json({ ok: true, user, status, isOwner });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/rates/today", (_req, res) => {
    const store = readStore();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
    const data = store.ratesByDate[today] || null;
    res.json({ ok: true, date: today, data });
  });

  router.post("/admin/rates/today", (req, res) => {
    try {
      const { isOwner, user } = requireAuth(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const body = req.body ?? {};
      const rates = body.rates;
      if (!rates?.USD || !rates?.RUB || !rates?.USDT) {
        return res.status(400).json({ ok: false, error: "rates_missing" });
      }

      const store = readStore();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
      store.ratesByDate[today] = {
        updated_at: new Date().toISOString(),
        updated_by: user.id,
        rates: {
          USD: { buy_vnd: Number(rates.USD.buy_vnd), sell_vnd: Number(rates.USD.sell_vnd) },
          RUB: { buy_vnd: Number(rates.RUB.buy_vnd), sell_vnd: Number(rates.RUB.sell_vnd) },
          USDT: { buy_vnd: Number(rates.USDT.buy_vnd), sell_vnd: Number(rates.USDT.sell_vnd) }
        }
      };
      writeStore(store);
      res.json({ ok: true, date: today, data: store.ratesByDate[today] });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/admin/users", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });
      const store = readStore();
      res.json({ ok: true, users: Object.values(store.users) });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.post("/admin/users/:tgId/status", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const tgId = Number(req.params.tgId);
      const status = String(req.body?.status || "none");
      const allowed = new Set(["none", "bronze", "silver", "gold"]);
      if (!allowed.has(status)) return res.status(400).json({ ok: false, error: "bad_status" });

      const store = readStore();
      const key = String(tgId);
      if (!store.users[key]) return res.status(404).json({ ok: false, error: "user_not_found" });

      store.users[key].status = status as any;
      writeStore(store);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  router.get("/reviews", (_req, res) => {
    const store = readStore();
    const reviews = store.reviews.filter((r) => r.is_public).slice(-50).reverse();
    res.json({ ok: true, reviews });
  });

  router.post("/reviews", (req, res) => {
    try {
      const { user } = requireAuth(req);

      const rating = Number(req.body?.rating);
      const text = String(req.body?.text || "").trim();

      if (!(rating >= 1 && rating <= 5)) {
        return res.status(400).json({ ok: false, error: "bad_rating" });
      }
      if (text.length < 3) {
        return res.status(400).json({ ok: false, error: "text_too_short" });
      }

      const store = readStore();
      store.reviews.push({
        id: cryptoRandomId(),
        tg_id: user.id,
        username: user.username,
        rating,
        text,
        created_at: new Date().toISOString(),
        is_public: true
      });
      writeStore(store);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });
  

  return router;
}

function cryptoRandomId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
