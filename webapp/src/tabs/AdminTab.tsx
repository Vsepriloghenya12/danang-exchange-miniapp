import React, { useEffect, useState } from "react";
import { apiAdminSetTodayRates, apiAdminSetUserStatus, apiAdminUsers } from "../lib/api";

export default function AdminTab({ me }: any) {
  const [usdBuy, setUsdBuy] = useState("24800");
  const [usdSell, setUsdSell] = useState("25100");
  const [rubBuy, setRubBuy] = useState("260");
  const [rubSell, setRubSell] = useState("275");
  const [usdtBuy, setUsdtBuy] = useState("24800");
  const [usdtSell, setUsdtSell] = useState("25100");

  const [users, setUsers] = useState<any[]>([]);

  const loadUsers = async () => {
    const r = await apiAdminUsers(me.initData);
    if (r.ok) setUsers(r.users);
  };

  useEffect(() => { loadUsers(); }, []);

  const saveRates = async () => {
    const rates = {
      USD: { buy_vnd: Number(usdBuy), sell_vnd: Number(usdSell) },
      RUB: { buy_vnd: Number(rubBuy), sell_vnd: Number(rubSell) },
      USDT: { buy_vnd: Number(usdtBuy), sell_vnd: Number(usdtSell) }
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

        <div style={{ marginBottom: 10 }}>
          <b>USD</b>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" value={usdBuy} onChange={(e) => setUsdBuy(e.target.value)} placeholder="BUY" />
            <input className="input" value={usdSell} onChange={(e) => setUsdSell(e.target.value)} placeholder="SELL" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <b>RUB</b>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" value={rubBuy} onChange={(e) => setRubBuy(e.target.value)} placeholder="BUY" />
            <input className="input" value={rubSell} onChange={(e) => setRubSell(e.target.value)} placeholder="SELL" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <b>USDT</b>
          <div className="row" style={{ marginTop: 6 }}>
            <input className="input" value={usdtBuy} onChange={(e) => setUsdtBuy(e.target.value)} placeholder="BUY" />
            <input className="input" value={usdtSell} onChange={(e) => setUsdtSell(e.target.value)} placeholder="SELL" />
          </div>
        </div>

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
                <span className="small">{u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {u.status}</span>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                {["standart","silver","gold"].map(s => (
                  <button key={s} className="btn" style={{ padding: "8px 10px" }} onClick={() => setStatus(u.tg_id, s)}>
                    {s}
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
