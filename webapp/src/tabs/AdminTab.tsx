import React, { useEffect, useState } from "react";
import {
  apiAdminSetTodayRates,
  apiAdminGetRequests,
  apiAdminSetRequestState,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates,
  apiAdminGetAtms,
  apiAdminSetAtms,
  apiAdminGetBonuses,
  apiAdminSetBonuses
} from "../lib/api";
import type { AtmItem, BonusesConfig, BonusesTier } from "../lib/types";

const STATUS_OPTIONS = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" }
] as const;

const REQUEST_STATE_OPTIONS = [
  { value: "new", label: "Принята" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "canceled", label: "Отменена" }
] as const;

type RateRowProps = {
  code: string;
  buy: string;
  sell: string;
  setBuy: (v: string) => void;
  setSell: (v: string) => void;
};

// ВАЖНО: компонент вынесен наружу.
// Если объявлять компонент внутри AdminTab, на каждом setState создаётся НОВАЯ функция-компонент,
// React размонтирует/монтирует её заново → инпут теряет фокус → клавиатура закрывается.
const RateRow = React.memo(function RateRow(props: RateRowProps) {
  return (
    <div className="vx-rateRow">
      <div className="vx-code">{props.code}</div>

      <div className="vx-fields">
        <div className="vx-field">
          <input
            className="input vx-in"
            inputMode="decimal"
            value={props.buy}
            onChange={(e) => props.setBuy(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="vx-field">
          <input
            className="input vx-in"
            inputMode="decimal"
            value={props.sell}
            onChange={(e) => props.setSell(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>
    </div>
  );
});

function statusLabelAny(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "Золото";
  if (v === "silver") return "Серебро";
  return "Стандарт";
}

function statusValueAny(s: any): "standard" | "silver" | "gold" {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "gold";
  if (v === "silver") return "silver";
  return "standard";
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

function mkId() {
  return (
    (globalThis as any).crypto?.randomUUID?.() ||
    `atm_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

export default function AdminTab({ me }: any) {
  const [section, setSection] = useState<"rates" | "users" | "requests" | "atms" | "bonuses">("rates");

  // По умолчанию ВСЁ пустое (без подстановки старых значений)
  const [usdBuy, setUsdBuy] = useState("");
  const [usdSell, setUsdSell] = useState("");

  const [rubBuy, setRubBuy] = useState("");
  const [rubSell, setRubSell] = useState("");

  const [usdtBuy, setUsdtBuy] = useState("");
  const [usdtSell, setUsdtSell] = useState("");

  const [eurBuy, setEurBuy] = useState("");
  const [eurSell, setEurSell] = useState("");

  const [thbBuy, setThbBuy] = useState("");
  const [thbSell, setThbSell] = useState("");

  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const [atms, setAtms] = useState<AtmItem[]>([]);
  const [atmsBusy, setAtmsBusy] = useState(false);
  const [atmsLoaded, setAtmsLoaded] = useState(false);

  const [bonuses, setBonuses] = useState<BonusesConfig | null>(null);
  const [bonusesBusy, setBonusesBusy] = useState(false);
  const [bonusesLoaded, setBonusesLoaded] = useState(false);

  const clearRates = () => {
    setRubBuy(""); setRubSell("");
    setUsdtBuy(""); setUsdtSell("");
    setUsdBuy(""); setUsdSell("");
    setEurBuy(""); setEurSell("");
    setThbBuy(""); setThbSell("");
  };

  const loadUsers = async () => {
    const r = await apiAdminUsers(me.initData);
    if (r.ok) setUsers(r.users);
  };

  const loadRequests = async () => {
    const r = await apiAdminGetRequests(me.initData);
    if (r.ok) setRequests(r.requests || []);
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
    loadRequests();
    // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
    clearRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Загружаем банкоматы только когда пользователь открыл этот раздел
  useEffect(() => {
    if (section === "atms" && !atmsLoaded) {
      (async () => {
        setAtmsBusy(true);
        try {
          const r = await apiAdminGetAtms(me.initData);
          if (r.ok) setAtms(Array.isArray(r.atms) ? r.atms : []);
          else alert(r.error || "Ошибка загрузки банкоматов");
          setAtmsLoaded(true);
        } finally {
          setAtmsBusy(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, atmsLoaded]);

  // Загружаем надбавки только когда пользователь открыл этот раздел
  useEffect(() => {
    if (section === "bonuses" && !bonusesLoaded) {
      (async () => {
        setBonusesBusy(true);
        try {
          const r = await apiAdminGetBonuses(me.initData);
          if (r.ok) {
            setBonuses(r.bonuses);
            setBonusesLoaded(true);
          } else {
            alert(r.error || "Ошибка загрузки надбавок");
          }
        } finally {
          setBonusesBusy(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, bonusesLoaded]);

  const saveRates = async () => {
    try {
      const hasAny = (a: string, b: string) => a.trim() !== "" || b.trim() !== "";
      const hasBoth = (a: string, b: string) => a.trim() !== "" && b.trim() !== "";

      // EUR/THB — опционально: либо оба поля заполнены, либо оба пустые
      if (hasAny(eurBuy, eurSell) && !hasBoth(eurBuy, eurSell)) {
        throw new Error("EUR: заполни BUY и SELL (или оставь оба поля пустыми)");
      }
      if (hasAny(thbBuy, thbSell) && !hasBoth(thbBuy, thbSell)) {
        throw new Error("THB: заполни BUY и SELL (или оставь оба поля пустыми)");
      }

      const rates: any = {
        RUB: { buy_vnd: toNumStrict("RUB BUY", rubBuy), sell_vnd: toNumStrict("RUB SELL", rubSell) },
        USDT: { buy_vnd: toNumStrict("USDT BUY", usdtBuy), sell_vnd: toNumStrict("USDT SELL", usdtSell) },
        USD: { buy_vnd: toNumStrict("USD BUY", usdBuy), sell_vnd: toNumStrict("USD SELL", usdSell) }
      };

      if (hasBoth(eurBuy, eurSell)) {
        rates.EUR = { buy_vnd: toNumStrict("EUR BUY", eurBuy), sell_vnd: toNumStrict("EUR SELL", eurSell) };
      }
      if (hasBoth(thbBuy, thbSell)) {
        rates.THB = { buy_vnd: toNumStrict("THB BUY", thbBuy), sell_vnd: toNumStrict("THB SELL", thbSell) };
      }

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

  const setRequestState = async (id: string, state: string) => {
    const r = await apiAdminSetRequestState(me.initData, id, state);
    if (r.ok) loadRequests();
    else alert(r.error || "Ошибка");
  };

  const addAtm = () => {
    setAtms((p) => [...p, { id: mkId(), title: "", address: "", note: "", mapUrl: "" }]);
  };

  const updAtm = (id: string, patch: Partial<AtmItem>) => {
    setAtms((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const delAtm = (id: string) => setAtms((p) => p.filter((x) => x.id !== id));

  const moveAtm = (id: string, dir: -1 | 1) => {
    setAtms((p) => {
      const idx = p.findIndex((x) => x.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= p.length) return p;
      const next = p.slice();
      const t = next[idx];
      next[idx] = next[j];
      next[j] = t;
      return next;
    });
  };

  const saveAtms = async () => {
    const hasBad = atms.some((a) => !a.title?.trim() || !a.mapUrl?.trim());
    if (hasBad) {
      alert("Заполни у каждого банкомата: Название и Ссылку на карту");
      return;
    }

    setAtmsBusy(true);
    try {
      const r = await apiAdminSetAtms(me.initData, atms);
      if (r.ok) {
        alert("Список банкоматов сохранён ✅");
        setAtmsLoaded(true);
      } else {
        alert(r.error || "Ошибка сохранения банкоматов");
      }
    } finally {
      setAtmsBusy(false);
    }
  };

  const reloadAtms = async () => {
    setAtmsBusy(true);
    try {
      const r = await apiAdminGetAtms(me.initData);
      if (r.ok) {
        setAtms(Array.isArray(r.atms) ? r.atms : []);
        setAtmsLoaded(true);
      } else {
        alert(r.error || "Ошибка загрузки банкоматов");
      }
    } finally {
      setAtmsBusy(false);
    }
  };

  // --------------------
  // Bonuses helpers
  // --------------------
  const numInput = (s: string) => {
    const t = String(s ?? "").replace(",", ".").trim();
    if (t === "") return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };

  const setBonusEnabled = (key: "tiers" | "methods", on: boolean) => {
    setBonuses((p) => (p ? { ...p, enabled: { ...p.enabled, [key]: on } } : p));
  };

  const updMethodBonus = (method: "transfer" | "atm", cur: "RUB" | "USD" | "USDT", v: number) => {
    setBonuses((p) =>
      p
        ? {
            ...p,
            methods: {
              ...p.methods,
              [method]: { ...p.methods[method], [cur]: v }
            }
          }
        : p
    );
  };

  const updTier = (cur: "RUB" | "USD" | "USDT", idx: number, patch: Partial<BonusesTier>) => {
    setBonuses((p) => {
      if (!p) return p;
      const list = (p.tiers as any)[cur] as BonusesTier[];
      const next = list.map((t, i) => (i === idx ? { ...t, ...patch } : t));
      return { ...p, tiers: { ...p.tiers, [cur]: next } };
    });
  };

  const addTier = (cur: "RUB" | "USD" | "USDT") => {
    setBonuses((p) => {
      if (!p) return p;
      const list = (p.tiers as any)[cur] as BonusesTier[];
      const last = list[list.length - 1];
      const min = Number.isFinite(last?.max as any) ? Number(last.max) : Number(last?.min ?? 0) + 1;
      const row: BonusesTier = { min: Math.max(0, min || 0), standard: 0, silver: 0, gold: 0 };
      return { ...p, tiers: { ...p.tiers, [cur]: [...list, row] } };
    });
  };

  const delTier = (cur: "RUB" | "USD" | "USDT", idx: number) => {
    setBonuses((p) => {
      if (!p) return p;
      const list = (p.tiers as any)[cur] as BonusesTier[];
      const next = list.filter((_, i) => i !== idx);
      return { ...p, tiers: { ...p.tiers, [cur]: next.length ? next : list } };
    });
  };

  const saveBonuses = async () => {
    if (!bonuses) return;
    setBonusesBusy(true);
    try {
      const r = await apiAdminSetBonuses(me.initData, bonuses);
      if (r.ok) {
        setBonuses(r.bonuses);
        setBonusesLoaded(true);
        alert("Надбавки сохранены ✅");
      } else {
        alert(r.error || "Ошибка сохранения надбавок");
      }
    } finally {
      setBonusesBusy(false);
    }
  };

  const reloadBonuses = async () => {
    setBonusesBusy(true);
    try {
      const r = await apiAdminGetBonuses(me.initData);
      if (r.ok) {
        setBonuses(r.bonuses);
        setBonusesLoaded(true);
      } else {
        alert(r.error || "Ошибка загрузки надбавок");
      }
    } finally {
      setBonusesBusy(false);
    }
  };

  return (
    <div className="card vx-admin">

      <div className="vx-adminHead">
        <div className="h1">Управление</div>
        <div className="vx-muted">только для владельца</div>
      </div>

      <div className="vx-adminSeg">
        <button className={section === "rates" ? "on" : ""} onClick={() => setSection("rates")}>Курс</button>
        <button className={section === "bonuses" ? "on" : ""} onClick={() => setSection("bonuses")}>Надбавки</button>
        <button className={section === "users" ? "on" : ""} onClick={() => setSection("users")}>Клиенты</button>
        <button className={section === "requests" ? "on" : ""} onClick={() => setSection("requests")}>Заявки</button>
        <button className={section === "atms" ? "on" : ""} onClick={() => setSection("atms")}>Банкоматы</button>
      </div>

      {section === "rates" ? (
        <div className="card vx-mt10">
          <div className="small">Курс на сегодня (BUY/SELL к VND) — заполняется каждый день</div>
          <div className="hr" />

          <RateRow code="RUB" buy={rubBuy} sell={rubSell} setBuy={setRubBuy} setSell={setRubSell} />
          <RateRow code="USDT" buy={usdtBuy} sell={usdtSell} setBuy={setUsdtBuy} setSell={setUsdtSell} />
          <RateRow code="USD" buy={usdBuy} sell={usdSell} setBuy={setUsdBuy} setSell={setUsdSell} />
          <RateRow code="EUR" buy={eurBuy} sell={eurSell} setBuy={setEurBuy} setSell={setEurSell} />
          <RateRow code="THB" buy={thbBuy} sell={thbSell} setBuy={setThbBuy} setSell={setThbSell} />

          <div className="vx-mt10">
            <div className="row vx-rowWrap vx-gap8">
              <button className="btn" onClick={saveRates}>Сохранить</button>
              <button className="btn" onClick={clearRates}>Очистить</button>
              <button className="btn" onClick={loadRates}>Загрузить</button>
            </div>
          </div>
        </div>
      ) : null}

      {section === "bonuses" ? (
        <div className="card vx-mt10">
          <div className="row vx-between vx-center">
            <div className="small">Надбавки (статусы / способ получения)</div>
            <div className="row vx-rowWrap vx-gap6">
              <button className="btn vx-btnSm" onClick={saveBonuses} disabled={bonusesBusy || !bonuses}>
                Сохранить
              </button>
              <button className="btn vx-btnSm" onClick={reloadBonuses} disabled={bonusesBusy}>
                Обновить
              </button>
            </div>
          </div>

          <div className="small vx-mt6">
            Надбавки применяются только для <b>RUB/USD/USDT → VND</b>.
          </div>

          <div className="hr" />

          {!bonuses ? (
            <div className="small">Загрузка…</div>
          ) : (
            <>
              <div className="row vx-rowWrap vx-gap8">
                <button
                  className="btn vx-btnSm"
                  style={
                    bonuses.enabled.tiers
                      ? ({ background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)" } as any)
                      : ({ background: "rgba(255,255,255,.78)", color: "rgba(9,23,33,.92)", border: "1px solid rgba(9,23,33,.14)", boxShadow: "none" } as any)
                  }
                  type="button"
                  onClick={() => setBonusEnabled("tiers", !bonuses.enabled.tiers)}
                  disabled={bonusesBusy}
                >
                  {bonuses.enabled.tiers ? "Надбавки по статусам: ВКЛ" : "Надбавки по статусам: ВЫКЛ"}
                </button>

                <button
                  className="btn vx-btnSm"
                  style={
                    bonuses.enabled.methods
                      ? ({ background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)" } as any)
                      : ({ background: "rgba(255,255,255,.78)", color: "rgba(9,23,33,.92)", border: "1px solid rgba(9,23,33,.14)", boxShadow: "none" } as any)
                  }
                  type="button"
                  onClick={() => setBonusEnabled("methods", !bonuses.enabled.methods)}
                  disabled={bonusesBusy}
                >
                  {bonuses.enabled.methods ? "Надбавки за способ: ВКЛ" : "Надбавки за способ: ВЫКЛ"}
                </button>
              </div>

              <div className="vx-sp12" />

              <div className="h3">Надбавки за способ получения (только если нет наличных)</div>

              <div className="row vx-rowWrap vx-gap8">
                <div className="vx-field">
                  <div className="vx-lbl">Перевод — RUB</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.transfer.RUB ?? 0)}
                    onChange={(e) => updMethodBonus("transfer", "RUB", numInput(e.target.value))}
                  />
                </div>
                <div className="vx-field">
                  <div className="vx-lbl">Перевод — USD</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.transfer.USD ?? 0)}
                    onChange={(e) => updMethodBonus("transfer", "USD", numInput(e.target.value))}
                  />
                </div>
                <div className="vx-field">
                  <div className="vx-lbl">Перевод — USDT</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.transfer.USDT ?? 0)}
                    onChange={(e) => updMethodBonus("transfer", "USDT", numInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="row vx-rowWrap vx-gap8 vx-mt10">
                <div className="vx-field">
                  <div className="vx-lbl">Банкомат — RUB</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.atm.RUB ?? 0)}
                    onChange={(e) => updMethodBonus("atm", "RUB", numInput(e.target.value))}
                  />
                </div>
                <div className="vx-field">
                  <div className="vx-lbl">Банкомат — USD</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.atm.USD ?? 0)}
                    onChange={(e) => updMethodBonus("atm", "USD", numInput(e.target.value))}
                  />
                </div>
                <div className="vx-field">
                  <div className="vx-lbl">Банкомат — USDT</div>
                  <input
                    className="input vx-in"
                    inputMode="decimal"
                    value={String(bonuses.methods.atm.USDT ?? 0)}
                    onChange={(e) => updMethodBonus("atm", "USDT", numInput(e.target.value))}
                  />
                </div>
              </div>

              <div className="hr" />

              <div className="h3">Надбавки по статусам и сумме</div>
              <div className="small">Формат: min ≤ сумма &lt; max (max можно оставить пустым для последнего диапазона).</div>

              {(["RUB", "USD", "USDT"] as const).map((cur) => (
                <div key={cur} className="vx-mt10">
                  <div className="row vx-between vx-center">
                    <div className="vx-title18">{cur}</div>
                    <button className="btn vx-btnSm" type="button" onClick={() => addTier(cur)} disabled={bonusesBusy}>
                      Добавить диапазон
                    </button>
                  </div>

                  <div className="hr" />

                  {(bonuses.tiers as any)[cur].map((t: BonusesTier, idx: number) => (
                    <div key={idx} className="vx-mb10">
                      <div className="row vx-rowWrap vx-gap8">
                        <div className="vx-field">
                          <div className="vx-lbl">min</div>
                          <input
                            className="input vx-in"
                            inputMode="numeric"
                            value={String(t.min ?? 0)}
                            onChange={(e) => updTier(cur, idx, { min: Math.max(0, Math.floor(numInput(e.target.value))) })}
                          />
                        </div>

                        <div className="vx-field">
                          <div className="vx-lbl">max</div>
                          <input
                            className="input vx-in"
                            inputMode="numeric"
                            value={t.max == null ? "" : String(t.max)}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              updTier(cur, idx, { max: raw === "" ? undefined : Math.max(0, Math.floor(numInput(raw))) });
                            }}
                            placeholder="(пусто)"
                          />
                        </div>

                        <div className="vx-field">
                          <div className="vx-lbl">стандарт</div>
                          <input
                            className="input vx-in"
                            inputMode="decimal"
                            value={String(t.standard ?? 0)}
                            onChange={(e) => updTier(cur, idx, { standard: numInput(e.target.value) })}
                          />
                        </div>

                        <div className="vx-field">
                          <div className="vx-lbl">серебро</div>
                          <input
                            className="input vx-in"
                            inputMode="decimal"
                            value={String(t.silver ?? 0)}
                            onChange={(e) => updTier(cur, idx, { silver: numInput(e.target.value) })}
                          />
                        </div>

                        <div className="vx-field">
                          <div className="vx-lbl">золото</div>
                          <input
                            className="input vx-in"
                            inputMode="decimal"
                            value={String(t.gold ?? 0)}
                            onChange={(e) => updTier(cur, idx, { gold: numInput(e.target.value) })}
                          />
                        </div>

                        <div className="vx-field" style={{ flex: "0 0 auto" } as any}>
                          <div className="vx-lbl">&nbsp;</div>
                          <button className="btn vx-btnSm" type="button" onClick={() => delTier(cur, idx)} disabled={bonusesBusy}>
                            Удалить
                          </button>
                        </div>
                      </div>

                      <div className="hr" />
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      ) : null}

      {section === "users" ? (
        <div className="card vx-mt10">
          <div className="row vx-between vx-center">
            <div className="small">Клиенты и статусы</div>
            <button className="btn vx-btnSm" onClick={loadUsers}>Обновить</button>
          </div>
          <div className="hr" />

          {users.length === 0 ? (
            <div className="small">Пока нет клиентов (они появятся после входа в мини-апп).</div>
          ) : (
            users.map((u) => (
              <div key={u.tg_id} className="vx-mb10">
                <div>
                  <b>{u.first_name ?? ""} {u.last_name ?? ""}</b>{" "}
                  <span className="small">
                    {u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {statusLabelAny(u.status)}
                  </span>
                </div>

                <div className="row vx-mt6 vx-rowWrap vx-gap6">
                  {STATUS_OPTIONS.map((s) => {
                    const isOn = statusValueAny(u.status) === s.value;
                    const activeStyle = isOn
                      ? (s.value === "standard"
                          ? { background: "rgba(9,23,33,.88)", color: "rgba(255,255,255,.96)", border: 0 }
                          : s.value === "silver"
                            ? { background: "rgba(190,198,210,.95)", color: "rgba(9,23,33,.92)", border: 0 }
                            : { background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)", border: 0 })
                      : undefined;
                    return (
                      <button
                        key={s.value}
                        className={`btn vx-btnSm vx-statusBtn vx-status-${s.value}${isOn ? " vx-btnOn" : ""}`}
                        style={activeStyle as any}
                        onClick={() => setStatus(u.tg_id, s.value)}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                <div className="hr" />
              </div>
            ))
          )}
        </div>
      ) : null}

      {section === "requests" ? (
        <div className="card vx-mt10">
          <div className="row vx-between vx-center">
            <div className="small">Заявки</div>
            <button className="btn vx-btnSm" onClick={loadRequests}>Обновить</button>
          </div>
          <div className="hr" />

          {requests.length === 0 ? (
            <div className="small">Пока нет заявок.</div>
          ) : (
            requests.map((r) => {
              const who = r?.from?.username ? "@" + r.from.username : (r?.from?.first_name || "") || `id ${r?.from?.id}`;
              const shortId = String(r.id || "").slice(-6);
              const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
              const stateLabel = REQUEST_STATE_OPTIONS.find((x) => x.value === r.state)?.label || r.state;

              return (
                <div key={r.id} className="vx-mb10">
                  <div>
                    <b>#{shortId}</b>{" "}
                    <span className="small">{created}</span>
                  </div>
                  <div className="small">
                    {who} • {r.sellCurrency} → {r.buyCurrency} • отдаёт: {r.sellAmount} • получит: {r.buyAmount}
                  </div>
                  <div className="small">Статус: <b>{stateLabel}</b></div>

                  <div className="row vx-mt6 vx-rowWrap vx-gap6">
                    {REQUEST_STATE_OPTIONS.map((s) => (
                      <button key={s.value} className="btn vx-btnSm" onClick={() => setRequestState(r.id, s.value)}>
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="hr" />
                </div>
              );
            })
          )}
        </div>
      ) : null}

      {section === "atms" ? (
        <div className="card vx-mt10">
          <div className="row vx-between vx-center">
            <div className="small">Банкоматы (вкладка “Банкоматы” берёт список отсюда)</div>
            <div className="row vx-rowWrap vx-gap6">
              <button className="btn vx-btnSm" onClick={addAtm} disabled={atmsBusy}>Добавить</button>
              <button className="btn vx-btnSm" onClick={saveAtms} disabled={atmsBusy || atms.length === 0}>Сохранить</button>
              <button className="btn vx-btnSm" onClick={reloadAtms} disabled={atmsBusy}>Загрузить</button>
            </div>
          </div>

          <div className="hr" />

          {atms.length === 0 ? (
            <div className="small">Пока пусто. Нажми “Добавить”.</div>
          ) : (
            atms.map((a, idx) => (
              <div key={a.id} className="vx-mb10">
                <div className="small"><b>#{idx + 1}</b></div>

                <input
                  className="input vx-mt6"
                  value={a.title}
                  onChange={(e) => updAtm(a.id, { title: e.target.value })}
                  placeholder="Название банкомата"
                />

                <input
                  className="input vx-mt6"
                  value={a.address || ""}
                  onChange={(e) => updAtm(a.id, { address: e.target.value })}
                  placeholder="Адрес / район (необязательно)"
                />

                <input
                  className="input vx-mt6"
                  value={a.note || ""}
                  onChange={(e) => updAtm(a.id, { note: e.target.value })}
                  placeholder="Комментарий (комиссия, лимиты и т.д.)"
                />

                <input
                  className="input vx-mt6"
                  value={a.mapUrl}
                  onChange={(e) => updAtm(a.id, { mapUrl: e.target.value })}
                  placeholder="Ссылка на Google/Apple Maps"
                />

                <div className="row vx-mt6 vx-rowWrap vx-gap6">
                  <button className="btn vx-btnSm" onClick={() => moveAtm(a.id, -1)} disabled={idx === 0 || atmsBusy}>↑</button>
                  <button className="btn vx-btnSm" onClick={() => moveAtm(a.id, 1)} disabled={idx === atms.length - 1 || atmsBusy}>↓</button>
                  <button className="btn vx-btnSm" onClick={() => delAtm(a.id)} disabled={atmsBusy}>Удалить</button>
                </div>

                {(!a.title.trim() || !a.mapUrl.trim()) ? (
                  <div className="small vx-mt6">⚠️ Заполни Название и Ссылку на карту</div>
                ) : null}

                <div className="hr" />
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
