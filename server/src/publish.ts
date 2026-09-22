// Telegram accepts numeric chat IDs and public channel usernames.
export function parsePublishChatId(value: unknown): string | number | null {
  const raw = String(value ?? "").trim();
  const username = raw.replace(/^https?:\/\/(?:www\.)?t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/, "@$1");
  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) return username;
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n !== 0 ? n : null;
}

export function publishChatId(config: { publishChatId?: string | number; groupChatId?: number }): string | number | null {
  // An explicit destination must not silently fall back to a different channel.
  const explicit = String(config.publishChatId ?? "").trim();
  if (explicit) return parsePublishChatId(explicit);
  return parsePublishChatId(config.groupChatId) ?? parsePublishChatId(process.env.GROUP_CHAT_ID);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function publishTextHtml(text: string): string {
  // Escape each original fragment once, including query parameters in links.
  const links = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let result = "";
  let offset = 0;
  for (const match of text.matchAll(links)) {
    result += escapeHtml(text.slice(offset, match.index));
    result += `<a href="${escapeHtml(match[2])}">${escapeHtml(match[1])}</a>`;
    offset = match.index! + match[0].length;
  }
  return result + escapeHtml(text.slice(offset));
}

export function publishErrorMessage(error: string): string {
  if (/^(?:error:\s*)?(?:401:\s*)?unauthorized$/i.test(error.trim())) {
    return "Telegram отклонил токен бота. Проверь BOT_TOKEN в сервисе api: нужен действующий токен этого бота из BotFather. После обновления переменной перезапусти сервис api.";
  }
  if (error === "group_not_set") return "Укажи канал для публикации: @username или числовой ID.";
  if (error === "rates_missing") return "Сначала сохрани курсы RUB, USDT и USD на сегодня во вкладке «Курс».";
  if (/chat not found/i.test(error)) return "Канал не найден. Проверь @username или ID канала и добавь в него бота.";
  if (/not enough rights|CHAT_ADMIN_REQUIRED|not an administrator|forbidden|kicked/i.test(error)) {
    return "У бота нет доступа к публикации. Добавь его в администраторы канала с правом публикации сообщений.";
  }
  if (/message is too long/i.test(error)) return "Текст публикации слишком длинный. Сократи его до 4096 символов.";
  return error;
}
