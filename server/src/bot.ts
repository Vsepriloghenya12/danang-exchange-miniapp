import { Telegraf, Markup } from "telegraf";
import { readStore, writeStore, upsertUserFromTelegram, type UserStatus } from "./store.js";
import { formatRequestMessage } from "./format.js";

export function createBot(opts: {
  token: string;
  webappUrl?: string;
  ownerTgId?: number;
  ownerTgIds?: number[];
}) {
  const bot = new Telegraf(opts.token);

  // ✅ корректно собираем владельцев
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
    await ctx.reply(`groupChatId: ${store.config.groupChatId ?? "(не задан)"}\nrequests: ${store.requests.length}`);
  });

  bot.command("pinggroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /pinggroup");
    const store = readStore();
    const groupChatId = store.config.groupChatId;
    if (!groupChatId) return ctx.reply("Группа не задана. Сделай /setgroup в группе.");

    try {
      await ctx.telegram.sendMessage(groupChatId, "✅ Тест: бот может писать в эту группу");
      await ctx.reply("Ок ✅ отправил тест в группу");
    } catch (e: any) {
      console.error("PINGGROUP ERROR:", e);
      await ctx.reply(`Не смог отправить в группу. Ошибка: ${e?.message || e}`);
    }
  });

  // ✅ ловим заявки из Telegram.WebApp.sendData (если ты оставишь этот способ)
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    console.log("✅ web_app_data received:", wad);

    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let payload: any;
    try {
      payload = JSON.parse(wad);
    } catch (e) {
      console.error("❌ JSON parse error:", e, wad);
      return ctx.reply("Не смог прочитать payload (не JSON).");
    }

    const store = readStore();
    const groupChatId = store.config.groupChatId;
    if (!groupChatId) return ctx.reply("Группа не задана. Добавь бота в группу и сделай там /setgroup");

    const userKey = String(ctx.from?.id ?? "");
    const status: UserStatus = store.users[userKey]?.status ?? "none";
    const createdAtISO = new Date().toISOString();

    store.requests.push({ ...payload, from: ctx.from, status, created_at: createdAtISO });
    writeStore(store);

    const text = formatRequestMessage({
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

    try {
      await ctx.telegram.sendMessage(groupChatId, text, { parse_mode: "HTML" } as any);
      await ctx.reply("Заявка отправлена ✅");
    } catch (e: any) {
      console.error("❌ sendMessage to group failed:", e);
      await ctx.reply(`Не смог отправить в группу. Ошибка: ${e?.message || e}`);
    }
  });

  return bot;
}
