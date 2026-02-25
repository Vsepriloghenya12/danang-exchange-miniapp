import React, { useEffect, useMemo, useRef, useState } from "react";

const FIND_ATM_URL = "https://www.google.com/maps/search/ATM+Vietcombank+near+me/";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AtmTab() {
  const videos = useMemo(
    () => [
      { key: "vietcombank" as const, title: "Видео инструкция для VIETCOMBANK", src: "/videos/vietcombank.mp4" },
      { key: "bidv" as const, title: "Видео инструкция для BIDV", src: "/videos/bidv.mp4" },
    ],
    []
  );

  const [openKey, setOpenKey] = useState<(typeof videos)[number]["key"] | null>(null);
  const playerRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(() => videos.find((v) => v.key === openKey) || null, [videos, openKey]);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => {
      playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">
        Вы можете получить наличные в банкоматах <b>VIETCOMBANK</b> и <b>BIDV</b> в любом городе Вьетнама.
      </div>

      <div className="vx-sp12" />

      {/* Buttons (two in a row) */}
      <div className="vx-atmBtnGrid">
        {videos.map((v) => (
          <button
            key={v.key}
            type="button"
            className={`btn vx-btnSm vx-atmBtn ${openKey === v.key ? "vx-atmBtnOn" : ""}`}
            onClick={() => setOpenKey(v.key)}
          >
            {v.title}
          </button>
        ))}
      </div>

      {/* Video opens below after button click */}
      {active && (
        <div className="vx-atmVideoCard vx-mt10" ref={playerRef}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div className="vx-atmVideoTitle" style={{ marginBottom: 0 }}>
              {active.title}
            </div>
            <button type="button" className="vx-btnGhost vx-btnSm" onClick={() => setOpenKey(null)}>
              Закрыть
            </button>
          </div>
          <div className="vx-sp10" />
          <video className="vx-atmVideo" controls playsInline autoPlay preload="metadata" src={active.src} />
        </div>
      )}

      <div className="vx-sp12" />

      <button className="btn" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        Найти ближайший ко мне банкомат
      </button>

      <div className="small vx-mt6">Ссылку можно изменить в коде: <b>FIND_ATM_URL</b> (AtmTab.tsx).</div>
    </div>
  );
}
