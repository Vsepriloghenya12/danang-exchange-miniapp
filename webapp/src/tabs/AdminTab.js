import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useState } from "react";
import { apiAdminSetTodayRates, apiAdminGetRequests, apiAdminSetRequestState, apiAdminSetUserStatus, apiAdminUsers, apiGetTodayRates, apiAdminGetBonuses, apiAdminSetBonuses, apiAdminGetReviews, apiAdminApproveReview, apiAdminRejectReview, apiAdminReplyReview, apiAdminGetRatesRange } from "../lib/api";
const STATUS_OPTIONS = [
    { value: "standard", label: "Стандарт" },
    { value: "silver", label: "Серебро" },
    { value: "gold", label: "Золото" }
];
const REQUEST_STATE_OPTIONS = [
    { value: "new", label: "Принята" },
    { value: "in_progress", label: "В работе" },
    { value: "done", label: "Готово" },
    { value: "canceled", label: "Отклонена" }
];
// ВАЖНО: компонент вынесен наружу.
// Если объявлять компонент внутри AdminTab, на каждом setState создаётся НОВАЯ функция-компонент,
// React размонтирует/монтирует её заново → инпут теряет фокус → клавиатура закрывается.
const RateRow = React.memo(function RateRow(props) {
    return (_jsxs("div", { className: "vx-rateRow", children: [_jsx("div", { className: "vx-code", children: props.code }), _jsxs("div", { className: "vx-fields", children: [_jsx("div", { className: "vx-field", children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: props.buy, onChange: (e) => props.setBuy(e.target.value), placeholder: "0" }) }), _jsx("div", { className: "vx-field", children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: props.sell, onChange: (e) => props.setSell(e.target.value), placeholder: "0" }) })] })] }));
});
function statusLabelAny(s) {
    const v = String(s ?? "").toLowerCase().trim();
    if (v === "gold")
        return "Золото";
    if (v === "silver")
        return "Серебро";
    return "Стандарт";
}
function statusValueAny(s) {
    const v = String(s ?? "").toLowerCase().trim();
    if (v === "gold")
        return "gold";
    if (v === "silver")
        return "silver";
    return "standard";
}
function nStr(v) {
    const s = String(v ?? "");
    return s === "0" ? "" : s;
}
function toNumStrict(label, s) {
    const n = Number(String(s).replace(",", ".").trim());
    if (!Number.isFinite(n) || n <= 0)
        throw new Error(`Заполни корректно: ${label}`);
    return n;
}
// Защита от «битых» данных в store.json (например, bonuses = {}), чтобы UI не падал.
function normalizeBonuses(input) {
    const src = input && typeof input === "object" ? input : {};
    const num = (v, d = 0) => {
        const n = Number(String(v ?? "").replace(",", ".").trim());
        return Number.isFinite(n) ? n : d;
    };
    const tierList = (arr) => (Array.isArray(arr) ? arr : []);
    return {
        enabled: {
            tiers: typeof src?.enabled?.tiers === "boolean" ? src.enabled.tiers : true,
            methods: typeof src?.enabled?.methods === "boolean" ? src.enabled.methods : true
        },
        tiers: {
            RUB: tierList(src?.tiers?.RUB),
            USD: tierList(src?.tiers?.USD),
            USDT: tierList(src?.tiers?.USDT)
        },
        methods: {
            transfer: {
                RUB: num(src?.methods?.transfer?.RUB, 0),
                USD: num(src?.methods?.transfer?.USD, 0),
                USDT: num(src?.methods?.transfer?.USDT, 0)
            },
            atm: {
                RUB: num(src?.methods?.atm?.RUB, 0),
                USD: num(src?.methods?.atm?.USD, 0),
                USDT: num(src?.methods?.atm?.USDT, 0)
            }
        }
    };
}
export default function AdminTab({ me, forcedSection, hideHeader, hideSeg }) {
    const [section, setSection] = useState(forcedSection || "rates");
    // Allow the parent to fully control which section is displayed.
    useEffect(() => {
        if (!forcedSection)
            return;
        setSection(forcedSection);
    }, [forcedSection]);
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
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [requestsFilter, setRequestsFilter] = useState("all");
    const [bonuses, setBonuses] = useState(null);
    const [bonusesBusy, setBonusesBusy] = useState(false);
    const [bonusesLoaded, setBonusesLoaded] = useState(false);
    const [reviewsLoaded, setReviewsLoaded] = useState(false);
    const [reviewsBusy, setReviewsBusy] = useState(false);
    const [adminReviews, setAdminReviews] = useState([]);
    const [reviewsFilter, setReviewsFilter] = useState("pending");
    const [replyDrafts, setReplyDrafts] = useState({});
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
        if (r.ok)
            setUsers(r.users);
    };
    const loadRequests = async () => {
        const r = await apiAdminGetRequests(me.initData);
        if (r.ok)
            setRequests(r.requests || []);
    };
    const applyRatesToForm = (rates) => {
        if (!rates || typeof rates !== "object")
            return;
        clearRates();
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
        const r = await apiAdminGetRatesRange(me.initData, { from: day, to: day });
        const item = Array.isArray(r?.items) ? r.items.find((x) => String(x?.date || "") === day) : null;
        const rates = item?.rates;
        if (!rates) {
            alert(`За ${day} курс не найден`);
            return;
        }
        applyRatesToForm(rates);
    };
    useEffect(() => {
        loadUsers();
        loadRequests();
        // ВАЖНО: не подставляем сохранённые курсы автоматически — всё начинается пустым.
        clearRates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // Загружаем надбавки только когда пользователь открыл этот раздел
    useEffect(() => {
        if (section === "bonuses" && !bonusesLoaded) {
            (async () => {
                setBonusesBusy(true);
                try {
                    const r = await apiAdminGetBonuses(me.initData);
                    if (r.ok) {
                        setBonuses(normalizeBonuses(r.bonuses));
                        setBonusesLoaded(true);
                    }
                    else {
                        alert(r.error || "Ошибка загрузки надбавок");
                    }
                }
                finally {
                    setBonusesBusy(false);
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, bonusesLoaded]);
    // Загружаем отзывы только когда владелец открыл этот раздел
    useEffect(() => {
        if (section === "reviews" && !reviewsLoaded) {
            (async () => {
                setReviewsBusy(true);
                try {
                    const r = await apiAdminGetReviews(me.initData);
                    if (r.ok) {
                        setAdminReviews(Array.isArray(r.reviews) ? r.reviews : []);
                        setReviewsLoaded(true);
                    }
                    else {
                        alert(r.error || "Ошибка загрузки отзывов");
                    }
                }
                finally {
                    setReviewsBusy(false);
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, reviewsLoaded]);
    const reloadReviews = async () => {
        setReviewsBusy(true);
        try {
            const r = await apiAdminGetReviews(me.initData);
            if (r.ok) {
                setAdminReviews(Array.isArray(r.reviews) ? r.reviews : []);
                setReviewsLoaded(true);
            }
            else {
                alert(r.error || "Ошибка загрузки отзывов");
            }
        }
        finally {
            setReviewsBusy(false);
        }
    };
    const approveReview = async (id) => {
        setReviewsBusy(true);
        try {
            const r = await apiAdminApproveReview(me.initData, id);
            if (!r.ok)
                alert(r.error || "Ошибка");
            await reloadReviews();
        }
        finally {
            setReviewsBusy(false);
        }
    };
    const rejectReview = async (id) => {
        setReviewsBusy(true);
        try {
            const r = await apiAdminRejectReview(me.initData, id);
            if (!r.ok)
                alert(r.error || "Ошибка");
            await reloadReviews();
        }
        finally {
            setReviewsBusy(false);
        }
    };
    const replyReview = async (id, text) => {
        const t = String(text || "").trim();
        if (!t)
            return;
        setReviewsBusy(true);
        try {
            const r = await apiAdminReplyReview(me.initData, id, t);
            if (!r.ok)
                alert(r.error || "Ошибка");
            await reloadReviews();
        }
        finally {
            setReviewsBusy(false);
        }
    };
    const saveRates = async () => {
        try {
            const hasAny = (a, b) => a.trim() !== "" || b.trim() !== "";
            const hasBoth = (a, b) => a.trim() !== "" && b.trim() !== "";
            // EUR/THB — опционально: либо оба поля заполнены, либо оба пустые
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
            const r = await apiAdminSetTodayRates(me.initData, rates);
            if (r.ok)
                alert("Курс сохранён ✅");
            else
                alert(r.error || "Ошибка");
        }
        catch (e) {
            alert(e?.message || "Проверь значения");
        }
    };
    const setStatus = async (tgId, status) => {
        const r = await apiAdminSetUserStatus(me.initData, tgId, status);
        if (r.ok)
            loadUsers();
        else
            alert(r.error || "Ошибка");
    };
    const setRequestState = async (id, state) => {
        const r = await apiAdminSetRequestState(me.initData, id, state);
        if (r.ok)
            loadRequests();
        else
            alert(r.error || "Ошибка");
    };
    // --------------------
    // Bonuses helpers
    // --------------------
    const numInput = (s) => {
        const t = String(s ?? "").replace(",", ".").trim();
        if (t === "")
            return 0;
        const n = Number(t);
        return Number.isFinite(n) ? n : 0;
    };
    const setBonusEnabled = (key, on) => {
        setBonuses((p) => (p ? { ...p, enabled: { ...p.enabled, [key]: on } } : p));
    };
    const updMethodBonus = (method, cur, v) => {
        setBonuses((p) => p
            ? {
                ...p,
                methods: {
                    ...p.methods,
                    [method]: { ...p.methods[method], [cur]: v }
                }
            }
            : p);
    };
    const updTier = (cur, idx, patch) => {
        setBonuses((p) => {
            if (!p)
                return p;
            const list = p.tiers[cur];
            const next = list.map((t, i) => (i === idx ? { ...t, ...patch } : t));
            return { ...p, tiers: { ...p.tiers, [cur]: next } };
        });
    };
    const addTier = (cur) => {
        setBonuses((p) => {
            if (!p)
                return p;
            const list = p.tiers[cur];
            const last = list[list.length - 1];
            const min = Number.isFinite(last?.max) ? Number(last.max) : Number(last?.min ?? 0) + 1;
            const row = { min: Math.max(0, min || 0), standard: 0, silver: 0, gold: 0 };
            return { ...p, tiers: { ...p.tiers, [cur]: [...list, row] } };
        });
    };
    const delTier = (cur, idx) => {
        setBonuses((p) => {
            if (!p)
                return p;
            const list = p.tiers[cur];
            const next = list.filter((_, i) => i !== idx);
            return { ...p, tiers: { ...p.tiers, [cur]: next.length ? next : list } };
        });
    };
    const saveBonuses = async () => {
        if (!bonuses)
            return;
        setBonusesBusy(true);
        try {
            const r = await apiAdminSetBonuses(me.initData, bonuses);
            if (r.ok) {
                setBonuses(normalizeBonuses(r.bonuses));
                setBonusesLoaded(true);
                alert("Надбавки сохранены ✅");
            }
            else {
                alert(r.error || "Ошибка сохранения надбавок");
            }
        }
        finally {
            setBonusesBusy(false);
        }
    };
    const reloadBonuses = async () => {
        setBonusesBusy(true);
        try {
            const r = await apiAdminGetBonuses(me.initData);
            if (r.ok) {
                setBonuses(normalizeBonuses(r.bonuses));
                setBonusesLoaded(true);
            }
            else {
                alert(r.error || "Ошибка загрузки надбавок");
            }
        }
        finally {
            setBonusesBusy(false);
        }
    };
    return (_jsxs("div", { className: "vx-admin", children: [!hideHeader ? (_jsx("div", { className: "vx-adminHead", children: _jsx("div", { className: "h1", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435" }) })) : null, !hideSeg ? (_jsxs("div", { className: "vx-adminSeg", children: [_jsx("button", { className: section === "rates" ? "on" : "", onClick: () => setSection("rates"), children: "\u041A\u0443\u0440\u0441" }), _jsx("button", { className: section === "bonuses" ? "on" : "", onClick: () => setSection("bonuses"), children: "\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438" }), _jsx("button", { className: section === "reviews" ? "on" : "", onClick: () => setSection("reviews"), children: "\u041E\u0442\u0437\u044B\u0432\u044B" }), _jsx("button", { className: section === "users" ? "on" : "", onClick: () => setSection("users"), children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }), _jsx("button", { className: section === "requests" ? "on" : "", onClick: () => setSection("requests"), children: "\u0417\u0430\u044F\u0432\u043A\u0438" })] })) : null, section === "rates" ? (_jsxs("div", { className: "vx-mt10 vx-adminSection", children: [_jsx("div", { className: "small", children: "\u041A\u0443\u0440\u0441 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F (BUY/SELL \u043A VND) \u2014 \u0437\u0430\u043F\u043E\u043B\u043D\u044F\u0435\u0442\u0441\u044F \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C" }), _jsx("div", { className: "hr" }), _jsx(RateRow, { code: "RUB", buy: rubBuy, sell: rubSell, setBuy: setRubBuy, setSell: setRubSell }), _jsx(RateRow, { code: "USDT", buy: usdtBuy, sell: usdtSell, setBuy: setUsdtBuy, setSell: setUsdtSell }), _jsx(RateRow, { code: "USD", buy: usdBuy, sell: usdSell, setBuy: setUsdBuy, setSell: setUsdSell }), _jsx(RateRow, { code: "EUR", buy: eurBuy, sell: eurSell, setBuy: setEurBuy, setSell: setEurSell }), _jsx(RateRow, { code: "THB", buy: thbBuy, sell: thbSell, setBuy: setThbBuy, setSell: setThbSell }), _jsx("div", { className: "vx-mt10", children: _jsxs("div", { className: "row vx-rowWrap vx-gap8", children: [_jsx("button", { className: "btn", onClick: saveRates, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "btn", onClick: clearRates, children: "\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C" }), _jsx("button", { className: "btn", onClick: loadYesterdayRates, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0432\u0447\u0435\u0440\u0430\u0448\u043D\u0438\u0439" }), _jsx("button", { className: "btn", onClick: loadRates, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0442\u0435\u043A\u0443\u0449\u0438\u0439" })] }) })] })) : null, section === "bonuses" ? (_jsxs("div", { className: "vx-mt10 vx-adminSection", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: "\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438 (\u0441\u0442\u0430\u0442\u0443\u0441\u044B / \u0441\u043F\u043E\u0441\u043E\u0431 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F)" }), _jsxs("div", { className: "row vx-rowWrap vx-gap6", children: [_jsx("button", { className: "btn vx-btnSm", onClick: saveBonuses, disabled: bonusesBusy || !bonuses, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "btn vx-btnSm", onClick: reloadBonuses, disabled: bonusesBusy, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" })] })] }), _jsxs("div", { className: "small vx-mt6", children: ["\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438 \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F ", _jsx("b", { children: "RUB/USD/USDT \u2192 VND" }), "."] }), _jsx("div", { className: "hr" }), !bonuses ? (_jsx("div", { className: "small", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row vx-rowWrap vx-gap8", children: [_jsx("button", { className: "btn vx-btnSm vx-toggleBtn " + (bonuses.enabled.tiers ? "is-on" : "is-off"), type: "button", onClick: () => setBonusEnabled("tiers", !bonuses.enabled.tiers), disabled: bonusesBusy, children: bonuses.enabled.tiers ? "Надбавки по статусам: ВКЛ" : "Надбавки по статусам: ВЫКЛ" }), _jsx("button", { className: "btn vx-btnSm vx-toggleBtn " + (bonuses.enabled.methods ? "is-on" : "is-off"), type: "button", onClick: () => setBonusEnabled("methods", !bonuses.enabled.methods), disabled: bonusesBusy, children: bonuses.enabled.methods ? "Надбавки за способ: ВКЛ" : "Надбавки за способ: ВЫКЛ" })] }), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "h3", children: "\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438 \u0437\u0430 \u0441\u043F\u043E\u0441\u043E\u0431 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u044F" }), _jsxs("div", { className: "row vx-rowWrap vx-gap8", children: [_jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u2014 RUB" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.transfer.RUB ?? 0), onChange: (e) => updMethodBonus("transfer", "RUB", numInput(e.target.value)) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u2014 USD" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.transfer.USD ?? 0), onChange: (e) => updMethodBonus("transfer", "USD", numInput(e.target.value)) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434 \u2014 USDT" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.transfer.USDT ?? 0), onChange: (e) => updMethodBonus("transfer", "USDT", numInput(e.target.value)) })] })] }), _jsxs("div", { className: "row vx-rowWrap vx-gap8 vx-mt10", children: [_jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442 \u2014 RUB" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.atm.RUB ?? 0), onChange: (e) => updMethodBonus("atm", "RUB", numInput(e.target.value)) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442 \u2014 USD" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.atm.USD ?? 0), onChange: (e) => updMethodBonus("atm", "USD", numInput(e.target.value)) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442 \u2014 USDT" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(bonuses.methods.atm.USDT ?? 0), onChange: (e) => updMethodBonus("atm", "USDT", numInput(e.target.value)) })] })] }), _jsx("div", { className: "hr" }), _jsx("div", { className: "h3", children: "\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438 \u043F\u043E \u0441\u0442\u0430\u0442\u0443\u0441\u0430\u043C \u0438 \u0441\u0443\u043C\u043C\u0435" }), _jsx("div", { className: "small", children: "\u0424\u043E\u0440\u043C\u0430\u0442: min \u2264 \u0441\u0443\u043C\u043C\u0430 < max (max \u043C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043F\u0443\u0441\u0442\u044B\u043C \u0434\u043B\u044F \u043F\u043E\u0441\u043B\u0435\u0434\u043D\u0435\u0433\u043E \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0430)." }), ["RUB", "USD", "USDT"].map((cur) => (_jsxs("div", { className: "vx-mt10", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "vx-title18", children: cur }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => addTier(cur), disabled: bonusesBusy, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D" })] }), _jsx("div", { className: "hr" }), bonuses.tiers[cur].map((t, idx) => (_jsxs("div", { className: "vx-mb10", children: [_jsxs("div", { className: "row vx-rowWrap vx-gap8", children: [_jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "min" }), _jsx("input", { className: "input vx-in", inputMode: "numeric", value: String(t.min ?? 0), onChange: (e) => updTier(cur, idx, { min: Math.max(0, Math.floor(numInput(e.target.value))) }) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "max" }), _jsx("input", { className: "input vx-in", inputMode: "numeric", value: t.max == null ? "" : String(t.max), onChange: (e) => {
                                                                    const raw = e.target.value.trim();
                                                                    updTier(cur, idx, { max: raw === "" ? undefined : Math.max(0, Math.floor(numInput(raw))) });
                                                                }, placeholder: "(\u043F\u0443\u0441\u0442\u043E)" })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0441\u0442\u0430\u043D\u0434\u0430\u0440\u0442" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(t.standard ?? 0), onChange: (e) => updTier(cur, idx, { standard: numInput(e.target.value) }) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0441\u0435\u0440\u0435\u0431\u0440\u043E" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(t.silver ?? 0), onChange: (e) => updTier(cur, idx, { silver: numInput(e.target.value) }) })] }), _jsxs("div", { className: "vx-field", children: [_jsx("div", { className: "vx-lbl", children: "\u0437\u043E\u043B\u043E\u0442\u043E" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(t.gold ?? 0), onChange: (e) => updTier(cur, idx, { gold: numInput(e.target.value) }) })] }), _jsxs("div", { className: "vx-field", style: { flex: "0 0 auto" }, children: [_jsx("div", { className: "vx-lbl", children: "\u00A0" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => delTier(cur, idx), disabled: bonusesBusy, children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] })] }), _jsx("div", { className: "hr" })] }, idx)))] }, cur)))] }))] })) : null, section === "users" ? (_jsxs("div", { className: "vx-mt10 vx-adminSection", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B \u0438 \u0441\u0442\u0430\u0442\u0443\u0441\u044B" }), _jsx("button", { className: "btn vx-btnSm", onClick: loadUsers, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" })] }), _jsx("div", { className: "hr" }), users.length === 0 ? (_jsx("div", { className: "small", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432 (\u043E\u043D\u0438 \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u043F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430 \u0432 \u043C\u0438\u043D\u0438-\u0430\u043F\u043F)." })) : (users.map((u) => (_jsxs("div", { className: "vx-mb10", children: [_jsxs("div", { children: [_jsxs("b", { children: [u.first_name ?? "", " ", u.last_name ?? ""] }), " ", _jsxs("span", { className: "small", children: [u.username ? "@" + u.username : "", " \u2022 id:", u.tg_id, " \u2022 \u0441\u0442\u0430\u0442\u0443\u0441: ", statusLabelAny(u.status)] })] }), _jsx("div", { className: "row vx-mt6 vx-rowWrap vx-gap6", children: STATUS_OPTIONS.map((s) => {
                                    const isOn = statusValueAny(u.status) === s.value;
                                    const activeStyle = isOn
                                        ? (s.value === "standard"
                                            ? { background: "rgba(9,23,33,.88)", color: "rgba(255,255,255,.96)", border: 0 }
                                            : s.value === "silver"
                                                ? { background: "rgba(190,198,210,.95)", color: "rgba(9,23,33,.92)", border: 0 }
                                                : { background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)", border: 0 })
                                        : undefined;
                                    return (_jsx("button", { className: `btn vx-btnSm vx-statusBtn vx-status-${s.value}${isOn ? " vx-btnOn" : ""}`, style: activeStyle, onClick: () => setStatus(u.tg_id, s.value), children: s.label }, s.value));
                                }) }), _jsx("div", { className: "hr" })] }, u.tg_id))))] })) : null, section === "requests" ? (_jsxs("div", { className: "vx-mt10 vx-adminSection", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: "\u0417\u0430\u044F\u0432\u043A\u0438" }), _jsx("button", { className: "btn vx-btnSm", onClick: loadRequests, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" })] }), _jsxs("div", { className: "row vx-rowWrap vx-gap6 vx-mt6", children: [_jsx("button", { className: "btn vx-btnSm " + (requestsFilter === "all" ? "vx-btnOn" : ""), onClick: () => setRequestsFilter("all"), children: "\u0412\u0441\u0435" }), REQUEST_STATE_OPTIONS.map((s) => (_jsx("button", { className: "btn vx-btnSm " + (requestsFilter === s.value ? "vx-btnOn" : ""), onClick: () => setRequestsFilter(s.value), children: s.label }, s.value)))] }), _jsx("div", { className: "hr" }), requests.length === 0 ? (_jsx("div", { className: "small", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0437\u0430\u044F\u0432\u043E\u043A." })) : ((requestsFilter === "all" ? requests : requests.filter((x) => String(x.state) === String(requestsFilter))).map((r) => {
                        const who = r?.from?.username ? "@" + r.from.username : (r?.from?.first_name || "") || `id ${r?.from?.id}`;
                        const shortId = String(r.id || "").slice(-6);
                        const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
                        const stateLabel = REQUEST_STATE_OPTIONS.find((x) => x.value === r.state)?.label || r.state;
                        return (_jsxs("div", { className: "vx-mb10", children: [_jsxs("div", { children: [_jsxs("b", { children: ["#", shortId] }), " ", _jsx("span", { className: "small", children: created })] }), _jsxs("div", { className: "small", children: [who, " \u2022 ", r.sellCurrency, " \u2192 ", r.buyCurrency, " \u2022 \u043E\u0442\u0434\u0430\u0451\u0442: ", r.sellAmount, " \u2022 \u043F\u043E\u043B\u0443\u0447\u0438\u0442: ", r.buyAmount] }), _jsxs("div", { className: "small", children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: stateLabel })] }), _jsx("div", { className: "row vx-mt6 vx-rowWrap vx-gap6", children: REQUEST_STATE_OPTIONS.map((s) => (_jsx("button", { className: "btn vx-btnSm", onClick: () => setRequestState(r.id, s.value), children: s.label }, s.value))) }), _jsx("div", { className: "hr" })] }, r.id));
                    }))] })) : null, section === "reviews" ? (_jsxs("div", { className: "vx-mt10 vx-adminSection", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: "\u041E\u0442\u0437\u044B\u0432\u044B (\u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0438\u044F)" }), _jsx("button", { className: "btn vx-btnSm", onClick: reloadReviews, disabled: reviewsBusy, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" })] }), _jsxs("div", { className: "row vx-rowWrap vx-gap6 vx-mt6", children: [_jsx("button", { className: "btn vx-btnSm " + (reviewsFilter === "pending" ? "vx-btnOn" : ""), onClick: () => setReviewsFilter("pending"), children: "\u041D\u0430 \u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0438\u0438" }), _jsx("button", { className: "btn vx-btnSm " + (reviewsFilter === "approved" ? "vx-btnOn" : ""), onClick: () => setReviewsFilter("approved"), children: "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0435" }), _jsx("button", { className: "btn vx-btnSm " + (reviewsFilter === "rejected" ? "vx-btnOn" : ""), onClick: () => setReviewsFilter("rejected"), children: "\u041E\u0442\u043A\u043B\u043E\u043D\u0451\u043D\u043D\u044B\u0435" }), _jsx("button", { className: "btn vx-btnSm " + (reviewsFilter === "all" ? "vx-btnOn" : ""), onClick: () => setReviewsFilter("all"), children: "\u0412\u0441\u0435" })] }), _jsx("div", { className: "hr" }), adminReviews.length === 0 ? (_jsx("div", { className: "small", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043E\u0442\u0437\u044B\u0432\u043E\u0432." })) : (adminReviews
                        .filter((r) => (reviewsFilter === "all" ? true : r.state === reviewsFilter))
                        .map((r) => {
                        const who = r?.username ? "@" + r.username : (r?.first_name || "") || `id ${r?.tg_id}`;
                        const created = r.created_at ? new Date(r.created_at).toLocaleString("ru-RU") : "";
                        const reqShort = String(r.requestId || "").slice(-6);
                        const stateLabel = r.state === "pending" ? "на модерации" : r.state === "approved" ? "опубликован" : "отклонён";
                        const draft = replyDrafts[String(r.id)] ?? (r.company_reply?.text || "");
                        return (_jsxs("div", { className: "vx-mb10", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsxs("div", { children: [_jsxs("b", { children: ["#", reqShort] }), " ", _jsx("span", { className: "small", children: created })] }), _jsx("div", { className: "small", children: stateLabel })] }), _jsxs("div", { className: "small", children: ["\u041E\u0442: ", _jsx("b", { children: who }), " \u2022 tg_id: ", r.tg_id, r.anonymous ? _jsx("span", { children: " \u2022 (\u043F\u043E\u043F\u0440\u043E\u0441\u0438\u043B \u0430\u043D\u043E\u043D\u0438\u043C\u043D\u043E)" }) : null] }), _jsx("div", { className: "vx-mt6", style: { whiteSpace: "pre-wrap" }, children: r.text }), _jsxs("div", { className: "row vx-rowWrap vx-gap6 vx-mt6", children: [r.state !== "approved" ? (_jsx("button", { className: "btn vx-btnSm", onClick: () => approveReview(r.id), disabled: reviewsBusy, children: "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u0442\u044C" })) : null, r.state !== "rejected" ? (_jsx("button", { className: "btn vx-btnSm", onClick: () => rejectReview(r.id), disabled: reviewsBusy, children: "\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C" })) : null] }), _jsxs("div", { className: "vx-mt10", children: [_jsx("div", { className: "vx-lbl", children: "\u041E\u0442\u0432\u0435\u0442 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438" }), _jsx("textarea", { className: "input vx-in", rows: 2, value: draft, onChange: (e) => setReplyDrafts((p) => ({ ...p, [String(r.id)]: e.target.value })), placeholder: "\u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043E\u0442\u0432\u0435\u0442 (\u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u0435\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F\u043C)" }), _jsx("div", { className: "vx-mt6", children: _jsx("button", { className: "btn vx-btnSm", onClick: () => replyReview(r.id, draft), disabled: reviewsBusy || !String(draft || "").trim(), children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043E\u0442\u0432\u0435\u0442" }) })] }), _jsx("div", { className: "hr" })] }, r.id));
                    }))] })) : null] }));
}
