import { createHash, randomUUID } from 'node:crypto';
import { mkdir, stat, open, rename, unlink, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { telegramRequest } from './telegramExperience.js';
import { fetchPublicTelegramPage } from './newsPublicTelegram.js';
import type { NewsPost } from './news.js';

export type NewsMedia = {
  kind: 'photo' | 'video'; messageId: number; url?: string; posterUrl?: string;
  fileId?: string; posterFileId?: string; size?: number;
};
export function safeTelegramMediaUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && /^cdn\d+\.telesco\.pe$/.test(u.hostname) && !u.port && !u.username && !u.password && u.pathname.startsWith('/file/')) return u.href;
  } catch {}
}
const directory = join(tmpdir(), 'cashalot-news-media-v1');
const inflight = new Map<string, Promise<{ path: string; size: number; type: string }>>();
let active = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>(resolve => waiting.push(resolve)); else active++;
  try { return await fn(); } finally { const next = waiting.shift(); if (next) next(); else active--; }
}
let lastSweep = 0;
async function sweep() {
  if (Date.now() - lastSweep < 3600000) return;
  lastSweep = Date.now();
  const files = await Promise.all((await readdir(directory)).filter(n => /^[a-f0-9]{64}\.(jpg|mp4)$/.test(n)).map(async name => ({ name, info: await stat(join(directory, name)).catch(() => null) })));
  let total = 0;
  for (const file of files.sort((a,b) => (b.info?.mtimeMs || 0) - (a.info?.mtimeMs || 0))) {
    if (!file.info) continue;
    total += file.info.size;
    // Keep recent downloads available to in-flight responses and uploads.
    if (Date.now() - file.info.mtimeMs > 3600000 && (total > 512_000_000 || Date.now() - file.info.mtimeMs > 7 * 86400000)) await unlink(join(directory, file.name)).catch(() => {});
  }
}
async function download(url: string, path: string, video: boolean, botFile = false) {
  const limit = video ? 50_000_000 : 10_000_000;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) });
  const type = response.headers.get('content-type')?.split(';')[0] || '';
  const accepted = video ? type === 'video/mp4' : ['image/jpeg', 'image/png', 'image/webp'].includes(type);
  if (!response.ok || !response.body || (!accepted && !(botFile && type === 'application/octet-stream')) || Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel(); throw Error('Медиа недоступно или превышает допустимый размер.');
  }
  const temporary = `${path}.${randomUUID()}.part`;
  const file = await open(temporary, 'wx'); const reader = response.body.getReader(); let size = 0; let header = Buffer.alloc(0);
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) throw Error('Медиа превышает допустимый размер.');
      if (header.length < 16) header = Buffer.concat([header, value]).subarray(0,16);
      await file.writeFile(value);
    }
    const isVideo = header.subarray(4,8).toString() === 'ftyp';
    const isImage = header[0] === 255 && header[1] === 216 && header[2] === 255 || header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || header.subarray(0,4).toString() === 'RIFF' && header.subarray(8,12).toString() === 'WEBP';
    if (!(video ? isVideo : isImage)) throw Error('Неподдерживаемый формат медиа.');
    await file.close(); await rename(temporary, path);
    return { path, size, type: video ? 'video/mp4' : header[0] === 255 ? 'image/jpeg' : header[0] === 137 ? 'image/png' : 'image/webp' };
  } finally { await reader.cancel().catch(() => {}); await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); }
}
export async function getNewsMedia(post: NewsPost, index: number, token: string, poster = false) {
  const media = post.media?.[index];
  if (!media || poster && media.kind !== 'video') throw Error('Медиа не найдено.');
  const video = media.kind === 'video' && !poster;
  const key = createHash('sha256').update(JSON.stringify([post.id, media.messageId, index, poster, media.fileId || media.url])).digest('hex');
  const pending = inflight.get(key); if (pending) return pending;
  // Bound the queue as well as active downloads. No arbitrary URLs are accepted from requests.
  if (inflight.size >= 20) throw Error('Медиа временно недоступно.');
  const job = limited(async () => {
    await mkdir(directory, { recursive: true }); void sweep().catch(() => {});
    const path = join(directory, `${key}.${video ? 'mp4' : 'jpg'}`);
    const cached = await stat(path).catch(() => null);
    if (cached && Date.now() - cached.mtimeMs < 7 * 86400000) {
      const handle = await open(path, 'r'); const head = Buffer.alloc(16); await handle.read(head, 0,16,0); await handle.close();
      return { path, size: cached.size, type: video ? 'video/mp4' : head[0] === 255 ? 'image/jpeg' : head[0] === 137 ? 'image/png' : 'image/webp' };
    }
    const fileId = poster ? media.posterFileId : media.fileId;
    if (fileId) {
      if (!token) throw Error('Медиа временно недоступно.');
      const file = await telegramRequest(token, 'getFile', { file_id: fileId });
      if (!/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(file.file_path || '') || file.file_path.split('/').includes('..')) throw Error('Медиа недоступно.');
      return download(`https://api.telegram.org/file/bot${token}/${file.file_path}`, path, video, true);
    }
    let url = safeTelegramMediaUrl((poster ? media.posterUrl : media.url) || '');
    if (url) { try { return await download(url, path, video); } catch {} }
    // Telegram's public CDN links expire. Renew only from the original public channel post.
    const source = post.url.match(/^https:\/\/t\.me\/([a-zA-Z][\w]{3,31})\/(\d+)$/);
    if (!source) throw Error('Медиа недоступно.');
    const page = await fetchPublicTelegramPage(source[1], Number(source[2]) + 1);
    const fresh = page.messages.flatMap(m => m.media).find(m => m.messageId === media.messageId && m.kind === media.kind);
    url = safeTelegramMediaUrl((poster ? fresh?.posterUrl : fresh?.url) || '');
    if (!url) throw Error('Медиа недоступно в открытой версии Telegram.');
    return download(url, path, video);
  }).finally(() => inflight.delete(key));
  inflight.set(key, job); return job;
}

// The caller persists a send claim first; ambiguous/partial failures are never resent automatically.
export async function sendNewsMedia(token: string, post: NewsPost, chatId: string | number, text: string, replyMarkup: unknown, record: (ids: number[]) => Promise<void>) {
  const media = post.media || [];
  if (!media.length) {
    const result = await telegramRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
    await record([result.message_id]); return;
  }
  if (media.length > 10) throw Error('В альбоме больше 10 вложений.');
  const form = new FormData(); form.set('chat_id', String(chatId));
  const inputs: Record<string, unknown>[] = []; let total = 0;
  // Counting HTML markup too is conservative and avoids splitting tags or surrogate pairs.
  const short = text.length <= 1024;
  for (let i = 0; i < media.length; i++) {
    const item = media[i]; let reference = item.fileId;
    if (!reference) {
      const file = await getNewsMedia(post, i, token); total += file.size;
      if (total > 100_000_000) throw Error('Альбом слишком большой для автоматической отправки.');
      const name = `attachment${i}`; reference = `attach://${name}`;
      form.set(name, new Blob([new Uint8Array(await readFile(file.path))], { type: file.type }), `${name}.${item.kind === 'video' ? 'mp4' : 'jpg'}`);
    }
    inputs.push({ type: item.kind, media: reference, ...(item.kind === 'video' ? { supports_streaming: true } : {}), ...(i === 0 && short ? { caption: text, parse_mode: 'HTML' } : {}) });
  }
  const group = inputs.length > 1;
  if (group) form.set('media', JSON.stringify(inputs));
  else {
    form.set(media[0].kind, String(inputs[0].media));
    if (media[0].kind === 'video') form.set('supports_streaming', 'true');
    if (short) { form.set('caption', text); form.set('parse_mode', 'HTML'); }
    if (replyMarkup) form.set('reply_markup', JSON.stringify(replyMarkup));
  }
  const result = await telegramRequest(token, group ? 'sendMediaGroup' : media[0].kind === 'photo' ? 'sendPhoto' : 'sendVideo', form, 60000);
  await record((group ? result : [result]).map((m: any) => m.message_id));
  if (!short) {
    const result = await telegramRequest(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });
    await record([result.message_id]);
  }
}
