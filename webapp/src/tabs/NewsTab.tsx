import React, { useEffect, useState } from 'react';
import { getTg } from '../lib/telegram';
import './news.css';

export const newsLabels: Record<string, string> = { all: 'Всё', places: 'Места', events: 'Афиша', travel: 'Туристу', offers: 'Акции', life: 'Жизнь города' };
const english: Record<string, string> = { all: 'All', places: 'Places', events: 'Events', travel: 'Travel', offers: 'Offers', life: 'City life' };
export type NewsItem = { id: string; title: string; summary: string; category: string; source: string; url: string; publishedAt: string; language: string; expiresAt?: string; mapUrl?: string; hidden?: boolean; delivery?: { state: string } };
function openNewsLink(url: string) {
  if (!url.startsWith('https://')) return;
  const tg = getTg();
  if (url.startsWith('https://t.me/') && tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function DanangDrawing() {
  return <svg className="dn-drawing" viewBox="0 0 360 105" fill="none" aria-hidden="true"><circle cx="288" cy="24" r="17" fill="currentColor" opacity=".85"/><path d="M0 81h360M24 79c32-77 58-77 90 0 29-62 57-62 86 0 29-45 57-45 86 0" stroke="currentColor" strokeWidth="3"/><path d="M30 80V55m16 25V29m16 51V23m16 57V29m16 51V48m35 32V48m18 32V33m18 47V31m18 49V44m36 36V61m19 19V47m19 33V46m19 34V60M0 93c35-12 65 12 100 0s65 12 100 0 65 12 100 0 45 4 60 0" stroke="currentColor" opacity=".5" strokeWidth="1.5"/></svg>;
}
export default function NewsTab({ isEn = false }: { isEn?: boolean }) {
  const labels = isEn ? english : newsLabels;
  const [posts, setPosts] = useState<NewsItem[]>([]); const [channel, setChannel] = useState<string | null>(null);
  const [category, setCategory] = useState('all'); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [reload, setReload] = useState(0); const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState<string[]>(() => { try { const s = JSON.parse(localStorage.getItem('cashalot-news-saved') || '[]'); return Array.isArray(s) ? s.filter(x => typeof x === 'string').slice(0, 200) : []; } catch { return []; } });
  useEffect(() => {
    const abort = new AbortController(); setLoading(true); setError('');
    fetch('/api/news', { signal: abort.signal }).then(async r => { if (!r.ok) throw Error(); const data = await r.json(); if (!data.ok || !Array.isArray(data.posts)) throw Error(); setPosts(data.posts); setChannel(data.channelUrl); })
      .catch(() => { if (!abort.signal.aborted) setError(isEn ? 'News could not be loaded.' : 'Не удалось загрузить новости.'); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [reload, isEn]);
  const toggle = (id: string) => setSaved(old => { const next = old.includes(id) ? old.filter(x => x !== id) : [...old, id].slice(-200); try { localStorage.setItem('cashalot-news-saved', JSON.stringify(next)); } catch {} return next; });
  const filtered = posts.filter(p => (category === 'all' || p.category === category) && (!savedOnly || saved.includes(p.id)));
  return <div className="dn-feed">
    <header className="dn-masthead"><div><span>{isEn ? 'Your Vietnam' : 'Твой Вьетнам'}</span><h2>{isEn ? 'Da Nang' : 'Дананг'}</h2><p>{isEn ? 'Places, plans and city life' : 'Места, планы и жизнь у моря'}</p></div><DanangDrawing /></header>
    <div className="dn-tools"><span>{isEn ? 'The city worth knowing' : 'Город, который хочется знать'}</span><button type="button" className="dn-saveFilter" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>{isEn ? 'Saved' : 'Сохранённое'}{saved.length ? ` ${saved.length}` : ''}</button></div>
    <nav className="dn-filters" aria-label={isEn ? 'News categories' : 'Рубрики новостей'}>{Object.entries(labels).map(([key, label]) => <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</nav>
    {loading && <p className="dn-empty" role="status">{isEn ? 'Loading city news…' : 'Собираем новости города…'}</p>}
    {error && <div className="dn-empty" role="alert"><p>{error}</p><button type="button" onClick={() => setReload(x => x + 1)}>{isEn ? 'Try again' : 'Попробовать ещё раз'}</button></div>}
    {!loading && !error && !filtered.length && <div className="dn-empty"><h3>{savedOnly ? (isEn ? 'Keep something for later' : 'Сохраните что-нибудь на потом') : (isEn ? 'New stories are on their way' : 'Новые истории ещё впереди')}</h3><p>{savedOnly ? (isEn ? 'Tap the bookmark on a story.' : 'Нажмите на закладку у интересной публикации.') : (isEn ? 'Fresh stories will appear here as sources publish them. Try another category.' : 'Свежие материалы появятся здесь по мере выхода в источниках. Можно посмотреть другие рубрики.')}</p><button type="button" onClick={() => setReload(x => x + 1)}>{isEn ? 'Refresh' : 'Обновить'}</button></div>}
    {!loading && !error && <div className="dn-stories">{filtered.map((p, i) => <article key={p.id} className={`dn-story ${i === 0 ? 'dn-lead' : ''}`}>
      <div className="dn-meta"><span>{labels[p.category]}</span><time dateTime={p.publishedAt}>{new Date(p.publishedAt).toLocaleDateString(isEn ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'long', timeZone: 'Asia/Ho_Chi_Minh' })}</time><button className="dn-bookmark" type="button" aria-label={saved.includes(p.id) ? (isEn ? 'Remove bookmark' : 'Убрать из сохранённого') : (isEn ? 'Bookmark story' : 'Сохранить публикацию')} aria-pressed={saved.includes(p.id)} onClick={() => toggle(p.id)}><svg viewBox="0 0 24 24" width="20" height="20" fill={saved.includes(p.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg></button></div>
      <h3>{p.title}</h3>{p.summary && <p className="dn-summary">{p.summary}</p>}
      {p.expiresAt && <p className="dn-expiry">{isEn ? 'Until ' : 'До '}{new Date(p.expiresAt).toLocaleDateString(isEn ? 'en-GB' : 'ru-RU', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
      <footer><span>{p.source}{p.language === 'en' ? (isEn ? ' · English' : ' · на английском') : ''}</span><div>{p.mapUrl && <button type="button" onClick={() => openNewsLink(p.mapUrl!)}>{isEn ? 'Map' : 'На карте'}</button>}{p.url && <button type="button" onClick={() => openNewsLink(p.url)}>{isEn ? 'Read story' : 'Читать'}</button>}</div></footer>
    </article>)}</div>}
    {channel && <button className="dn-channel" type="button" onClick={() => openNewsLink(channel)}><strong>{isEn ? 'Da Nang in your Telegram' : 'Дананг в вашем Telegram'}</strong><span>{isEn ? 'Follow Your Vietnam' : 'Подписаться на «Твой Вьетнам»'}</span></button>}
  </div>;
}
