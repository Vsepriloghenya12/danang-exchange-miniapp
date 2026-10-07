import React, { useEffect, useState } from 'react';
import { getTg } from '../lib/telegram';
import './news.css';

export const newsLabels: Record<string, string> = { all: 'Всё', places: 'Места', events: 'Афиша', travel: 'Туристу', offers: 'Акции', life: 'Жизнь города' };
const english: Record<string, string> = { all: 'All', places: 'Places', events: 'Events', travel: 'Travel', offers: 'Offers', life: 'City life' };
export type NewsItem = { id: string; title: string; summary: string; category: string; source: string; sourceKind?: 'website' | 'telegram' | 'editorial'; url: string; publishedAt: string; language: string; expiresAt?: string; mapUrl?: string; hidden?: boolean; delivery?: { state: string }; media?: { kind: 'photo' | 'video'; url: string; poster?: string }[]; mediaUnavailable?: boolean; mediaWarning?: string; translated?: boolean; translation?: { state: string; error?: string } };
function NewsAttachment({ media, title, isEn }: { media: NonNullable<NewsItem['media']>[number]; title: string; isEn: boolean }) {
  const [failed, setFailed] = useState(false); const [attempt, setAttempt] = useState(0);
  return <figure className="dn-attachment">{failed ? <div className="dn-mediaError"><p>{isEn ? 'Media is temporarily unavailable' : 'Фото или видео временно недоступно'}</p><button type="button" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>{isEn ? 'Try again' : 'Повторить'}</button></div> : media.kind === 'video' ? <video key={attempt} controls playsInline preload="none" poster={media.poster} src={media.url} aria-label={title} onError={() => setFailed(true)}/> : <img key={attempt} src={media.url} alt={title} loading="lazy" decoding="async" onError={() => setFailed(true)}/>}</figure>;
}
function openNewsLink(url: string) {
  if (!url.startsWith('https://')) return;
  const tg = getTg();
  if (url.startsWith('https://t.me/') && tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
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
    <header className="dn-masthead"><h2>{isEn ? 'Your Vietnam' : 'Твой Вьетнам'}</h2><p>{isEn ? 'Da Nang. Places, plans and life by the sea.' : 'Дананг. Места, планы и жизнь у моря.'}</p></header>
    <div className="dn-tools"><span>{isEn ? 'In the city' : 'В городе'}</span><button type="button" className="dn-saveFilter" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>{isEn ? 'Saved' : 'Сохранённое'}{saved.length ? ` ${saved.length}` : ''}</button></div>
    <nav className="dn-filters" aria-label={isEn ? 'News categories' : 'Рубрики новостей'}>{Object.entries(labels).map(([key, label]) => <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</nav>
    {loading && <p className="dn-empty" role="status">{isEn ? 'Loading city news…' : 'Собираем новости города…'}</p>}
    {error && <div className="dn-empty" role="alert"><p>{error}</p><button type="button" onClick={() => setReload(x => x + 1)}>{isEn ? 'Try again' : 'Попробовать ещё раз'}</button></div>}
    {!loading && !error && !filtered.length && <div className="dn-empty"><h3>{savedOnly ? (isEn ? 'Keep something for later' : 'Сохраните что-нибудь на потом') : (isEn ? 'New stories are on their way' : 'Новые истории ещё впереди')}</h3><p>{savedOnly ? (isEn ? 'Tap the bookmark on a story.' : 'Нажмите на закладку у интересной публикации.') : (isEn ? 'Fresh stories will appear here as sources publish them. Try another category.' : 'Свежие материалы появятся здесь по мере выхода в источниках. Можно посмотреть другие рубрики.')}</p><button type="button" onClick={() => setReload(x => x + 1)}>{isEn ? 'Refresh' : 'Обновить'}</button></div>}
    {!loading && !error && <div className="dn-stories">{filtered.map((p, i) => <article key={p.id} className={`dn-story ${i === 0 ? 'dn-lead' : ''}`}>
      <div className="dn-meta"><span>{labels[p.category]}</span><button className="dn-bookmark" type="button" aria-label={saved.includes(p.id) ? (isEn ? 'Remove bookmark' : 'Убрать из сохранённого') : (isEn ? 'Bookmark story' : 'Сохранить публикацию')} aria-pressed={saved.includes(p.id)} onClick={() => toggle(p.id)}><svg viewBox="0 0 24 24" width="20" height="20" fill={saved.includes(p.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg></button></div>
      <h3>{p.title}</h3>
      {!!p.media?.length && <div className={`dn-gallery ${p.media.length > 1 ? 'dn-galleryMultiple' : ''}`} role="group" aria-label={isEn ? 'Post photos and videos' : 'Фото и видео публикации'}>{p.media.map((m, index) => <NewsAttachment key={`${p.id}-${index}`} media={m} title={`${p.title} · ${index + 1}/${p.media!.length}`} isEn={isEn}/>)}</div>}
      {(p.media?.length || 0) > 1 && <p className="dn-galleryHint">{isEn ? `${p.media!.length} attachments · swipe to view` : `${p.media!.length} вложений · листайте в сторону`}</p>}
      {p.mediaUnavailable && <p className="dn-mediaNote">{isEn ? 'Some media is unavailable in the public Telegram preview.' : 'Часть вложений недоступна в открытой версии Telegram.'}</p>}
      {p.summary && <p className="dn-summary">{p.summary}</p>}
      {p.expiresAt && <p className="dn-expiry">{isEn ? 'Until ' : 'До '}{new Date(p.expiresAt).toLocaleDateString(isEn ? 'en-GB' : 'ru-RU', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>}
      <footer><span>{p.sourceKind !== 'telegram' && p.sourceKind !== 'editorial' ? p.source : ''}{p.translated ? (isEn ? ' · Translated from Vietnamese' : ' · Перевод с вьетнамского') : ''}{p.language === 'en' ? (isEn ? ' · English' : ' · на английском') : ''}</span><div>{p.mapUrl && <button type="button" onClick={() => openNewsLink(p.mapUrl!)}>{isEn ? 'Map' : 'На карте'}</button>}{p.url && p.sourceKind !== 'telegram' && <button type="button" onClick={() => openNewsLink(p.url)}>{isEn ? 'Read story' : 'Читать'}</button>}</div></footer>
    </article>)}</div>}
    {channel && <button className="dn-channel" type="button" onClick={() => openNewsLink(channel)}><span className="dn-channelCopy"><strong>{isEn ? 'Take Da Nang with you' : 'Дананг всегда рядом'}</strong><span>{isEn ? 'Your Vietnam on Telegram' : '«Твой Вьетнам» в Telegram'}</span></span><span className="dn-subscribe">{isEn ? 'Follow' : 'Подписаться'}</span></button>}
  </div>;
}
