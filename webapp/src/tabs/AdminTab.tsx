import React, { useEffect, useState } from "react";
import {
  apiAdminSetTodayRates,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates
} from "../lib/api";

const STATUS_OPTIONS = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" }
] as const;

function statusLabelAny(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "Золото";
  if (v === "silver") return "Серебро";
  return "Стандарт";
}

function nStr(v: any) {
  const s = String(v ?? "");
  return s === "0" ? "" : s;
}

function toNumStrict(label: string, s: string) {
  const n = Number(String(s).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Заполни корректно: ${label}`);
  return n;
}

export default function AdminTab({ me }: any) {
  const [usdBuy, setUsdBuy] = useState("24800");
  const [usdSell, setUsdSell] = useState("25100");

  const [rubBuy, setRubBuy] = useState("260");
  const [rubSell, setRubSell] = useState("275");

  const [usdtBuy, setUsdtBuy] = useState("24800");
  const [usdtSell, setUsdtSell] = useState("25100");

  const [eurBuy, setEurBuy] = useState("");
  const [eurSell, setEurSell] = useState("");

  const [thbBuy, setThbBuy] = useState("");
  const [thbSell, setThbSell] = useState("");

  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = async () => {
    const r = await apiAdminUsers(me.initData);
    if (r.ok) setUsers(r.users);
  };

  const loadRates = async () => {
    const r = await apiGetTodayRates();
    const rates = (r as any)?.data?.rates;
    if (!rates) return;

    if (rates.USD) { setUsdBuy(nStr(rates.USD.buy_vnd)); setUsdSell(nStr(rates.USD.sell_vnd)); }
    if (rates.RUB) { setRubBuy(nStr(rates.RUB.buy_vnd)); setRubSell(nStr(rates.RUB.sell_vnd)); }
    if (rates.USDT) { setUsdtBuy(nStr(rates.USDT.buy_vnd)); setUsdtSell(nStr(rates.USDT.sell_vnd)); }
    if (rates.EUR) { setEurBuy(nStr(rates.EUR.buy_vnd)); setEurSell(nStr(rates.EUR.sell_vnd)); }
    if (rates.THB) { setThbBuy(nStr(rates.THB.buy_vnd)); setThbSell(nStr(rates.THB.sell_vnd)); }
  };

  useEffect(() => {
    loadUsers();
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRates = async () => {
    try {
      const rates = {
        RUB: { buy_vnd: toNumStrict("RUB BUY", rubBuy), sell_vnd: toNumStrict("RUB SELL", rubSell) },
        USDT: { buy_vnd: toNumStrict("USDT BUY", usdtBuy), sell_vnd: toNumStrict("USDT SELL", usdtSell) },
        USD: { buy_vnd: toNumStrict("USD BUY", usdBuy), sell_vnd: toNumStrict("USD SELL", usdSell) },
        EUR: { buy_vnd: toNumStrict("EUR BUY", eurBuy), sell_vnd: toNumStrict("EUR SELL", eurSell) },
        THB: { buy_vnd: toNumStrict("THB BUY", thbBuy), sell_vnd: toNumStrict("THB SELL", thbSell) }
      };

      const r = await apiAdminSetTodayRates(me.initData, rates);
      if (r.ok) alert("Курс сохранён ✅");
      else alert(r.error || "Ошибка");
    } catch (e: any) {
      alert(e?.message || "Проверь значения");
    }
  };

  const setStatus = async (tgId: number, status: string) => {
    const r = await apiAdminSetUserStatus(me.initData, tgId, status);
    if (r.ok) loadUsers();
    else alert(r.error || "Ошибка");
  };

  const RateRow = (props: {
    code: string;
    buy: string;
    sell: string;
    setBuy: (v: string) => void;
    setSell: (v: string) => void;
  }) => {
    return (
      <div className="vx-rateRow">
        <div className="vx-code">{props.code}</div>

        <div className="vx-fields">
          <div className="vx-field">
            <div className="vx-lbl">BUY</div>
            <input
              className="input vx-in"
              inputMode="decimal"
              value={props.buy}
              onChange={(e) => props.setBuy(e.target.value)}
              placeholder="например 24800"
            />
          </div>

          <div className="vx-field">
            <div className="vx-lbl">SELL</div>
            <input
              className="input vx-in"
              inputMode="decimal"
              value={props.sell}
              onChange={(e) => props.setSell(e.target.value)}
              placeholder="например 25100"
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="card">
      <style>{`
        .vx-rateRow{
          display:flex;
          align-items:flex-start;
          gap:10px;
          padding: 10px 0;
          border-top: 1px solid rgba(15,23,42,0.08);
        }
        .vx-rateRow:first-of-type{ border-top: 0; padding-top: 0; }

        .vx-code{
          width: 62px;
          flex: 0 0 62px;
          font-weight: 950;
          color:#0f172a;
          padding-top: 18px;
        }

        .vx-fields{
          flex: 1 1 auto;
          min-width: 0;
          display:flex;
          gap:8px;
          flex-wrap: wrap;     /* ключ: не вылезаем за рамки */
        }

        .vx-field{
          flex: 1 1 140px;     /* если узко — перенос на следующую строку */
          min-width: 0;
        }

        .vx-lbl{
          font-size: 11px;
          font-weight: 900;
          color: rgba(15,23,42,0.55);
          margin: 0 0 6px 2px;
          letter-spacing: 0.02em;
        }

        .vx-in{
          width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
      `}</style>

      <div className="h1">Управление</div>

      <div className="card">
        <div className="small">Курс на сегодня (BUY/SELL к VND) — заполняется каждый день</div>
        <div className="hr" />

        <RateRow code="RUB"  buy={rubBuy}  sell={rubSell}  setBuy={setRubBuy}  setSell={setRubSell} />
        <RateRow code="USDT" buy={usdtBuy} sell={usdtSell} setBuy={setUsdtBuy} setSell={setUsdtSell} />
        <RateRow code="USD"  buy={usdBuy}  sell={usdSell}  setBuy={setUsdBuy}  setSell={setUsdSell} />
        <RateRow code="EUR"  buy={eurBuy}  sell={eurSell}  setBuy={setEurBuy}  setSell={setEurSell} />
        <RateRow code="THB"  buy={thbBuy}  sell={thbSell}  setBuy={setThbBuy}  setSell={setThbSell} />

        <div style={{ marginTop: 10 }}>
          <button className="btn" onClick={saveRates}>Сохранить курс</button>
        </div>
      </div>

      <div className="card">
        <div className="small">Клиенты и статусы</div>
        <div className="hr" />

        {users.length === 0 ? (
          <div className="small">Пока нет клиентов (они появятся после входа в мини-апп).</div>
        ) : (
          users.map((u) => (
            <div key={u.tg_id} style={{ marginBottom: 10 }}>
              <div>
                <b>{u.first_name ?? ""} {u.last_name ?? ""}</b>{" "}
                <span className="small">
                  {u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {statusLabelAny(u.status)}
                </span>
              </div>

              <div className="row" style={{ marginTop: 6, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    className="btn"
                    style={{ padding: "8px 10px" }}
                    onClick={() => setStatus(u.tg_id, s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="hr" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
