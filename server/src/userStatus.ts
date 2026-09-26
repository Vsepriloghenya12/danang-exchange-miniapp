import { USER_STATUS_LABELS_RU, normalizeStatus, type UserStatus } from "./domain/status.js";
import { findContact, normUsername, type Store } from "./store.js";
import { readFile } from "node:fs/promises";

const STATUS_ANIMATIONS = {
  silver: {
    filename: "IMG_6060.MP4",
    caption: 'Ваш статус в приложении изменен на "СЕРЕБРО"\nС этого момента при расчёте курса обмена будет применён дополнительный повышающий коэффициент. Спасибо, что остаётесь с нами!',
  },
  gold: {
    filename: "IMG_6061.MP4",
    caption: 'Ваш статус в приложении изменен на "ЗОЛОТО"\nС этого момента при расчёте курса обмена дополнительный повышающий коэффициент будет ещё больше. Спасибо, что остаётесь с нами!',
  },
} as const;

export type StatusChange = { tgId?: number; previous: UserStatus; next: UserStatus };

// Called inside mutateStore so concurrent saves observe the committed status.
export function setUserStatus(store: Store, tgId: number, next: UserStatus, now: string): StatusChange | null {
  const key = String(tgId);
  const existing = store.users[key];
  const contact = findContact(store, { tg_id: tgId, username: existing?.username });
  const previous = normalizeStatus(existing?.status ?? contact?.status);
  const request = [...store.requests].reverse().find(r => Number(r.from?.id) === tgId);
  if (!existing) {
    store.users[key] = {
      tg_id: tgId,
      username: contact?.username || request?.from?.username,
      first_name: request?.from?.first_name,
      last_name: request?.from?.last_name,
      status: next,
      created_at: now,
      last_seen_at: now,
    };
  } else {
    existing.status = next;
    existing.last_seen_at = now;
  }
  const username = normUsername(store.users[key].username);
  for (const c of store.contacts) {
    if (Number(c.tg_id) === tgId || (username && normUsername(c.username) === username)) {
      c.status = next;
      c.updated_at = now;
      if (!c.tg_id) c.tg_id = tgId;
    }
  }
  return previous === next ? null : { tgId, previous, next };
}

export async function notifyStatusChange(botToken: string, change: StatusChange | null) {
  if (!change) return { state: "unchanged" as const };
  if (!change.tgId) return {
    state: "skipped" as const,
    message: "Статус сохранён. Уведомление не отправлено: Telegram ID клиента пока неизвестен. Клиенту нужно открыть бота и нажать «Старт».",
  };
  const animation = change.next === "standard" ? null : STATUS_ANIMATIONS[change.next];
  let body: FormData | string;
  if (animation) {
    let bytes: Buffer;
    try {
      // Resolves from both server/src and server/dist, independently of cwd.
      bytes = await readFile(new URL(`../assets/status/${animation.filename}`, import.meta.url));
    } catch {
      console.warn("Status notification animation unavailable", { status: change.next });
      return { state: "failed" as const, message: "Статус сохранён, но не удалось загрузить анимацию для уведомления. Проверь файлы анимаций на сервере." };
    }
    body = new FormData();
    body.append("chat_id", String(change.tgId));
    body.append("caption", animation.caption);
    body.append("show_caption_above_media", "true");
    body.append("animation", new Blob([new Uint8Array(bytes)], { type: "video/mp4" }), animation.filename);
  } else {
    body = JSON.stringify({
      chat_id: change.tgId,
      text: `Ваш статус в обменнике изменён: «${USER_STATUS_LABELS_RU[change.previous]}» → «${USER_STATUS_LABELS_RU[change.next]}».\nНовый статус уже действует в приложении.`,
    });
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${animation ? "sendAnimation" : "sendMessage"}`, {
      method: "POST",
      signal: AbortSignal.timeout(animation ? 20_000 : 10_000),
      ...(animation ? {} : { headers: { "content-type": "application/json" } }),
      body,
    });
    const data = await response.json() as { ok?: boolean; error_code?: number; description?: string };
    if (response.ok && data.ok) return { state: "sent" as const };
    const code = data.error_code || response.status;
    // Do not log fetch errors/URLs: they can contain the bot token.
    console.warn("Status notification rejected", { tgId: change.tgId, code });
    return {
      state: "failed" as const,
      message: code === 401
        ? "Статус сохранён, но Telegram отклонил токен бота. Проверь BOT_TOKEN сервиса, отправляющего уведомления."
        : code === 403 || (code === 400 && /chat not found/i.test(data.description || ""))
          ? "Статус сохранён, но сообщение не доставлено. Клиенту нужно открыть бота, нажать «Старт» и убедиться, что бот не заблокирован."
          : "Статус сохранён, но Telegram не принял уведомление.",
    };
  } catch {
    console.warn("Status notification response unavailable", { tgId: change.tgId });
    // Do not retry an ambiguous timeout: Telegram may already have sent it.
    return { state: "failed" as const, message: "Статус сохранён, но подтверждение доставки уведомления от Telegram не получено." };
  }
}
