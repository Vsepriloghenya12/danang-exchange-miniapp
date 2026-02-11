import React from "react";

const ATMS = [
  { title: "Vietcombank ATM", area: "Hai Chau", note: "Обычно выдает VND" },
  { title: "BIDV ATM", area: "My Khe", note: "Проверить комиссию" },
  { title: "TPBank LiveBank", area: "Center", note: "Иногда выгоднее" }
];

export default function AtmTab() {
  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">Пока статический список (позже сделаем редактирование владельцем).</div>
      <div className="hr" />
      {ATMS.map((a, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div><b>{a.title}</b></div>
          <div className="small">{a.area} • {a.note}</div>
        </div>
      ))}
    </div>
  );
}
