import React, { useEffect, useRef, useState } from "react";
import {
  apiAdminSetTodayRates,
  apiAdminGetRequests,
  apiAdminSetRequestState,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates,
  apiAdminGetAtms,
  apiAdminSetAtms
} from "../lib/api";
import type { AtmItem } from "../lib/types";

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

function nStr(v: any) {
  const s = String(v ?? "");
  return s === "0" ? "" : s;
}

function toNumStrict(label: string, s: string) {
  const n = Number(String(s).replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Заполни корректно: ${label}`);
  return n;
}

function mkAtmId() {
  return (
    (globalThis as any).crypto?.randomUUID?.() ||
    `atm_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
}

function openMap(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function AdminTab({ me }: any) {
  const [section, setSection] = useState<"rates" | "users" | "requests" | "atms">("rates");

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

  // ATMs
  const [atms, setAtms] = useState<AtmItem[]>([]);
  const [atmsBusy, setAtmsBusy] = useState(false);
  const atmsLoadedRef = useRef(false);

  const clearRates = () => {
    setRubBuy("");
    setRubSell("");
    setUsdtBuy("");
    setUsdtSell("");
    setUsdBuy("");
    setUsdSell("");
    setEurBuy("");
    setEurSell("");
    setThbBuy("");
    setThbSell("");
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

    if (rates.USD) {
      setUsdBuy(nStr(rates.USD.buy_vnd));
      setUsdSell(nStr(rates.USD.sell_vnd));
    }
    if (rates.RUB) {
      setRubBuy(nStr(rates.RUB.buy_vnd));
      setRubSell(nStr(rates.RUB.sell_vnd));
    }
    if (rates.USDT) {
      setUsdtBuy(nStr(rates.USDT.buy_vnd));
      setUsdtSell(nStr(rates.USDT.sell_vnd));
    }
    if (rates.EUR) {
      setEurBuy(nStr(rates.EUR.buy_vnd));
      setEurSell(nStr(rates.EUR.sell_vnd));
    }
    if (rates.THB) {
      setThbBuy(nStr(rates.THB.buy_vnd));
      setThbSell(nStr(rates.THB.sell_vnd));
    }
  };

  const loadAtms = async () => {
    setAtmsBusy(true);
    try {
      const r = await apiAdminGetAtms(me.initData);
      if (r.ok) setAtms(Array.isArray(r.atms) ? r.atms : []);
      else alert(r.error || "Ошибка");
    } finally {
      setAtmsBusy(false);
    }
  };

  const saveAtms = async () => {
    // минимальная валидация
    for (const a of atms) {
      if (!a.title?.trim() || !a.mapUrl?.trim()) {
        alert("Заполни у каждого банкомата: Название и Ссылку на карты");
        return;
      }
    }

    setAtmsBusy(true);
    try {
      const r = await apiAdminSetAtms(me.initData, atms);
      if (r.ok) alert("Список банкоматов сохранён ✅");
      else alert(r.error || "Ошибка");
    } finally {
      setAtmsBusy(false);
    }
  };

  const addAtm = () => {
    setAtms((p) => [
      ...p,
      { id: mkAtmId(), title: "", address: "", note: "", mapUrl: "" }
    ]);
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

  useEffect(() => {
    loadUsers();
    loadRequests();
    // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
    clearRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ленивая загрузка банкоматов, чтобы лишний раз не дергать сервер
  useEffect(() => {
    if (section !== "atms") return;
    if (atmsLoadedRef.current) return;
    atmsLoadedRef.current = true;
    loadAtms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

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

  return (
    <div className="card vx-admin">
      <div className="vx-adminHead">
        <div className="h1">Управление</div>
        <div className="vx-muted">только для владельца</div>
      </div>

      <div className="vx-adminSeg">
        <button className={section === "rates" ? "on" : ""} onClick={() => setSection("rates")}>
          Курс
        </button>
        <button className={section === "users" ? "on" : ""} onClick={() => setSection("users")}>
          Клиенты
        </button>
        <button className={section === "requests" ? "on" : ""} onClick={() => setSection("requests")}>
          Заявки
        </button>
        <button className={section === "atms" ? "on" : ""} onClick={() => setSection("atms")}>
          Банкоматы
        </button>
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
              <button className="btn" onClick={saveRates}>
                Сохранить
              </button>
              <button className="btn" onClick={clearRates}>
                Очистить
              </button>
              <button className="btn" onClick={loadRates}>
                Загрузить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {section === "users" ? (
        <div className="card vx-mt10">
          <div className="row vx-between vx-center">
            <div className="small">Клиенты и статусы</div>
            <button className="btn vx-btnSm" onClick={loadUsers}>
              Обновить
            </button>
          </div>
          <div className="hr" />

          {users.length === 0 ? (
            <div className="small">Пока нет клиентов (они появятся после входа в мини-апп).</div>
          ) : (
            users.map((u) => (
              <div key={u.tg_id} className="vx-mb10">
                <div>
                  <b>
                    {u.first_name ?? ""} {u.last_name ?? ""}
                  </b>{" "}
                  <span className="small">
                    {u.username ? "@" + u.username : ""} • id:{u.tg_id} • статус: {statusLabelAny(u.status)}
                  </span>
                </div>

                <div className="row vx-mt6 vx-rowWrap vx-gap6">
                  {STATUS_OPTIONS.map((s) => (
                    <button key={s.value} className="btn vx-btnSm" onClick={() => setStatus(u.tg_id, s.value)}>
                      {s.label}
                    </button>
                  ))}
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
            <button className="btn vx-btnSm" onClick={loadRequests}>
              Обновить
            </button>
          </div>
          <div className="hr" />

          {requests.length === 0 ? (
            <div className="small">Пока нет заявок.</div>
          ) : (
            requests.map((r) => {
              const who = r?.from?.username
                ? "@" + r.from.username
                : (r?.from?.first_name || "") || `id ${r?.from?.id}`;
              const shortId = String(r.id || "").slice(-6);
              const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
              const stateLabel = REQUEST_STATE_OPTIONS.find((x) => x.value === r.state)?.label || r.state;

              return (
                <div key={r.id} className="vx-mb10">
                  <div>
                    <b>#{shortId}</b> <span className="small">{created}</span>
                  </div>
                  <div className="small">
                    {who} • {r.sellCurrency} → {r.buyCurrency} • отдаёт: {r.sellAmount} • получит: {r.buyAmount}
                  </div>
                  <div className="small">
                    Статус: <b>{stateLabel}</b>
                  </div>

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
          <div className="small">Банкоматы (показываются на вкладке “Банкоматы” в мини‑аппе)</div>
          <div className="hr" />

          <div className="row vx-rowWrap vx-gap8">
            <button className="btn" type="button" onClick={addAtm} disabled={atmsBusy}>
              Добавить
            </button>
            <button
              className="btn"
              type="button"
              onClick={saveAtms}
              disabled={atmsBusy || atms.length === 0}
            >
              Сохранить
            </button>
            <button className="btn" type="button" onClick={loadAtms} disabled={atmsBusy}>
              Загрузить
            </button>
          </div>

          <div className="vx-mt10" />

          {atms.length === 0 ? (
            <div className="small">Пока пусто. Нажми “Добавить”.</div>
          ) : (
            atms.map((a, idx) => (
              <div key={a.id} className="vx-mb10">
                <div className="small">
                  <b>#{idx + 1}</b>
                </div>

                <input
                  className="input vx-mt6"
                  value={a.title}
                  onChange={(e) => updAtm(a.id, { title: e.target.value })}
                  placeholder="Название (например: Vietcombank ATM)"
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
                  <button className="btn vx-btnSm" type="button" onClick={() => moveAtm(a.id, -1)}>
                    ↑
                  </button>
                  <button className="btn vx-btnSm" type="button" onClick={() => moveAtm(a.id, 1)}>
                    ↓
                  </button>
                  <button className="btn vx-btnSm" type="button" onClick={() => delAtm(a.id)}>
                    Удалить
                  </button>
                  <button
                    className="btn vx-btnSm"
                    type="button"
                    onClick={() => a.mapUrl && openMap(a.mapUrl)}
                    disabled={!a.mapUrl}
                  >
                    Открыть
                  </button>
                </div>

                {!a.title.trim() || !a.mapUrl.trim() ? (
                  <div className="small vx-mt6">⚠️ Нужно заполнить Название и Ссылку на карты</div>
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
