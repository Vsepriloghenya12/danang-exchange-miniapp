import React, { useEffect, useMemo, useState } from "react";
import { apiGetAtms } from "../lib/api";
import type { Atm } from "../lib/types";
import { getTg } from "../lib/telegram";

function openLink(url: string) {
  const tg: any = getTg();
  if (tg && typeof tg.openLink === "function") {
    tg.openLink(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export default function AtmTab() {
  const [atms, setAtms] = useState<Atm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await apiGetAtms();
        if (!alive) return;
        if (r?.ok) setAtms(Array.isArray((r as any).atms) ? (r as any).atms : []);
        else setError((r as any)?.error || "Не удалось загрузить список банкоматов");
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Не удалось загрузить список банкоматов");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const hasAny = useMemo(() => atms.some((a) => (a?.title || "").trim() !== ""), [atms]);

  return (
    <div className="card">
      <div className="h1">Банкоматы</div>
      <div className="small">Список наполняет владелец в разделе “Управление”.</div>
      <div className="hr" />

      {loading ? <div className="small">Загрузка…</div> : null}
      {!loading && error ? <div className="small">{error}</div> : null}

      {!loading && !error && !hasAny ? (
        <div className="small">Пока нет добавленных банкоматов.</div>
      ) : null}

      {!loading && !error
        ? atms.map((a) => (
            <div key={a.id} className="vx-atmItem">
              <div className="vx-atmTitle">
                <b>{a.title}</b>
              </div>

              {(a.area || a.note) ? (
                <div className="small">
                  {[a.area, a.note].filter(Boolean).join(" • ")}
                </div>
              ) : null}

              {a.mapUrl ? (
                <div className="vx-mt6">
                  <button type="button" className="vx-linkBtn" onClick={() => openLink(a.mapUrl!)}>
                    Открыть на карте
                  </button>
                </div>
              ) : null}
            </div>
          ))
        : null}
    </div>
  );
}
