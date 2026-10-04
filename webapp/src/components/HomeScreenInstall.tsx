import React, { useEffect, useState } from 'react';
import { getTg } from '../lib/telegram';
import './home-screen-install.css';

export default function HomeScreenInstall({ isEn = false }: { isEn?: boolean }) {
  const [status, setStatus] = useState('checking');
  const [note, setNote] = useState('');
  useEffect(() => {
    const tg = getTg();
    if (!tg?.initData || !tg.isVersionAtLeast?.('8.0') || !tg.addToHomeScreen || !tg.checkHomeScreenStatus) { setStatus('unsupported'); return; }
    let active = true;
    const added = () => { if (active) { setStatus('added'); setNote(''); } };
    const checked = (next: string) => { if (active) setStatus(['added', 'missed', 'unknown', 'unsupported'].includes(next) ? next : 'unknown'); };
    const timer = window.setTimeout(() => checked('unknown'), 2500);
    try { tg.checkHomeScreenStatus(next => { clearTimeout(timer); checked(next); }); }
    catch { checked('unsupported'); }
    tg.onEvent?.('homeScreenAdded', added);
    return () => { active = false; clearTimeout(timer); tg.offEvent?.('homeScreenAdded', added); };
  }, []);
  const add = () => {
    try {
      getTg()?.addToHomeScreen?.();
      setNote(isEn ? 'Confirm adding the icon in Telegram. If no window appears, check your home screen.' : 'Подтвердите добавление значка в Telegram. Если окно не появилось, проверьте главный экран телефона.');
    } catch { setStatus('unsupported'); }
  };
  return <section className="cl-install" aria-label={isEn ? 'Home screen shortcut' : 'Ярлык приложения'}>
    <img src="/brand/telegram/app-icon-192.png" width="60" height="60" alt="" />
    <div><strong>Cash a Lot</strong><p>{isEn ? 'Your exchange, one tap away' : 'Ваш обмен — в одном нажатии'}</p></div>
    <button type="button" disabled={status === 'checking' || status === 'added' || status === 'unsupported'} onClick={add}>
      {status === 'added' ? (isEn ? 'Icon added' : 'Значок добавлен') : status === 'checking' ? (isEn ? 'Checking…' : 'Проверяем…') : (isEn ? 'Add to home screen' : 'На главный экран')}
    </button>
    {status === 'unsupported' && <small>{isEn ? 'Open in an up-to-date Telegram app on your phone. In a browser, use its “Add to home screen” menu if available.' : 'Откройте в обновлённом Telegram на телефоне. В браузере можно воспользоваться его меню «На главный экран», если оно доступно.'}</small>}
    {note && <small role="status">{note}</small>}
  </section>;
}
