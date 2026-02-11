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
        "WEBAPP_URL не задан. Сначала укажи HTTPS URL и вызови /setwebapp <url>.\n" +
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
    if (owner && ctx.from?.id !== owner) return ctx.reply("Только владелец может делать /setgroup");
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setgroup в группе.");

    const store = readStore();
    store.config.groupChatId = ctx.chat.id;
    writeStore(store);
    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  bot.command("setwebapp", async (ctx) => {
    const owner = opts.ownerTgId;
    if (owner && ctx.from?.id !== owner) return ctx.reply("Только владелец может делать /setwebapp");
    const parts = (ctx.message as any)?.text?.split(" ") ?? [];
    const url = parts[1];
    if (!url) return ctx.reply("Использование: /setwebapp https://xxxx.tld");

    // Попробуем поставить кнопку меню (не критично, но удобно)
    try {
      await ctx.telegram.setChatMenuButton({
  menuButton: { type: "web_app", text: "Обмен Дананг", web_app: { url } } as any
} as any);
    } catch {}

    await ctx.reply("Готово ✅ Теперь /start и открывай мини-апп.");
  });

  // Ловим заявки из Mini App (sendData)
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    let payload: any = null;
    try {
      payload = JSON.parse(wad);
    } catch {
      return ctx.reply("Не смог прочитать payload (не JSON).");
    }

    // Берём groupChatId либо из store, либо из env (если поставишь позже)
    const store = readStore();
    const groupChatId = store.config.groupChatId;

    if (!groupChatId) {
      await ctx.reply("Группа не задана. Добавь бота в группу и сделай там /setgroup");
      return;
    }

    // Достаём статус
    const userKey = String(ctx.from?.id ?? "");
    const status = store.users[userKey]?.status ?? "none";

    const createdAtISO = new Date().toISOString();

    // Сохраняем заявку в store
    store.requests.push({
      ...payload,
      from: ctx.from,
      status,
      created_at: createdAtISO
    });
    writeStore(store);

    // Форматируем и шлём в группу
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

    await ctx.telegram.sendMessage(groupChatId, text, { parse_mode: "HTML" });
    await ctx.reply("Заявка отправлена ✅");
  });

  return bot;
}
