import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useMemo, useState } from "react";
import { apiAdminGetRequests, apiAdminSetRequestState, apiAdminSetTodayRates, apiAdminSetUserStatus, apiAdminUsers, apiGetTodayRates } from "../lib/api";
const STATUS_OPTIONS = [
    { value: "standard", label: "Стандарт" },
    { value: "silver", label: "Серебро" },
    { value: "gold", label: "Золото" }
];
const STATE_OPTIONS = [
    { value: "all", label: "Все" },
    { value: "new", label: "Принята" },
    { value: "in_progress", label: "В работе" },
    { value: "done", label: "Готово" },
    { value: "canceled", label: "Отменена" }
];
const DATE_FILTERS = [
    { value: "all", label: "За всё время" },
    { value: "today", label: "Сегодня" },
    { value: "7d", label: "7 дней" },
    { value: "30d", label: "30 дней" }
];
function statusRu(s) {
    const v = String(s ?? "").toLowerCase().trim();
    if (v === "gold")
        return "Золото";
    if (v === "silver")
        return "Серебро";
    return "Стандарт";
}
function stateRu(s) {
    const v = String(s ?? "").toLowerCase().trim();
    if (v === "new")
        return "Принята";
    if (v === "in_progress")
        return "В работе";
    if (v === "done")
        return "Готово";
    if (v === "canceled")
        return "Отменена";
    return v || "—";
}
function fmtDt(s) {
    if (!s)
        return "";
    try {
        return new Date(s).toLocaleString("ru-RU", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }
    catch {
        return String(s);
    }
}
function shortId(id) {
    return String(id || "").slice(-6);
}
function displayName(u) {
    const username = u?.username ? `@${u.username}` : "";
    const full = `${u?.first_name || ""} ${u?.last_name || ""}`.trim();
    const id = u?.tg_id ?? u?.id;
    if (full)
        return username ? `${full} (${username})` : full;
    if (username)
        return username;
    if (id)
        return `id ${id}`;
    return "—";
}
function withinDateFilter(d, filter) {
    if (filter === "all")
        return true;
    const now = new Date();
    const ms = now.getTime() - d.getTime();
    if (filter === "7d")
        return ms <= 7 * 24 * 60 * 60 * 1000;
    if (filter === "30d")
        return ms <= 30 * 24 * 60 * 60 * 1000;
    // today (Da Nang)
    const tz = "Asia/Ho_Chi_Minh";
    const fmt = (x) => x.toLocaleDateString("en-CA", { timeZone: tz });
    return fmt(d) === fmt(now);
}
export default function Dashboard({ token }) {
    const [tab, setTab] = useState("deals");
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [lastSync, setLastSync] = useState(new Date().toISOString());
    // filters
    const [q, setQ] = useState("");
    const [stateFilter, setStateFilter] = useState("all");
    const [dateFilter, setDateFilter] = useState("7d");
    const [selectedReqId, setSelectedReqId] = useState("");
    const [selectedClientId, setSelectedClientId] = useState(null);
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
        const m = new Map();
        for (const u of users)
            m.set(Number(u.tg_id), u);
        return m;
    }, [users]);
    const loadAll = async () => {
        setLoading(true);
        const [u, r] = await Promise.allSettled([apiAdminUsers(token), apiAdminGetRequests(token)]);
        if (u.status === "fulfilled" && u.value?.ok)
            setUsers(u.value.users || []);
        if (r.status === "fulfilled" && r.value?.ok)
            setRequests((r.value.requests || []));
        setLastSync(new Date().toISOString());
        setLoading(false);
    };
    useEffect(() => {
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const clients = useMemo(() => {
        // Client appears only after first deal (request)
        const map = new Map();
        for (const r of requests) {
            const id = Number(r?.from?.id);
            if (!Number.isFinite(id) || id <= 0)
                continue;
            const u = usersById.get(id);
            const base = u || { tg_id: id, username: r?.from?.username, first_name: r?.from?.first_name, last_name: r?.from?.last_name, status: "standard" };
            const pair = `${r.sellCurrency}→${r.buyCurrency}`;
            const created = String(r.created_at || "");
            const existing = map.get(id);
            if (!existing) {
                map.set(id, {
                    tg_id: id,
                    username: base.username,
                    first_name: base.first_name,
                    last_name: base.last_name,
                    status: (base.status || "standard"),
                    deals: 1,
                    firstDealAt: created,
                    lastDealAt: created,
                    lastState: (r.state || "new"),
                    lastPair: pair
                });
            }
            else {
                existing.deals += 1;
                if (!existing.firstDealAt || created < existing.firstDealAt)
                    existing.firstDealAt = created;
                if (!existing.lastDealAt || created > existing.lastDealAt) {
                    existing.lastDealAt = created;
                    existing.lastState = (r.state || "new");
                    existing.lastPair = pair;
                }
                // keep updated status/name from store users if present
                existing.status = (base.status || existing.status);
                existing.username = base.username ?? existing.username;
                existing.first_name = base.first_name ?? existing.first_name;
                existing.last_name = base.last_name ?? existing.last_name;
            }
        }
        return [...map.values()].sort((a, b) => String(b.lastDealAt).localeCompare(String(a.lastDealAt)));
    }, [requests, usersById]);
    const filteredRequests = useMemo(() => {
        const qq = q.trim().toLowerCase();
        return [...requests]
            .filter((r) => {
            if (selectedClientId && Number(r?.from?.id) !== selectedClientId)
                return false;
            if (stateFilter !== "all" && r.state !== stateFilter)
                return false;
            const d = new Date(r.created_at);
            if (!withinDateFilter(d, dateFilter))
                return false;
            if (!qq)
                return true;
            const u = usersById.get(Number(r?.from?.id));
            const who = `${r?.from?.username || ""} ${r?.from?.first_name || ""} ${r?.from?.last_name || ""} ${u?.username || ""} ${u?.first_name || ""} ${u?.last_name || ""}`
                .toLowerCase()
                .trim();
            const text = `${r.id} ${r.sellCurrency} ${r.buyCurrency} ${r.sellAmount} ${r.buyAmount} ${who}`.toLowerCase();
            return text.includes(qq);
        })
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }, [requests, q, stateFilter, dateFilter, selectedClientId, usersById]);
    const selectedReq = useMemo(() => filteredRequests.find((r) => r.id === selectedReqId) || requests.find((r) => r.id === selectedReqId) || null, [filteredRequests, requests, selectedReqId]);
    const selectedClient = useMemo(() => {
        if (!selectedClientId)
            return null;
        return clients.find((c) => c.tg_id === selectedClientId) || null;
    }, [selectedClientId, clients]);
    const clientHistory = useMemo(() => {
        if (!selectedClientId)
            return [];
        return [...requests]
            .filter((r) => Number(r?.from?.id) === selectedClientId)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }, [requests, selectedClientId]);
    const setUserStatus = async (tgId, status) => {
        const r = await apiAdminSetUserStatus(token, tgId, status);
        if (!r?.ok)
            alert(r?.error || "Ошибка");
        await loadAll();
    };
    const setReqState = async (id, state) => {
        const r = await apiAdminSetRequestState(token, id, state);
        if (!r?.ok)
            alert(r?.error || "Ошибка");
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
    const applyRatesToForm = (rates) => {
        if (!rates || typeof rates !== "object")
            return;
        clearRates();
        const nStr = (v) => {
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
    const daNangISO = (shiftDays = 0) => {
        const d = new Date(Date.now() + shiftDays * 24 * 60 * 60 * 1000);
        return d.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
    };
    const loadRates = async () => {
        const r = await apiGetTodayRates();
        const rates = r?.data?.rates;
        if (!rates)
            return;
        applyRatesToForm(rates);
    };
    const loadYesterdayRates = async () => {
        const day = daNangISO(-1);
        const r = await apiAdminGetRatesRange(token, { from: day, to: day });
        const item = Array.isArray(r?.items) ? r.items.find((x) => String(x?.date || "") === day) : null;
        const rates = item?.rates;
        if (!rates) {
            alert(`За ${day} курс не найден`);
            return;
        }
        applyRatesToForm(rates);
    };
    const saveRates = async () => {
        try {
            const toNumStrict = (label, s) => {
                const n = Number(String(s).replace(",", ".").trim());
                if (!Number.isFinite(n) || n <= 0)
                    throw new Error(`Заполни корректно: ${label}`);
                return n;
            };
            const hasAny = (a, b) => a.trim() !== "" || b.trim() !== "";
            const hasBoth = (a, b) => a.trim() !== "" && b.trim() !== "";
            if (hasAny(eurBuy, eurSell) && !hasBoth(eurBuy, eurSell)) {
                throw new Error("EUR: заполни BUY и SELL (или оставь оба поля пустыми)");
            }
            if (hasAny(thbBuy, thbSell) && !hasBoth(thbBuy, thbSell)) {
                throw new Error("THB: заполни BUY и SELL (или оставь оба поля пустыми)");
            }
            const rates = {
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
            if (r?.ok)
                alert("Курс сохранён ✅");
            else
                alert(r?.error || "Ошибка");
        }
        catch (e) {
            alert(e?.message || "Проверь значения");
        }
    };
    return (_jsxs("div", { className: "vx-adminDash", children: [_jsxs("div", { className: "card vx-adminToolbar", children: [_jsxs("div", { className: "vx-adminToolbarRow", children: [_jsxs("div", { className: "vx-adminTabs", children: [_jsx("button", { className: tab === "deals" ? "vx-chipOn" : "vx-chip", onClick: () => setTab("deals"), children: "\u0421\u0434\u0435\u043B\u043A\u0438" }), _jsx("button", { className: tab === "clients" ? "vx-chipOn" : "vx-chip", onClick: () => setTab("clients"), children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }), _jsx("button", { className: tab === "rates" ? "vx-chipOn" : "vx-chip", onClick: () => setTab("rates"), children: "\u041A\u0443\u0440\u0441" })] }), _jsxs("div", { className: "vx-adminToolbarRight", children: [_jsxs("div", { className: "vx-adminMeta", children: ["\u041E\u0431\u043D\u043E\u0432\u043B\u0435\u043D\u043E: ", fmtDt(lastSync)] }), _jsx("button", { className: "btn vx-btnSm", onClick: loadAll, disabled: loading, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" })] })] }), tab === "deals" ? (_jsxs("div", { className: "vx-adminFilters", children: [_jsx("input", { className: "input vx-adminSearch", value: q, onChange: (e) => setQ(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A: \u0438\u043C\u044F, @username, id, \u043F\u0430\u0440\u0430, \u0441\u0443\u043C\u043C\u0430, #id" }), _jsx("select", { className: "input vx-adminSel", value: stateFilter, onChange: (e) => setStateFilter(e.target.value), children: STATE_OPTIONS.map((s) => (_jsx("option", { value: s.value, children: s.label }, s.value))) }), _jsx("select", { className: "input vx-adminSel", value: dateFilter, onChange: (e) => setDateFilter(e.target.value), children: DATE_FILTERS.map((d) => (_jsx("option", { value: d.value, children: d.label }, d.value))) }), selectedClientId ? (_jsx("button", { className: "vx-btnGhost vx-adminClear", onClick: () => setSelectedClientId(null), children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430" })) : null] })) : null] }), tab === "deals" ? (_jsxs("div", { className: "vx-adminGrid", children: [_jsxs("div", { className: "card vx-adminPanel", children: [_jsxs("div", { className: "vx-panelHead", children: [_jsx("div", { className: "h2 vx-m0", children: "\u0421\u0434\u0435\u043B\u043A\u0438" }), _jsxs("div", { className: "vx-muted", children: [filteredRequests.length, " \u0448\u0442."] })] }), _jsxs("div", { className: "vx-adminTableWrap", children: [_jsxs("table", { className: "vx-tablePC", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { children: "#" }), _jsx("th", { children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { children: "\u041F\u0430\u0440\u0430" }), _jsx("th", { children: "\u041E\u0442\u0434\u0430\u0451\u0442" }), _jsx("th", { children: "\u041F\u043E\u043B\u0443\u0447\u0438\u0442" }), _jsx("th", { children: "\u0421\u043F\u043E\u0441\u043E\u0431" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("th", {})] }) }), _jsx("tbody", { children: filteredRequests.map((r) => {
                                                    const id = Number(r?.from?.id);
                                                    const u = usersById.get(id);
                                                    const who = displayName(u || { id, ...r.from });
                                                    const isSel = r.id === selectedReqId;
                                                    const pair = `${r.sellCurrency}→${r.buyCurrency}`;
                                                    const method = r.receiveMethod || "—";
                                                    return (_jsxs("tr", { className: isSel ? "isSel" : "", onClick: () => {
                                                            setSelectedReqId(r.id);
                                                            setSelectedClientId(id);
                                                        }, children: [_jsx("td", { className: "mono", children: fmtDt(r.created_at) }), _jsx("td", { className: "mono", children: shortId(r.id) }), _jsx("td", { children: who }), _jsx("td", { className: "mono", children: pair }), _jsx("td", { className: "mono", children: r.sellAmount }), _jsx("td", { className: "mono", children: r.buyAmount }), _jsx("td", { className: "mono", children: method }), _jsx("td", { children: _jsx("span", { className: `vx-badge vx-st-${r.state}`, children: stateRu(r.state) }) }), _jsxs("td", { className: "vx-actions", onClick: (e) => e.stopPropagation(), children: [_jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "new"), children: "\u041F\u0440\u0438\u043D\u044F\u0442\u0430" }), _jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "in_progress"), children: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435" }), _jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "done"), children: "\u0413\u043E\u0442\u043E\u0432\u043E" }), _jsx("button", { className: "vx-mini vx-miniDanger", onClick: () => setReqState(r.id, "canceled"), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }, r.id));
                                                }) })] }), !loading && filteredRequests.length === 0 ? (_jsx("div", { className: "vx-empty", children: "\u041D\u0435\u0442 \u0441\u0434\u0435\u043B\u043E\u043A \u043F\u043E \u0444\u0438\u043B\u044C\u0442\u0440\u0430\u043C." })) : null] })] }), _jsxs("div", { className: "card vx-adminPanel vx-adminSide", children: [_jsxs("div", { className: "vx-panelHead", children: [_jsx("div", { className: "h2 vx-m0", children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("div", { className: "vx-muted", children: "\u0438\u0441\u0442\u043E\u0440\u0438\u044F" })] }), !selectedClient ? (_jsx("div", { className: "vx-empty", children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u0441\u0434\u0435\u043B\u043A\u0443, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u0438 \u0438\u0441\u0442\u043E\u0440\u0438\u044E." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "vx-clientCard", children: [_jsx("div", { className: "vx-clientName", children: displayName(selectedClient) }), _jsxs("div", { className: "vx-clientMeta", children: ["id: ", _jsx("b", { children: selectedClient.tg_id }), " \u2022 \u0441\u0434\u0435\u043B\u043E\u043A: ", _jsx("b", { children: selectedClient.deals }), " \u2022 \u0441\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: statusRu(selectedClient.status) })] }), _jsxs("div", { className: "vx-clientMeta", children: ["\u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F: ", fmtDt(selectedClient.lastDealAt), " \u2022 ", stateRu(selectedClient.lastState), " \u2022 ", selectedClient.lastPair] }), _jsx("div", { className: "vx-clientBtns", children: STATUS_OPTIONS.map((s) => (_jsx("button", { className: "vx-mini" + (selectedClient.status === s.value ? " vx-miniOn" : ""), onClick: () => setUserStatus(selectedClient.tg_id, s.value), children: s.label }, s.value))) })] }), _jsxs("div", { className: "vx-sideList", children: [_jsx("div", { className: "vx-sideTitle", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0441\u0434\u0435\u043B\u043E\u043A" }), _jsxs("div", { className: "vx-sideScroll", children: [clientHistory.map((r) => (_jsxs("div", { className: "vx-sideItem " + (r.id === selectedReqId ? "on" : ""), onClick: () => setSelectedReqId(r.id), role: "button", children: [_jsxs("div", { className: "vx-sideTop", children: [_jsxs("span", { className: "mono", children: ["#", shortId(r.id)] }), _jsx("span", { className: `vx-badge vx-st-${r.state}`, children: stateRu(r.state) })] }), _jsxs("div", { className: "vx-sideMid mono", children: [r.sellCurrency, "\u2192", r.buyCurrency, " \u2022 ", r.sellAmount, " \u2192 ", r.buyAmount] }), _jsx("div", { className: "vx-sideBot", children: fmtDt(r.created_at) })] }, r.id))), clientHistory.length === 0 ? _jsx("div", { className: "vx-empty", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u043F\u0443\u0441\u0442\u0430\u044F." }) : null] })] })] }))] })] })) : null, tab === "clients" ? (_jsxs("div", { className: "vx-adminGrid", children: [_jsxs("div", { className: "card vx-adminPanel", children: [_jsxs("div", { className: "vx-panelHead", children: [_jsx("div", { className: "h2 vx-m0", children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }), _jsxs("div", { className: "vx-muted", children: ["\u0432 \u0441\u043F\u0438\u0441\u043A\u0435: ", clients.length] })] }), _jsxs("div", { className: "vx-adminFilters", children: [_jsx("input", { className: "input vx-adminSearch", value: q, onChange: (e) => setQ(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A: \u0438\u043C\u044F, @username, id" }), _jsx("button", { className: "vx-btnGhost vx-adminClear", onClick: () => setQ(""), children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u043F\u043E\u0438\u0441\u043A" })] }), _jsxs("div", { className: "vx-clientList", children: [clients
                                        .filter((c) => {
                                        const qq = q.trim().toLowerCase();
                                        if (!qq)
                                            return true;
                                        const t = `${c.tg_id} ${c.username || ""} ${c.first_name || ""} ${c.last_name || ""}`.toLowerCase();
                                        return t.includes(qq);
                                    })
                                        .map((c) => (_jsxs("div", { className: "vx-clientRow " + (selectedClientId === c.tg_id ? "on" : ""), onClick: () => setSelectedClientId(c.tg_id), role: "button", children: [_jsxs("div", { className: "vx-clientRowTop", children: [_jsx("div", { className: "vx-clientRowName", children: displayName(c) }), _jsx("span", { className: `vx-badge vx-st-${c.lastState}`, children: stateRu(c.lastState) })] }), _jsxs("div", { className: "vx-clientRowMeta", children: ["\u0441\u0434\u0435\u043B\u043E\u043A: ", _jsx("b", { children: c.deals }), " \u2022 \u0441\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: statusRu(c.status) })] }), _jsxs("div", { className: "vx-clientRowMeta", children: ["\u043F\u043E\u0441\u043B\u0435\u0434\u043D\u044F\u044F: ", fmtDt(c.lastDealAt), " \u2022 ", c.lastPair] })] }, c.tg_id))), clients.length === 0 ? _jsx("div", { className: "vx-empty", children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0435\u0440\u0432\u043E\u0439 \u0437\u0430\u044F\u0432\u043A\u0438." }) : null] })] }), _jsxs("div", { className: "card vx-adminPanel vx-adminSide", children: [_jsxs("div", { className: "vx-panelHead", children: [_jsx("div", { className: "h2 vx-m0", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" }), _jsx("div", { className: "vx-muted", children: "\u0441\u0434\u0435\u043B\u043E\u043A" })] }), !selectedClient ? (_jsx("div", { className: "vx-empty", children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u0441\u043B\u0435\u0432\u0430." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "vx-clientCard", children: [_jsx("div", { className: "vx-clientName", children: displayName(selectedClient) }), _jsxs("div", { className: "vx-clientMeta", children: ["id: ", _jsx("b", { children: selectedClient.tg_id }), " \u2022 \u0441\u0434\u0435\u043B\u043E\u043A: ", _jsx("b", { children: selectedClient.deals }), " \u2022 \u0441\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: statusRu(selectedClient.status) })] }), _jsx("div", { className: "vx-clientBtns", children: STATUS_OPTIONS.map((s) => (_jsx("button", { className: "vx-mini" + (selectedClient.status === s.value ? " vx-miniOn" : ""), onClick: () => setUserStatus(selectedClient.tg_id, s.value), children: s.label }, s.value))) })] }), _jsx("div", { className: "vx-sideScroll", style: { marginTop: 10 }, children: clientHistory.map((r) => (_jsxs("div", { className: "vx-sideItem", children: [_jsxs("div", { className: "vx-sideTop", children: [_jsxs("span", { className: "mono", children: ["#", shortId(r.id)] }), _jsx("span", { className: `vx-badge vx-st-${r.state}`, children: stateRu(r.state) })] }), _jsxs("div", { className: "vx-sideMid mono", children: [r.sellCurrency, "\u2192", r.buyCurrency, " \u2022 ", r.sellAmount, " \u2192 ", r.buyAmount] }), _jsx("div", { className: "vx-sideBot", children: fmtDt(r.created_at) }), _jsxs("div", { className: "vx-sideActions", children: [_jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "new"), children: "\u041F\u0440\u0438\u043D\u044F\u0442\u0430" }), _jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "in_progress"), children: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435" }), _jsx("button", { className: "vx-mini", onClick: () => setReqState(r.id, "done"), children: "\u0413\u043E\u0442\u043E\u0432\u043E" }), _jsx("button", { className: "vx-mini vx-miniDanger", onClick: () => setReqState(r.id, "canceled"), children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }, r.id))) })] }))] })] })) : null, tab === "rates" ? (_jsxs("div", { className: "card vx-adminPanel", children: [_jsxs("div", { className: "vx-panelHead", children: [_jsx("div", { className: "h2 vx-m0", children: "\u041A\u0443\u0440\u0441 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F" }), _jsx("div", { className: "vx-muted", children: "BUY/SELL \u043A VND" })] }), _jsxs("div", { className: "vx-ratesGrid", children: [_jsx(RateRow, { code: "RUB", buy: rubBuy, sell: rubSell, setBuy: setRubBuy, setSell: setRubSell }), _jsx(RateRow, { code: "USDT", buy: usdtBuy, sell: usdtSell, setBuy: setUsdtBuy, setSell: setUsdtSell }), _jsx(RateRow, { code: "USD", buy: usdBuy, sell: usdSell, setBuy: setUsdBuy, setSell: setUsdSell }), _jsx(RateRow, { code: "EUR", buy: eurBuy, sell: eurSell, setBuy: setEurBuy, setSell: setEurSell }), _jsx(RateRow, { code: "THB", buy: thbBuy, sell: thbSell, setBuy: setThbBuy, setSell: setThbSell })] }), _jsxs("div", { className: "vx-mt10 row vx-rowWrap vx-gap8", children: [_jsx("button", { className: "btn", onClick: saveRates, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "vx-btnGhost", onClick: clearRates, children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C" }), _jsx("button", { className: "vx-btnGhost", onClick: loadYesterdayRates, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0447\u0435\u0440\u0430\u0448\u043D\u0438\u0439" }), _jsx("button", { className: "vx-btnGhost", onClick: loadRates, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0438\u0439" })] })] })) : null] }));
}
const RateRow = React.memo(function RateRow(props) {
    return (_jsxs("div", { className: "vx-rateRowPC", children: [_jsx("div", { className: "vx-codePC", children: props.code }), _jsx("input", { className: "input vx-inPC", inputMode: "decimal", value: props.buy, onChange: (e) => props.setBuy(e.target.value), placeholder: "BUY" }), _jsx("input", { className: "input vx-inPC", inputMode: "decimal", value: props.sell, onChange: (e) => props.setSell(e.target.value), placeholder: "SELL" })] }));
});
