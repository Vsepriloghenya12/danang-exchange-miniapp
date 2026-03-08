import React from "react";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

const CONTACT_URL = "https://t.me/love_2604";

export default function PaymentsTab() {
  return (
    <div className="card" style={{ padding: 14 }}>
        <div className="small" style={{ lineHeight: 1.55 }}>
        Если вы хотите оформить или оплатить визу во Вьетнам, а также получить помощь с бронированием отелей и авиабилетов по всему миру, просто оставьте заявку ниже. Менеджер с радостью поможет вам!
      </div>

      <div className="vx-sp12" />

      <button
        type="button"
        className="btn"
        onClick={() => openLink(CONTACT_URL)}
        style={{ width: "100%" }}
      >
        ОСТАВИТЬ ЗАЯВКУ
      </button>
    </div>
  );
}
