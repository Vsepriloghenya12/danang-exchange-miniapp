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
    <div className="vx-atm">
      <div className="vx-atmHintBox">
        <div className="vx-atmHint">
          {isEn ? "You can withdraw cash from " : "Вы можете получить наличные в банкоматах "}
          <span className="vx-bankBrand vx-bankBrandVcb">VIETCOMBANK</span>
          {isEn ? " and " : " и "}
          <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>
          {isEn ? " in any city of Vietnam." : " в любом городе Вьетнама."}
        </div>
      </div>

      <div className="vx-sp14" />

      <div className="vx-atmBtnGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <button type="button" className={"btn vx-atmBtn " + (active === "vietcombank" ? "vx-btnOn" : "")} onClick={() => setActive((p) => (p === "vietcombank" ? null : "vietcombank"))}>
          {isEn ? "Video " : "Видео "}
          <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span>
        </button>
        <button type="button" className={"btn vx-atmBtn " + (active === "bidv" ? "vx-btnOn" : "")} onClick={() => setActive((p) => (p === "bidv" ? null : "bidv"))}>
          {isEn ? "Video " : "Видео "}
          <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>
        </button>
      </div>

      <div className="vx-sp14" />

      <button className="btn vx-atmFindBtn" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        {isEn ? "Find the nearest ATM on the map" : "Найти ближайший ко мне банкомат"}
      </button>

      <div className="vx-sp14" />

      <div className="vx-atmNote">
        {isEn ? "If you see a nearby " : "Если вы видите рядом с собой банкомат "}
        <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span>
        {isEn ? " or " : " или "}
        <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>
        {isEn ? ", which is not marked on our map, please send its location to our manager." : ", который не отмечен на нашей карте, пожалуйста, отправьте его локацию нашему менеджеру."}
      </div>

      <div className="vx-sp10" />

      <button className="btn vx-atmSuggestBtn" type="button" onClick={() => setSuggestOpen(true)}>
        {isEn ? "Add location" : "Добавить локацию"}
      </button>

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
