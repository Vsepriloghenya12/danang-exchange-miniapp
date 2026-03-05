import React from "react";

export default function ContactsTab() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="h3" style={{ marginBottom: 6 }}>
        Контакты
      </div>
      <div className="small" style={{ marginBottom: 12 }}>
        Остались вопросы? Напишите менеджеру. Хотите разместить анонс или объявление — пишите администратору.
      </div>

      <div className="card" style={{ padding: 12, background: "rgba(255,255,255,.7)", border: "1px solid rgba(0,0,0,.08)" }}>
        <div className="small" style={{ fontWeight: 900, marginBottom: 4 }}>
          Менеджер
        </div>
        <div className="small" style={{ opacity: 0.8 }}>Контакт добавим позже.</div>
      </div>

      <div style={{ height: 10 }} />

      <div className="card" style={{ padding: 12, background: "rgba(255,255,255,.7)", border: "1px solid rgba(0,0,0,.08)" }}>
        <div className="small" style={{ fontWeight: 900, marginBottom: 4 }}>
          Администратор
        </div>
        <div className="small" style={{ opacity: 0.8 }}>Контакт добавим позже.</div>
      </div>
    </div>
  );
}
