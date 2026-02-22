import React, { useEffect, useMemo, useState } from "react";
import {
  apiAdminGetRequests,
  apiAdminSetRequestState,
  apiAdminSetTodayRates,
  apiAdminSetUserStatus,
  apiAdminUsers,
  apiGetTodayRates
} from "../lib/api";

type UserStatus = "standard" | "silver" | "gold";
type RequestState = "new" | "in_progress" | "done" | "canceled";

type StoredUser = {
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  status: UserStatus;
  created_at?: string;
  last_seen_at?: string;
};

type StoredRequest = {
  id: string;
  state: RequestState;
  state_updated_at?: string;
  sellCurrency: string;
  buyCurrency: string;
  sellAmount: number;
  buyAmount: number;
  payMethod?: string;
  receiveMethod: string;
  from: { id: number; username?: string; first_name?: string; last_name?: string };
  status: UserStatus;
  created_at: string;
};

const STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" }
];

const STATE_OPTIONS: Array<{ value: RequestState | "all"; label: string }> = [
  { value: "all", label: "Все" },
  { value: "new", label: "Принята" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "canceled", label: "Отменена" }
];

const DATE_FILTERS: Array<{ value: "all" | "today" | "7d" | "30d"; label: string }> = [
  { value: "all", label: "За всё время" },
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" }
];

function statusRu(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "Золото";
  if (v === "silver") return "Серебро";
  return "Стандарт";
}

function stateRu(s: any) {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "new") return "Принята";
  if (v === "in_progress") return "В работе";
  if (v === "done") return "Готово";
  if (v === "canceled") return "Отменена";
  return v || "—";
}

function fmtDt(s?: string) {
  if (!s) return "";
  try {
    return new Date(s).toLocaleString("ru-RU", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return String(s);
  }
}

function shortId(id: string) {
  return String(id || "").slice(-6);
}

function displayName(u?: { username?: string; first_name?: string; last_name?: string; tg_id?: number; id?: number }) {
  const username = u?.username ? `@${u.username}` : "";
  const full = `${u?.first_name || ""} ${u?.last_name || ""}`.trim();
  const id = u?.tg_id ?? u?.id;
  if (full) return username ? `${full} (${username})` : full;
  if (username) return username;
  if (id) return `id ${id}`;
  return "—";
}

function withinDateFilter(d: Date, filter: "all" | "today" | "7d" | "30d") {
  if (filter === "all") return true;
  const now = new Date();
  const ms = now.getTime() - d.getTime();
  if (filter === "7d") return ms <= 7 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return ms <= 30 * 24 * 60 * 60 * 1000;
  // today (Da Nang)
  const tz = "Asia/Ho_Chi_Minh";
  const fmt = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  return fmt(d) === fmt(now);
}

type ClientAgg = {
  tg_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  status: UserStatus;
  deals: number;
  firstDealAt: string;
  lastDealAt: string;
  lastState: RequestState;
  lastPair: string;
};

export default function Dashboard({ token }: { token: string }) {
  const [tab, setTab] = useState<"deals" | "clients" | "rates">("deals");

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [requests, setRequests] = useState<StoredRequest[]>([]);
  const [lastSync, setLastSync] = useState<string>(new Date().toISOString());

  // filters
  const [q, setQ] = useState("");
  const [stateFilter, setStateFilter] = useState<RequestState | "all">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "7d" | "30d">("7d");

  const [selectedReqId, setSelectedReqId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);

  // rates inputs
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

  const usersById = useMemo(() => {
    const m = new Map<number, StoredUser>();
    for (const u of users) m.set(Number(u.tg_id), u);
    return m;
  }, [users]);

  const loadAll = async () => {
    setLoading(true);
    const [u, r] = await Promise.allSettled([apiAdminUsers(token), apiAdminGetRequests(token)]);
    if (u.status === "fulfilled" && u.value?.ok) setUsers(u.value.users || []);
    if (r.status === "fulfilled" && r.value?.ok) setRequests((r.value.requests || []) as any);
    setLastSync(new Date().toISOString());
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clients: ClientAgg[] = useMemo(() => {
    // Client appears only after first deal (request)
    const map = new Map<number, ClientAgg>();
    for (const r of requests) {
      const id = Number(r?.from?.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const u = usersById.get(id);
      const base = u || ({ tg_id: id, username: r?.from?.username, first_name: r?.from?.first_name, last_name: r?.from?.last_name, status: "standard" } as StoredUser);
      const pair = `${r.sellCurrency}→${r.buyCurrency}`;
      const created = String(r.created_at || "");
      const existing = map.get(id);
      if (!existing) {
        map.set(id, {
          tg_id: id,
          username: base.username,
          first_name: base.first_name,
          last_name: base.last_name,
          status: (base.status || "standard") as UserStatus,
          deals: 1,
          firstDealAt: created,
          lastDealAt: created,
          lastState: (r.state || "new") as RequestState,
          lastPair: pair
        });
      } else {
        existing.deals += 1;
        if (!existing.firstDealAt || created < existing.firstDealAt) existing.firstDealAt = created;
        if (!existing.lastDealAt || created > existing.lastDealAt) {
          existing.lastDealAt = created;
          existing.lastState = (r.state || "new") as RequestState;
          existing.lastPair = pair;
        }
        // keep updated status/name from store users if present
        existing.status = (base.status || existing.status) as UserStatus;
        existing.username = base.username ?? existing.username;
        existing.first_name = base.first_name ?? existing.first_name;
        existing.last_name = base.last_name ?? existing.last_name;
      }
    }
    return [...map.values()].sort((a, b) => String(b.lastDealAt).localeCompare(String(a.lastDealAt)));
  }, [requests, usersById]);

  const filteredRequests: StoredRequest[] = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return [...requests]
      .filter((r) => {
        if (selectedClientId && Number(r?.from?.id) !== selectedClientId) return false;
        if (stateFilter !== "all" && r.state !== stateFilter) return false;
        const d = new Date(r.created_at);
        if (!withinDateFilter(d, dateFilter)) return false;
        if (!qq) return true;

        const u = usersById.get(Number(r?.from?.id));
        const who = `${r?.from?.username || ""} ${r?.from?.first_name || ""} ${r?.from?.last_name || ""} ${u?.username || ""} ${u?.first_name || ""} ${u?.last_name || ""}`
          .toLowerCase()
          .trim();
        const text = `${r.id} ${r.sellCurrency} ${r.buyCurrency} ${r.sellAmount} ${r.buyAmount} ${who}`.toLowerCase();
        return text.includes(qq);
      })
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [requests, q, stateFilter, dateFilter, selectedClientId, usersById]);

  const selectedReq = useMemo(
    () => filteredRequests.find((r) => r.id === selectedReqId) || requests.find((r) => r.id === selectedReqId) || null,
    [filteredRequests, requests, selectedReqId]
  );

  const selectedClient = useMemo(() => {
    if (!selectedClientId) return null;
    return clients.find((c) => c.tg_id === selectedClientId) || null;
  }, [selectedClientId, clients]);

  const clientHistory = useMemo(() => {
    if (!selectedClientId) return [] as StoredRequest[];
    return [...requests]
      .filter((r) => Number(r?.from?.id) === selectedClientId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [requests, selectedClientId]);

  const setUserStatus = async (tgId: number, status: UserStatus) => {
    const r = await apiAdminSetUserStatus(token, tgId, status);
    if (!r?.ok) alert(r?.error || "Ошибка");
    await loadAll();
  };

  const setReqState = async (id: string, state: RequestState) => {
    const r = await apiAdminSetRequestState(token, id, state);
    if (!r?.ok) alert(r?.error || "Ошибка");
    await loadAll();
  };

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

  const loadRates = async () => {
    const r = await apiGetTodayRates();
    const rates = (r as any)?.data?.rates;
    if (!rates) return;
    const nStr = (v: any) => {
      const s = String(v ?? "");
      return s === "0" ? "" : s;
    };
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

  const saveRates = async () => {
    try {
      const toNumStrict = (label: string, s: string) => {
        const n = Number(String(s).replace(",", ".").trim());
        if (!Number.isFinite(n) || n <= 0) throw new Error(`Заполни корректно: ${label}`);
        return n;
      };

      const hasAny = (a: string, b: string) => a.trim() !== "" || b.trim() !== "";
      const hasBoth = (a: string, b: string) => a.trim() !== "" && b.trim() !== "";

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

      const r = await apiAdminSetTodayRates(token, rates);
      if (r?.ok) alert("Курс сохранён ✅");
      else alert(r?.error || "Ошибка");
    } catch (e: any) {
      alert(e?.message || "Проверь значения");
    }
  };

  return (
    <div className="vx-adminDash">
      <div className="card vx-adminToolbar">
        <div className="vx-adminToolbarRow">
          <div className="vx-adminTabs">
            <button className={tab === "deals" ? "vx-chipOn" : "vx-chip"} onClick={() => setTab("deals")}>
              Сделки
            </button>
            <button className={tab === "clients" ? "vx-chipOn" : "vx-chip"} onClick={() => setTab("clients")}>
              Клиенты
            </button>
            <button className={tab === "rates" ? "vx-chipOn" : "vx-chip"} onClick={() => setTab("rates")}>
              Курс
            </button>
          </div>

          <div className="vx-adminToolbarRight">
            <div className="vx-adminMeta">Обновлено: {fmtDt(lastSync)}</div>
            <button className="btn vx-btnSm" onClick={loadAll} disabled={loading}>
              Обновить
            </button>
          </div>
        </div>

        {tab === "deals" ? (
          <div className="vx-adminFilters">
            <input
              className="input vx-adminSearch"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск: имя, @username, id, пара, сумма, #id"
            />

            <select className="input vx-adminSel" value={stateFilter} onChange={(e) => setStateFilter(e.target.value as any)}>
              {STATE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <select className="input vx-adminSel" value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)}>
              {DATE_FILTERS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            {selectedClientId ? (
              <button className="vx-btnGhost vx-adminClear" onClick={() => setSelectedClientId(null)}>
                Сбросить клиента
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {tab === "deals" ? (
        <div className="vx-adminGrid">
          <div className="card vx-adminPanel">
            <div className="vx-panelHead">
              <div className="h2 vx-m0">Сделки</div>
              <div className="vx-muted">{filteredRequests.length} шт.</div>
            </div>

            <div className="vx-adminTableWrap">
              <table className="vx-tablePC">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>#</th>
                    <th>Клиент</th>
                    <th>Пара</th>
                    <th>Отдаёт</th>
                    <th>Получит</th>
                    <th>Способ</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r) => {
                    const id = Number(r?.from?.id);
                    const u = usersById.get(id);
                    const who = displayName(u || ({ id, ...r.from } as any));
                    const isSel = r.id === selectedReqId;
                    const pair = `${r.sellCurrency}→${r.buyCurrency}`;
                    const method = r.receiveMethod || "—";
                    return (
                      <tr
                        key={r.id}
                        className={isSel ? "isSel" : ""}
                        onClick={() => {
                          setSelectedReqId(r.id);
                          setSelectedClientId(id);
                        }}
                      >
                        <td className="mono">{fmtDt(r.created_at)}</td>
                        <td className="mono">{shortId(r.id)}</td>
                        <td>{who}</td>
                        <td className="mono">{pair}</td>
                        <td className="mono">{r.sellAmount}</td>
                        <td className="mono">{r.buyAmount}</td>
                        <td className="mono">{method}</td>
                        <td>
                          <span className={`vx-badge vx-st-${r.state}`}>{stateRu(r.state)}</span>
                        </td>
                        <td className="vx-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="vx-mini" onClick={() => setReqState(r.id, "new")}>Принята</button>
                          <button className="vx-mini" onClick={() => setReqState(r.id, "in_progress")}>В работе</button>
                          <button className="vx-mini" onClick={() => setReqState(r.id, "done")}>Готово</button>
                          <button className="vx-mini vx-miniDanger" onClick={() => setReqState(r.id, "canceled")}>Отмена</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loading && filteredRequests.length === 0 ? (
                <div className="vx-empty">Нет сделок по фильтрам.</div>
              ) : null}
            </div>
          </div>

          <div className="card vx-adminPanel vx-adminSide">
            <div className="vx-panelHead">
              <div className="h2 vx-m0">Клиент</div>
              <div className="vx-muted">история</div>
            </div>

            {!selectedClient ? (
              <div className="vx-empty">Выбери сделку, чтобы увидеть клиента и историю.</div>
            ) : (
              <>
                <div className="vx-clientCard">
                  <div className="vx-clientName">{displayName(selectedClient)}</div>
                  <div className="vx-clientMeta">
                    id: <b>{selectedClient.tg_id}</b> • сделок: <b>{selectedClient.deals}</b> • статус: <b>{statusRu(selectedClient.status)}</b>
                  </div>
                  <div className="vx-clientMeta">последняя: {fmtDt(selectedClient.lastDealAt)} • {stateRu(selectedClient.lastState)} • {selectedClient.lastPair}</div>

                  <div className="vx-clientBtns">
                    {STATUS_OPTIONS.map((s) => (
                      <button key={s.value} className="vx-mini" onClick={() => setUserStatus(selectedClient.tg_id, s.value)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vx-sideList">
                  <div className="vx-sideTitle">История сделок</div>
                  <div className="vx-sideScroll">
                    {clientHistory.map((r) => (
                      <div
                        key={r.id}
                        className={"vx-sideItem " + (r.id === selectedReqId ? "on" : "")}
                        onClick={() => setSelectedReqId(r.id)}
                        role="button"
                      >
                        <div className="vx-sideTop">
                          <span className="mono">#{shortId(r.id)}</span>
                          <span className={`vx-badge vx-st-${r.state}`}>{stateRu(r.state)}</span>
                        </div>
                        <div className="vx-sideMid mono">{r.sellCurrency}→{r.buyCurrency} • {r.sellAmount} → {r.buyAmount}</div>
                        <div className="vx-sideBot">{fmtDt(r.created_at)}</div>
                      </div>
                    ))}
                    {clientHistory.length === 0 ? <div className="vx-empty">История пустая.</div> : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "clients" ? (
        <div className="vx-adminGrid">
          <div className="card vx-adminPanel">
            <div className="vx-panelHead">
              <div className="h2 vx-m0">Клиенты</div>
              <div className="vx-muted">в списке: {clients.length}</div>
            </div>

            <div className="vx-adminFilters">
              <input
                className="input vx-adminSearch"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск: имя, @username, id"
              />
              <button className="vx-btnGhost vx-adminClear" onClick={() => setQ("")}>Сбросить поиск</button>
            </div>

            <div className="vx-clientList">
              {clients
                .filter((c) => {
                  const qq = q.trim().toLowerCase();
                  if (!qq) return true;
                  const t = `${c.tg_id} ${c.username || ""} ${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
                  return t.includes(qq);
                })
                .map((c) => (
                  <div
                    key={c.tg_id}
                    className={"vx-clientRow " + (selectedClientId === c.tg_id ? "on" : "")}
                    onClick={() => setSelectedClientId(c.tg_id)}
                    role="button"
                  >
                    <div className="vx-clientRowTop">
                      <div className="vx-clientRowName">{displayName(c)}</div>
                      <span className={`vx-badge vx-st-${c.lastState}`}>{stateRu(c.lastState)}</span>
                    </div>
                    <div className="vx-clientRowMeta">
                      сделок: <b>{c.deals}</b> • статус: <b>{statusRu(c.status)}</b>
                    </div>
                    <div className="vx-clientRowMeta">последняя: {fmtDt(c.lastDealAt)} • {c.lastPair}</div>
                  </div>
                ))}

              {clients.length === 0 ? <div className="vx-empty">Клиенты появятся после первой заявки.</div> : null}
            </div>
          </div>

          <div className="card vx-adminPanel vx-adminSide">
            <div className="vx-panelHead">
              <div className="h2 vx-m0">История</div>
              <div className="vx-muted">сделок</div>
            </div>

            {!selectedClient ? (
              <div className="vx-empty">Выбери клиента слева.</div>
            ) : (
              <>
                <div className="vx-clientCard">
                  <div className="vx-clientName">{displayName(selectedClient)}</div>
                  <div className="vx-clientMeta">
                    id: <b>{selectedClient.tg_id}</b> • сделок: <b>{selectedClient.deals}</b>
                  </div>

                  <div className="vx-clientBtns">
                    {STATUS_OPTIONS.map((s) => (
                      <button key={s.value} className="vx-mini" onClick={() => setUserStatus(selectedClient.tg_id, s.value)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="vx-sideScroll" style={{ marginTop: 10 }}>
                  {clientHistory.map((r) => (
                    <div key={r.id} className="vx-sideItem">
                      <div className="vx-sideTop">
                        <span className="mono">#{shortId(r.id)}</span>
                        <span className={`vx-badge vx-st-${r.state}`}>{stateRu(r.state)}</span>
                      </div>
                      <div className="vx-sideMid mono">{r.sellCurrency}→{r.buyCurrency} • {r.sellAmount} → {r.buyAmount}</div>
                      <div className="vx-sideBot">{fmtDt(r.created_at)}</div>
                      <div className="vx-sideActions">
                        <button className="vx-mini" onClick={() => setReqState(r.id, "new")}>Принята</button>
                        <button className="vx-mini" onClick={() => setReqState(r.id, "in_progress")}>В работе</button>
                        <button className="vx-mini" onClick={() => setReqState(r.id, "done")}>Готово</button>
                        <button className="vx-mini vx-miniDanger" onClick={() => setReqState(r.id, "canceled")}>Отмена</button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "rates" ? (
        <div className="card vx-adminPanel">
          <div className="vx-panelHead">
            <div className="h2 vx-m0">Курс на сегодня</div>
            <div className="vx-muted">BUY/SELL к VND</div>
          </div>

          <div className="vx-ratesGrid">
            <RateRow code="RUB" buy={rubBuy} sell={rubSell} setBuy={setRubBuy} setSell={setRubSell} />
            <RateRow code="USDT" buy={usdtBuy} sell={usdtSell} setBuy={setUsdtBuy} setSell={setUsdtSell} />
            <RateRow code="USD" buy={usdBuy} sell={usdSell} setBuy={setUsdBuy} setSell={setUsdSell} />
            <RateRow code="EUR" buy={eurBuy} sell={eurSell} setBuy={setEurBuy} setSell={setEurSell} />
            <RateRow code="THB" buy={thbBuy} sell={thbSell} setBuy={setThbBuy} setSell={setThbSell} />
          </div>

          <div className="vx-mt10 row vx-rowWrap vx-gap8">
            <button className="btn" onClick={saveRates}>Сохранить</button>
            <button className="vx-btnGhost" onClick={clearRates}>Очистить</button>
            <button className="vx-btnGhost" onClick={loadRates}>Загрузить текущий</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type RateRowProps = {
  code: string;
  buy: string;
  sell: string;
  setBuy: (v: string) => void;
  setSell: (v: string) => void;
};

const RateRow = React.memo(function RateRow(props: RateRowProps) {
  return (
    <div className="vx-rateRowPC">
      <div className="vx-codePC">{props.code}</div>
      <input
        className="input vx-inPC"
        inputMode="decimal"
        value={props.buy}
        onChange={(e) => props.setBuy(e.target.value)}
        placeholder="BUY"
      />
      <input
        className="input vx-inPC"
        inputMode="decimal"
        value={props.sell}
        onChange={(e) => props.setSell(e.target.value)}
        placeholder="SELL"
      />
    </div>
  );
});
