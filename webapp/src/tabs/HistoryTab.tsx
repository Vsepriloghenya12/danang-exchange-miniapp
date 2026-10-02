import React, { useEffect, useMemo, useState } from "react";
import Sheet from "../components/Sheet";
import { vndEquivalent } from "../domain/loyalty";
import RequestBonusDetails from "../components/RequestBonusDetails";
import { apiGetMyRequests, apiGetTodayRates } from "../lib/api";

type Lang = "ru" | "en";


function getTg() { return (window as any).Telegram?.WebApp; }


function fmtVnd(n: number, lang: Lang): string {
  const text = new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
  return lang === "en" ? text.replace(/,/g, " ") : text;
}

function methodLabel(m: string, lang: Lang) {
  const v = String(m || "").toLowerCase();
  if (v === "cash") return lang === "en" ? "Cash" : "Наличные";
  if (v === "transfer") return lang === "en" ? "Transfer" : "Перевод";
  if (v === "atm") return lang === "en" ? "ATM" : "Банкомат";
  return m || "—";
}

function shortId(id: string) { const s = String(id || ""); return s.length > 6 ? s.slice(-6) : s; }

function ruOps(n: number): string {
  const m = n % 100; const d = n % 10;
  if (m >= 11 && m <= 14) return `${n} операций`;
  if (d === 1) return `${n} операция`;
  if (d >= 2 && d <= 4) return `${n} операции`;
  return `${n} операций`;
}
function opsLabel(n: number, lang: Lang) {
  return lang === "en" ? `${n} ${n === 1 ? "operation" : "operations"}` : ruOps(n);
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupLabel(d: Date, now: Date, lang: Lang): string {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const key = dayKey(d);
  if (key === today) return lang === "en" ? "Today" : "Сегодня";
  if (key === yesterday) return lang === "en" ? "Yesterday" : "Вчера";
  const opts: Intl.DateTimeFormatOptions = d.getFullYear() === now.getFullYear()
    ? { day: "numeric", month: "long" }
    : { day: "numeric", month: "long", year: "numeric" };
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", opts);
}

function timeLabel(d: Date, lang: Lang): string {
  return d.toLocaleTimeString(lang === "en" ? "en-GB" : "ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function SwapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 5v14M7 5L4 8.2M7 5l3 3.2M17 19V5M17 19l3-3.2M17 19l-3-3.2" />
    </svg>
  );
}

export default function HistoryTab({ me, lang = "ru", onExchange }: { me: any; lang?: Lang; onExchange?: () => void }) {
  const isEn = lang === "en";
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";

  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<any[]>([]);
  const [rates, setRates] = useState<any>(null);

  async function load() {
    if (!initData) return;
    setError("");
    try {
      const r = await apiGetMyRequests(initData);
      if (!r?.ok) {
        setError(r?.error || (isEn ? "Error" : "Ошибка"));
        setRequests([]);
        return;
      }
      setRequests(Array.isArray(r.requests) ? r.requests : []);
    } catch {
      setError(isEn ? "Could not load your exchanges. Please try again." : "Не удалось загрузить обмены. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initData) return;
    void load();
    const id = window.setInterval(load, 12000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData, isEn]);

  useEffect(() => {
    apiGetTodayRates()
      .then((r: any) => setRates(r?.data?.rates ?? null))
      .catch(() => setRates(null));
  }, []);

  const list = useMemo(
    () => (requests || []).slice().sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at))),
    [requests]
  );

  const stats = useMemo(() => {
    const now = new Date();
    let totalDoneVnd = 0;
    let monthCount = 0;
    let monthVnd = 0;
    let pendingCount = 0;

    for (const r of list) {
      const st = String(r?.state || "");
      const d = new Date(String(r?.created_at || ""));
      const inMonth = Number.isFinite(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      const vnd = vndEquivalent(r, rates);

      if (st === "done") {
        if (vnd != null) totalDoneVnd += vnd;
        if (inMonth) {
          monthCount += 1;
          if (vnd != null) monthVnd += vnd;
        }
      } else if (st === "new" || st === "in_progress") {
        pendingCount += 1;
        if (inMonth) monthCount += 1;
      }
    }

    return { totalDoneVnd, monthCount, monthVnd, pendingCount };
  }, [list, rates]);

  const groups = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { label: string; items: any[] }>();
    for (const r of list) {
      const d = new Date(String(r?.created_at || ""));
      const key = Number.isFinite(d.getTime()) ? dayKey(d) : "unknown";
      if (!map.has(key)) {
        map.set(key, { label: Number.isFinite(d.getTime()) ? groupLabel(d, now, lang) : "—", items: [] });
      }
      map.get(key)!.items.push(r);
    }
    return [...map.values()];
  }, [list, lang]);

  if (!initData) {
    return <div className="small">{isEn ? "Open this tab inside Telegram." : "Откройте вкладку «Моя история» внутри Telegram."}</div>;
  }


  const monthName = new Date().toLocaleDateString(isEn ? "en-GB" : "ru-RU", { month: "long" });

  const showEmpty = !loading && !error && list.length === 0;

  return (
    <div className="cx-hist cp-history">
      {!loading && !error && <div className="cl-historyTotal">
        <span>{isEn ? "Exchanged in total" : "Обменяно всего"}</span>
        <strong>{fmtVnd(stats.totalDoneVnd, lang)} ₫</strong>
      </div>}

      {/* month summary */}
      {list.length > 0 ? (
        <div className="cx-card cx-histSummary">
          <div className="cx-histCaps" style={{ marginBottom: 10 }}>{monthName.charAt(0).toUpperCase() + monthName.slice(1)}</div>
          <div className="cx-histSummaryRow">
            <div className="cx-histSumCol">
              <div className="cx-histSumVal">{stats.monthCount}</div>
              <div className="cx-histSumSub">{isEn ? "deals" : "сделки"}</div>
            </div>
            <div className="cx-histSumDiv" />
            <div className="cx-histSumCol">
              <div className="cx-histSumVal is-money">{fmtVnd(stats.monthVnd, lang)} ₫</div>
              <div className="cx-histSumSub">{isEn ? "exchanged" : "обменяно"}</div>
            </div>
            <div className="cx-histSumDiv" />
            <div className="cx-histSumCol">
              <div className="cx-histSumVal">{stats.pendingCount}</div>
              <div className="cx-histSumSub">{isEn ? "in progress" : "в работе"}</div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="cx-histMuted">{isEn ? "Loading…" : "Загрузка…"}</div> : null}
      {error ? <div className="cp-empty" role="alert"><p>{error}</p><button type="button" className="cp-secondary" onClick={()=>{setLoading(true);void load();}}>{isEn?"Try again":"Повторить"}</button></div> : null}

      {showEmpty ? (
        <div className="cx-histEmpty">
          <div className="cx-histEmptyIco" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12v18l-2.4-1.4L13.2 21 12 20l-1.2 1-2.4-1.4L6 21z" />
              <path d="M9.5 8h5M9.5 12h5" />
            </svg>
          </div>
          <div className="cx-histEmptyTitle">{isEn ? "Nothing here yet" : "Здесь пока пусто"}</div>
          <div className="cx-histEmptyText">
            {isEn ? "Your exchanges will appear here right after your first request." : "Ваши обмены появятся здесь сразу после первой заявки."}
          </div>
          <button type="button" className="cx-cta cx-histEmptyCta" onClick={() => onExchange?.()}>
            {isEn ? "Exchange currency" : "Обменять валюту"}
          </button>
        </div>
      ) : null}

      {groups.map((g) => (
        <div key={g.label} className="cx-histGroup">
          <div className="cx-histGroupHead">
            <span className="cx-histCaps">{g.label}</span>
            <span className="cx-histGroupCount">{opsLabel(g.items.length, lang)}</span>
          </div>
          <div className="cx-histList">
            {g.items.map((r) => {
              const st = String(r?.state || "");
              const stNorm = st === "new" ? "in_progress" : st;
              const d = new Date(String(r?.created_at || ""));
              const vnd = vndEquivalent(r, rates);
              const amount = vnd != null ? `${fmtVnd(vnd, lang)} ₫` : `${r?.buyAmount} ${r?.buyCurrency}`;
              const sub = `${methodLabel(String(r?.receiveMethod || ""), lang)}${Number.isFinite(d.getTime()) ? ` · ${timeLabel(d, lang)}` : ""}`;
              const title = `${isEn ? "Exchange" : "Обмен"} ${r?.sellCurrency} → ${r?.buyCurrency}`;

              const openDetails = () => setSelected(r);



              return (
                <button key={String(r?.id)} type="button" className="cx-histItem" onClick={openDetails}>
                  <span className="cx-histIco" aria-hidden="true"><SwapIcon /></span>
                  <span className="cx-histBody">
                    <span className="cx-histRow1">
                      <span className="cx-histTitle">{title}</span>
                      <span className="cx-histAmount">{amount}</span>
                    </span>
                    <span className="cx-histRow2">
                      <span className="cx-histSub">{sub}</span>
                      {stNorm === "done" ? (
                        <span className="cx-histPill is-done">{isEn ? "Done" : "Выполнено"}</span>
                      ) : stNorm === "canceled" ? (
                        <span className="cx-histPill is-cancelled">{isEn ? "Cancelled" : "Отменено"}</span>
                      ) : (
                        <span className="cx-histPill is-pending">{isEn ? "In progress" : "В работе"}</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {selected && <Sheet title={(isEn?"Exchange #":"Обмен #")+shortId(String(selected.id))} closeLabel={isEn?"Close":"Закрыть"} onClose={()=>setSelected(null)}>
        <div className="cp-receipt">
          <span className={"cx-histPill "+(selected.state==="done"?"is-done":selected.state==="canceled"?"is-cancelled":"is-pending")}>{selected.state==="done"?(isEn?"Done":"Выполнено"):selected.state==="canceled"?(isEn?"Cancelled":"Отменено"):(isEn?"In progress":"В работе")}</span>
          <div className="cp-receiptAmounts"><div><span>{isEn?"You give":"Отдаёте"}</span><strong>{Number(selected.sellAmount).toLocaleString(isEn?"en-US":"ru-RU")} <small>{selected.sellCurrency}</small></strong></div><div><span>{isEn?"You get":"Получаете"}</span><strong>{Number(selected.buyAmount).toLocaleString(isEn?"en-US":"ru-RU")} <small>{selected.buyCurrency}</small></strong></div></div>
          <RequestBonusDetails bonus={selected.cashcoin} sellCurrency={selected.sellCurrency} buyCurrency={selected.buyCurrency} isEn={isEn}/>
          <dl><div><dt>{isEn?"Payment":"Оплата"}</dt><dd>{methodLabel(selected.payMethod,lang)}</dd></div><div><dt>{isEn?"Receive":"Получение"}</dt><dd>{methodLabel(selected.receiveMethod,lang)}</dd></div><div><dt>{isEn?"Date":"Дата"}</dt><dd>{new Date(selected.created_at).toLocaleString(isEn?"en-GB":"ru-RU")}</dd></div></dl>
          {selected.comment && <div className="cp-receiptComment"><span>{isEn?"Comment":"Комментарий"}</span><p>{selected.comment}</p></div>}
        </div>
      </Sheet>}
    </div>
  );
}
