import type express from 'express';
import { randomUUID } from 'node:crypto';
import { readStore, mutateStore } from './store.js';
import { NEWS_SOURCES, NEWS_CATEGORIES, newsState, visibleNews, publicNewsPost, syncNews, plainText, safeNewsUrl, type NewsPost } from './news.js';
import { telegramRequest } from './telegramExperience.js';
import { parsePublishChatId } from './publish.js';
import { fetchPublicTelegramPage, publicTelegramUsername } from './newsPublicTelegram.js';

export function registerNewsRoutes(router: express.Router, owner: (req: express.Request) => Promise<boolean>, token: string) {
  router.get('/news', async (_req, res) => {
    try {
      const n = newsState(await readStore());
      res.setHeader('Cache-Control', 'public, max-age=30');
      res.json({ ok: true, posts: visibleNews(n).slice(0, 100).map(publicNewsPost), channelUrl: n.channel?.url || null, checkedAt: n.checkedAt || null });
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
  router.post('/admin/news/public-telegram-source', guarded(async (req, res) => {
    if (req.body?.remove === true) {
      if (typeof req.body.id !== 'string') { res.status(400).json({ ok: false, error: 'Выберите источник.' }); return; }
      await mutateStore(s => { const n = newsState(s); n.publicTelegramSources = (n.publicTelegramSources || []).filter(x => x.id !== req.body.id); });
      res.json({ ok: true }); return;
    }
    const username = publicTelegramUsername(req.body?.channel);
    if (!username) { res.status(400).json({ ok: false, error: 'Нужна ссылка https://t.me/имя_канала или @имя. Закрытые каналы не поддерживаются.' }); return; }
    const current = newsState(await readStore());
    if (current.channel?.url?.toLowerCase() === `https://t.me/${username}` || current.telegramSources?.some(x => x.username?.toLowerCase() === username)) {
      res.status(400).json({ ok: false, error: 'Канал уже подключён через бота или используется для публикации.' }); return;
    }
    if (current.publicTelegramSources?.some(x => x.username === username)) { res.json({ ok: true }); return; }
    if ((current.publicTelegramSources?.length || 0) >= 10) { res.status(400).json({ ok: false, error: 'Можно подключить до 10 публичных каналов.' }); return; }
    try {
      const page = await fetchPublicTelegramPage(username);
      const { result } = await mutateStore(s => {
        const n = newsState(s); const sources = n.publicTelegramSources ||= [];
        if (n.channel?.url?.toLowerCase() === `https://t.me/${username}` || n.telegramSources?.some(x => x.username?.toLowerCase() === username)) return false;
        if (sources.some(x => x.username === username)) return true;
        if (sources.length >= 10) return false;
        const connectedAt = new Date().toISOString();
        sources.push({ id: randomUUID(), username, title: page.title, connectedAt, lastCheckedAt: connectedAt, lastMessageId: Math.max(0, ...page.ids) });
        return true;
      });
      res.status(result ? 200 : 400).json({ ok: result, ...(!result ? { error: 'Источник уже занят или достигнут лимит каналов.' } : {}) });
    } catch (e) { res.status(400).json({ ok: false, error: e instanceof Error ? e.message : 'Открытая лента недоступна.' }); }
  }));
  router.post('/admin/news/telegram-source', guarded(async (req, res) => {
    if (req.body?.remove === true && Number.isSafeInteger(req.body?.id)) {
      await mutateStore(s => { const n = newsState(s); n.telegramSources = (n.telegramSources || []).filter(x => x.id !== req.body.id); });
      res.json({ ok: true }); return;
    }
    const raw = String(req.body?.channel || '').trim().replace(/^https:\/\/t\.me\/([\w]+)\/?$/, '@$1');
    const id = parsePublishChatId(raw);
    if (!id) { res.status(400).json({ ok: false, error: 'Укажите @имя, ссылку t.me или ID канала.' }); return; }
    try {
      const me = await telegramRequest(token, 'getMe', {});
      const chat = await telegramRequest(token, 'getChat', { chat_id: id });
      const member = await telegramRequest(token, 'getChatMember', { chat_id: chat.id, user_id: me.id });
      if (chat.type !== 'channel' || !['administrator', 'member', 'creator'].includes(member.status) || chat.has_protected_content) throw Error('access');
      const { result } = await mutateStore(s => {
        const n = newsState(s); const sources = n.telegramSources ||= [];
        if (n.publicTelegramSources?.some(x => x.username === chat.username?.toLowerCase())) return false;
        if (String(n.channel?.id) === String(chat.id) || sources.length >= 20 && !sources.some(x => x.id === chat.id)) return false;
        if (!sources.some(x => x.id === chat.id)) sources.push({ id: chat.id, title: plainText(chat.title), username: chat.username, connectedAt: new Date().toISOString() });
        return true;
      });
      if (!result) { res.status(400).json({ ok: false, error: 'Канал публикации нельзя добавить как источник. Лимит — 20 источников.' }); return; }
      res.json({ ok: true });
    } catch { res.status(400).json({ ok: false, error: 'Добавьте бота приложения в канал-источник. Нужен доступ к сообщениям, канал без запрета копирования.' }); }
  }));
  router.post('/admin/news/channel', guarded(async (req, res) => {
    if (req.body?.disconnect === true) { await mutateStore(s => { delete newsState(s).channel; }); res.json({ ok: true }); return; }
    const id = parsePublishChatId(req.body?.channel);
    if (!id) { res.status(400).json({ ok: false, error: 'Укажите @имя или ID новостного канала.' }); return; }
    try {
      const me = await telegramRequest(token, 'getMe', {});
      const chat = await telegramRequest(token, 'getChat', { chat_id: id });
      const membership = await telegramRequest(token, 'getChatMember', { chat_id: chat.id, user_id: me.id });
      if (chat.type !== 'channel' || membership.status !== 'administrator' || !membership.can_post_messages) throw new Error('channel_rights');
      if (newsState(await readStore()).telegramSources?.some(s => s.id === chat.id)) { res.status(400).json({ ok: false, error: 'Сначала отключите этот канал от источников.' }); return; }
      if (newsState(await readStore()).publicTelegramSources?.some(s => s.username === chat.username?.toLowerCase())) { res.status(400).json({ ok: false, error: 'Сначала отключите этот канал от публичных источников.' }); return; }
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
