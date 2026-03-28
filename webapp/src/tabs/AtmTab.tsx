import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiSuggestAtm } from "../lib/api";

type Lang = "ru" | "en";
const FIND_ATM_URL = "https://maps.app.goo.gl/i11t9GR7bMhwnmHfA?g_st=i";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

type BankKey = "vietcombank" | "bidv";

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
      alert(isEn ? "No Telegram initData — open the app inside Telegram." : "Нет Telegram initData — откройте приложение внутри Telegram.");
      return;
    }

    setSending(true);
    try {
      const r: any = await apiSuggestAtm(initData, text);
      if (!r?.ok) throw new Error(r?.error || "send_failed");
      setSuggestOpen(false);
      setSuggestText("");
      if (tg?.showPopup) tg.showPopup({ title: isEn ? "Thanks!" : "Спасибо!", message: isEn ? "Location sent to the manager." : "Локация отправлена менеджеру.", buttons: [{ type: "ok" }] });
      else alert(isEn ? "Location sent to the manager." : "Локация отправлена менеджеру.");
    } catch (e: any) {
      const msg = e?.message || (isEn ? "Failed to send" : "Не удалось отправить");
      if (tg?.showPopup) tg.showPopup({ title: isEn ? "Error" : "Ошибка", message: msg, buttons: [{ type: "ok" }] });
      else alert(msg);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mx-btnRow" style={{ marginBottom: 10 }}>
        <button type="button" className="mx-btn" onClick={() => openLink(FIND_ATM_URL)}>{isEn ? "Find ATM on map" : "Найти банкомат на карте"}</button>
        <button type="button" className="mx-btn mx-btnPrimary" onClick={() => setSuggestOpen(true)}>{isEn ? "Suggest location" : "Предложить локацию"}</button>
      </div>

      <div className="mx-btnRow" style={{ marginBottom: 10 }}>
        <button type="button" className="mx-btn" onClick={() => setActive("vietcombank")}>VIETCOMBANK</button>
        <button type="button" className="mx-btn" onClick={() => setActive("bidv")}>BIDV</button>
      </div>

      {active ? (
        <div className="card" style={{ padding: 12 }}>
          <video ref={videoRef} src={src} controls playsInline autoPlay muted style={{ width: "100%", borderRadius: 12 }} />
          <div className="small" style={{ marginTop: 8, opacity: 0.86 }}>{isEn ? "Video instruction" : "Видео-инструкция"}</div>
        </div>
      ) : null}

      {suggestOpen ? (
        <div className="vx-modalOverlay" onClick={() => setSuggestOpen(false)}>
          <div className="vx-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="vx-modalTitle">{isEn ? "Suggest ATM location" : "Предложить локацию банкомата"}</div>
            <div className="vx-sp12" />
            <textarea className="input vx-in" rows={4} placeholder={isEn ? "For example: https://maps.app.goo.gl/... or address" : "Например: https://maps.app.goo.gl/... или адрес"} value={suggestText} onChange={(e) => setSuggestText(e.target.value)} />
            <div className="vx-sp12" />
            <div className="mx-btnRow">
              <button type="button" className="mx-btn" onClick={() => setSuggestOpen(false)}>{isEn ? "Cancel" : "Отмена"}</button>
              <button type="button" className="mx-btn mx-btnPrimary" onClick={submitSuggest} disabled={sending}>{sending ? (isEn ? "Sending…" : "Отправка…") : (isEn ? "Send" : "Отправить")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
