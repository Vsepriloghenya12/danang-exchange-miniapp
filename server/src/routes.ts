import express from "express";
import { randomUUID } from "node:crypto";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  defaultBonuses,
  type UserStatus,
  type RequestState,
  type StoredRequest,
  type BonusesConfig,
  type BonusesTier,
  normalizeStatus,
  parseStatusInput
} from "./store.js";
import { validateTelegramInitData } from "./telegramValidate.js";
import { getMarketSnapshot } from "./marketRates.js";

type ReceiveMethod = "cash" | "transfer" | "atm";
type Currency = "RUB" | "USD" | "USDT" | "VND" | "EUR" | "THB";

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

    return { user: v.user, status, isOwner };
  }

  // Admin access for a standalone PC dashboard.
  // If ADMIN_WEB_KEY is set, requests with header `x-admin-key: <key>` are treated as owner.
  function requireAdmin(req: express.Request) {
    const envKey = String(process.env.ADMIN_WEB_KEY || "").trim();
    const key = String(req.headers["x-admin-key"] || "").trim();
    if (envKey && key && key === envKey) {
      return {
        user: { id: 0, username: "admin", first_name: "Admin" },
        status: "standard" as UserStatus,
        isOwner: true
      };
    }
    return requireAuth(req);
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

  return router;
}
