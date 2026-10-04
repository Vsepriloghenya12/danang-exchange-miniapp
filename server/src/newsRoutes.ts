import type express from 'express';
import { randomUUID } from 'node:crypto';
import { readStore, mutateStore } from './store.js';
import { NEWS_SOURCES, NEWS_CATEGORIES, newsState, visibleNews, syncNews, plainText, safeNewsUrl, type NewsPost } from './news.js';
import { telegramRequest } from './telegramExperience.js';
import { parsePublishChatId } from './publish.js';

export function registerNewsRoutes(router: express.Router, owner: (req: express.Request) => Promise<boolean>, token: string) {
  router.get('/news', async (_req, res) => {
    try {
      const n = newsState(await readStore());
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ ok: true, posts: visibleNews(n).slice(0, 100).map(({ delivery, hidden, ...p }) => p), channelUrl: n.channel?.url || null, checkedAt: n.checkedAt || null });
    } catch { res.status(503).json({ ok: false, error: 'Лента временно недоступна. Попробуйте ещё раз.' }); }
  });
  const guarded = (handler: express.RequestHandler): express.RequestHandler => async (req, res, next) => {
    try { if (!await owner(req)) { res.status(403).json({ ok: false, error: 'Доступно только владельцу.' }); return; } }
    catch { res.status(401).json({ ok: false, error: 'Войдите в страницу владельца.' }); return; }
    try { await handler(req, res, next); }
    catch { res.status(500).json({ ok: false, error: 'Не удалось сохранить изменения. Попробуйте ещё раз.' }); }
  };
  router.get('/admin/news', guarded(async (_req, res) => {
    const n = newsState(await readStore());
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...n, lease: undefined, sourcesCatalog: NEWS_SOURCES });
  }));
  router.post('/admin/news/settings', guarded(async (req, res) => {
    const { enabled, sources } = req.body || {};
    if (typeof enabled !== 'boolean' || !Array.isArray(sources) || sources.some(id => !NEWS_SOURCES.some(s => s.id === id))) { res.status(400).json({ ok: false, error: 'Проверьте настройки источников.' }); return; }
    await mutateStore(s => { const n = newsState(s); n.enabled = enabled; n.sources = [...new Set(sources)] as string[]; });
    res.json({ ok: true });
  }));
  router.post('/admin/news/refresh', guarded(async (_req, res) => { await syncNews(token); res.json({ ok: true }); }));
  router.post('/admin/news/channel', guarded(async (req, res) => {
    if (req.body?.disconnect === true) { await mutateStore(s => { delete newsState(s).channel; }); res.json({ ok: true }); return; }
    const id = parsePublishChatId(req.body?.channel);
    if (!id) { res.status(400).json({ ok: false, error: 'Укажите @имя или ID новостного канала.' }); return; }
    try {
      const me = await telegramRequest(token, 'getMe', {});
      const chat = await telegramRequest(token, 'getChat', { chat_id: id });
      const membership = await telegramRequest(token, 'getChatMember', { chat_id: chat.id, user_id: me.id });
      if (chat.type !== 'channel' || membership.status !== 'administrator' || !membership.can_post_messages) throw new Error('channel_rights');
      await mutateStore(s => {
        const n = newsState(s);
        n.channel = { id: chat.id, title: plainText(chat.title), url: chat.username ? `https://t.me/${chat.username}` : undefined,
          connectedAt: n.channel && n.channel.id === chat.id ? n.channel.connectedAt : new Date().toISOString() };
      });
      res.json({ ok: true });
    } catch { res.status(400).json({ ok: false, error: 'Канал не найден или у тестового бота нет права публикации. Добавьте бота администратором канала с правом отправлять сообщения.' }); }
  }));
  router.post('/admin/news/post', guarded(async (req, res) => {
    const b = req.body || {}; const title = plainText(b.title); const summary = plainText(b.summary);
    const category = NEWS_CATEGORIES.find(c => c === b.category); const url = b.url ? safeNewsUrl(String(b.url)) : '';
    const mapUrl = b.mapUrl ? safeNewsUrl(String(b.mapUrl)) : '';
    const expiry = b.expiresAt ? Date.parse(b.expiresAt) : NaN;
    if (title.length < 5 || title.length > 160 || summary.length > 1600 || !category || b.url && !url || b.mapUrl && !mapUrl || b.expiresAt && (!Number.isFinite(expiry) || expiry <= Date.now()) || category === 'offers' && !Number.isFinite(expiry)) {
      res.status(400).json({ ok: false, error: 'Нужны заголовок (5–160 символов), рубрика и корректные ссылки HTTPS. Для акции укажите будущую дату окончания. Текст — до 1600 символов.' }); return;
    }
    const now = new Date().toISOString();
    const post: NewsPost = { id: randomUUID(), title, summary, category, source: 'Cash A Lot', sourceId: 'editorial', language: 'ru', url, mapUrl, hidden: false, publishedAt: now, addedAt: now,
      ...(Number.isFinite(expiry) ? { expiresAt: new Date(expiry).toISOString() } : {}) };
    await mutateStore(s => { newsState(s).posts.unshift(post); });
    res.json({ ok: true, id: post.id });
  }));
  router.post('/admin/news/visibility', guarded(async (req, res) => {
    if (typeof req.body?.id !== 'string' || typeof req.body?.hidden !== 'boolean') { res.status(400).json({ ok: false, error: 'Выберите публикацию.' }); return; }
    const { result } = await mutateStore(s => { const p = newsState(s).posts.find(p => p.id === req.body.id); if (!p) return false; p.hidden = req.body.hidden; return true; });
    res.status(result ? 200 : 404).json({ ok: result, ...(!result ? { error: 'Публикация не найдена.' } : {}) });
  }));
}
