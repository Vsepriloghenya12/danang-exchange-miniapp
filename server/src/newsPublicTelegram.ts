import { createHash } from 'node:crypto';
import { parseDocument, DomUtils } from 'htmlparser2';
import { DAY, newsCategory, type NewsPost } from './news.js';
import { safeTelegramMediaUrl, type NewsMedia } from './newsMedia.js';

export type PublicTelegramSource = {
  id: string; username: string; title: string; connectedAt: string; lastMessageId: number;
  lastCheckedAt?: string; lastReceivedAt?: string; error?: string;
};
type PublicMessage = { id: number; date: string; text: string; media: NewsMedia[]; mediaWarning?: string };
export type PublicChannelPage = { username: string; title: string; messages: PublicMessage[]; ids: number[]; before?: number };
const MAX_BYTES = 2_000_000;
const usernamePattern = /^[a-z][a-z0-9_]{3,30}[a-z0-9]$/i;
export function publicTelegramUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (usernamePattern.test(raw.replace(/^@/, ''))) return raw.replace(/^@/, '').toLowerCase();
  if (!/^https:\/\/t\.me\/(?:s\/)?[a-z][a-z0-9_]{3,30}[a-z0-9](?:\/\d+)?\/?$/i.test(raw)) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.hostname !== 't.me' || u.port || u.username || u.password || u.search || u.hash) return null;
    const match = u.pathname.match(/^\/(?:s\/)?([a-z][a-z0-9_]{3,30}[a-z0-9])(?:\/\d+)?\/?$/i);
    return match?.[1].toLowerCase() || null;
  } catch { return null; }
}
const hasClass = (node: any, name: string) => (node.attribs?.class || '').split(/\s+/).includes(name);
function readableText(node: any): string {
  if (node.type === 'text') return node.data;
  if (['script', 'style', 'noscript'].includes(node.name) || node.attribs?.hidden !== undefined || node.attribs?.['aria-hidden'] === 'true') return '';
  if (node.name === 'br') return '\n';
  return (node.children || []).map(readableText).join('') + (['p', 'div', 'blockquote'].includes(node.name) ? '\n' : '');
}
function cleanText(node: any) {
  return readableText(node).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function parsePublicTelegramPage(html: string, username: string): PublicChannelPage {
  if (!usernamePattern.test(username) || Buffer.byteLength(html) > MAX_BYTES) throw Error('Некорректная страница канала.');
  const doc = parseDocument(html);
  const find = (cls: string, nodes: any[] = doc.children) => DomUtils.findOne(n => hasClass(n, cls), nodes, true);
  const heading = find('tgme_channel_info_header_title'); const identity = find('tgme_channel_info_header_username');
  const history = find('tgme_channel_history');
  if (!heading || !identity || !history || cleanText(identity).toLowerCase() !== `@${username.toLowerCase()}`) throw Error('У канала нет открытой веб-ленты. Проверьте ссылку.');
  const ids: number[] = []; const messages: PublicMessage[] = [];
  for (const widget of DomUtils.findAll(n => hasClass(n, 'tgme_widget_message'), history.children).slice(0, 100)) {
    const post = widget.attribs['data-post']?.match(/^([\w]+)\/(\d+)$/);
    if (!post || post[1].toLowerCase() !== username.toLowerCase()) continue;
    const id = Number(post[2]); if (!Number.isSafeInteger(id) || id < 1) continue;
    ids.push(id);
    const textNode = find('tgme_widget_message_text', widget.children);
    const dateLink = find('tgme_widget_message_date', widget.children);
    const time = dateLink && DomUtils.findOne(n => n.name === 'time', dateLink.children, true);
    const date = Date.parse(time?.attribs.datetime || '');
    if (!Number.isFinite(date) || /(?:^|\s)(?:noforwards|protected_content)(?:\s|$)/.test(widget.attribs.class || '')) continue;
    const text = textNode ? cleanText(textNode) : '';
    const media: NewsMedia[] = []; let missing = false;
    const background = (node: any) => {
      const match = (node?.attribs?.style || '').match(/background-image\s*:\s*url\(\s*(['"]?)(.*?)\1\s*\)/i);
      return match && safeTelegramMediaUrl(match[2]);
    };
    const attachments = DomUtils.findAll(n => hasClass(n, 'tgme_widget_message_photo_wrap') || hasClass(n, 'tgme_widget_message_video_player'), widget.children);
    for (const node of attachments) {
      const link = node.attribs.href?.match(/^https:\/\/t\.me\/([\w]+)\/(\d+)(?:\?.*)?$/);
      const messageId = link && link[1].toLowerCase() === username.toLowerCase() ? Number(link[2]) : id;
      if (!Number.isSafeInteger(messageId) || messageId < 1) continue;
      if (!ids.includes(messageId)) ids.push(messageId);
      if (hasClass(node, 'tgme_widget_message_video_player')) {
        const video = DomUtils.findOne(n => n.name === 'video', node.children, true);
        const url = safeTelegramMediaUrl(video?.attribs.src || '');
        const posterUrl = background(find('tgme_widget_message_video_thumb', node.children));
        if (url) media.push({ kind: 'video', messageId, url, ...(posterUrl ? { posterUrl } : {}) }); else missing = true;
      } else {
        const url = background(node);
        if (url) media.push({ kind: 'photo', messageId, url }); else missing = true;
      }
    }
    // Locked/unsupported previews sometimes contain no actual video element.
    if (find('tgme_widget_message_video_not_supported', widget.children) || find('tgme_widget_message_media_not_supported', widget.children)) missing = true;
    const unique = media.filter((m, i) => media.findIndex(other => other.kind === m.kind && other.url === m.url) === i);
    if (text.length >= 5 || unique.length || missing) messages.push({ id, date: new Date(date).toISOString(), text, media: unique.slice(0,10), ...(missing || unique.length > 10 ? { mediaWarning: 'Часть вложений недоступна в открытой версии Telegram или превышен лимит 10 вложений.' } : {}) });
  }
  const pager = find('tme_messages_more');
  const cursor = Number(pager?.attribs['data-before']);
  const before = Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined;
  return { username: username.toLowerCase(), title: cleanText(heading).slice(0, 160), messages, ids, before };
}
export async function fetchPublicTelegramPage(username: string, before?: number): Promise<PublicChannelPage> {
  if (!usernamePattern.test(username) || before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw Error('Некорректный адрес канала.');
  // Only this fixed HTTPS origin is contacted. No cookies, credentials, redirects or page scripts.
  const url = `https://t.me/s/${username}${before ? `?before=${before}` : ''}`;
  let response: Response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'text/html', 'user-agent': 'CashALotNews/1.0' } }); }
  catch { throw Error('Не удалось открыть веб-ленту Telegram. Попробуйте позже.'); }
  if (response.status === 429) throw Error('Telegram ограничил частоту запросов. Следующая проверка через 15 минут.');
  if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/html')) throw Error('Открытая веб-лента канала недоступна.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw Error('Страница канала слишком большая.'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return parsePublicTelegramPage(Buffer.concat(chunks).toString('utf8'), username);
}
export async function pollPublicTelegramSource(source: PublicTelegramSource, now = new Date()) {
  let page = await fetchPublicTelegramPage(source.username);
  const newest = Math.max(source.lastMessageId, ...page.ids);
  const messages = [...page.messages]; const seen = new Set<number>();
  for (let depth = 0; page.before && page.ids.length && Math.min(...page.ids) > source.lastMessageId; depth++) {
    if (depth >= 2 || seen.has(page.before)) throw Error('Слишком много новых постов для одной проверки. Повторите проверку или переподключите канал.');
    seen.add(page.before); page = await fetchPublicTelegramPage(source.username, page.before); messages.push(...page.messages);
  }
  const candidates = messages.filter(m => Date.parse(m.date) >= Date.parse(source.connectedAt) && Date.parse(m.date) >= +now - 14 * DAY && Date.parse(m.date) <= +now + 300000);
  const posts: NewsPost[] = candidates.map(m => {
    const lines = m.text.split('\n').filter(Boolean); const first = lines.shift() || (m.media.some(x => x.kind === 'video') ? 'Видео из Дананга' : 'Фото из Дананга');
    return {
      id: createHash('sha256').update(`telegram:public:${source.username}:${m.id}`).digest('hex').slice(0,24),
      title: first.length > 160 ? first.slice(0,157) + '…' : first,
      summary: (first.length > 160 ? [first, ...lines] : lines).join('\n\n').slice(0,1600),
      source: source.title, sourceId: `telegram:public:${source.username}`, sourceKind: 'telegram',
      url: `https://t.me/${source.username}/${m.id}`, category: newsCategory(m.text), language: /[а-яё]/i.test(m.text) ? 'ru' : 'en',
      publishedAt: m.date, addedAt: now.toISOString(), hidden: false, media: m.media, mediaWarning: m.mediaWarning,
    };
  });
  return { posts: posts.filter((_,i) => candidates[i].id > source.lastMessageId), mediaUpdates: posts.filter((_,i) => candidates[i].id <= source.lastMessageId), lastMessageId: newest };
}
