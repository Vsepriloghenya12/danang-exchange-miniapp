import React, { useMemo, useState } from "react";

const FIND_ATM_URL = "https://www.google.com/maps/search/ATM+Vietcombank+near+me/";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

type BankKey = "vietcombank" | "bidv";

export default function AtmTab() {
  const [active, setActive] = useState<BankKey | null>(null);

  const src = useMemo(() => {
    if (active === "vietcombank") return "/videos/vietcombank.mp4";
    if (active === "bidv") return "/videos/bidv.mp4";
    return "";
  }, [active]);

  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">
        Вы можете получить наличные в банкоматах <b>VIETCOMBANK</b> и <b>BIDV</b> в любом городе Вьетнама.
      </div>

      <div className="vx-sp12" />

      <div
        className="vx-atmBtnGrid"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <button
          type="button"
          className={"btn vx-atmBtn " + (active === "vietcombank" ? "vx-btnOn" : "")}
          onClick={() => setActive((p) => (p === "vietcombank" ? null : "vietcombank"))}
        >
          Видео VIETCOMBANK
        </button>
        <button
          type="button"
          className={"btn vx-atmBtn " + (active === "bidv" ? "vx-btnOn" : "")}
          onClick={() => setActive((p) => (p === "bidv" ? null : "bidv"))}
        >
          Видео BIDV
        </button>
      </div>

      {active ? (
        <div className="vx-sp12">
          <div className="small"><b>{active === "vietcombank" ? "Видео инструкция для VIETCOMBANK" : "Видео инструкция для BIDV"}</b></div>
          <div className="vx-sp8" />
          <video className="vx-atmVideo" controls playsInline preload="metadata" src={src} />
          <div className="vx-sp8" />
          <button className="btn vx-btnSm" type="button" onClick={() => setActive(null)}>
            Закрыть видео
          </button>
        </div>
      ) : null}

      <div className="vx-sp12" />

      <button className="btn" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        Найти ближайший ко мне банкомат
      </button>
    </div>
  );
}
