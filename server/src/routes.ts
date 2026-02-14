import express from "express";
import { readStore, writeStore, upsertUserFromTelegram, type UserStatus, normalizeStatus } from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";

type ReceiveMethod = "cash" | "transfer" | "atm";

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
    const auth = (req.headers.authorization as string | undefined) || "";
    const initFromAuth = auth.startsWith("tma ") ? auth.slice(4) : undefined;
    const initFromHeader = req.headers["x-telegram-init-data"] as string | undefined;
    const initFromBody =
      (req.body?.initData as string | undefined) ||
      (req.body?.init_data as string | undefined);

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

  // ---- Rates ----
  router.get("/rates/today", (_req, res) => {
    const store = readStore();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    const data = store.ratesByDate?.[today] || null;
    res.json({ ok: true, date: today, data });
  });

  // ---- Reviews ----
  router.get("/reviews", (_req, res) => {
    const store = readStore();
    const reviews = (store.reviews || []).slice(-50).reverse();
    res.json({ ok: true, reviews });
  });

  router.post("/reviews", (req, res) => {
    try {
      const { user } = requireAuth(req);
      const rating = Number(req.body?.rating);
      const text = String(req.body?.text || "").trim();

      if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ ok: false, error: "bad_rating" });
      if (text.length < 3) return res.status(400).json({ ok: false, error: "text_too_short" });

      const store = readStore();
      store.reviews = store.reviews || [];
      store.reviews.push({
        id: cryptoRandomId(),
        tg_id: user.id,
        username: user.username,
        rating,
        text,
        created_at: new Date().toISOString()
      });

      writeStore(store);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ---- Requests ----
  // WebApp шлёт сюда — сервер отправляет в группу и отвечает ok:true только если Telegram принял сообщение
  router.post("/requests", async (req, res) => {
    try {
      const { user, status } = requireAuth(req);

      const p = req.body || {};
      const sellCurrency = String(p.sellCurrency || "");
      const buyCurrency = String(p.buyCurrency || "");
      const sellAmount = Number(p.sellAmount);
      const buyAmount = Number(p.buyAmount);
      const receiveMethod = String(p.receiveMethod || "");

      const allowedCur = new Set(["RUB", "USD", "USDT", "VND"]);
      const allowedMethod = new Set(["cash", "transfer", "atm"]);

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

      const methodMap: Record<string, string> = { cash: "наличные", transfer: "перевод", atm: "банкомат" };

      const who =
        (user.username ? `@${user.username}` : `${user.first_name || ""} ${user.last_name || ""}`.trim() || `id ${user.id}`) +
        ` • статус: ${statusLabel[normalizeStatus(status)]}`;

      const text =
        `💱 Заявка\n` +
        `👤 ${who}\n` +
        `🔁 ${sellCurrency} → ${buyCurrency}\n` +
        `💸 Отдаёт: ${sellAmount}\n` +
        `🎯 Получит: ${buyAmount}\n` +
        `📦 Способ: ${methodMap[receiveMethod] || receiveMethod}\n` +
        `🕒 ${dtDaNang}`;

      // отправляем в группу
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

      // сохраняем заявку
      store.requests = store.requests || [];
      store.requests.push({
        sellCurrency,
        buyCurrency,
        sellAmount,
        buyAmount,
        receiveMethod: receiveMethod as ReceiveMethod,
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

  // ---- Admin users ----
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

  router.post("/admin/users/:tgId/status", (req, res) => {
    try {
      const { isOwner } = requireAuth(req);
      if (!isOwner) return res.status(403).json({ ok: false, error: "not_owner" });

      const tgId = Number(req.params.tgId);
      const next = normalizeStatus(req.body?.status);

      const allowed = new Set<UserStatus>(["standard", "silver", "gold"]);
      if (!allowed.has(next)) return res.status(400).json({ ok: false, error: "bad_status" });

      const store = readStore();
      const key = String(tgId);
      if (!store.users?.[key]) return res.status(404).json({ ok: false, error: "user_not_found" });

      store.users[key].status = next;
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
