import { createHash, randomUUID } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { readStore, mutateStore, type Store } from './store.js';
import { telegramRequest, publicAppOrigin } from './telegramExperience.js';

export const NEWS_SOURCES = [
  { id: 'ator', name: 'АТОР', url: 'https://www.atorus.ru/news/rss.xml', host: 'atorus.ru', language: 'ru', enabled: true },
  { id: 'tourdom', name: 'ТурДом', url: 'https://www.tourdom.ru/rss/', host: 'tourdom.ru', language: 'ru', enabled: true },
  { id: 'vnexpress', name: 'VnExpress', url: 'https://e.vnexpress.net/rss/travel.rss', host: 'e.vnexpress.net', language: 'en', enabled: false },
] as const;
export const NEWS_CATEGORIES = ['places', 'events', 'travel', 'offers', 'life'] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];
export type NewsPost = {
  id: string; title: string; summary: string; category: NewsCategory; source: string; sourceId: string;
  sourceKind?: 'website' | 'telegram' | 'editorial';
  url: string; language: string; publishedAt: string; addedAt: string; hidden: boolean;
  expiresAt?: string; mapUrl?: string; delivery?: { state: 'sending' | 'sent' | 'uncertain'; at: string; chatId: string | number; messageId?: number };
};
export type NewsState = {
  enabled: boolean; sources: string[]; posts: NewsPost[]; checkedAt?: string;
  sourceStatus: Record<string, { checkedAt: string; count?: number; error?: string }>;
  channel?: { id: string | number; title: string; url?: string; connectedAt: string };
  lease?: { id: string; until: string }; lastSendAt?: string;
  telegramSources?: { id: number; title: string; username?: string; connectedAt: string; lastReceivedAt?: string }[];
};
export const DAY = 86400000;
export function newsState(store: Store): NewsState {
  return store.config.news ||= { enabled: true, sources: NEWS_SOURCES.filter(s => s.enabled).map(s => s.id), posts: [], sourceStatus: {} };
}
const textValue = (v: any): string => typeof v === 'string' ? v : typeof v?.['#text'] === 'string' ? v['#text'] : '';
export function plainText(value: unknown): string {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, n) => {
      const code = n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }).replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n: string) => (({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[n] || ''))
    .replace(/[<>]/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}
export function safeNewsUrl(raw: string, host?: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)) return '';
    if (host && u.hostname !== host && u.hostname !== `www.${host}`) return '';
    u.hash = ''; for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch { return ''; }
}
export function relevantToDanang(title: string, summary: string): boolean {
  const s = `${title} ${summary}`.toLowerCase();
  return /дананг|da\s*nang|đà\s*nẵng/.test(s) ||
    (/вьетнам|vietnam|viet nam/.test(s) && /виз[аыуе]|безвиз|правил.{0,25}въезд|e-?visa|visa exemption|entry requirements/.test(s));
}
export function newsCategory(text: string): NewsCategory {
  if (/фестивал|концерт|афиш|фейерверк|festival|concert|firework/i.test(text)) return 'events';
  if (/виз[аыуе]|въезд|рейс|аэропорт|перел[её]т|flight|airport|visa/i.test(text)) return 'travel';
  if (/откр[ыи]|ресторан|кафе|музе|парк|отел|пляж|restaurant|cafe|opening|museum|hotel|resort|beach/i.test(text)) return 'places';
  return 'life';
}
const digest = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);
const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(w => w.length > 2);
export function duplicateNews(a: NewsPost, b: NewsPost): boolean {
  if (a.id === b.id || a.url && a.url === b.url) return true;
  if (Math.abs(Date.parse(a.publishedAt) - Date.parse(b.publishedAt)) > 7 * DAY) return false;
  const x = new Set(words(a.title)), y = new Set(words(b.title));
  const overlap = [...x].filter(w => y.has(w)).length;
  return x.size > 3 && y.size > 3 && overlap / new Set([...x, ...y]).size >= .8;
}
export function parseNewsFeed(xml: string, source: typeof NEWS_SOURCES[number], now = new Date()): NewsPost[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || Buffer.byteLength(xml) > 6_000_000) throw new Error('Неподдерживаемый формат ленты');
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false }).parse(xml);
  if (!parsed?.rss?.channel) throw new Error('Источник вернул не RSS');
  const raw = parsed.rss.channel.item || [];
  return (Array.isArray(raw) ? raw : [raw]).slice(0, 500).flatMap((item: any) => {
    const title = plainText(textValue(item.title));
    const summary = plainText(textValue(item.description));
    const date = Date.parse(textValue(item.pubDate));
    const url = safeNewsUrl(textValue(item.link), source.host);
    if (!title || title.length > 300 || !url || !Number.isFinite(date) || date > +now + 300000 || date < +now - 14 * DAY || !relevantToDanang(title, summary)) return [];
    // Publish only a small excerpt. The full article and its images stay with the publisher.
    const titleWords = title.split(/\s+/); const headline = titleWords.slice(0, 22).join(' ') + (titleWords.length > 22 ? '…' : '');
    const allowance = Math.max(0, 24 - titleWords.length);
    const excerptWords = summary.split(/\s+/);
    const excerpt = summary && summary !== title && allowance > 3 ? excerptWords.slice(0, allowance).join(' ').replace(/[.,;:!?…]+$/, '') + (excerptWords.length > allowance ? '…' : '.') : '';
    return [{ id: digest(url), title: headline, summary: excerpt, category: newsCategory(title + ' ' + summary), source: source.name, sourceId: source.id, url,
      language: source.language, publishedAt: new Date(date).toISOString(), addedAt: now.toISOString(), hidden: false }];
  });
}
export function visibleNews(state: NewsState, now = new Date()) {
  return state.posts.filter(p => !p.hidden && (!p.expiresAt || Date.parse(p.expiresAt) > +now)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}
async function fetchFeed(source: typeof NEWS_SOURCES[number]): Promise<string> {
  const response = await fetch(source.url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'accept': 'application/rss+xml, application/xml, text/xml', 'user-agent': 'CashALotNews/1.0' } });
  if (!response.ok || !response.body) throw new Error('Источник временно недоступен');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 6_000_000) throw new Error('Лента слишком большая'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
export function deliveryCandidate(state: NewsState, now = new Date()): NewsPost | undefined {
  if (!state.enabled || !state.channel) return;
  const hour = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', hour: 'numeric', hourCycle: 'h23' }));
  if (hour < 8 || hour >= 21 || state.lastSendAt && +now - Date.parse(state.lastSendAt) < 2 * 3600000) return;
  const day = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
  const attempts = state.posts.filter(p => p.delivery && new Date(p.delivery.at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) === day);
  if (attempts.length >= 3) return;
  return visibleNews(state, now).filter(p => !p.delivery && p.addedAt >= state.channel!.connectedAt && Date.parse(p.publishedAt) >= +now - DAY).at(0);
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function newsTelegramText(post: NewsPost) {
  const website = newsSourceKind(post) === 'website';
  return `<b>${esc(post.title)}</b>${post.summary ? '\n\n' + esc(post.summary) : ''}\n\n${website ? esc(post.source) + ' · ' : ''}${new Date(post.publishedAt).toLocaleDateString('ru-RU', { timeZone: 'Asia/Ho_Chi_Minh' })}${website && post.url ? `\n<a href="${esc(post.url)}">Читать в источнике</a>` : ''}`;
}
export function newsSourceKind(post: NewsPost) {
  return post.sourceKind || (post.sourceId.startsWith('telegram:') ? 'telegram' : post.sourceId === 'editorial' ? 'editorial' : 'website');
}
export function publicNewsPost(post: NewsPost) {
  const { delivery, hidden, sourceId, ...publicPost } = post;
  const sourceKind = newsSourceKind(post);
  return { ...publicPost, sourceKind, ...(sourceKind !== 'website' ? { source: '' } : {}), ...(sourceKind === 'telegram' ? { url: '' } : {}) };
}
let running: Promise<void> | undefined;
export function syncNews(token: string, now = new Date()): Promise<void> {
  if (running) return running;
  running = runNews(token, now).finally(() => { running = undefined; });
  return running;
}
async function runNews(token: string, now: Date) {
  const leaseId = randomUUID();
  const acquired = await mutateStore(s => {
    const n = newsState(s);
    if (!n.enabled || n.lease && Date.parse(n.lease.until) > +now) return false;
    n.lease = { id: leaseId, until: new Date(+now + 180000).toISOString() }; return true;
  });
  if (!acquired.result) return;
  try {
    const chosen = newsState(await readStore()).sources;
    const results = await Promise.all(NEWS_SOURCES.filter(s => chosen.includes(s.id)).map(async source => {
      try { return { source, posts: parseNewsFeed(await fetchFeed(source), source, now), error: '' }; }
      catch { return { source, posts: [] as NewsPost[], error: 'Не удалось обновить источник. Следующая попытка через 15 минут.' }; }
    }));
    await mutateStore(s => {
      const n = newsState(s); if (!n.enabled || n.lease?.id !== leaseId) return;
      for (const result of results) {
        if (!n.sources.includes(result.source.id)) continue;
        n.sourceStatus[result.source.id] = { checkedAt: now.toISOString(), count: result.posts.length, error: result.error || undefined };
        for (const p of result.posts) if (!n.posts.some(old => duplicateNews(old, p))) n.posts.push(p);
      }
      n.posts = n.posts.filter(p => Date.parse(p.addedAt) > +now - 90 * DAY).sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 500);
      n.checkedAt = now.toISOString();
    });
    const claim = await mutateStore(s => {
      const n = newsState(s); if (n.lease?.id !== leaseId) return null;
      const p = deliveryCandidate(n, now); if (!p || !token) return null;
      p.delivery = { state: 'sending', at: now.toISOString(), chatId: n.channel!.id }; n.lastSendAt = now.toISOString();
      return { post: structuredClone(p), channel: structuredClone(n.channel!) };
    });
    if (claim.result) {
      const { post, channel } = claim.result;
      try {
        const origin = publicAppOrigin(process.env.WEBAPP_URL || '');
        const result = await telegramRequest(token, 'sendMessage', { chat_id: channel.id, text: newsTelegramText(post), parse_mode: 'HTML', link_preview_options: { is_disabled: true },
          ...(origin ? { reply_markup: { inline_keyboard: [[{ text: 'Лента Дананга', url: `${origin}/?section=news` }]] } } : {}) });
        await mutateStore(s => { const p = newsState(s).posts.find(x => x.id === post.id); if (p && p.delivery && p.delivery.at === post.delivery?.at) p.delivery = { ...p.delivery, state: 'sent', messageId: result.message_id }; });
      } catch {
        await mutateStore(s => { const p = newsState(s).posts.find(x => x.id === post.id); if (p?.delivery) p.delivery.state = 'uncertain'; });
      }
    }
  } finally {
    await mutateStore(s => { const n = newsState(s); if (n.lease?.id === leaseId) delete n.lease; });
  }
}
export function startNewsWorker(token: string) {
  // A local preview and production cannot start a new publisher accidentally.
  if (process.env.NEWS_ENABLED !== 'true' && process.env.RAILWAY_SERVICE_ID !== '1c1b2d05-972a-458a-b30c-606e2264e467') return;
  const run = () => { void syncNews(token).catch(() => console.error('News refresh failed; next scheduled attempt will retry.')); };
  const first = setTimeout(run, 15000); first.unref();
  const timer = setInterval(run, 15 * 60000); timer.unref();
}
