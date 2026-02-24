import React from "react";

const FIND_ATM_URL = "https://www.google.com/maps/@/data=!3m1!4b1!4m2!11m1!2sgilh91bdh1BmzcYuNnwZdqS4KxLjpQ?g_ep=CAISEjI1LjIyLjAuNzYzNTE5NzAyMBgAILffASpiLDk0MjY3MzIzOTQyNzUzMTYsOTQyMjQ4MjUsOTQyMjcyNDcsOTQyMjcyNDgsOTQyMzExODgsNDcwNzE3MDQsNDcwNjk1MDgsOTQyMTg2NDEsOTQyMDMwMTksNDcwODQzMDRCAlZO";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AtmTab() {
  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">
        Вы можете получить наличные в банкоматах <b>VIETCOMBANK</b> и <b>BIDV</b> в любом городе Вьетнама.
      </div>

      <div className="vx-sp12" />

      <div className="vx-atmVideoGrid">
        <div className="vx-atmVideoCard">
          <div className="vx-atmVideoTitle">Видео инструкция для VIETCOMBANK</div>
          <video className="vx-atmVideo" controls playsInline preload="metadata" src="/videos/vietcombank.mp4" />
        </div>

        <div className="vx-atmVideoCard">
          <div className="vx-atmVideoTitle">Видео инструкция для BIDV</div>
          <video className="vx-atmVideo" controls playsInline preload="metadata" src="/videos/bidv.mp4" />
        </div>
      </div>

      <div className="vx-sp12" />

      <button className="btn" type="button" onClick={() => openLink(FIND_ATM_URL)}>
        Найти ближайший ко мне банкомат
      </button>

      <div className="small vx-mt6">Ссылку можно изменить в коде: <b>FIND_ATM_URL</b> (AtmTab.tsx).</div>
    </div>
  );
}
