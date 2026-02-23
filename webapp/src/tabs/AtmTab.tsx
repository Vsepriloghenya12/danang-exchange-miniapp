import React, { useEffect, useState } from "react";
import { apiGetAtms } from "../lib/api";
import type { AtmItem } from "../lib/types";

function openMap(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AtmTab() {
  const [atms, setAtms] = useState<AtmItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await apiGetAtms();
        if (r.ok) setAtms(Array.isArray(r.atms) ? r.atms : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">Список заполняется владельцем в “Управлении”.</div>
      <div className="hr" />

      {loading ? (
        <div className="small">Загрузка…</div>
      ) : atms.length === 0 ? (
        <div className="small">Пока нет добавленных банкоматов.</div>
      ) : (
        atms.map((a) => (
          <div key={a.id} className="vx-mb10">
            <div>
              <b>{a.title}</b>
            </div>
            <div className="small">{[a.address, a.note].filter(Boolean).join(" • ")}</div>

            <div className="vx-mt6">
              <button className="btn vx-btnSm" onClick={() => openMap(a.mapUrl)}>
                Открыть на карте
              </button>
            </div>

            <div className="hr" />
          </div>
        ))
      )}
    </div>
  );
}
