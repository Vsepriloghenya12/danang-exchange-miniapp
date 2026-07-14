import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiSuggestAtm } from "../lib/api";

type Lang = "ru" | "en";
type BankKey = "vietcombank" | "bidv";

const FIND_ATM_URL = "https://maps.app.goo.gl/i11t9GR7bMhwnmHfA?g_st=i";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AtmTab({ isActive = true, lang = "ru" }: { isActive?: boolean; lang?: Lang }) {
  const isEn = lang === "en";
  const [active, setActive] = useState<BankKey | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState("");
  const [sending, setSending] = useState(false);

  const tg = (window as any).Telegram?.WebApp;
  const initData = String(tg?.initData || "");

  const src = useMemo(() => {
    if (active === "vietcombank") return "/videos/vietcombank.mp4";
    if (active === "bidv") return "/videos/bidv.mp4";
    return "";
  }, [active]);

  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (isActive) return;
    const v = videoRef.current;
    if (!v) return;
    try {
      v.pause();
      v.currentTime = 0;
    } catch {}
  }, [isActive]);

  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (!v) return;
      try {
        v.pause();
        v.currentTime = 0;
      } catch {}
    };
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (suggestOpen || !!active) html.classList.add("mx-sheet-open");
    else html.classList.remove("mx-sheet-open");
    return () => html.classList.remove("mx-sheet-open");
  }, [suggestOpen, active]);

  async function submitSuggest() {
    const text = String(suggestText || "").trim();
    if (!text) return;
    if (!initData) {
      alert(isEn ? "No Telegram initData. Open the app inside Telegram." : "Нет Telegram initData. Откройте приложение внутри Telegram.");
      return;
    }

    setSending(true);
    try {
      const r: any = await apiSuggestAtm(initData, text);
      if (!r?.ok) throw new Error(r?.error || "send_failed");
      setSuggestOpen(false);
      setSuggestText("");
      if (tg?.showPopup) {
        tg.showPopup({
          title: isEn ? "Thanks!" : "Спасибо!",
          message: isEn ? "Location sent to the manager." : "Локация отправлена менеджеру.",
          buttons: [{ type: "ok" }],
        });
      } else {
        alert(isEn ? "Location sent to the manager." : "Локация отправлена менеджеру.");
      }
    } catch (e: any) {
      const msg = e?.message || (isEn ? "Failed to send" : "Не удалось отправить");
      if (tg?.showPopup) tg.showPopup({ title: isEn ? "Error" : "Ошибка", message: msg, buttons: [{ type: "ok" }] });
      else alert(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="vx-atm cx-atm">
      <div className="cx-card cx-atmInfo">
        <span className="cx-atmInfoIcon" aria-hidden="true">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <rect x="5" y="2.5" width="14" height="19" rx="2" />
            <path d="M8 6h8M8 10h8M9 21v-4h6v4" />
          </svg>
        </span>
        <div className="cx-atmInfoText">
          {isEn ? "Withdraw cash without commission from " : "Снимайте наличные без комиссии в банкоматах "}
          <b className="cx-bankVcb">Vietcombank</b>
          {isEn ? " and " : " и "}
          <b className="cx-bankBidv">BIDV</b>
          {isEn ? " ATMs across Vietnam." : " по всему Вьетнаму."}
        </div>
      </div>

      <div className="cx-sectionLabel">{isEn ? "Video guides" : "Видео-инструкции"}</div>

      <div className="cx-videoList">
        <button type="button" className="cx-videoCard" onClick={() => setActive((p) => (p === "vietcombank" ? null : "vietcombank"))}>
          <span className="cx-videoThumb is-vcb" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="cx-videoBody">
            <span className="cx-videoName">Vietcombank</span>
            <span className="cx-videoSub">{isEn ? "How to withdraw cash" : "Как снять наличные"}</span>
          </span>
          <span className="cx-videoTag">{isEn ? "video" : "видео"}</span>
        </button>
        <button type="button" className="cx-videoCard" onClick={() => setActive((p) => (p === "bidv" ? null : "bidv"))}>
          <span className="cx-videoThumb is-bidv" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="cx-videoBody">
            <span className="cx-videoName">BIDV</span>
            <span className="cx-videoSub">{isEn ? "How to withdraw cash" : "Как снять наличные"}</span>
          </span>
          <span className="cx-videoTag">{isEn ? "video" : "видео"}</span>
        </button>
      </div>

      <button className="cx-cta" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.6" />
        </svg>
        {isEn ? "Find on the map" : "Найти на карте"}
      </button>

      <div className="cx-suggestBox">
        <div className="cx-suggestText">
          {isEn
            ? "Found a Vietcombank or BIDV ATM that is not on the map?"
            : "Нашли банкомат Vietcombank или BIDV, которого нет на карте?"}
        </div>
        <button className="cx-suggestBtn" type="button" onClick={() => setSuggestOpen(true)}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {isEn ? "Suggest a location" : "Предложить точку"}
        </button>
      </div>

      {active ? (
        <div className="vx-modalOverlay" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className="vx-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="vx-modalTitle">
              {active === "vietcombank" ? (
                <>
                  {isEn ? "Video instruction for " : "Видео инструкция для "}
                  <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span>
                </>
              ) : (
                <>
                  {isEn ? "Video instruction for " : "Видео инструкция для "}
                  <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>
                </>
              )}
            </div>
            <div className="vx-sp12" />
            <video ref={videoRef} className="vx-atmVideo" controls playsInline preload="metadata" autoPlay muted src={src} />
            <div className="vx-sp12" />
            <button className="btn vx-btnSm" type="button" onClick={() => setActive(null)}>
              {isEn ? "Close video" : "Закрыть видео"}
            </button>
          </div>
        </div>
      ) : null}

      {suggestOpen ? (
        <div className="vx-modalOverlay" role="dialog" aria-modal="true">
          <div className="vx-modalCard">
            <div className="vx-modalTitle">{isEn ? "New ATM" : "Новый банкомат"}</div>
            <div className="vx-modalSub">{isEn ? "Paste the address or a Google Maps link" : "Вставьте адрес или ссылку на Google Maps"}</div>
            <div className="vx-sp10" />
            <textarea className="input" style={{ width: "100%", minHeight: 88 }} value={suggestText} onChange={(e) => setSuggestText(e.target.value)} placeholder={isEn ? "For example: https://maps.app.goo.gl/... or address" : "Например: https://maps.app.goo.gl/... или адрес"} />
            <div className="vx-sp10" />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (sending) return;
                  setSuggestOpen(false);
                }}
              >
                {isEn ? "Cancel" : "Отмена"}
              </button>
              <button type="button" className="btn vx-btnOn" disabled={sending || !String(suggestText || "").trim()} onClick={submitSuggest}>
                {sending ? (isEn ? "Sending…" : "Отправка…") : (isEn ? "Send" : "Отправить")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
