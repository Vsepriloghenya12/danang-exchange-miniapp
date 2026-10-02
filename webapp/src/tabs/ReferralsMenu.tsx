import React, { useEffect, useRef, useState } from "react";
import { referralApi, cashcoin, bonusEntryAmount, type MyReferrals } from "../lib/referrals";
import { getTg } from "../lib/telegram";
import "./referrals.css";

export default function ReferralsMenu({ initData, isEn, onClose }: { initData: string; isEn: boolean; onClose: () => void }) {
  const [data, setData] = useState<MyReferrals | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState<"invite" | "balance" | "history">("invite");
  const [copied, setCopied] = useState(false);
  const [retry, setRetry] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const demo = initData === "demo";
  useEffect(() => {
    let live = true;
    setError("");
    if (demo) setData({ link: null, balanceCents: 0, earnedCents: 0, paidCents: 0, invitedCount: 0, completedCount: 0, history: [], referred: false, rewarded: false });
    else referralApi<MyReferrals>(initData, "/referrals").then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [initData, demo, retry]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const buttons = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [onClose]);
  function share() {
    if (!data?.link) return;
    const message = isEn ? "Join Cash A Lot and earn bonuses!" : "Присоединяйся к Cash A Lot и получай бонусы!";
    const url = `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(message)}`;
    const tg = getTg();
    if (tg?.openTelegramLink) tg.openTelegramLink(url); else window.open(url, "_blank", "noopener,noreferrer");
  }
  async function copy() {
    if (!data?.link) return;
    try { await navigator.clipboard.writeText(data.link); setCopied(true); }
    catch { setError(isEn ? "Copy the link from the field below." : "Скопируйте ссылку из поля ниже."); }
  }
  return <div className="rf-overlay" onClick={onClose}>
    <div className="rf-panel" role="dialog" aria-modal="true" aria-labelledby="rf-title" tabIndex={-1} ref={panel} onClick={e => e.stopPropagation()}>
      <div className="rf-heading"><h2 id="rf-title">{isEn ? "Friends & bonuses" : "Друзья и бонусы"}</h2><button className="cx-chip" onClick={onClose} aria-label={isEn ? "Close" : "Закрыть"}>×</button></div>
      <nav className="rf-tabs" aria-label={isEn ? "Referral menu" : "Реферальная программа"}>
        {([["invite", isEn ? "Invite a friend" : "Пригласить друга"], ["balance", isEn ? "Bonus account" : "Бонусный счёт"], ["history", isEn ? "History" : "История"]] as const).map(([key, title]) => <button key={key} aria-current={page === key ? "page" : undefined} onClick={() => setPage(key)}>{title}</button>)}
      </nav>
      {error && <p role="alert">{error} <button className="btn" onClick={() => setRetry(v => v + 1)}>{isEn ? "Retry" : "Повторить"}</button></p>}
      {!data && !error && <p role="status">{isEn ? "Loading…" : "Загружаем…"}</p>}
      {data && <>
        {demo && <p className="rf-muted">{isEn ? "Preview. Open the app in Telegram for your personal link." : "Предпросмотр. Для личной ссылки откройте приложение в Telegram."}</p>}
        {data.referralRejected && <p>{isEn ? "This invitation exceeded the daily limit. A welcome bonus is not available." : "Для этого приглашения превышен дневной лимит. Приветственный бонус недоступен."}</p>}
        {page === "invite" && <>
          <div className="cl-referralOffers">
          <div className="rf-offer"><span>{isEn ? "For your friend" : "Другу"}</span><strong>+0,5%</strong><p>{isEn ? "Added to the amount they receive in their first exchange" : "К сумме, которую он получает в первом обмене"}</p></div>
          <div className="rf-offer rf-offer-secondary"><span>{isEn ? "For you" : "Вам"}</span><strong>0,5%</strong><p>{isEn ? "Of the amount your friend receives in their first exchange, in bonuses" : "От суммы, полученной другом в первом обмене, в бонусах"}</p></div>
          </div>
          <button className="rf-share" disabled={!data.link} onClick={share}><svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true"><path d="m21 3-7 18-4-7-7-4L21 3Zm0 0L10 14" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg>{isEn ? "Share in Telegram" : "Пригласить друга в Telegram"}</button>
          {data.link && <div className="rf-link"><input aria-label={isEn ? "Your invitation link" : "Ваша ссылка приглашения"} readOnly value={data.link} onFocus={e => e.currentTarget.select()} /><button className="btn" onClick={copy}>{copied ? (isEn ? "Copied" : "Скопировано") : (isEn ? "Copy" : "Копировать")}</button></div>}
          {!data.link && !demo && <p>{isEn ? "The bot link is unavailable. Please try again later." : "Ссылка бота пока недоступна. Попробуйте обновить страницу позже."}</p>}
          <p className="rf-muted">{isEn ? "For new clients only. Your friend gets the extra amount in their first exchange. Your bonuses are credited after the manager confirms completion. 1 bonus = 1 RUB; conversions use the exchange office’s daily rates. Up to 20 invitations per day (UTC)." : "Для новых клиентов. Друг получает прибавку в первом обмене, а вы — бонусы после подтверждения сделки. 1 бонус = 1 ₽. Пересчёт по курсам обменника на день заявки. До 20 приглашений в сутки (UTC)."}</p>
        </>}
        {page === "balance" && <>
          {!!data.legacyUsdCents && <p role="status">{isEn ? `Previous bonuses: ${(data.legacyUsdCents / 100).toFixed(2)} USD. They will convert to bonuses when today’s exchange rate is set.` : `Старые бонусы: ${(data.legacyUsdCents / 100).toFixed(2)} USD. Пересчитаются в бонусы после заполнения курса на сегодня.`}</p>}
          <div className="rf-offer"><span>{isEn ? "Available" : "Доступно"}</span><strong>{cashcoin(data.availableCents ?? data.balanceCents, isEn)}</strong><p>{isEn ? "Bonus account" : "Бонусный счёт"}</p></div>
          <dl className="rf-stats"><div><dt>{isEn ? "Invited" : "Приглашено"}</dt><dd>{data.invitedCount}</dd></div><div><dt>{isEn ? "Completed first exchange" : "Совершили первый обмен"}</dt><dd>{data.completedCount}</dd></div><div><dt>{isEn ? "Earned" : "Начислено"}</dt><dd>{cashcoin(data.earnedCents, isEn)}</dd></div><div><dt>{isEn ? "Received" : "Выдано"}</dt><dd>{cashcoin(data.paidCents, isEn)}</dd></div></dl>
          {!!data.reservedCents && <p>{isEn ? "Reserved in requests: " : "В заявках: "}{cashcoin(data.reservedCents, isEn)}</p>}
          {data.referred && !data.rewarded && <p>{isEn ? "You receive an extra 0.5% in your first exchange." : "В первом обмене к сумме получения добавится 0,5%."}</p>}
          <p className="rf-muted">{isEn ? "Use bonuses with the button next to the comment field. Bonuses reserved for an active request become available again if it is canceled." : "Списывайте бонусы кнопкой рядом с комментарием к обмену. Бонусы в активной заявке резервируются; при отмене они снова доступны."}</p>
        </>}
        {page === "history" && (data.history.length ? <ul className="rf-history">{data.history.map(e => <li key={e.id}><div><b>{e.kind === "welcome" ? (isEn ? "First exchange bonus" : "Бонус за первый обмен") : e.kind === "referrer" ? (isEn ? "Friend’s first exchange" : "Первый обмен друга") : e.kind === "test_credit" ? (isEn ? "Test credit" : "Тестовое начисление") : e.kind === "redemption" ? (isEn ? "Used in exchange" : "Использованы в обмене") : (isEn ? "Bonus payout" : "Выдача бонусов")}</b><small>{new Date(e.created_at).toLocaleString(isEn ? "en-GB" : "ru-RU")}{e.request_id ? ` · #${e.request_id.slice(-6)}` : ""}</small></div><strong>{e.cents > 0 ? "+" : ""}{bonusEntryAmount(e, isEn)}</strong></li>)}</ul> : <div className="rf-empty"><h3>{isEn ? "Your invitation history will appear here" : "Здесь отобразится история ваших приглашений"}</h3><p>{isEn ? "Invite a friend. Their first completed exchange will appear here." : "Пригласите друга. Когда он завершит первый обмен, здесь появится начисление."}</p></div>)}
      </>}
    </div>
  </div>;
}
