import { createHash } from 'node:crypto';
import { mutateStore } from './store.js';
import { DAY, newsCategory, newsState, duplicateNews, plainText, type NewsPost } from './news.js';
import type { NewsMedia } from './newsMedia.js';

type File = { file_id: string; file_size?: number; width?: number; height?: number };
type ChannelPost = { chat: { id: number; type: string }; message_id: number; date: number; text?: string; caption?: string; has_protected_content?: boolean; photo?: File[]; video?: File & { thumbnail?: File }; media_group_id?: string };
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
    const photo = message.photo?.at(-1);
    const media: NewsMedia[] = message.video ? [{ kind: 'video', messageId: message.message_id, fileId: message.video.file_id, posterFileId: message.video.thumbnail?.file_id, size: message.video.file_size }] : photo ? [{ kind: 'photo', messageId: message.message_id, fileId: photo.file_id, size: photo.file_size }] : [];
    if ((!text && !media.length) || text.startsWith('/')) return true;
    const lines = text.split(/\r?\n/).map(plainText).filter(Boolean);
    const first = lines.shift() || (message.video ? 'Видео из Дананга' : 'Фото из Дананга');
    if (first.length < 5 && !media.length) return true;
    const title = first.length <= 160 ? first : first.slice(0, 157) + '…';
    const summary = (first.length > 160 ? [first, ...lines] : lines).join('\n\n').slice(0, 1600);
    const post: NewsPost = {
      id: createHash('sha256').update(`telegram:${message.chat.id}:${message.media_group_id ? `album:${message.media_group_id}` : message.message_id}`).digest('hex').slice(0, 24),
      title, summary, category: newsCategory(text), source: source.title, sourceId: `telegram:${source.id}`, sourceKind: 'telegram',
      url: source.username ? `https://t.me/${source.username}/${message.message_id}` : '', language: 'ru',
      publishedAt: new Date(date).toISOString(), addedAt: now.toISOString(), hidden: false, media, mediaHasCaption: Boolean(text), ...(message.media_group_id ? { mediaUpdatedAt: now.toISOString() } : {}),
    };
    source.lastReceivedAt = now.toISOString();
    const existing = state.posts.find(p => p.id === post.id);
    if (existing && message.media_group_id && !existing.delivery) {
      const previous = existing.media || [];
      if (!previous.some(m => m.messageId === message.message_id)) {
        existing.media = [...previous, ...media].sort((a,b) => a.messageId - b.messageId).slice(0,10);
        existing.mediaUpdatedAt = now.toISOString();
        if (previous.length + media.length > 10) existing.mediaWarning = 'Альбом содержит больше 10 вложений.';
      }
      if (text && !existing.mediaHasCaption) { existing.title = title; existing.summary = summary; existing.category = post.category; existing.mediaHasCaption = true; }
    } else if (!state.posts.some(p => duplicateNews(p, post))) state.posts.push(post);
    state.posts = state.posts.filter(p => Date.parse(p.addedAt) > +now - 90 * DAY).sort((a,b) => b.addedAt.localeCompare(a.addedAt)).slice(0,500);
    return true;
  });
  return result;
}
