import { Telegraf, Markup } from "telegraf";
import {
  readStore,
  writeStore,
  upsertUserFromTelegram,
  type UserStatus,
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
    return !!id && ownerIds.includes(id);
  };

  const requireOwner = async (ctx: any, action: string) => {
    if (!ownerIds.length) {
      await ctx.reply("Владелец не настроен. Укажи OWNER_TG_ID или OWNER_TG_IDS в .env и перезапусти сервер/бота.");
      return false;
    }
    if (!isOwner(ctx.from?.id)) {
      await ctx.reply(`Только владелец может делать ${action}`);
      return false;
    }
    return true;
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
          `статус: ${statusLabel[normalizeStatus(u.status)]}`
      );
    } else {
      await ctx.reply("Не вижу пользователя.");
    }
  });

  bot.command("chatid", async (ctx) => {
    await ctx.reply(`chat_id: ${ctx.chat?.id}`);
  });

  bot.command("setgroup", async (ctx) => {
    if (!(await requireOwner(ctx, "/setgroup"))) return;
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setgroup в группе.");

    const store = readStore();
    store.config.groupChatId = ctx.chat.id;
    writeStore(store);

    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  bot.command("showgroup", async (ctx) => {
    if (!(await requireOwner(ctx, "/showgroup"))) return;
    const store = readStore();
    const envGroup = process.env.GROUP_CHAT_ID ? Number(process.env.GROUP_CHAT_ID) : undefined;
    await ctx.reply(
      `store.groupChatId: ${store.config.groupChatId ?? "(не задан)"}\n` +
        `env.GROUP_CHAT_ID: ${envGroup ?? "(не задан)"}\n` +
        `requests: ${store.requests.length}`
    );
  });

  bot.command("pinggroup", async (ctx) => {
    if (!(await requireOwner(ctx, "/pinggroup"))) return;
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

  // setstatus <tg_id> <standard|silver|gold>
  bot.command("setstatus", async (ctx) => {
    if (!(await requireOwner(ctx, "/setstatus"))) return;

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
    const u = store.users[key];
    if (!u) return ctx.reply("Пользователь не найден в store (он должен хотя бы раз открыть мини-приложение).");

    u.status = normalizeStatus(next);
    store.users[key] = u;
    writeStore(store);

    await ctx.reply(`Готово ✅ tg_id=${tgId} статус=${statusLabel[u.status]}`);
  });

  return bot;
}
