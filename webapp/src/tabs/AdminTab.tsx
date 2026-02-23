import React, { useEffect, useState } from "react";
import {
  apiAdminSetTodayRates,
  apiAdminSetAtms,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetAtms,
  apiGetTodayRates
} from "../lib/api";

type AtmEdit = {
  id: string;
  title: string;
  area: string;
  note: string;
  mapUrl: string;
};

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

type AtmRowProps = {
  index: number;
  atm: AtmEdit;
  onPatch: (id: string, patch: Partial<AtmEdit>) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
};

const AtmRow = React.memo(function AtmRow(props: AtmRowProps) {
  const a = props.atm;
  return (
    <div className="vx-atmRow">
      <div className="vx-atmTop">
        <div className="vx-atmNum">{props.index + 1}.</div>
        <div className="vx-atmBtns">
          <button type="button" className="vx-ghostBtn" onClick={() => props.onMove(a.id, -1)} title="Вверх">
            ↑
          </button>
          <button type="button" className="vx-ghostBtn" onClick={() => props.onMove(a.id, 1)} title="Вниз">
            ↓
          </button>
          <button type="button" className="vx-dangerBtn" onClick={() => props.onRemove(a.id)} title="Удалить">
            Удалить
          </button>
        </div>
      </div>

      <div className="vx-atmGrid">
        <input
          className="input"
          value={a.title}
          onChange={(e) => props.onPatch(a.id, { title: e.target.value })}
          placeholder="Название банкомата (например Vietcombank ATM)"
        />
        <input
          className="input"
          value={a.area}
          onChange={(e) => props.onPatch(a.id, { area: e.target.value })}
          placeholder="Район / адрес"
        />
        <input
          className="input"
          value={a.note}
          onChange={(e) => props.onPatch(a.id, { note: e.target.value })}
          placeholder="Комментарий (комиссия, лимиты и т.п.)"
        />
        <input
          className="input"
          value={a.mapUrl}
          onChange={(e) => props.onPatch(a.id, { mapUrl: e.target.value })}
          placeholder="Ссылка на Google/Apple Maps"
        />
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

  const [atms, setAtms] = useState<AtmEdit[]>([]);

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

  const makeClientId = () => {
    const c: any = globalThis as any;
    if (c?.crypto?.randomUUID) return c.crypto.randomUUID();
    return `atm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  };

  const toEdit = (x: any): AtmEdit => ({
    id: String(x?.id ?? "").trim() || makeClientId(),
    title: String(x?.title ?? ""),
    area: String(x?.area ?? ""),
    note: String(x?.note ?? ""),
    mapUrl: String(x?.mapUrl ?? x?.map_url ?? "")
  });

  const loadAtms = async () => {
    const r = await apiGetAtms();
    if (r?.ok) setAtms(Array.isArray((r as any).atms) ? (r as any).atms.map(toEdit) : []);
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
    loadAtms();
    // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
    clearRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const patchAtm = (id: string, patch: Partial<AtmEdit>) => {
    setAtms((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const addAtm = () => {
    setAtms((prev) => [...prev, { id: makeClientId(), title: "", area: "", note: "", mapUrl: "" }]);
  };

  const removeAtm = (id: string) => {
    setAtms((prev) => prev.filter((a) => a.id !== id));
  };

  const moveAtm = (id: string, dir: -1 | 1) => {
    setAtms((prev) => {
      const i = prev.findIndex((x) => x.id === id);
      if (i < 0) return prev;
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  };

  const saveAtms = async () => {
    try {
      const cleaned = atms
        .map((a) => ({
          id: a.id,
          title: a.title.trim(),
          area: a.area.trim(),
          note: a.note.trim(),
          mapUrl: a.mapUrl.trim()
        }))
        .filter((a) => a.title || a.area || a.note || a.mapUrl);

      for (const a of cleaned) {
        if (!a.title) throw new Error("Заполни название банкомата");
        if (!a.mapUrl) throw new Error(`Банкомат “${a.title}”: добавь ссылку на карту`);
      }

      const payload = cleaned.map((a) => ({
        id: a.id,
        title: a.title,
        area: a.area || undefined,
        note: a.note || undefined,
        mapUrl: a.mapUrl
      }));

      const r = await apiAdminSetAtms(me.initData, payload);
      if (r.ok) {
        alert("Банкоматы сохранены ✅");
        loadAtms();
      } else {
        alert(r.error || "Ошибка");
      }
    } catch (e: any) {
      alert(e?.message || "Проверь данные");
    }
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

      <div className="card">
        <div className="small">Банкоматы (список для вкладки “Банкоматы”)</div>
        <div className="hr" />

        {atms.length === 0 ? <div className="small">Список пуст. Нажми “Добавить банкомат”.</div> : null}

        {atms.map((a, idx) => (
          <AtmRow
            key={a.id}
            index={idx}
            atm={a}
            onPatch={patchAtm}
            onRemove={removeAtm}
            onMove={moveAtm}
          />
        ))}

        <div className="vx-mt10">
          <div className="row vx-rowWrap" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={addAtm}>
              Добавить банкомат
            </button>
            <button type="button" className="btn" onClick={saveAtms}>
              Сохранить список
            </button>
            <button type="button" className="btn" onClick={loadAtms}>
              Загрузить текущий
            </button>
          </div>
          <div className="vx-help vx-mt8">
            Подсказка: вставляй ссылку прямо из Google/Apple Maps ("Поделиться" → "Копировать ссылку").
          </div>
        </div>
      </div>
    </div>
  );
}
