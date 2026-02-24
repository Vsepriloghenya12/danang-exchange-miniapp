import React from "react";

const FIND_ATM_URL = "https://www.google.com/maps/search/?api=1&query=Vietcombank%20ATM";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

export default function AtmTab() {
  const tg = getTg();

  const openLink = (url: string) => {
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="card">
      <style>{`
        .vx-atmInfo{ font-size: 13px; font-weight: 800; color: rgba(15,23,42,0.82); line-height: 1.35; }
        .vx-atmGrid{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
        @media (max-width: 420px){ .vx-atmGrid{ grid-template-columns: 1fr; } }

        .vx-atmVidCard{
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.62);
          border-radius: 18px;
          padding: 10px;
          overflow: hidden;
        }
        .vx-atmVidTitle{ font-size: 13px; font-weight: 950; margin-bottom: 8px; }
        .vx-atmVid{
          width: 100%;
          border-radius: 14px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(15,23,42,0.04);
        }

        .vx-atmLink{
          margin-top: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 48px;
          padding: 0 14px;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.14);
          background: rgba(255,255,255,0.90);
          font-weight: 900;
          cursor: pointer;
          user-select: none;
          width: 100%;
        }
      `}</style>

      <div className="h1">Банкоматы</div>

      <div className="vx-atmInfo" style={{ marginTop: 8 }}>
        Вы можете получить наличные в банкоматах <b>VIETCOMBANK</b> и <b>BIDV</b> в любом городе Вьетнама.
      </div>

      <div className="vx-atmGrid">
        <div className="vx-atmVidCard">
          <div className="vx-atmVidTitle">Видео инструкция для VIETCOMBANK</div>
          <video
            className="vx-atmVid"
            controls
            playsInline
            preload="metadata"
            src="/videos/vietcombank.mp4"
          />
          <div className="small" style={{ marginTop: 6 }}>
            Файл: <b>webapp/public/videos/vietcombank.mp4</b>
          </div>
        </div>

        <div className="vx-atmVidCard">
          <div className="vx-atmVidTitle">Видео инструкция для BIDV</div>
          <video className="vx-atmVid" controls playsInline preload="metadata" src="/videos/bidv.mp4" />
          <div className="small" style={{ marginTop: 6 }}>
            Файл: <b>webapp/public/videos/bidv.mp4</b>
          </div>
        </div>
      </div>

      <button type="button" className="vx-atmLink" onClick={() => openLink(FIND_ATM_URL)}>
        Найти ближайший ко мне банкомат
      </button>

      <div className="small" style={{ marginTop: 8, opacity: 0.8 }}>
        Ссылку можно изменить в файле <b>webapp/src/tabs/AtmTab.tsx</b> (константа <b>FIND_ATM_URL</b>).
      </div>
    </div>
  );
}
