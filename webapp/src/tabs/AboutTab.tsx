import React from "react";

type Lang = "ru" | "en";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AboutTab({ lang = "ru" }: { lang?: Lang }) {
  const isEn = lang === "en";
  const text = isEn
    ? `A helper app for tourists and locals in Da Nang. Here you can exchange currency, book and pay for hotels and tickets, and get help with e-visa services.`
    : `Приложение-помощник для туристов и локалов Дананга. Здесь можно обменять валюту, забронировать и оплатить отели, билеты, оформить e-visa.`;
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="small" style={{ lineHeight: 1.6, whiteSpace: "pre-line" }}>{text}</div>
      <div style={{ height: 12 }} />
      <button type="button" className="btn" onClick={() => openLink("https://t.me/exchange_vn_dn")}>
        {isEn ? "Write to us" : "Написать нам"}
      </button>
    </div>
  );
}
