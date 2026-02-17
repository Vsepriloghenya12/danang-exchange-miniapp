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

  return (
    <div className="card">
      <div className="h1">Управление</div>

      <div className="card">
        <div className="small">Курс на сегодня (BUY/SELL к VND) — заполняется каждый день</div>
        <div className="hr" />

        <div style={{ display: "grid", gridTemplateColumns: "0.7fr 1fr 1fr", gap: 8, alignItems: "center" }}>
          <div className="small" style={{ fontWeight: 900 }}>Валюта</div>
          <div className="small" style={{ fontWeight: 900 }}>BUY</div>
          <div className="small" style={{ fontWeight: 900 }}>SELL</div>

          {[
            ["RUB", rubBuy, setRubBuy, rubSell, setRubSell],
            ["USDT", usdtBuy, setUsdtBuy, usdtSell, setUsdtSell],
            ["USD", usdBuy, setUsdBuy, usdSell, setUsdSell],
            ["EUR", eurBuy, setEurBuy, eurSell, setEurSell],
            ["THB", thbBuy, setThbBuy, thbSell, setThbSell]
          ].map(([code, buy, setBuy, sell, setSell]) => (
            <React.Fragment key={String(code)}>
              <div style={{ fontWeight: 950 }}>{String(code)}</div>
              <input
                className="input"
                inputMode="decimal"
                value={String(buy)}
                onChange={(e) => (setBuy as any)(e.target.value)}
                placeholder="например 24800"
              />
              <input
                className="input"
                inputMode="decimal"
                value={String(sell)}
                onChange={(e) => (setSell as any)(e.target.value)}
                placeholder="например 25100"
              />
            </React.Fragment>
          ))}
        </div>

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
