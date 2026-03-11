import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiSuggestAtm } from "../lib/api";

const FIND_ATM_URL = "https://www.google.com/maps/search/ATM+Vietcombank+near+me/";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

type BankKey = "vietcombank" | "bidv";

export default function AtmTab({ isActive = true }: { isActive?: boolean }) {
  const [active, setActive] = useState<BankKey | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState("");
  const [sending, setSending] = useState(false);

  // Telegram initData — used to authenticate API calls.
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

  // When the modal is open, freeze page overscroll and hide the fixed bottom menu.
  // We reuse the same global switch that the Afisha bottom-sheet uses.
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
      alert("Нет Telegram initData — откройте приложение внутри Telegram.");
      return;
    }

    setSending(true);
    try {
      const r: any = await apiSuggestAtm(initData, text);
      if (!r?.ok) throw new Error(r?.error || "send_failed");

      setSuggestOpen(false);
      setSuggestText("");

      const tg = (window as any).Telegram?.WebApp;
      if (tg?.showPopup) {
        tg.showPopup({
          title: "Спасибо!",
          message: "Локация отправлена менеджеру.",
          buttons: [{ type: "ok" }]
        });
      } else {
        alert("Локация отправлена менеджеру.");
      }
    } catch (e: any) {
      const msg = e?.message || "Не удалось отправить";
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.showPopup) {
        tg.showPopup({ title: "Ошибка", message: msg, buttons: [{ type: "ok" }] });
      } else {
        alert(msg);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="vx-atm">
      <div className="vx-atmHintBox">
        <div className="vx-atmHint">
          Вы можете получить наличные в банкоматах <span className="vx-bankBrand vx-bankBrandVcb">VIETCOMBANK</span> и <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span> в любом городе Вьетнама.
        </div>
      </div>

      <div className="vx-sp14" />

      <div className="vx-atmBtnGrid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <button
          type="button"
          className={"btn vx-atmBtn " + (active === "vietcombank" ? "vx-btnOn" : "")}
          onClick={() => setActive((p) => (p === "vietcombank" ? null : "vietcombank"))}
        >
          Видео <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span>
        </button>
        <button
          type="button"
          className={"btn vx-atmBtn " + (active === "bidv" ? "vx-btnOn" : "")}
          onClick={() => setActive((p) => (p === "bidv" ? null : "bidv"))}
        >
          Видео <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>
        </button>
      </div>

      <div className="vx-sp14" />

      <button className="btn vx-atmFindBtn" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        Найти ближайший ко мне банкомат
      </button>

      <div className="vx-sp14" />

      <div className="vx-atmNote">
        Если вы видите рядом с собой банкомат <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span> или <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span>, который не отмечен на нашей карте,
        пожалуйста, отправьте его локацию нашему менеджеру.
      </div>

      <div className="vx-sp10" />

      <button className="btn vx-atmSuggestBtn" type="button" onClick={() => setSuggestOpen(true)}>
        Добавить локацию
      </button>


      {active ? (
        <div className="vx-modalOverlay" role="dialog" aria-modal="true" onClick={() => setActive(null)}>
          <div className="vx-modalCard" onClick={(e) => e.stopPropagation()}>
            <div className="vx-modalTitle">
              {active === "vietcombank" ? <>Видео инструкция для <span className="vx-bankBrand vx-bankBrandVcb">Vietcombank</span></> : <>Видео инструкция для <span className="vx-bankBrand vx-bankBrandBidv">BIDV</span></>}
            </div>
            <div className="vx-sp12" />
            <video ref={videoRef} className="vx-atmVideo" controls playsInline preload="metadata" src={src} />
            <div className="vx-sp12" />
            <button className="btn vx-btnSm" type="button" onClick={() => setActive(null)}>
              Закрыть видео
            </button>
          </div>
        </div>
      ) : null}

      {suggestOpen ? (
        <div className="vx-modalOverlay" role="dialog" aria-modal="true">
          <div className="vx-modalCard">
            <div className="vx-modalTitle">Новый банкомат</div>
            <div className="vx-modalSub">Вставьте адрес или ссылку на Google Maps</div>
            <div className="vx-sp10" />
            <textarea
              className="input"
              style={{ width: "100%", minHeight: 88 }}
              value={suggestText}
              onChange={(e) => setSuggestText(e.target.value)}
              placeholder="Например: https://maps.app.goo.gl/... или адрес"
            />
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
                Отмена
              </button>
              <button
                type="button"
                className="btn vx-btnOn"
                disabled={sending || !String(suggestText || "").trim()}
                onClick={submitSuggest}
              >
                {sending ? "Отправка…" : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
