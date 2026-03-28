import React from "react";

type Lang = "ru" | "en";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function ContactCard({ role, handle }: { role: string; handle: string }) {
  const username = handle.replace(/^@+/, "");
  const url = `https://t.me/${username}`;
  return (
    <button type="button" className="card" onClick={() => openLink(url)} style={{ width: "100%", padding: 12, textAlign: "left", background: "rgba(255,255,255,.7)", border: "1px solid rgba(0,0,0,.08)", cursor: "pointer" }}>
      <div className="small" style={{ fontWeight: 900, marginBottom: 4 }}>{role}</div>
      <div className="small" style={{ opacity: 0.88 }}>{handle}</div>
    </button>
  );
}

export default function ContactsTab({ lang = "ru" }: { lang?: Lang }) {
  const isEn = lang === "en";
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="small" style={{ marginBottom: 12, lineHeight: 1.5 }}>
        {isEn ? "For exchange, events, and app support questions, you can message us directly." : "По вопросам обмена, афиши и работы приложения вы можете написать нам напрямую."}
      </div>
      <ContactCard role={isEn ? "Admin" : "Админ"} handle="@exchange_vn" />
      <div style={{ height: 10 }} />
      <ContactCard role={isEn ? "Manager" : "Менеджер"} handle="@manager_exchange_vn" />
    </div>
  );
}
