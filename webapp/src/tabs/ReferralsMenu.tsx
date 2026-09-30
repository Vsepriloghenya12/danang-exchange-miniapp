import React, { useEffect, useRef, useState } from "react";
import { referralApi, usd, type MyReferrals } from "../lib/referrals";
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
    const message = isEn ? "Join Cash a Lot! Get a bonus worth 50,000 VND after your first completed exchange." : "Приглашаю в Cash a Lot! Получи бонус на сумму 50 000 VND после первого завершённого обмена.";
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
          <div className="rf-offer"><span>{isEn ? "For your friend" : "Другу"}</span><strong>50 000 VND</strong><p>{isEn ? "Credited in USD after their first exchange" : "В USD на бонусный счёт после первого обмена"}</p></div>
          <div className="rf-offer rf-offer-secondary"><span>{isEn ? "For you" : "Вам"}</span><strong>0,5%</strong><p>{isEn ? "Of the amount your friend exchanges for the first time" : "От суммы первого обмена друга"}</p></div>
          <button className="btn rf-share" disabled={!data.link} onClick={share}>{isEn ? "Share in Telegram" : "Пригласить друга в Telegram"}</button>
          {data.link && <div className="rf-link"><input aria-label={isEn ? "Your invitation link" : "Ваша ссылка приглашения"} readOnly value={data.link} onFocus={e => e.currentTarget.select()} /><button className="btn" onClick={copy}>{copied ? (isEn ? "Copied" : "Скопировано") : (isEn ? "Copy" : "Копировать")}</button></div>}
          {!data.link && !demo && <p>{isEn ? "The bot link is unavailable. Please try again later." : "Ссылка бота пока недоступна. Попробуйте обновить страницу позже."}</p>}
          <p className="rf-muted">{isEn ? "For new clients only. Bonuses are credited once, after the manager confirms the completed exchange and receipt of funds. Up to 20 new invitations per day (UTC)." : "Для новых клиентов. Бонусы начисляются один раз, когда менеджер подтвердит завершение обмена и получение денег. До 20 новых приглашений в сутки (UTC)."}</p>
        </>}
        {page === "balance" && <>
          <div className="rf-offer"><span>{isEn ? "Available" : "Доступно"}</span><strong>{usd(data.balanceCents)}</strong><p>{isEn ? "Bonus account" : "Бонусный счёт"}</p></div>
          <dl className="rf-stats"><div><dt>{isEn ? "Invited" : "Приглашено"}</dt><dd>{data.invitedCount}</dd></div><div><dt>{isEn ? "Completed first exchange" : "Совершили первый обмен"}</dt><dd>{data.completedCount}</dd></div><div><dt>{isEn ? "Earned" : "Начислено"}</dt><dd>{usd(data.earnedCents)}</dd></div><div><dt>{isEn ? "Received" : "Выдано"}</dt><dd>{usd(data.paidCents)}</dd></div></dl>
          {data.referred && !data.rewarded && <p>{isEn ? "Your welcome bonus is waiting for your first completed exchange." : "Ваш приветственный бонус ждёт первого завершённого обмена."}</p>}
          <p className="rf-muted">{isEn ? "Contact your manager to use your bonuses. They will agree on the payout currency and conversion with you." : "Чтобы использовать бонусы, обратитесь к менеджеру. Он согласует с вами валюту и пересчёт при выдаче."}</p>
        </>}
        {page === "history" && (data.history.length ? <ul className="rf-history">{data.history.map(e => <li key={e.id}><div><b>{e.kind === "welcome" ? (isEn ? "First exchange bonus" : "Бонус за первый обмен") : e.kind === "referrer" ? (isEn ? "Friend’s first exchange" : "Первый обмен друга") : (isEn ? "Bonus payout" : "Выдача бонусов")}</b><small>{new Date(e.created_at).toLocaleString(isEn ? "en-GB" : "ru-RU")}{e.request_id ? ` · #${e.request_id.slice(-6)}` : ""}</small></div><strong>{e.cents > 0 ? "+" : ""}{usd(e.cents)}</strong></li>)}</ul> : <div className="rf-empty"><h3>{isEn ? "No transactions yet" : "Здесь появятся ваши бонусы"}</h3><p>{isEn ? "Invite a friend. Their first completed exchange will appear here." : "Пригласите друга. Когда он завершит первый обмен, здесь появится начисление."}</p></div>)}
      </>}
    </div>
  </div>;
}
