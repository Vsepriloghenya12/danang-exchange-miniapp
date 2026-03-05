import React from "react";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function PaymentsTab() {
  // Placeholder: owner will provide final text + link later.
  const contactUrl = ""; // e.g. "https://t.me/username"

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="h3" style={{ marginBottom: 6 }}>
        Оплата и брони
      </div>
      <div className="small" style={{ lineHeight: 1.45 }}>
        Здесь будет информация по оплате и бронированиям. Текст и контакт добавим позже.
      </div>

      <div className="vx-sp12" />

      <button
        type="button"
        className="btn"
        disabled={!contactUrl}
        onClick={() => {
          if (!contactUrl) return;
          openLink(contactUrl);
        }}
        style={{ width: "100%" }}
      >
        Связаться
      </button>
    </div>
  );
}
