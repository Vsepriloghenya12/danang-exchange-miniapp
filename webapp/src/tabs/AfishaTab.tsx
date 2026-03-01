import React, { useEffect, useMemo, useState } from "react";
import { apiAfishaClick, apiGetAfisha } from "../lib/api";
import type { AfishaEvent, AfishaFilterCategory } from "../lib/types";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function openLink(url: string) {
  const tg = getTg();
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

const CATS: Array<{ key: AfishaFilterCategory; label: string }> = [
  { key: "all", label: "Все" },
  { key: "sport", label: "Спорт" },
  { key: "party", label: "Вечеринки" },
  { key: "culture", label: "Культура и искусство" },
  { key: "city", label: "Городские мероприятия" },
  { key: "food", label: "Еда" },
  { key: "music", label: "Музыка" },
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function AfishaTab() {
  const tg = getTg();
  const initData = tg?.initData || "";

  const [category, setCategory] = useState<AfishaFilterCategory>("all");
  const [from, setFrom] = useState<string>(() => todayISO());
  const [to, setTo] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [events, setEvents] = useState<AfishaEvent[]>([]);
  const [err, setErr] = useState<string>("");

  const params = useMemo(() => ({ category, from: from || undefined, to: to || undefined }), [category, from, to]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const r = await apiGetAfisha(params);
        if (!alive) return;
        if (!r?.ok) {
          setEvents([]);
          setErr(String((r as any)?.error || "Ошибка"));
        } else {
          setEvents(Array.isArray((r as any)?.events) ? ((r as any).events as AfishaEvent[]) : []);
        }
      } catch {
        if (!alive) return;
        setEvents([]);
        setErr("Ошибка загрузки");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  async function onClick(ev: AfishaEvent, kind: "details" | "location") {
    try {
      if (initData) await apiAfishaClick(initData, ev.id, kind);
    } catch {
      // ignore
    }
    openLink(kind === "details" ? ev.detailsUrl : ev.locationUrl);
  }

  return (
    <div className="mx-afisha">
      <div className="mx-chipRow">
        {CATS.map((c) => (
          <button
            key={c.key}
            type="button"
            className={"mx-chip " + (category === c.key ? "is-on" : "")}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="mx-filterRow">
        <label className="mx-filterItem">
          <span>С</span>
          <input className="mx-date" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="mx-filterItem">
          <span>По</span>
          <input className="mx-date" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading ? <div className="mx-muted">Загрузка…</div> : null}
      {!loading && err ? <div className="mx-muted">{err}</div> : null}
      {!loading && !err && events.length === 0 ? <div className="mx-muted">Пока нет мероприятий.</div> : null}

      <div className="mx-list">
        {events.map((ev) => (
          <div key={ev.id} className="mx-card mx-cardInner">
            <div className="mx-afTitle">{ev.title}</div>
            <div className="mx-afMeta">{fmtDate(ev.date)}</div>

            <div className="mx-btnRow" style={{ marginTop: 10 }}>
              <button type="button" className="mx-btn" onClick={() => onClick(ev, "details")}>Подробнее</button>
              <button type="button" className="mx-btn mx-btnPrimary" onClick={() => onClick(ev, "location")}>Локация</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
