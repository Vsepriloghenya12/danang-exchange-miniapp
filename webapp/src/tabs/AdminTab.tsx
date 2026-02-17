import React, { useEffect, useMemo, useState } from "react";
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

type StatusValue = typeof STATUS_OPTIONS[number]["value"];
type RateCode = "RUB" | "USDT" | "USD" | "EUR" | "THB";
type RateDraft = Record<RateCode, { buy: string; sell: string }>;

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
  const raw = String(s ?? "").replace(",", ".").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) throw new Error(`Заполни корректно: ${label}`);
  return n;
}

function hasAnyValue(pair: { buy: string; sell: string }) {
  return Boolean(String(pair.buy ?? "").trim() || String(pair.sell ?? "").trim());
}

export default function AdminTab({ me }: any) {
  const [rates, setRates] = useState<RateDraft>({
    RUB: { buy: "260", sell: "275" },
    USDT: { buy: "24800", sell: "25100" },
    USD: { buy: "24800", sell: "25100" },
    EUR: { buy: "", sell: "" },
    THB: { buy: "", sell: "" }
  });

  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [loadingRates, setLoadingRates] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Если поле есть и оно false — закрываем доступ. (Если поля нет — не ломаем приложение)
  const isDenied = me?.is_admin === false;
  const canCallAdminApi = Boolean(me?.initData);

  const loadUsers = async () => {
    if (!canCallAdminApi) return;
    setLoadingUsers(true);
    try {
      const r = await apiAdminUsers(me.initData);
      if (r.ok) setUsers(r.users);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadRates = async () => {
    setLoadingRates(true);
    try {
      const r = await apiGetTodayRates();
      const serverRates = (r as any)?.data?.rates;
      if (!serverRates) return;

      setRates((prev) => {
        const next: RateDraft = { ...prev };
        if (serverRates.RUB)
          next.RUB = { buy: nStr(serverRates.RUB.buy_vnd), sell: nStr(serverRates.RUB.sell_vnd) };
        if (serverRates.USDT)
          next.USDT = { buy: nStr(serverRates.USDT.buy_vnd), sell: nStr(serverRates.USDT.sell_vnd) };
        if (serverRates.USD)
          next.USD = { buy: nStr(serverRates.USD.buy_vnd), sell: nStr(serverRates.USD.sell_vnd) };
        if (serverRates.EUR)
          next.EUR = { buy: nStr(serverRates.EUR.buy_vnd), sell: nStr(serverRates.EUR.sell_vnd) };
        if (serverRates.THB)
          next.THB = { buy: nStr(serverRates.THB.buy_vnd), sell: nStr(serverRates.THB.sell_vnd) };
        return next;
      });
    } finally {
      setLoadingRates(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRates = async () => {
    try {
      if (!canCallAdminApi) throw new Error("Нет initData — открой мини‑апп внутри Telegram");

      // RUB/USDT/USD — обязательные
      const payload: any = {
        RUB: {
          buy_vnd: toNumStrict("RUB BUY", rates.RUB.buy),
          sell_vnd: toNumStrict("RUB SELL", rates.RUB.sell)
        },
        USDT: {
          buy_vnd: toNumStrict("USDT BUY", rates.USDT.buy),
          sell_vnd: toNumStrict("USDT SELL", rates.USDT.sell)
        },
        USD: {
          buy_vnd: toNumStrict("USD BUY", rates.USD.buy),
          sell_vnd: toNumStrict("USD SELL", rates.USD.sell)
        }
      };

      // EUR/THB — опционально (если начали заполнять — требуем оба поля)
      (["EUR", "THB"] as const).forEach((code) => {
        const pair = rates[code];
        if (!hasAnyValue(pair)) return;
        payload[code] = {
          buy_vnd: toNumStrict(`${code} BUY`, pair.buy),
          sell_vnd: toNumStrict(`${code} SELL`, pair.sell)
        };
      });

      setSavingRates(true);
      const r = await apiAdminSetTodayRates(me.initData, payload);
      if (r.ok) alert("Курс сохранён ✅");
      else alert(r.error || "Ошибка");
    } catch (e: any) {
      alert(e?.message || "Проверь значения");
    } finally {
      setSavingRates(false);
    }
  };

  const setStatus = async (tgId: number, status: StatusValue) => {
    if (!canCallAdminApi) return;
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
      <div
        className="vx-rateRow"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 0"
        }}
      >
        <div className="vx-code" style={{ width: 54, fontWeight: 700 }}>
          {props.code}
        </div>

        <div className="vx-fields" style={{ display: "flex", gap: 10, flex: 1 }}>
          <div className="vx-field" style={{ flex: 1 }}>
            <div className="vx-lbl small">BUY</div>
            <input
              className="input vx-in"
              inputMode="decimal"
              value={props.buy}
              onChange={(e) => props.setBuy(e.target.value)}
              placeholder="например 24800"
            />
          </div>

          <div className="vx-field" style={{ flex: 1 }}>
            <div className="vx-lbl small">SELL</div>
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

  const filteredUsers = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return users;
    return users.filter((u) => {
      const hay = [
        u.first_name,
        u.last_name,
        u.username ? "@" + u.username : "",
        String(u.tg_id ?? "")
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [users, q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div className="h1">Управление</div>
          <div className="small">Только для админа • курсы и статусы клиентов</div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="btn"
            onClick={() => {
              loadRates();
              loadUsers();
            }}
          >
            Обновить
          </button>
          <button className="btn" onClick={saveRates} disabled={savingRates}>
            {savingRates ? "Сохранение…" : "Сохранить курс"}
          </button>
        </div>
      </div>

      {isDenied ? (
        <div className="card">
          <div className="h2">Нет доступа</div>
          <div className="small">Эта вкладка доступна только администратору.</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="h2">Курс на сегодня</div>
                <div className="small">BUY/SELL к VND • заполняется каждый день</div>
              </div>
              <div className="small" style={{ opacity: 0.8 }}>
                {loadingRates ? "Загрузка…" : ""}
              </div>
            </div>
            <div className="hr" />

            <RateRow
              code="RUB"
              buy={rates.RUB.buy}
              sell={rates.RUB.sell}
              setBuy={(v) => setRates((p) => ({ ...p, RUB: { ...p.RUB, buy: v } }))}
              setSell={(v) => setRates((p) => ({ ...p, RUB: { ...p.RUB, sell: v } }))}
            />
            <RateRow
              code="USDT"
              buy={rates.USDT.buy}
              sell={rates.USDT.sell}
              setBuy={(v) => setRates((p) => ({ ...p, USDT: { ...p.USDT, buy: v } }))}
              setSell={(v) => setRates((p) => ({ ...p, USDT: { ...p.USDT, sell: v } }))}
            />
            <RateRow
              code="USD"
              buy={rates.USD.buy}
              sell={rates.USD.sell}
              setBuy={(v) => setRates((p) => ({ ...p, USD: { ...p.USD, buy: v } }))}
              setSell={(v) => setRates((p) => ({ ...p, USD: { ...p.USD, sell: v } }))}
            />

            <div className="hr" />
            <div className="small" style={{ opacity: 0.9 }}>
              EUR и THB можно оставить пустыми. Если начинаешь заполнять — заполни оба поля.
            </div>

            <RateRow
              code="EUR"
              buy={rates.EUR.buy}
              sell={rates.EUR.sell}
              setBuy={(v) => setRates((p) => ({ ...p, EUR: { ...p.EUR, buy: v } }))}
              setSell={(v) => setRates((p) => ({ ...p, EUR: { ...p.EUR, sell: v } }))}
            />
            <RateRow
              code="THB"
              buy={rates.THB.buy}
              sell={rates.THB.sell}
              setBuy={(v) => setRates((p) => ({ ...p, THB: { ...p.THB, buy: v } }))}
              setSell={(v) => setRates((p) => ({ ...p, THB: { ...p.THB, sell: v } }))}
            />

            {!canCallAdminApi && (
              <div className="small" style={{ marginTop: 8 }}>
                ⚠️ Нет initData. Открой мини‑апп внутри Telegram, иначе админ‑кнопки не сработают.
              </div>
            )}
          </div>

          <div className="card">
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div className="h2">Клиенты и статусы</div>
                <div className="small">Ищи по имени, @username или id</div>
              </div>
              <div className="small" style={{ opacity: 0.8 }}>
                {loadingUsers ? "Загрузка…" : users.length ? `Всего: ${users.length}` : ""}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск…"
              />
            </div>

            <div className="hr" />

            {filteredUsers.length === 0 ? (
              <div className="small">
                {users.length === 0
                  ? "Пока нет клиентов (они появятся после входа в мини‑апп)."
                  : "Ничего не найдено по поиску."}
              </div>
            ) : (
              filteredUsers.map((u) => {
                const cur = String(u.status ?? "standard").toLowerCase().trim();
                return (
                  <div key={u.tg_id} style={{ padding: "10px 0" }}>
                    <div>
                      <b>
                        {u.first_name ?? ""} {u.last_name ?? ""}
                      </b>{" "}
                      <span className="small">
                        {u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {statusLabelAny(u.status)}
                      </span>
                    </div>

                    <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                      {STATUS_OPTIONS.map((s) => (
                        <button
                          key={s.value}
                          className="btn vx-btnSm"
                          onClick={() => setStatus(u.tg_id, s.value)}
                          style={cur === s.value ? { opacity: 1, transform: "scale(1.01)" } : { opacity: 0.85 }}
                        >
                          {s.label}
                          {cur === s.value ? " ✓" : ""}
                        </button>
                      ))}
                    </div>

                    <div className="hr" />
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
