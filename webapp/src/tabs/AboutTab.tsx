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
    ? `A helper app for tourists and locals in Da Nang. Here you can find interesting events and activities, exchange currency, book and pay for hotels and tickets, and get help with e-visa services.

If you want to publish your event in the Events section, please contact us.`
    : `Приложение-помощник для туристов и локалов Дананга. Здесь можно найти интересные мероприятия и активности на любой вкус, а также обменять валюту, забронировать и оплатить отели, билеты, оформить e-visa.

Если вы хотите опубликовать своё мероприятие в разделе «Афиша», пожалуйста, напишите нам.`;
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
