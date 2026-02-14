import express from "express";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  type UserStatus,
  normalizeStatus,
  parseStatusInput
} from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";

type ReceiveMethod = "cash" | "transfer" | "atm";
type Currency = "RUB" | "USD" | "USDT" | "VND";

const statusLabel: Record<UserStatus, string> = {
  standard: "стандарт",
  silver: "серебро",
  gold: "золото"
};

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
    // Authorization: tma <initData>
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

    return { user: v.user, status, isOwner };
  }

  router.get("/health", (_req, res) => res.json({ ok: true }));

  router.post("/auth", (req, res) => {
    try {
      const { user, status, isOwner } = requireAuth(req);
      res.json({ ok: true, user, status, statusLabel: statusLabel[status], isOwner });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ✅ чтобы фронт мог получить статус без 404
  router.get("/me", (req, res) => {
    try {
      const { user, status, isOwner } = requireAuth(req);
      res.json({
        ok: true,
        data: {
          user,
          status,
          statusLabel: statusLabel[normalizeStatus(status)],
          isOwner
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

  router.get("/admin/rates/today", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
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
      const { isOwner, user } = requireAuth(req);
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
      const data = {
        USD: { buy_vnd: num(USD.buy_vnd), sell_vnd: num(USD.sell_vnd) },
        RUB: { buy_vnd: num(RUB.buy_vnd), sell_vnd: num(RUB.sell_vnd) },
        USDT: { buy_vnd: num(USDT.buy_vnd), sell_vnd: num(USDT.sell_vnd) }
      };

      const all = [
        data.USD.buy_vnd,
        data.USD.sell_vnd,
        data.RUB.buy_vnd,
        data.RUB.sell_vnd,
        data.USDT.buy_vnd,
        data.USDT.sell_vnd
      ];
      if (!all.every((n) => Number.isFinite(n) && n > 0)) {
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
  // Admin users
  // --------------------
  router.get("/admin/users", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const store = readStore();
      res.json({ ok: true, users: Object.values(store.users || {}) });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ✅ статус: понимаем standard/silver/gold + русские синонимы
  router.post("/admin/users/:tgId/status", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
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
  router.post("/requests", async (req, res) => {
    try {
      const { user, status } = requireAuth(req);

      const p = req.body || {};
      const sellCurrency = String(p.sellCurrency || "") as Currency;
      const buyCurrency = String(p.buyCurrency || "") as Currency;
      const sellAmount = Number(p.sellAmount);
      const buyAmount = Number(p.buyAmount);
      const receiveMethod = String(p.receiveMethod || "").toLowerCase() as ReceiveMethod;

      const allowedCur = new Set<Currency>(["RUB", "USD", "USDT", "VND"]);
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
      store.requests.push({
        sellCurrency,
        buyCurrency,
        sellAmount,
        buyAmount,
        receiveMethod,
        from: user,
        status: normalizeStatus(status),
        created_at: new Date().toISOString()
      });
      writeStore(store);

      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  return router;
}
