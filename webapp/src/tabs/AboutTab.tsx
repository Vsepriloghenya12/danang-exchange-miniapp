import React from "react";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AboutTab({
  onInstallApp,
  installLabel,
}: {
  onInstallApp?: () => void;
  installLabel?: string;
}) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="small" style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>
        {`Приложение-помощник для туристов и локалов Дананга. Здесь можно найти интересные мероприятия и активности на любой вкус, а также обменять валюту, забронировать и оплатить отели, билеты, оформить e-visa.

Если вы хотите опубликовать своё мероприятие в разделе «Афиша», пожалуйста, напишите нам.`}
      </div>
      <div style={{ height: 12 }} />
      {onInstallApp ? (
        <>
          <button type="button" className="btn" onClick={onInstallApp}>
            {installLabel || "Установить приложение"}
          </button>
          <div style={{ height: 10 }} />
        </>
      ) : null}
      <button type="button" className="btn" onClick={() => openLink("https://t.me/exchange_vn_dn")}>
        Написать нам
      </button>
    </div>
  );
}
