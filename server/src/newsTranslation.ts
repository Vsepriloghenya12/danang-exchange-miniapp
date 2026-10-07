import { readStore, mutateStore } from './store.js';
import { newsState, newsCategory, plainText, type NewsPost } from './news.js';

export type NewsTranslation = { state: 'pending' | 'done'; title: string; summary: string; error?: string; retryAt?: string };
export function queueVietnamese(post: NewsPost): NewsPost {
  return post.language === 'vi' && !post.translation ? { ...post, translation: { state: 'pending', title: post.title, summary: post.summary } } : post;
}
export function translationChunks(text: string): string[] {
  const chunks: string[] = []; let chunk = '';
  for (const word of text.split(/(\s+)/u)) {
    if (Buffer.byteLength(chunk + word) <= 480) { chunk += word; continue; }
    if (chunk.trim()) chunks.push(chunk.trim()); chunk = '';
    for (const character of word) {
      if (Buffer.byteLength(chunk + character) > 480) { chunks.push(chunk); chunk = ''; }
      chunk += character;
    }
  }
  if (chunk.trim()) chunks.push(chunk.trim()); return chunks;
}
export async function translateVietnamese(text: string): Promise<string> {
  if (!text.trim()) return '';
  const translated: string[] = [];
  for (const chunk of translationChunks(text)) {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.search = new URLSearchParams({ q: chunk, langpair: 'vi|ru', mt: '1' }).toString();
    const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) });
    const raw = await r.text(); if (raw.length > 100000) throw Error('Перевод временно недоступен.');
    const d = JSON.parse(raw);
    if (!r.ok || d.quotaFinished || Number(d.responseStatus) !== 200 || typeof d.responseData?.translatedText !== 'string') throw Error('Сервис перевода недоступен или исчерпан дневной лимит.');
    const value = plainText(d.responseData.translatedText);
    if (!value || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID LANGUAGE/i.test(value)) throw Error('Сервис не вернул перевод.');
    translated.push(value);
  }
  const result = translated.join(' ');
  if (/[\p{L}]/u.test(text) && !/[а-яё]/i.test(result)) throw Error('Перевод на русский не подтверждён.');
  return result;
}
export async function translatePendingNews(now = new Date()) {
  const candidates = newsState(await readStore()).posts.filter(p => p.translation?.state === 'pending' && !p.hidden && (!p.translation.retryAt || Date.parse(p.translation.retryAt) <= +now)).sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0,3);
  for (const candidate of candidates) {
    const original = candidate.translation!;
    const chars = original.title.length + original.summary.length;
    const { result: reserved } = await mutateStore(s => {
      const n = newsState(s); const p = n.posts.find(p => p.id === candidate.id);
      if (!n.enabled || p?.translation?.state !== 'pending') return false;
      const day = now.toISOString().slice(0,10);
      if (n.translationUsage?.day !== day) n.translationUsage = { day, chars: 0 };
      if (n.translationUsage!.chars + chars > 4800) { p.translation.error = 'Дневной лимит перевода исчерпан. Продолжим завтра; оригинал не публикуется.'; return false; }
      n.translationUsage!.chars += chars;
      p.translation.retryAt = new Date(+now + 3600000).toISOString(); return true;
    });
    if (!reserved) continue;
    try {
      const title = await translateVietnamese(original.title); const summary = await translateVietnamese(original.summary);
      await mutateStore(s => {
        const p = newsState(s).posts.find(p => p.id === candidate.id);
        if (p?.translation?.state !== 'pending' || p.translation.title !== original.title || p.translation.summary !== original.summary) return;
        p.title = title; p.summary = summary; p.language = 'ru'; p.category = newsCategory(`${title} ${summary}`);
        p.translation = { ...original, state: 'done', error: undefined, retryAt: undefined };
      });
    } catch (e) {
      await mutateStore(s => { const p = newsState(s).posts.find(p => p.id === candidate.id); if (p?.translation?.state === 'pending') p.translation.error = e instanceof Error ? e.message : 'Перевод временно недоступен.'; });
    }
  }
}
