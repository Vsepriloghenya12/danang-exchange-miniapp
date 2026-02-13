import { Telegraf, Markup } from "telegraf";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  type UserStatus
} from "./store.js";
import { formatRequestMessage } from "./format.js";

export function createBot(opts: {
  token: string;
  webappUrl?: string;
  ownerTgId?: number;
}) {
  const bot = new Telegraf(opts.token);

  // /start — кнопка открытия Mini App
  bot.start(async (ctx) => {
    if (ctx.from) upsertUserFromTelegram(ctx.from);

    let webappUrl = opts.webappUrl || "";

    // Авто-добавление https:// если забыли
    if (webappUrl && !/^https?:\/\//i.test(webappUrl)) {
      webappUrl = "https://" + webappUrl;
    }

    if (!webappUrl) {
      return ctx.reply(
        "WEBAPP_URL не задан. Укажи публичный HTTPS URL в Railway Variables и снова /start."
      );
    }

    try {
      const kb = Markup.inlineKeyboard([
        Markup.button.webApp("Открыть мини-приложение", webappUrl)
      ]);
      await ctx.reply("Открывай мини-приложение 👇", kb);
    } catch (e) {
      console.error("START REPLY ERROR:", e);
      await ctx.reply(`Открой мини-приложение по ссылке: ${webappUrl}`);
    }
  });

  // Узнать tg_id
  bot.command("whoami", async (ctx) => {
    if (ctx.from) upsertUserFromTelegram(ctx.from);

    const u = ctx.from;
    await ctx.reply(
      `Ваш tg_id: ${u?.id}\nusername: ${u?.username ? "@" + u.username : "(нет)"}`
    );
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`chat_id: ${ctx.chat?.id}`);
  });

  // Сохранить chat_id группы, куда слать заявки
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

  // Назначить статус клиенту (только владелец)
  // Использование: /setstatus 123456789 gold
  bot.command("setstatus", async (ctx) => {
    const owner = opts.ownerTgId;
    if (owner && ctx.from?.id !== owner) {
      return ctx.reply("Только владелец может делать /setstatus");
    }

    const text = (ctx.message as any)?.text ?? "";
    const parts = text.split(" ").filter(Boolean);
    const tgId = parts[1];
    const statusRaw = (parts[2] || "").toLowerCase();

    if (!tgId || !statusRaw) {
      return ctx.reply("Использование: /setstatus <tg_id> <none|bronze|silver|gold>");
    }

    const allowed: UserStatus[] = ["none", "bronze", "silver", "gold"];
    if (!allowed.includes(statusRaw as UserStatus)) {
      return ctx.reply("Статус только: none | bronze | silver | gold");
    }

    const store = readStore();
    const key = String(tgId);
    const now = new Date().toISOString();

    if (!store.users[key]) {
      // создаём пользователя-заглушку, если ещё не было в базе
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
    return ctx.reply(`Готово ✅ tg_id=${tgId} → статус ${statusRaw}`);
  });

  // Оставим /setwebapp как "подсказку" (на Railway лучше через Variables)
  bot.command("setwebapp", async (ctx) => {
    const owner = opts.ownerTgId;
    if (owner && ctx.from?.id !== owner) return ctx.reply("Только владелец может делать /setwebapp");

    const parts = (ctx.message as any)?.text?.split(" ") ?? [];
    const url = parts[1];
    if (!url) return ctx.reply("Использование: /setwebapp https://xxxx.tld");

    await ctx.reply("Ок ✅ На Railway лучше задавать WEBAPP_URL в Variables. Потом /start.");
  });

  // Ловим заявки из Mini App (Telegram.WebApp.sendData)
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (!wad) return;

    if (ctx.from) upsertUserFromTelegram(ctx.from);

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
    const status: UserStatus = store.users[userKey]?.status ?? "none";
    const createdAtISO = new Date().toISOString();

    // сохраняем заявку
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

    await ctx.telegram.sendMessage(groupChatId, text, { parse_mode: "HTML" } as any);
    await ctx.reply("Заявка отправлена ✅");
  });

  return bot;
}
