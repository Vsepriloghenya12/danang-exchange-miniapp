import { Telegraf, Markup } from "telegraf";
import { randomUUID } from "node:crypto";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  type UserStatus,
  type StoredRequest,
  normalizeStatus,
  parseStatusInput
} from "./store.js";

type ReceiveMethod = "cash" | "transfer" | "atm";

const statusLabel: Record<UserStatus, string> = {
  standard: "стандарт",
  silver: "серебро",
  gold: "золото"
};

export function createBot(opts: {
  token: string;
  webappUrl?: string;
  ownerTgId?: number;
  ownerTgIds?: number[];
}) {
  const bot = new Telegraf(opts.token);

  const ownerIds: number[] =
    opts.ownerTgIds && opts.ownerTgIds.length
      ? opts.ownerTgIds
      : opts.ownerTgId
      ? [opts.ownerTgId]
      : [];

  const isOwner = (id?: number) => {
    if (!ownerIds.length) return true; // если не задали владельцев — не ограничиваем
    return !!id && ownerIds.includes(id);
  };

  bot.start(async (ctx) => {
    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let webappUrl = opts.webappUrl || "";
    if (webappUrl && !/^https?:\/\//i.test(webappUrl)) webappUrl = "https://" + webappUrl;

    if (!webappUrl) {
      return ctx.reply("WEBAPP_URL не задан. Укажи публичный HTTPS URL и снова /start.");
    }

    const kb = Markup.inlineKeyboard([Markup.button.webApp("Открыть мини-приложение", webappUrl)]);
    await ctx.reply("Открывай мини-приложение 👇", kb);
  });

  bot.command("whoami", async (ctx) => {
    if (ctx.from) {
      const u = upsertUserFromTelegram(ctx.from);
      await ctx.reply(
        `Твой tg_id: ${u.tg_id}\n` +
          `username: ${u.username ? "@" + u.username : "(нет)"}\n` +
          `статус: ${statusLabel[u.status]}`
      );
    } else {
      await ctx.reply("Не вижу пользователя.");
    }
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`chat_id: ${ctx.chat?.id}`);
  });

  bot.command("setgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setgroup");
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setgroup в группе.");

    const store = readStore();
    store.config.groupChatId = ctx.chat.id;
    writeStore(store);

    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  // Save a separate group where client requests should be posted
  bot.command("setrequestsgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setrequestsgroup");
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setrequestsgroup в группе.");

    const store = readStore();
    (store.config as any).requestsGroupChatId = ctx.chat.id;
    writeStore(store);

    await ctx.reply(`Группа для заявок сохранена ✅ requestsGroupChatId=${ctx.chat.id}`);
  });

  bot.command("showgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /showgroup");
    const store = readStore();
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    const envReqGroup = process.env.REQUESTS_GROUP_CHAT_ID ? Number(process.env.REQUESTS_GROUP_CHAT_ID) : undefined;
    await ctx.reply(
      `store.groupChatId: ${store.config.groupChatId ?? "(не задан)"}\n` +
        `store.requestsGroupChatId: ${(store.config as any).requestsGroupChatId ?? "(не задан)"}\n` +
        `env.GROUP_CHAT_ID: ${envGroup ?? "(не задан)"}\n` +
        `env.REQUESTS_GROUP_CHAT_ID: ${envReqGroup ?? "(не задан)"}\n` +
        `requests: ${store.requests.length}`
    );
  });

  bot.command("pinggroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /pinggroup");
    const store = readStore();
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    const groupChatId = store.config.groupChatId || envGroup;

    if (!groupChatId) return ctx.reply("Группа не задана. Сделай /setgroup в группе (или задай GROUP_CHAT_ID).");

    try {
      await ctx.telegram.sendMessage(groupChatId, "✅ Тест: бот может писать в эту группу");
      await ctx.reply("Ок ✅ отправил тест в группу");
    } catch (e: any) {
      console.error("PINGGROUP ERROR:", e);
      await ctx.reply(`Не смог отправить в группу. Ошибка: ${e?.message || e}`);
    }
  });

  bot.command("pingrequestsgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /pingrequestsgroup");
    const store = readStore();
    const envReqGroup = process.env.REQUESTS_GROUP_CHAT_ID ? Number(process.env.REQUESTS_GROUP_CHAT_ID) : undefined;
    const reqGroupChatId = (store.config as any).requestsGroupChatId || envReqGroup || store.config.groupChatId || (process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined);

    if (!reqGroupChatId) return ctx.reply("Группа для заявок не задана. Сделай /setrequestsgroup в нужной группе (или задай REQUESTS_GROUP_CHAT_ID).\nМожно временно использовать /setgroup.");

    try {
      await ctx.telegram.sendMessage(reqGroupChatId, "✅ Тест: бот может писать в группу заявок");
      await ctx.reply("Ок ✅ отправил тест в группу заявок");
    } catch (e: any) {
      console.error("PINGREQUESTSGROUP ERROR:", e);
      await ctx.reply(`Не смог отправить в группу. Ошибка: ${e?.message || e}`);
    }
  });

  // setstatus <tg_id> <standard|silver|gold>
  bot.command("setstatus", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setstatus");

    const text = (ctx.message as any)?.text ?? "";
    const parts = text.split(" ").filter(Boolean);
    const tgIdRaw = parts[1];
    const statusRaw = parts[2];

    if (!tgIdRaw || !statusRaw) {
      return ctx.reply("Использование: /setstatus <tg_id> <standard|silver|gold>");
    }

    const tgId = Number(tgIdRaw);
    if (!Number.isFinite(tgId) || tgId <= 0) {
      return ctx.reply("tg_id должен быть числом. Пример: /setstatus 123456789 gold");
    }

    const next = parseStatusInput(statusRaw);
    if (!next) {
      return ctx.reply("Статус только: standard | silver | gold (можно: стандарт/серебро/золото)");
    }

    const store = readStore();
    const key = String(tgId);
    const now = new Date().toISOString();

    if (!store.users[key]) {
      store.users[key] = {
        tg_id: tgId,
        username: undefined,
        first_name: undefined,
        last_name: undefined,
        status: next,
        created_at: now,
        last_seen_at: now
      };
    } else {
      store.users[key].status = next;
      store.users[key].last_seen_at = now;
    }

    writeStore(store);
    return ctx.reply(`Готово ✅ tg_id=${tgId} → статус ${statusLabel[next]}`);
  });

  // если вдруг кто-то всё ещё шлёт sendData() — не ломаем
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    console.log("✅ web_app_data received len=", String(wad).length);

    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let payload: any;
    try {
      payload = JSON.parse(wad);
    } catch {
      await ctx.reply("Не смог прочитать payload (не JSON).");
      return;
    }

    const store = readStore();

    const userKey = String(ctx.from?.id ?? "");
    const status: UserStatus = store.users[userKey]?.status ?? "standard";

    const methodMap: Record<string, string> = { cash: "наличные", transfer: "перевод", atm: "банкомат" };
    const payMap: Record<string, string> = { cash: "наличные", transfer: "перевод", other: "другое" };
    const dtDaNang = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .format(new Date())
      .replace(",", "");

    const who =
      (ctx.from?.username
        ? `@${ctx.from.username}`
        : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim() || `id ${ctx.from?.id}`) +
      ` • статус: ${statusLabel[normalizeStatus(status)]}`;

    // Create a request in the store (so it appears in the miniapp admin tab instantly)
    store.requests = store.requests || [];
    const id = randomUUID();
    const reqObj: StoredRequest = {
      id,
      state: "in_progress",
      sellCurrency: String(payload.sellCurrency || "") as any,
      buyCurrency: String(payload.buyCurrency || "") as any,
      sellAmount: Number(payload.sellAmount),
      buyAmount: Number(payload.buyAmount),
      payMethod: String(payload.payMethod || ""),
      receiveMethod: String(payload.receiveMethod || "") as any,
      from: ctx.from as any,
      status: normalizeStatus(status),
      created_at: new Date().toISOString()
    };
    store.requests.push(reqObj);
    writeStore(store);

    const shortId = id.slice(-6);
    const text =
      `💱 Новая заявка (в работе)\n` +
      `🆔 #${shortId}\n` +
      `👤 ${who}\n` +
      `🔁 ${payload.sellCurrency} → ${payload.buyCurrency}\n` +
      `💸 Отдаёт: ${payload.sellAmount}\n` +
      `🎯 Получит: ${payload.buyAmount}\n` +
      `💳 Оплата: ${payMap[String(payload.payMethod)] || String(payload.payMethod || "—")}\n` +
      `📦 Получение: ${methodMap[payload.receiveMethod as ReceiveMethod] || payload.receiveMethod}\n` +
      `🕒 ${dtDaNang}`;

    // Send request to a dedicated group (preferred) so managers can pick it up.
    // Priority: store.config.requestsGroupChatId -> env REQUESTS_GROUP_CHAT_ID -> store.config.groupChatId -> env GROUP_CHAT_ID
    const envReqGroup = process.env.REQUESTS_GROUP_CHAT_ID ? Number(process.env.REQUESTS_GROUP_CHAT_ID) : undefined;
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    const reqGroupChatId =
      (store.config as any).requestsGroupChatId || envReqGroup || store.config.groupChatId || envGroup;

    try {
      if (reqGroupChatId) {
        await ctx.telegram.sendMessage(reqGroupChatId, text, ({ disable_web_page_preview: true } as any));
      } else {
        // If no group is set, fall back to private notifications (best-effort)
        const recipients = ownerIds.length
          ? ownerIds
          : Array.isArray((store.config as any)?.adminTgIds)
          ? ((store.config as any).adminTgIds as number[])
          : [];
        let wa = opts.webappUrl || "";
        if (wa && !/^https?:\/\//i.test(wa)) wa = "https://" + wa;
        const kb = wa ? Markup.inlineKeyboard([Markup.button.webApp("Открыть админку", wa)]) : undefined;
        for (const rid of recipients) {
          await ctx.telegram.sendMessage(rid, text, kb ? kb : undefined);
        }
      }
    } catch (e: any) {
      console.error("REQUEST GROUP NOTIFY FAIL:", e);
    }

    // Acknowledge to the user
    try {
      await ctx.reply("✅ Ваша заявка принята в работу, в ближайшее время с вами свяжется менеджер 🙌");
    } catch {}
  });

  return bot;
}
