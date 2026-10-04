import type { InlineQueryResult, InlineQueryResultPhoto, InlineQueryResultArticle } from 'telegraf/types';
import type { Store } from './store.js';

export const TELEGRAM_ART = '/brand/telegram';
export const TEST_BOT_USERNAME = 'testcashalot_bot';
export const isTestBot = (username: string) => username.toLowerCase() === TEST_BOT_USERNAME;

export function publicAppOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.origin : '';
  } catch { return ''; }
}

export function invitationResult(username: string, tgId: number, origin: string): InlineQueryResultPhoto {
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username) || !Number.isSafeInteger(tgId) || tgId <= 0 || !publicAppOrigin(origin)) throw new Error('telegram_share_unavailable');
  const link = `https://t.me/${username}?start=ref_${tgId}`;
  return {
    type: 'photo', id: `invite-${tgId}`, title: 'Пригласить друга',
    description: 'Личная ссылка и бонус к первому обмену',
    photo_url: `${origin}${TELEGRAM_ART}/invite.jpg`, thumbnail_url: `${origin}${TELEGRAM_ART}/thumb.jpg`,
    photo_width: 640, photo_height: 400,
    caption: 'Присоединяйся к Cash A Lot и забери свой бонус!',
    reply_markup: { inline_keyboard: [[{ text: 'Получить бонус · Открыть Cash a Lot', url: link }]] },
  };
}

const currencies = ['RUB', 'USDT', 'USD', 'EUR', 'THB', 'KZT'] as const;
const aliases: Record<string, string> = { 'руб': 'RUB', 'рубль': 'RUB', 'рубли': 'RUB', 'доллар': 'USD', 'доллары': 'USD', 'евро': 'EUR', 'бат': 'THB', 'баты': 'THB', 'тенге': 'KZT' };
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
const fmt = (n: number, digits = 0) => n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function ratesResult(store: Store, username: string, origin: string, now = new Date(), query = ''): InlineQueryResultArticle {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const day = store.ratesByDate[date];
  const requested = aliases[query.toLowerCase()] || query.toUpperCase();
  const chosen = currencies.filter(c => !currencies.includes(requested as any) || c === requested);
  const lines = chosen.flatMap(cur => {
    const r = day?.rates[cur];
    if (!r || !positive(r.buy_vnd) || !positive(r.sell_vnd)) return [];
    return [`${cur}: ${fmt(r.buy_vnd, cur === 'KZT' ? 1 : 0)} / ${fmt(r.sell_vnd, cur === 'KZT' ? 1 : 0)} VND`];
  });
  const stamp = day && Number.isFinite(Date.parse(day.updated_at))
    ? new Date(day.updated_at).toLocaleString('ru-RU', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : date;
  const message = lines.length
    ? `Cash a Lot · Курсы в Дананге\n\n${lines.join('\n')}\n\nЗа 1 единицу валюты: покупка / продажа обменником.\nОбновлено: ${stamp} (Дананг).\n\nБазовые курсы на дату сообщения. Итог зависит от суммы, статуса и способа получения — проверьте расчёт в приложении.`
    : `Cash a Lot · Курсы в Дананге\n\nКурсы на сегодня ещё не опубликованы. Откройте приложение, чтобы проверить обновление.`;
  return {
    type: 'article', id: `rates-${date}-${chosen.length === 1 ? chosen[0] : 'all'}`,
    title: chosen.length === 1 ? `Курс ${chosen[0]} → VND` : 'Курсы в Дананге',
    description: lines.length ? lines.slice(0, 2).join(' · ') : 'Курсы на сегодня ещё не опубликованы',
    thumbnail_url: `${origin}${TELEGRAM_ART}/thumb.jpg`,
    input_message_content: { message_text: message },
    reply_markup: { inline_keyboard: [[{ text: 'Посмотреть курсы', url: `https://t.me/${username}?startapp=rates` }]] },
  };
}

export function inlineResults(store: Store, username: string, tgId: number, origin: string, query: string, now = new Date()): InlineQueryResult[] {
  const q = query.trim().toLowerCase().slice(0, 80);
  const invite = invitationResult(username, tgId, origin);
  if (/^(invite|ref|bonus|приглас|друг|бонус)/.test(q)) return [invite];
  return [ratesResult(store, username, origin, now, q), invite];
}

// Keep tokens out of error messages and put a deadline on every Telegram call.
export async function telegramRequest(token: string, method: string, body: Record<string, unknown> | FormData, timeoutMs = 10_000): Promise<any> {
  const multipart = body instanceof FormData;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: multipart ? undefined : { 'content-type': 'application/json' },
      body: multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    const data: any = await response.json();
    if (!response.ok || !data.ok) throw new Error('telegram_request_failed');
    return data.result;
  } catch { throw new Error('telegram_request_failed'); }
}
