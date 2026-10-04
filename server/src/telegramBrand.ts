import { readFile } from 'node:fs/promises';
import { readStore, mutateStore } from './store.js';
import { isTestBot, publicAppOrigin, telegramRequest } from './telegramExperience.js';

// Only the named test bot can receive these settings, even if this code is merged later.
export async function configureTestTelegram(token: string, username: string, webappUrl: string) {
  if (!isTestBot(username) || !publicAppOrigin(webappUrl)) return;
  const revision = 'telegram-brand-v2';
  const store = await readStore();
  if ((store.config as any).telegramBrandRevision === revision) return;
  try {
    await telegramRequest(token, 'setMyDescription', { description: 'Cash A Lot - сервис обмена валют во Вьетнаме.\n\nВыгодный курс, быстрый расчёт, программа лояльности.\n\nОплата e-visa и билетов, бронирование отелей.\n\nПриглашай друзей и получай бонусы!' });
    await telegramRequest(token, 'setMyShortDescription', { short_description: 'Cash a Lot · Обмен валют в Дананге. Курсы, обмен и бонусы. Тестовая версия.' });
    await telegramRequest(token, 'setMyCommands', { commands: [
      { command: 'start', description: 'Открыть обмен' }, { command: 'rates', description: 'Курсы в Дананге' },
      { command: 'bonus', description: 'Пригласить друга' }, { command: 'help', description: 'Как пользоваться ботом' },
    ] });
    await telegramRequest(token, 'setChatMenuButton', { menu_button: { type: 'web_app', text: 'Обменять', web_app: { url: webappUrl } } });
    const bytes = await readFile(new URL('../public/brand/telegram/app-icon.png', import.meta.url));
    const form = new FormData();
    form.set('photo', JSON.stringify({ type: 'static', photo: 'attach://photo_file' }));
    form.set('photo_file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'cashalot.png');
    await telegramRequest(token, 'setMyProfilePhoto', form);
    await mutateStore(s => { (s.config as any).telegramBrandRevision = revision; });
    console.log('Test bot branding configured. Inline mode and description picture are configured in BotFather.');
  } catch { console.error('Test bot branding setup incomplete; will retry on next restart.'); }
}
