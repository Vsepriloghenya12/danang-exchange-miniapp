import { createHash } from 'node:crypto';
import { mutateStore } from './store.js';
import { DAY, newsCategory, newsState, duplicateNews, plainText, type NewsPost } from './news.js';

type ChannelPost = { chat: { id: number; type: string }; message_id: number; date: number; text?: string; caption?: string; has_protected_content?: boolean };
// Only explicitly connected editorial channels are accepted. No private chats or destination echoes.
export async function ingestTelegramNews(message: ChannelPost, now = new Date()): Promise<boolean> {
  if (message.chat.type !== 'channel') return false;
  const { result } = await mutateStore(store => {
    const state = newsState(store);
    const source = state.telegramSources?.find(s => s.id === message.chat.id);
    if (!source || String(state.channel?.id) === String(message.chat.id)) return false;
    const date = message.date * 1000;
    if (!state.enabled || message.has_protected_content || !Number.isFinite(date) || date < Date.parse(source.connectedAt) || date < +now - DAY || date > +now + 300000) return true;
    const text = String(message.text || message.caption || '').trim();
    if (!text || text.startsWith('/')) return true;
    const lines = text.split(/\r?\n/).map(plainText).filter(Boolean);
    const first = lines.shift() || '';
    if (first.length < 5) return true;
    const title = first.length <= 160 ? first : first.slice(0, 157) + '…';
    const summary = (first.length > 160 ? [first, ...lines] : lines).join('\n\n').slice(0, 1600);
    const post: NewsPost = {
      id: createHash('sha256').update(`telegram:${message.chat.id}:${message.message_id}`).digest('hex').slice(0, 24),
      title, summary, category: newsCategory(text), source: source.title, sourceId: `telegram:${source.id}`, sourceKind: 'telegram',
      url: source.username ? `https://t.me/${source.username}/${message.message_id}` : '', language: 'ru',
      publishedAt: new Date(date).toISOString(), addedAt: now.toISOString(), hidden: false,
    };
    source.lastReceivedAt = now.toISOString();
    if (!state.posts.some(p => duplicateNews(p, post))) state.posts.push(post);
    state.posts = state.posts.filter(p => Date.parse(p.addedAt) > +now - 90 * DAY).sort((a,b) => b.addedAt.localeCompare(a.addedAt)).slice(0,500);
    return true;
  });
  return result;
}
