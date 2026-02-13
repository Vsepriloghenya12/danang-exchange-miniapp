import express from "express";
import { readStore, writeStore, upsertUserFromTelegram } from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";

type UserStatus = "none" | "bronze" | "silver" | "gold";

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
    return false; // если владелец(ы) не задан(ы) — админка закрыта
  }

  function requireAuth(req: express.Request) {
    // Authorization: tma <initData>
    const auth = (req.headers.authorization as string | undefined) || "";
    const initFromAuth = auth.startsWith("tma ") ? auth.slice(4) : undefined;

    // X header
    const initFromHeader = req.headers["x-telegram-init-data"] as string | undefined;

    // body
    const initFromBody =
      (req.body?.initData as string | undefined) ||
      (req.body?.init_data as string | undefined);

    const initData = initFromAuth || initFromHeader || initFromBody;
    if (!initData) throw new Error("No initData");

    const v = validateTelegramInitData(initData, opts.botToken);
    const up = upsertUserFromTelegram(v.user); // создаёт/обновляет пользователя в store
    const status = (up?.status ?? "none") as UserStatus;
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

  // ---- Rates ----
  router.get("/rates/today", (_req, res) => {
    const store = readStore();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }); // YYYY-MM-DD
    const data = store.ratesByDate?.[today] || null;
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

  // ---- Users (admin) ----
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
      const status = String(req.body?.status || "none").toLowerCase();

      const allowed = new Set<UserStatus>(["none", "bronze", "silver", "gold"]);
      if (!allowed.has(status as UserStatus)) {
        return res.status(400).json({ ok: false, error: "bad_status" });
      }

      const store = readStore();
      const key = String(tgId);
      if (!store.users?.[key]) return res.status(404).json({ ok: false, error: "user_not_found" });

      store.users[key].status = status as any;
      writeStore(store);

      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ---- Reviews ----
  router.get("/reviews", (_req, res) => {
    const store = readStore();
    const reviews = (store.reviews || []).filter((r: any) => r.is_public).slice(-50).reverse();
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
        created_at: new Date().toISOString(),
        is_public: true
      });

      writeStore(store);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(401).json({ ok: false, error: e?.message || "auth_failed" });
    }
  });

  // ---- Requests (главное) ----
  // Сюда шлёт калькулятор: сервер сам отправляет сообщение в группу
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

      const createdAt = new Date();

const dtDaNang = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false
}).format(createdAt).replace(",", "");

// если всё-таки хочешь хранить ISO для базы — оставь:
const createdAtISO = createdAt.toISOString();

      const who =
        (user.username ? `@${user.username}` : `${user.first_name || ""} ${user.last_name || ""}`.trim() || `id ${user.id}`) +
        ` • статус: ${status}`;

      const methodMap: Record<string, string> = { cash: "наличные", transfer: "перевод", atm: "банкомат" };

      const text =
        `💱 Заявка\n` +
        `👤 ${who}\n` +
        `🔁 ${sellCurrency} → ${buyCurrency}\n` +
        `💸 Отдаёт: ${sellAmount}\n` +
        `🎯 Получит: ${buyAmount}\n` +
        `📦 Способ: ${methodMap[receiveMethod] || receiveMethod}\n` +
        `🕒 ${dtDaNang}`

      // 1) сначала отправляем в группу (только если Telegram подтвердил ok — считаем что заявка доставлена)
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

      // 2) сохраняем заявку
      store.requests = store.requests || [];
      store.requests.push({
        sellCurrency,
        buyCurrency,
        sellAmount,
        buyAmount,
        receiveMethod,
        from: user,
        status,
        created_at: createdAtISO
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
