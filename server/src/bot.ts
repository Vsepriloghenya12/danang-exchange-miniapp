import { Telegraf, Markup } from "telegraf";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  type UserStatus
} from "./store.js";
import { formatRequestMessage } from "./format.js";

type ReceiveMethod = "cash" | "transfer" | "atm";

function plainRequestText(p: any, ctx: any, status: string) {
  const u = ctx.from;
  const who =
    (u?.username ? `@${u.username}` : `${u?.first_name || ""} ${u?.last_name || ""}`.trim() || `id ${u?.id}`) +
    ` • статус: ${status}`;

  const m: Record<string, string> = { cash: "наличные", transfer: "перевод", atm: "банкомат" };

  return (
    `💱 Заявка\n` +
    `👤 ${who}\n` +
    `🔁 ${p.sellCurrency} → ${p.buyCurrency}\n` +
    `💸 Отдаёт: ${p.sellAmount}\n` +
    `🎯 Получит: ${p.buyAmount}\n` +
    `📦 Способ: ${m[p.receiveMethod as ReceiveMethod] || p.receiveMethod || "-"}\n` +
    `🕒 ${new Date().toISOString()}`
  );
}

export function createBot(opts: {
  token: string;
  webappUrl?: string;
  ownerTgId?: number;
  ownerTgIds?: number[];
}) {
  const bot = new Telegraf(opts.token);

  // ✅ правильная логика owners
  const ownerIds: number[] =
    opts.ownerTgIds && opts.ownerTgIds.length
      ? opts.ownerTgIds
      : (opts.ownerTgId ? [opts.ownerTgId] : []);

  const isOwner = (id?: number) => {
    if (!ownerIds.length) return true;
    return !!id && ownerIds.includes(id);
  };

  bot.start(async (ctx) => {
    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let webappUrl = opts.webappUrl || "";
    if (webappUrl && !/^https?:\/\//i.test(webappUrl)) webappUrl = "https://" + webappUrl;

    if (!webappUrl) {
      return ctx.reply("WEBAPP_URL не задан. Укажи публичный HTTPS URL в Railway Variables и снова /start.");
    }

    const kb = Markup.inlineKeyboard([Markup.button.webApp("Открыть мини-приложение", webappUrl)]);
    await ctx.reply("Открывай мини-приложение 👇", kb);
  });

  bot.command("whoami", async (ctx) => {
    if (ctx.from) upsertUserFromTelegram(ctx.from);
    const u = ctx.from;
    await ctx.reply(`Ваш tg_id: ${u?.id}\nusername: ${u?.username ? "@" + u.username : "(нет)"}`);
  });

  bot.command("setgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setgroup");
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setgroup в группе.");

    const store = readStore();
    store.config.groupChatId = ctx.chat.id;
    writeStore(store);

    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  bot.command("showgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /showgroup");
    const store = readStore();
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    await ctx.reply(
      `store.groupChatId: ${store.config.groupChatId ?? "(не задан)"}\n` +
      `env.GROUP_CHAT_ID: ${envGroup ?? "(не задан)"}\n` +
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

  bot.command("setstatus", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setstatus");

    const text = (ctx.message as any)?.text ?? "";
    const parts = text.split(" ").filter(Boolean);
    const tgId = parts[1];
    const statusRaw = (parts[2] || "").toLowerCase();

    if (!tgId || !statusRaw) return ctx.reply("Использование: /setstatus <tg_id> <none|bronze|silver|gold>");

    const allowed: UserStatus[] = ["none", "bronze", "silver", "gold"];
    if (!allowed.includes(statusRaw as UserStatus)) return ctx.reply("Статус только: none | bronze | silver | gold");

    const store = readStore();
    const key = String(tgId);
    const now = new Date().toISOString();

    if (!store.users[key]) {
      store.users[key] = {
        tg_id: Number(tgId),
        username: undefined,
        first_name: undefined,
        last_name: undefined,
        status: statusRaw as UserStatus,
        created_at: now,
        last_seen_at: now
      };
    } else {
      store.users[key].status = statusRaw as UserStatus;
      store.users[key].last_seen_at = now;
    }
    writeStore(store);
    await ctx.reply(`Готово ✅ tg_id=${tgId} → статус ${statusRaw}`);
  });

  // ✅ ловим заявки из Mini App (sendData)
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    console.log("✅ web_app_data received len=", String(wad).length);

    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let payload: any;
    try {
      payload = JSON.parse(wad);
    } catch (e) {
      console.error("❌ JSON parse error:", e, wad);
      await ctx.reply("Не смог прочитать payload (не JSON).");
      return;
    }

    const store = readStore();
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    const groupChatId = store.config.groupChatId || envGroup;

    if (!groupChatId) {
      await ctx.reply("Группа не задана. Добавь бота в группу и сделай там /setgroup (или задай GROUP_CHAT_ID).");
      return;
    }

    const userKey = String(ctx.from?.id ?? "");
    const status: UserStatus = store.users[userKey]?.status ?? "none";
    const createdAtISO = new Date().toISOString();

    store.requests.push({ ...payload, from: ctx.from, status, created_at: createdAtISO });
    writeStore(store);

    const htmlText = formatRequestMessage({
      user: {
        id: ctx.from!.id,
        username: ctx.from?.username,
        first_name: ctx.from?.first_name,
        last_name: ctx.from?.last_name
      },
      status,
      sellCurrency: payload.sellCurrency,
      buyCurrency: payload.buyCurrency,
      sellAmount: payload.sellAmount,
      buyAmount: payload.buyAmount,
      receiveMethod: payload.receiveMethod,
      note: payload.note,
      createdAtISO
    });

    // ✅ отправляем и показываем ошибку пользователю, если Telegram ругнётся
    try {
      await ctx.telegram.sendMessage(groupChatId, htmlText, { parse_mode: "HTML" } as any);
      await ctx.reply("Заявка отправлена ✅");
    } catch (e: any) {
      console.error("❌ sendMessage failed:", e);

      // fallback без HTML, чтобы точно дошло
      try {
        await ctx.telegram.sendMessage(groupChatId, plainRequestText(payload, ctx, status));
        await ctx.reply("Заявка отправлена ✅ (без HTML)");
      } catch (e2: any) {
        console.error("❌ fallback sendMessage failed:", e2);
        await ctx.reply(`Не смог отправить в группу. Ошибка: ${e2?.message || e2}`);
      }
    }
  });

  return bot;
}
