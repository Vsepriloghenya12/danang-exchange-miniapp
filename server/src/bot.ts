import { Telegraf, Markup } from "telegraf";
import { randomUUID } from "node:crypto";
import { USER_STATUS_LABELS_RU, type UserStatus } from "./domain/status.js";
import {
  readStore,
  mutateStore,
  upsertUserFromTelegram,
  type StoredRequest,
  normalizeStatus,
  parseStatusInput
} from "./store.js";

type ReceiveMethod = "cash" | "transfer" | "atm";

const WEBAPP_OPEN_VERSION =
  String(
    process.env.WEBAPP_VERSION ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      process.env.RAILWAY_DEPLOYMENT_ID ||
      Date.now()
  )
    .trim()
    .slice(0, 24);

// Thousands separator must be a comma (1,000 / 10,000) — same as in the calculator UI
function fmtGroupedInt(n: number): string {
  const s = String(Math.trunc(Math.abs(n)));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtReqAmount(cur: string, n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (String(cur) === "USDT") {
    const v = Math.round(n * 10) / 10;
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    const intPart = Math.trunc(abs);
    const dec = Math.round((abs - intPart) * 10);
    const grouped = fmtGroupedInt(intPart);
    return dec ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
  }
  return fmtGroupedInt(Math.round(n));
}

function ignoreStatusForPair(a: string, b: string) {
  return (a === "THB" && b === "RUB") || (a === "RUB" && b === "THB");
}

function buildWebAppOpenUrl(rawUrl: string): string {
  const source = String(rawUrl || "").trim();
  if (!source) return "";

  const normalized = /^https?:\/\//i.test(source) ? source : `https://${source}`;

  try {
    const url = new URL(normalized);
    url.searchParams.set("appv", WEBAPP_OPEN_VERSION);
    return url.toString();
  } catch {
    return normalized;
  }
}

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


  const normalizeCmdText = (s: any) => String(s || "").trim();
  const isCmd = (text: string, name: string, me?: string) => {
    if (!text) return false;
    const cmd = text.split(/\s+/)[0]?.trim() || "";
    if (!cmd.startsWith("/")) return false;
    if (cmd === `/${name}`) return true;
    return !!me && cmd.toLowerCase() === `/${name}@${String(me).toLowerCase()}`;
  };
  const replyToChat = async (chatId: number, text: string) => {
    await bot.telegram.sendMessage(chatId, text);
  };
  const saveGroupChatId = async (chatId: number) => {
    await mutateStore((store) => {
      store.config.groupChatId = chatId;
    });
  };
  const saveRequestsGroupChatId = async (chatId: number) => {
    await mutateStore((store) => {
      (store.config as any).requestsGroupChatId = chatId;
    });
  };

  bot.start(async (ctx) => {
    if (ctx.from) await upsertUserFromTelegram(ctx.from);

    const webappUrl = buildWebAppOpenUrl(opts.webappUrl || "");

    if (!webappUrl) {
      return ctx.reply("WEBAPP_URL не задан. Укажи публичный HTTPS URL и снова /start.");
    }

    const kb = Markup.inlineKeyboard([Markup.button.webApp("Открыть мини-приложение", webappUrl)]);
    await ctx.reply("Открывай мини-приложение 👇", kb);
  });

  bot.command("whoami", async (ctx) => {
    if (ctx.from) {
      const u = await upsertUserFromTelegram(ctx.from);
      await ctx.reply(
        `Твой tg_id: ${u.tg_id}\n` +
          `username: ${u.username ? "@" + u.username : "(нет)"}\n` +
          `статус: ${USER_STATUS_LABELS_RU[u.status]}`
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

    await saveGroupChatId(ctx.chat.id);
    await ctx.reply(`Группа сохранена ✅ groupChatId=${ctx.chat.id}`);
  });

  // Save a separate group where client requests should be posted
  bot.command("setrequestsgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /setrequestsgroup");
    if (!ctx.chat || ctx.chat.type === "private") return ctx.reply("Используй /setrequestsgroup в группе.");

    await saveRequestsGroupChatId(ctx.chat.id);
    await ctx.reply(`Группа для заявок сохранена ✅ requestsGroupChatId=${ctx.chat.id}`);
  });

  bot.command("showgroup", async (ctx) => {
    if (!isOwner(ctx.from?.id)) return ctx.reply("Только владелец может делать /showgroup");
    const store = await readStore();
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
    const store = await readStore();
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
    const store = await readStore();
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

    const now = new Date().toISOString();

    await mutateStore((store) => {
      const key = String(tgId);
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

      for (const c of store.contacts || []) {
        if (Number(c?.tg_id) === tgId) {
          c.status = next;
          c.updated_at = now;
        }
      }
    });
    return ctx.reply(`Готово ✅ tg_id=${tgId} → статус ${USER_STATUS_LABELS_RU[next]}`);
  });



  bot.on("channel_post", async (ctx) => {
    const post = ctx.channelPost;
    if (!post) return;

    const chatId = post.chat.id;
    const rawText = "text" in post ? post.text : "caption" in post ? post.caption : "";
    const text = normalizeCmdText(rawText);
    if (!chatId || !text) return;

    if (isCmd(text, "chatid", ctx.me)) {
      await replyToChat(chatId, `chat_id: ${chatId}`);
      return;
    }

    if (isCmd(text, "setgroup", ctx.me)) {
      await saveGroupChatId(chatId);
      await replyToChat(chatId, `Канал сохранён ✅ groupChatId=${chatId}`);
      return;
    }

    if (isCmd(text, "setrequestsgroup", ctx.me)) {
      await saveRequestsGroupChatId(chatId);
      await replyToChat(chatId, `Канал для заявок сохранён ✅ requestsGroupChatId=${chatId}`);
    }
  });

  // WebApp payloads + replies from clients in private bot dialog
  bot.on("message", async (ctx) => {
    const msg: any = ctx.message;
    const wad = msg?.web_app_data?.data;
    if (wad) {
      console.log("✅ web_app_data received len=", String(wad).length);

      if (ctx.from) await upsertUserFromTelegram(ctx.from);

      let payload: any;
      try {
        payload = JSON.parse(wad);
      } catch {
        await ctx.reply("Не смог прочитать payload (не JSON).");
        return;
      }

      const preStore = await readStore();

      const userKey = String(ctx.from?.id ?? "");
      const status: UserStatus = preStore.users[userKey]?.status ?? "standard";

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

      const sellCur = String(payload.sellCurrency || "");
      const buyCur = String(payload.buyCurrency || "");
      const effStatus: UserStatus = ignoreStatusForPair(sellCur, buyCur) ? "standard" : normalizeStatus(status);

      const who =
        (ctx.from?.username
          ? `@${ctx.from.username}`
          : `${ctx.from?.first_name || ""} ${ctx.from?.last_name || ""}`.trim() || `id ${ctx.from?.id}`) +
        ` • статус: ${USER_STATUS_LABELS_RU[effStatus]}`;

      // Create a request in the store (so it appears in the miniapp admin tab instantly)
      const id = randomUUID();
      const reqObj: StoredRequest = {
        id,
        state: "in_progress",
        sellCurrency: sellCur as any,
        buyCurrency: buyCur as any,
        sellAmount: Number(payload.sellAmount),
        buyAmount: Number(payload.buyAmount),
        payMethod: String(payload.payMethod || ""),
        receiveMethod: String(payload.receiveMethod || "") as any,
        from: ctx.from as any,
        status: effStatus,
        created_at: new Date().toISOString()
      };
      const { store } = await mutateStore((store) => {
        store.requests = store.requests || [];
        store.requests.push(reqObj);
      });

      const shortId = id.slice(-6);
      const text =
        `💱 Новая заявка (в работе)
` +
        `🆔 #${shortId}
` +
        `👤 ${who}
` +
        `🔁 ${sellCur} → ${buyCur}
` +
        `💸 Отдаёт: ${fmtReqAmount(sellCur, Number(payload.sellAmount))}
` +
        `🎯 Получит: ${fmtReqAmount(buyCur, Number(payload.buyAmount))}
` +
        `💳 Оплата: ${payMap[String(payload.payMethod)] || String(payload.payMethod || "—")}
` +
        `📦 Получение: ${methodMap[payload.receiveMethod as ReceiveMethod] || payload.receiveMethod}
` +
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
      return;
    }

    if (ctx.from) await upsertUserFromTelegram(ctx.from);
    if (ctx.chat?.type !== "private") return;
    return;
  });


  return bot;
}
