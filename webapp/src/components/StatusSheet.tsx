import React, { useEffect, useRef, useState } from "react";
import type { UserStatus } from "../lib/types";
import { getUserStatusLabel } from "../domain/status";
import { loyaltyProgress, vndEquivalent } from "../domain/loyalty";
import { apiGetMyRequests, apiGetTodayRates } from "../lib/api";
import Sheet from "./Sheet";
import WhaleMark from "./WhaleMark";

const levels: UserStatus[] = ["standard", "silver", "gold"];
type Props = { status: UserStatus; lang: "ru" | "en"; user?: { id: number; username?: string }; initData: string; onClose: () => void };
function cleanName(value: string) { return value.trim().replace(/^@+/, "").replace(/\s+/g, " ").slice(0, 40); }
function readName(key: string | null) {
  try { return key ? cleanName(localStorage.getItem(key) || "") : ""; } catch { return ""; }
}
export default function StatusSheet({ status, lang, user, initData, onClose }: Props) {
  const isEn = lang === "en";
  const nameKey = user?.id ? "cashalot:card-name:" + user.id : null;
  const [savedName, setSavedName] = useState(() => readName(nameKey));
  const cardName = savedName || cleanName(user?.username || "") || (isEn ? "Our valued client" : "Наш любимый клиент");
  const nameButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  function finishEditing() { setEditing(false); nameButton.current?.focus({ preventScroll: true }); }
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState(false);
  const [volume, setVolume] = useState<{ total: number; partial: boolean } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => { setSavedName(readName(nameKey)); setEditing(false); }, [nameKey]);
  useEffect(() => {
    if (!initData) return;
    let alive = true;
    setLoadError(false);
    Promise.all([apiGetMyRequests(initData), apiGetTodayRates().catch(() => null)])
      .then(([response, today]) => {
        if (!response?.ok || !Array.isArray(response.requests)) throw new Error("history_unavailable");
        let total = 0, partial = false;
        for (const request of response.requests) {
          if (request.state !== "done") continue;
          const amount = vndEquivalent(request, today?.data?.rates);
          if (amount == null) partial = true;
          else total += amount;
        }
        if (alive) setVolume({ total, partial });
      })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [initData, retry]);
  const next = loyaltyProgress(volume?.total || 0, status);
  const money = (n: number) => {
    const text = new Intl.NumberFormat(isEn ? "en-US" : "ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
    return isEn ? text.replace(/,/g, " ") : text;
  };
  const description = (level: UserStatus) => level === "gold"
    ? (isEn ? "An even better exchange rate and free delivery" : "Ещё более выгодный курс и бесплатная доставка")
    : level === "silver" ? (isEn ? "An improved exchange rate" : "Улучшенный курс обмена")
    : (isEn ? "Standard exchange terms" : "Базовые условия обмена");
  function saveName(event: React.FormEvent) {
    event.preventDefault();
    const name = cleanName(draft);
    try {
      if (nameKey) { if (name) localStorage.setItem(nameKey, name); else localStorage.removeItem(nameKey); }
      setSavedName(name); setNameError(false); finishEditing();
    } catch { setNameError(true); }
  }
  return <Sheet title={isEn ? "Your status" : "Ваш статус"} closeLabel={isEn ? "Close" : "Закрыть"} onClose={onClose}>
    <div className={"cl-loyaltyCard is-" + status}>
      <div className="cl-cardTop"><div className="cl-cardBrand"><WhaleMark light={status === "standard"} /><span>Cash a Lot</span></div><span className="cl-cardType">{isEn ? "Club card" : "Клубная карта"}</span></div>
      <div className="cl-cardMiddle"><span className="cl-cardChip" aria-hidden="true"><i /><i /><i /></span><div className="cl-cardTier">{getUserStatusLabel(status, lang)}</div></div>
      <div className="cl-cardBottom"><span className="cl-cardNameLabel">{isEn ? "Cardholder" : "Владелец карты"}</span>
        <button type="button" className="cl-cardName" ref={nameButton} aria-label={(isEn ? "Edit card name: " : "Изменить имя на карте: ") + cardName} aria-expanded={editing} onClick={() => { setDraft(savedName || cleanName(user?.username || "")); setNameError(false); setEditing(true); }}><span>{cardName}</span></button>
      </div>
      <svg className="cl-cardWaves" viewBox="0 0 400 250" fill="none" aria-hidden="true"><path d="M190-30C160 50 380 45 295 155S350 280 445 235M210-30C180 50 400 45 315 155S370 280 465 235M230-30C200 50 420 45 335 155S390 280 485 235M250-30C220 50 440 45 355 155S410 280 505 235M270-30C240 50 460 45 375 155S430 280 525 235" /></svg>
    </div>
    {editing ? <form className="cl-cardEditor" onSubmit={saveName}>
      <label htmlFor="loyalty-card-name">{isEn ? "Name on your card" : "Имя на карте"}</label>
      <input id="loyalty-card-name" autoFocus maxLength={40} value={draft} placeholder={isEn ? "Our valued client" : "Наш любимый клиент"} onChange={event => { setDraft(event.target.value); setNameError(false); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finishEditing(); } }} autoComplete="off" />
      {nameError && <p role="alert">{isEn ? "Could not save the name. Please try again." : "Не удалось сохранить имя. Попробуйте ещё раз."}</p>}
      <div><button type="submit">{isEn ? "Save" : "Сохранить"}</button><button type="button" onClick={finishEditing}>{isEn ? "Cancel" : "Отмена"}</button></div>
    </form> : null}

    <section className="cl-loyaltyProgress" aria-label={isEn ? "Status progress" : "Прогресс статуса"}>
      {!initData ? <p>{isEn ? "Open the app in Telegram to see your progress." : "Откройте приложение в Telegram, чтобы увидеть прогресс."}</p>
        : loadError ? <div role="alert"><p>{isEn ? "Could not load your progress." : "Не удалось загрузить прогресс."}</p><button type="button" onClick={() => { setLoadError(false); setRetry(value => value + 1); }}>{isEn ? "Try again" : "Повторить"}</button></div>
        : !volume ? <p role="status">{isEn ? "Loading your progress…" : "Загружаем ваш прогресс…"}</p>
        : <>
          <div className="cl-progressHeading"><span>{next.nextStatus ? (isEn ? "Your next level" : "Следующий уровень") : (isEn ? "Your level" : "Ваш уровень")}</span><strong>{getUserStatusLabel(next.nextStatus || "gold", lang)}<span aria-hidden="true"> ✦</span></strong></div>
          <div className="cl-progressTrack" role="progressbar" aria-label={next.nextStatus ? (isEn ? "Progress to the next status" : "Прогресс до следующего статуса") : (isEn ? "Highest status reached" : "Достигнут высший статус")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(next.progress * 100)}><span style={{ width: next.progress * 100 + "%" }} /></div>
          <div className="cl-progressEndpoints"><span>{getUserStatusLabel(status, lang)}</span><span>{next.target ? money(next.target) + " ₫" : (isEn ? "Highest level" : "Высший уровень")}</span></div>
          <p className="cl-progressRemaining">{!next.nextStatus ? (isEn ? "Maximum status. Thank you for being with us!" : "Максимальный статус. Спасибо, что вы с нами!")
            : volume.partial ? (isEn ? "Some exchange rates are unavailable. Your progress is incomplete." : "Для части обменов нет курса. Прогресс пока неполный.")
            : next.remaining > 0 ? <>{isEn ? "Exchange another " : "Осталось обменять "}<strong>{money(next.remaining)} ₫</strong></>
            : (isEn ? "Threshold reached. Ask your manager about upgrading." : "Порог достигнут. Уточните повышение у менеджера.")}</p>
          <p className="cl-progressTotal">{isEn ? "Completed exchanges: " : "Завершённые обмены: "}{volume.partial ? "≥ " : ""}{money(volume.total)} ₫</p>
        </>}
    </section>
    <div className="cl-statusLevels">
      {levels.map(level => <div className={"cl-statusLevel is-" + level} key={level} aria-current={level === status ? "true" : undefined}>
        <span className="cl-statusMedal" aria-hidden="true">✦</span>
        <div><strong>{getUserStatusLabel(level, lang)}</strong><p>{description(level)}</p></div>
        {level === status && <span className="cl-statusCurrent">{isEn ? "Yours" : "Ваш"}</span>}
      </div>)}
    </div>
    <p className="cl-statusFootnote">{isEn ? "All app features are available at every level. Ask your manager about status upgrades." : "Все функции доступны на любом уровне. Условия повышения статуса можно уточнить у менеджера."}</p>
  </Sheet>;
}
