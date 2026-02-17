import React, { useEffect, useState } from "react";
import { apiAdminSetTodayRates, apiAdminSetUserStatus, apiAdminUsers, apiGetTodayRates } from "../lib/api";

const STATUS_OPTIONS = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" }
] as const;

function statusLabelAny(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "Золото";
  if (v === "silver") return "Серебро";
  // совместимость со старыми none/bronze
  return "Стандарт";
}

export default function AdminTab({ me }: any) {
  const [usdBuy, setUsdBuy] = useState("24800");
  const [usdSell, setUsdSell] = useState("25100");

  const [rubBuy, setRubBuy] = useState("260");
  const [rubSell, setRubSell] = useState("275");

  const [usdtBuy, setUsdtBuy] = useState("24800");
  const [usdtSell, setUsdtSell] = useState("25100");

  const [eurBuy, setEurBuy] = useState("0");
  const [eurSell, setEurSell] = useState("0");

  const [thbBuy, setThbBuy] = useState("0");
  const [thbSell, setThbSell] = useState("0");

  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = async () => {
    const r = await apiAdminUsers(me.initData);
    if (r.ok) setUsers(r.users);
  };

  const loadRates = async () => {
    const r = await apiGetTodayRates();
    const rates = (r as any)?.data?.rates;
    if (!rates) return;

    if (rates.USD) {
      setUsdBuy(String(rates.USD.buy_vnd ?? usdBuy));
      setUsdSell(String(rates.USD.sell_vnd ?? usdSell));
    }
    if (rates.RUB) {
      setRubBuy(String(rates.RUB.buy_vnd ?? rubBuy));
      setRubSell(String(rates.RUB.sell_vnd ?? rubSell));
    }
    if (rates.USDT) {
      setUsdtBuy(String(rates.USDT.buy_vnd ?? usdtBuy));
      setUsdtSell(String(rates.USDT.sell_vnd ?? usdtSell));
    }
    if (rates.EUR) {
      setEurBuy(String(rates.EUR.buy_vnd ?? eurBuy));
      setEurSell(String(rates.EUR.sell_vnd ?? eurSell));
    }
    if (rates.THB) {
      setThbBuy(String(rates.THB.buy_vnd ?? thbBuy));
      setThbSell(String(rates.THB.sell_vnd ?? thbSell));
    }
  };

  useEffect(() => {
    loadUsers();
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRates = async () => {
    const rates = {
      USD: { buy_vnd: Number(usdBuy), sell_vnd: Number(usdSell) },
      RUB: { buy_vnd: Number(rubBuy), sell_vnd: Number(rubSell) },
      USDT: { buy_vnd: Number(usdtBuy), sell_vnd: Number(usdtSell) },
      EUR: { buy_vnd: Number(eurBuy), sell_vnd: Number(eurSell) },
      THB: { buy_vnd: Number(thbBuy), sell_vnd: Number(thbSell) }
    };

    const r = await apiAdminSetTodayRates(me.initData, rates);
    if (r.ok) alert("Курс сохранён ✅");
    else alert(r.error || "Ошибка");
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
        <div className="small">Курс на сегодня (BUY/SELL к VND)</div>
        <div className="hr" />

        {[
          ["RUB", rubBuy, setRubBuy, rubSell, setRubSell],
          ["USDT", usdtBuy, setUsdtBuy, usdtSell, setUsdtSell],
          ["USD", usdBuy, setUsdBuy, usdSell, setUsdSell],
          ["EUR", eurBuy, setEurBuy, eurSell, setEurSell],
          ["THB", thbBuy, setThbBuy, thbSell, setThbSell]
        ].map(([code, buy, setBuy, sell, setSell]) => (
          <div key={String(code)} style={{ marginBottom: 10 }}>
            <b>{String(code)}</b>
            <div className="row" style={{ marginTop: 6 }}>
              <input className="input" value={String(buy)} onChange={(e) => (setBuy as any)(e.target.value)} placeholder="BUY" />
              <input className="input" value={String(sell)} onChange={(e) => (setSell as any)(e.target.value)} placeholder="SELL" />
            </div>
          </div>
        ))}

        <button className="btn" onClick={saveRates}>Сохранить курс</button>
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
