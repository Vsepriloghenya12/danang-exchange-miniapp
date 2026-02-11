import { Telegraf, Markup } from "telegraf";
import { readStore, writeStore } from "./store.js";
import { formatRequestMessage } from "./format.js";

export function createBot(opts: {
  token: string;
  webappUrl?: string;
  ownerTgId?: number;
}) {
  const bot = new Telegraf(opts.token);

  bot.start(async (ctx) => {
    const webappUrl = opts.webappUrl;

    if (!webappUrl) {
      return ctx.reply(
        "WEBAPP_URL не задан. Сначала задай публичный HTTPS URL (Railway domain) в переменной WEBAPP_URL.\n" +
          "Потом снова /start."
      );
    }

    const kb = Markup.inlineKeyboard([
      Markup.button.webApp("Открыть мини-приложение", webappUrl)
    ]);

    await ctx.reply("Открывай мини-приложение 👇", kb);
  });

  bot.command("whoami", async (ctx) => {
    const u = ctx.from;
    await ctx.reply(
      `Ваш tg_id: ${u?.id}\nusername: ${u?.username ? "@" + u.username : "(нет)"}`
    );
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`chat_id: ${ctx.chat?.id}`);
  });

  bot.command("setgroup", async (ctx) => {
    const owner = opts.ownerTgId;
    if (owner && ctx.from?.id !== owner) {
      return ctx.reply("Только владелец может делать /setgroup");
    }
    if (!ctx.chat || ctx.chat.type === "private") {
      return ctx.reply("Используй /setgroup в группе.");
    }

    const store = readStore();
    store.config.groupChatId = ctx.chat.id;
    writeStore(store);

    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  // Команду /setwebapp оставляем, но НЕ пытаемся ставить chat menu button (из-за типовых/совместимости).
  bot.command("setwebapp", async (ctx) => {
    const owner = opts.ownerTgId;
    if (owner && ctx.from?.id !== owner) return ctx.reply("Только владелец может делать /setwebapp");
    const parts = (ctx.message as any)?.text?.split(" ") ?? [];
    const url = parts[1];
    if (!url) return ctx.reply("Использование: /setwebapp https://xxxx.tld");

    // На Railway лучше задавать WEBAPP_URL через Variables.
    // Здесь просто подтверждаем, чтобы не ломать сборку типами.
    await ctx.reply("Ок ✅ Лучше задай WEBAPP_URL в Railway Variables и нажми /start.");
  });

  // Ловим заявки из Mini App (sendData)
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    let payload: any;
    try {
      payload = JSON.parse(wad);
    } catch {
      await ctx.reply("Не смог прочитать payload (не JSON).");
      return;
    }

    const store = readStore();
    const groupChatId = store.config.groupChatId;

    if (!groupChatId) {
      await ctx.reply("Группа не задана. Добавь бота в группу и сделай там /setgroup");
      return;
    }

    const userKey = String(ctx.from?.id ?? "");
    const status = store.users[userKey]?.status ?? "none";
    const createdAtISO = new Date().toISOString();

    store.requests.push({
      ...payload,
      from: ctx.from,
      status,
      created_at: createdAtISO
    });
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

    // Telegraf типы иногда спорят — отправим как Telegram API extra, но без лишних конфликтов
    await ctx.telegram.sendMessage(groupChatId, text, { parse_mode: "HTML" } as any);
    await ctx.reply("Заявка отправлена ✅");
  });

  return bot;
}
