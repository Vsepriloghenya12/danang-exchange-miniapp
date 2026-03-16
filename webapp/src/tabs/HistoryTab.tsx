import React, { useEffect, useMemo, useState } from "react";
import { apiGetMyRequests } from "../lib/api";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

const stateLabel: Record<string, string> = {
  in_progress: "В работе",
  done: "Готова",
  canceled: "Отклонена",
  new: "В работе",
};

function shortId(id: string) {
  const s = String(id || "");
  return s.length > 6 ? s.slice(-6) : s;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function methodLabel(m: string) {
  const v = String(m || "").toLowerCase();
  if (v === "cash") return "Наличные";
  if (v === "transfer") return "Перевод";
  if (v === "atm") return "Банкомат";
  if (v === "other") return "Другое";
  return m || "—";
}

export default function HistoryTab({ me }: any) {
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [requests, setRequests] = useState<any[]>([]);

  async function load() {
    if (!initData) return;
    setLoading(true);
    setError("");
    try {
      const r = await apiGetMyRequests(initData);
      if (!r?.ok) {
        setError(r?.error || "Ошибка");
        setRequests([]);
        return;
      }
      setRequests(Array.isArray(r.requests) ? r.requests : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initData) return;
    load();
    const id = window.setInterval(load, 12_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  const list = useMemo(
    () => (requests || []).slice().sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at))),
    [requests]
  );

  if (!initData) {
    return <div className="small">Откройте вкладку «Моя история» внутри Telegram.</div>;
  }

  return (
    <div>
      <div className="vx-head" style={{ alignItems: "center" }}>
        <div>
          <div className="h2 vx-m0">Сделки</div>
          <div className="vx-meta">Ваши заявки на обмен</div>
        </div>
        <div className="row vx-rowWrap vx-gap6" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn vx-btnSm" onClick={load}>
            Обновить
          </button>
        </div>
      </div>

      {loading ? <div className="vx-help">Загрузка…</div> : null}
      {error ? <div className="vx-help">{error}</div> : null}

      <div className="vx-sp12" />

      {list.length === 0 && !loading ? <div className="small">Пока нет сделок.</div> : null}

      <div className="vx-reqList">
        {list.map((r) => {
          const st = String(r?.state || "");
          const stNorm = st === "new" ? "in_progress" : st;
          const title = `${r?.sellCurrency} → ${r?.buyCurrency}`;
          const meta = `${fmtDateTime(String(r?.created_at || ""))} • #${shortId(String(r?.id || ""))}`;
          const line1 = `Отдаёте: ${r?.sellAmount} ${r?.sellCurrency}`;
          const line2 = `Получаете: ${r?.buyAmount} ${r?.buyCurrency}`;
          const methods = `${methodLabel(String(r?.payMethod || ""))} → ${methodLabel(String(r?.receiveMethod || ""))}`;
          const comment = String(r?.comment || "").trim();

          return (
            <button
              key={String(r?.id)}
              type="button"
              className="vx-reqRow"
              onClick={() => {
                const msg =
                  `${title}\n` +
                  `${meta}\n\n` +
                  `${line1}\n${line2}\n` +
                  `Способ: ${methods}\n` +
                  `Статус: ${stateLabel[stNorm] || stNorm}`;
                tg?.showAlert?.(msg);
              }}
            >
              <div className="vx-reqTop">
                <div style={{ fontWeight: 950 }}>{title}</div>
                <div className="vx-tag" style={{ whiteSpace: "nowrap" }}>
                  {stateLabel[stNorm] || stNorm}
                </div>
              </div>
              <div className="vx-muted" style={{ marginTop: 4 }}>
                {meta}
              </div>
              <div className="small" style={{ marginTop: 6, opacity: 0.92 }}>
                {line1}
              </div>
              <div className="small" style={{ marginTop: 2, opacity: 0.92 }}>
                {line2}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
