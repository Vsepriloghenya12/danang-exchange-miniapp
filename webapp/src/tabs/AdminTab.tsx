import React, { useEffect, useState } from "react";
import {
  apiAdminSetTodayRates,
  apiAdminGetBonuses,
  apiAdminSetBonuses,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates
} from "../lib/api";

type BonusTier = { upTo: number | null; standard: number; silver: number; gold: number };
type BonusConfig = {
  enabled: { status: boolean; method: boolean };
  cashCancelsMethodBonus: boolean;
  statusTiers: {
    RUB: { tiers: BonusTier[] };
    USD: { tiers: BonusTier[] };
    USDT: { tiers: BonusTier[] };
  };
  methodBonuses: {
    RUB: { transfer: number; atm: number };
    USD: { transfer: number; atm: number };
    USDT: { transfer: number; atm: number };
  };
};

function defaultBonuses(): BonusConfig {
  return {
    enabled: { status: true, method: true },
    cashCancelsMethodBonus: true,
    statusTiers: {
      RUB: {
        tiers: [
          { upTo: 50_000, standard: 0, silver: 1, gold: 2 },
          { upTo: 100_000, standard: 1, silver: 2, gold: 3 },
          { upTo: 200_000, standard: 2, silver: 3, gold: 4 },
          { upTo: null, standard: 3, silver: 4, gold: 5 }
        ]
      },
      USD: {
        tiers: [
          { upTo: 1000, standard: 0, silver: 100, gold: 150 },
          { upTo: 3000, standard: 100, silver: 150, gold: 200 },
          { upTo: null, standard: 150, silver: 200, gold: 250 }
        ]
      },
      USDT: {
        tiers: [
          { upTo: 1000, standard: 0, silver: 100, gold: 150 },
          { upTo: 3000, standard: 100, silver: 150, gold: 200 },
          { upTo: null, standard: 150, silver: 200, gold: 250 }
        ]
      }
    },
    methodBonuses: {
      RUB: { transfer: 1, atm: 1 },
      USD: { transfer: 100, atm: 100 },
      USDT: { transfer: 100, atm: 100 }
    }
  };
}

function toNum0(s: string) {
  const n = Number(String(s ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function mergeBonuses(raw: any): BonusConfig {
  const d = defaultBonuses();
  const r = raw && typeof raw === "object" ? raw : {};

  const enabled = {
    status: typeof r.enabled?.status === "boolean" ? r.enabled.status : d.enabled.status,
    method: typeof r.enabled?.method === "boolean" ? r.enabled.method : d.enabled.method
  };

  const cashCancelsMethodBonus =
    typeof r.cashCancelsMethodBonus === "boolean" ? r.cashCancelsMethodBonus : d.cashCancelsMethodBonus;

  const normTiers = (cur: "RUB" | "USD" | "USDT") => {
    const def = d.statusTiers[cur].tiers;
    const arr = Array.isArray(r.statusTiers?.[cur]?.tiers) ? r.statusTiers[cur].tiers : [];
    return {
      tiers: def.map((t, i) => {
        const src = arr[i] || {};
        const upTo = src.upTo === null ? null : (src.upTo === undefined ? t.upTo : toNum0(String(src.upTo)));
        return {
          upTo,
          standard: Number.isFinite(Number(src.standard)) ? Number(src.standard) : t.standard,
          silver: Number.isFinite(Number(src.silver)) ? Number(src.silver) : t.silver,
          gold: Number.isFinite(Number(src.gold)) ? Number(src.gold) : t.gold
        };
      })
    };
  };

  const normMethod = (cur: "RUB" | "USD" | "USDT") => {
    const def = d.methodBonuses[cur];
    const src = r.methodBonuses?.[cur] || {};
    return {
      transfer: Number.isFinite(Number(src.transfer)) ? Number(src.transfer) : def.transfer,
      atm: Number.isFinite(Number(src.atm)) ? Number(src.atm) : def.atm
    };
  };

  return {
    enabled,
    cashCancelsMethodBonus,
    statusTiers: { RUB: normTiers("RUB"), USD: normTiers("USD"), USDT: normTiers("USDT") },
    methodBonuses: { RUB: normMethod("RUB"), USD: normMethod("USD"), USDT: normMethod("USDT") }
  };
}

const STATUS_OPTIONS = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" }
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

  const [bonuses, setBonuses] = useState<BonusConfig>(defaultBonuses());
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

  const loadBonuses = async () => {
    const r = await apiAdminGetBonuses(me.initData);
    if (r?.ok) {
      setBonuses(mergeBonuses(r.bonuses));
      setBonusesLoaded(true);
    }
  };

  useEffect(() => {
    loadUsers();
    loadBonuses();
    // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
    clearRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTierVal = (
    cur: "RUB" | "USD",
    idx: number,
    field: "standard" | "silver" | "gold",
    v: string
  ) => {
    const n = toNum0(v);
    setBonuses((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as BonusConfig;
      next.statusTiers[cur].tiers[idx][field] = n;
      // USDT держим синхронно с USD
      if (cur === "USD") next.statusTiers.USDT = JSON.parse(JSON.stringify(next.statusTiers.USD));
      return next;
    });
  };

  const setMethodVal = (cur: "RUB" | "USD", field: "transfer" | "atm", v: string) => {
    const n = toNum0(v);
    setBonuses((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as BonusConfig;
      next.methodBonuses[cur][field] = n;
      if (cur === "USD") next.methodBonuses.USDT = JSON.parse(JSON.stringify(next.methodBonuses.USD));
      return next;
    });
  };

  const saveBonuses = async () => {
    // На всякий случай синхронизируем USDT с USD
    const payload: BonusConfig = JSON.parse(JSON.stringify(bonuses));
    payload.statusTiers.USDT = JSON.parse(JSON.stringify(payload.statusTiers.USD));
    payload.methodBonuses.USDT = JSON.parse(JSON.stringify(payload.methodBonuses.USD));

    const r = await apiAdminSetBonuses(me.initData, payload);
    if (r?.ok) {
      setBonuses(mergeBonuses(r.bonuses));
      setBonusesLoaded(true);
      alert("Надбавки сохранены ✅");
    } else {
      alert(r?.error || "Ошибка");
    }
  };

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

  return (
    <div className="card">
<div className="h1">Управление</div>

      <div className="card">
        <div className="small">Курс на сегодня (BUY/SELL к VND) — заполняется каждый день</div>
        <div className="hr" />

        <RateRow code="RUB"  buy={rubBuy}  sell={rubSell}  setBuy={setRubBuy}  setSell={setRubSell} />
        <RateRow code="USDT" buy={usdtBuy} sell={usdtSell} setBuy={setUsdtBuy} setSell={setUsdtSell} />
        <RateRow code="USD"  buy={usdBuy}  sell={usdSell}  setBuy={setUsdBuy}  setSell={setUsdSell} />
        <RateRow code="EUR"  buy={eurBuy}  sell={eurSell}  setBuy={setEurBuy}  setSell={setEurSell} />
        <RateRow code="THB"  buy={thbBuy}  sell={thbSell}  setBuy={setThbBuy}  setSell={setThbSell} />

        <div className="vx-mt10">
          <div className="row vx-rowWrap" style={{ gap: 8 }}>
            <button className="btn" onClick={saveRates}>Сохранить курс</button>
            <button className="btn" onClick={clearRates}>Очистить</button>
            <button className="btn" onClick={loadRates}>Загрузить текущий</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="small">Надбавки (по статусу/сумме и по способу получения)</div>
        <div className="hr" />

        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" as any }}>
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!bonuses.enabled.status}
              onChange={(e) => setBonuses((p) => ({ ...p, enabled: { ...p.enabled, status: e.target.checked } }))}
            />
            Надбавки по статусам
          </label>

          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={!!bonuses.enabled.method}
              onChange={(e) => setBonuses((p) => ({ ...p, enabled: { ...p.enabled, method: e.target.checked } }))}
            />
            Надбавки за способ получения
          </label>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          USD и USDT синхронизируются автоматически.
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="h3">Статусы (RUB)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {bonuses.statusTiers.RUB.tiers.map((t, i) => (
              <div
                key={`rub-tier-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px repeat(3, minmax(0, 1fr))",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <div className="small">
                  {t.upTo == null
                    ? `≥ ${bonuses.statusTiers.RUB.tiers[i - 1]?.upTo ?? ""}`
                    : `< ${t.upTo}`}
                </div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="standard"
                  value={nStr(t.standard)}
                  onChange={(e) => setTierVal("RUB", i, "standard", e.target.value)}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="silver"
                  value={nStr(t.silver)}
                  onChange={(e) => setTierVal("RUB", i, "silver", e.target.value)}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="gold"
                  value={nStr(t.gold)}
                  onChange={(e) => setTierVal("RUB", i, "gold", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="h3">Статусы (USD/USDT)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {bonuses.statusTiers.USD.tiers.map((t, i) => (
              <div
                key={`usd-tier-${i}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px repeat(3, minmax(0, 1fr))",
                  gap: 8,
                  alignItems: "center"
                }}
              >
                <div className="small">
                  {t.upTo == null
                    ? `≥ ${bonuses.statusTiers.USD.tiers[i - 1]?.upTo ?? ""}`
                    : `< ${t.upTo}`}
                </div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="standard"
                  value={nStr(t.standard)}
                  onChange={(e) => setTierVal("USD", i, "standard", e.target.value)}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="silver"
                  value={nStr(t.silver)}
                  onChange={(e) => setTierVal("USD", i, "silver", e.target.value)}
                />
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="gold"
                  value={nStr(t.gold)}
                  onChange={(e) => setTierVal("USD", i, "gold", e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="h3">Способ получения (когда покупаем VND)</div>
          <div className="small">Если выбрано «Наличные» (отдаёте или получаете) — надбавка отменяется.</div>

          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div className="small" />
              <div className="small"><b>Перевод</b></div>
              <div className="small"><b>Банкомат</b></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "80px repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div className="small"><b>RUB</b></div>
              <input
                className="input"
                inputMode="decimal"
                value={nStr(bonuses.methodBonuses.RUB.transfer)}
                onChange={(e) => setMethodVal("RUB", "transfer", e.target.value)}
              />
              <input
                className="input"
                inputMode="decimal"
                value={nStr(bonuses.methodBonuses.RUB.atm)}
                onChange={(e) => setMethodVal("RUB", "atm", e.target.value)}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "80px repeat(2, minmax(0, 1fr))", gap: 8 }}>
              <div className="small"><b>USD/USDT</b></div>
              <input
                className="input"
                inputMode="decimal"
                value={nStr(bonuses.methodBonuses.USD.transfer)}
                onChange={(e) => setMethodVal("USD", "transfer", e.target.value)}
              />
              <input
                className="input"
                inputMode="decimal"
                value={nStr(bonuses.methodBonuses.USD.atm)}
                onChange={(e) => setMethodVal("USD", "atm", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="vx-mt10">
          <div className="row vx-rowWrap" style={{ gap: 8 }}>
            <button className="btn" onClick={saveBonuses}>Сохранить надбавки</button>
            <button className="btn" onClick={loadBonuses}>{bonusesLoaded ? "Обновить" : "Загрузить"}</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="small">Клиенты и статусы</div>
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

              <div className="row vx-mt6 vx-rowWrap">
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    className="btn vx-btnSm"
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
