import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGetGFormulas, apiGetMarketRates } from "../lib/api";
// ✅ первые 5 валютных пар — НЕ ТРОГАЕМ (как было)
// ✅ остальные считаем по формулам с картинки: BUY = G*m, SELL = G*m
const PAIRS = [
    { id: "rub-vnd", base: "RUB", quote: "VND", mode: "vnd" },
    { id: "usdt-vnd", base: "USDT", quote: "VND", mode: "vnd" },
    { id: "usd-vnd", base: "USD", quote: "VND", mode: "vnd" },
    { id: "eur-vnd", base: "EUR", quote: "VND", mode: "vnd" },
    { id: "thb-vnd", base: "THB", quote: "VND", mode: "vnd" },
    // пары из таблицы
    { id: "usdt-rub", base: "USDT", quote: "RUB", mode: "g" },
    { id: "usd-rub", base: "USD", quote: "RUB", mode: "g" },
    { id: "eur-rub", base: "EUR", quote: "RUB", mode: "g" },
    { id: "thb-rub", base: "THB", quote: "RUB", mode: "g" },
    { id: "usd-usdt", base: "USD", quote: "USDT", mode: "g" },
    { id: "eur-usd", base: "EUR", quote: "USD", mode: "g" },
    { id: "eur-usdt", base: "EUR", quote: "USDT", mode: "g" },
    { id: "usd-thb", base: "USD", quote: "THB", mode: "g" },
    { id: "usdt-thb", base: "USDT", quote: "THB", mode: "g" },
    { id: "eur-thb", base: "EUR", quote: "THB", mode: "g" }
];
const DEFAULT_G_FORMULAS = {
    "USDT/RUB": { buyMul: 0.98, sellMul: 1.08 },
    "USD/RUB": { buyMul: 0.98, sellMul: 1.08 },
    "EUR/RUB": { buyMul: 0.94, sellMul: 1.08 },
    "THB/RUB": { buyMul: 0.96, sellMul: 1.1 },
    "USD/USDT": { buyMul: 0.965, sellMul: 1.035 },
    "EUR/USD": { buyMul: 0.95, sellMul: 1.05 },
    "EUR/USDT": { buyMul: 0.95, sellMul: 1.05 },
    "USD/THB": { buyMul: 0.95, sellMul: 1.07 },
    "USDT/THB": { buyMul: 0.95, sellMul: 1.07 },
    "EUR/THB": { buyMul: 0.95, sellMul: 1.07 }
};
function fmtDaNang(d) {
    try {
        return new Intl.DateTimeFormat("ru-RU", {
            timeZone: "Asia/Ho_Chi_Minh",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
            .format(d)
            .replace(",", "");
    }
    catch {
        return d.toLocaleString("ru-RU");
    }
}
// ✅ VND — без копеек, парсинг‑пары — с 1 знаком, кроме USD → USDT (3 знака)
function fmt(pairId, quote, n) {
    if (n == null || !Number.isFinite(n))
        return "—";
    const digits = quote === "VND" ? 0 : pairId === "usd-usdt" ? 3 : 1;
    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    }).format(n);
}
function fmtInt(n) {
    if (n == null || !Number.isFinite(n))
        return "—";
    return new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Math.trunc(n));
}
function fmtSourceAmount(cur, amount) {
    const value = fmtInt(amount);
    if (cur === "RUB")
        return `${value} ₽`;
    return `${value} ${cur}`;
}
function fmtHumanRuDate(dateStr) {
    if (!dateStr)
        return "сегодня";
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr));
    if (!m)
        return dateStr;
    const months = [
        "января",
        "февраля",
        "марта",
        "апреля",
        "мая",
        "июня",
        "июля",
        "августа",
        "сентября",
        "октября",
        "ноября",
        "декабря"
    ];
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const monthName = months[month - 1];
    if (!monthName)
        return dateStr;
    return `${day} ${monthName} ${year}`;
}
// Покупка/Продажа ПЕРВОЙ валюты пары через курсы к VND (как было)
function calcFromVnd(rates, base, quote) {
    if (!rates)
        return { buy: null, sell: null };
    if (base === quote)
        return { buy: 1, sell: 1 };
    const br = base === "VND" ? { buy_vnd: 1, sell_vnd: 1 } : rates?.[base];
    if (!br)
        return { buy: null, sell: null };
    const baseBuy = Number(br.buy_vnd);
    const baseSell = Number(br.sell_vnd);
    if (!Number.isFinite(baseBuy) || !Number.isFinite(baseSell) || baseBuy <= 0 || baseSell <= 0) {
        return { buy: null, sell: null };
    }
    if (quote === "VND")
        return { buy: baseBuy, sell: baseSell };
    const qr = rates?.[quote];
    if (!qr)
        return { buy: null, sell: null };
    const quoteBuy = Number(qr.buy_vnd);
    const quoteSell = Number(qr.sell_vnd);
    if (!Number.isFinite(quoteBuy) || !Number.isFinite(quoteSell) || quoteBuy <= 0 || quoteSell <= 0) {
        return { buy: null, sell: null };
    }
    return {
        buy: baseBuy / quoteSell,
        sell: baseSell / quoteBuy
    };
}
function gRateDecimals(base, quote) {
    return base === "USD" && quote === "USDT" ? 3 : 1;
}
function roundRate(value, decimals) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}
function calcFromG(market, formulas, base, quote) {
    if (!market || !market.ok)
        return { buy: null, sell: null };
    const key = `${base}/${quote}`;
    const f = (formulas && formulas[key]) || DEFAULT_G_FORMULAS[key];
    const G = Number(market.g?.[key]);
    if (!f || !Number.isFinite(G) || G <= 0)
        return { buy: null, sell: null };
    const decimals = gRateDecimals(base, quote);
    return {
        buy: roundRate(G * f.buyMul, decimals),
        sell: roundRate(G * f.sellMul, decimals),
    };
}
function currencyBadge(cur) {
    switch (cur) {
        case "RUB":
            return "₽";
        case "USDT":
            return "₮";
        case "USD":
            return "$";
        case "EUR":
            return "€";
        case "THB":
            return "฿";
        case "VND":
            return "₫";
        default:
            return cur;
    }
}
export default function RatesTab({ embedded = false, limit } = {}) {
    const [today, setToday] = useState(null);
    const [market, setMarket] = useState(null);
    const [formulas, setFormulas] = useState(DEFAULT_G_FORMULAS);
    useEffect(() => {
        let alive = true;
        const loadToday = async () => {
            try {
                const res = await fetch(`/api/rates/today?_=${Date.now()}`, { cache: "no-store" });
                const json = await res.json();
                if (alive)
                    setToday(json);
            }
            catch {
                if (alive)
                    setToday(null);
            }
        };
        const refreshIfVisible = () => {
            if (document.visibilityState === "visible") {
                void loadToday();
            }
        };
        void loadToday();
        const id = window.setInterval(() => {
            void loadToday();
        }, 30_000);
        document.addEventListener("visibilitychange", refreshIfVisible);
        window.addEventListener("focus", refreshIfVisible);
        return () => {
            alive = false;
            window.clearInterval(id);
            document.removeEventListener("visibilitychange", refreshIfVisible);
            window.removeEventListener("focus", refreshIfVisible);
        };
    }, []);
    useEffect(() => {
        apiGetGFormulas()
            .then((r) => {
            if (r && r.ok && r.formulas && typeof r.formulas === "object") {
                setFormulas(r.formulas);
            }
        })
            .catch(() => null);
    }, []);
    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const m = await apiGetMarketRates();
                if (alive)
                    setMarket(m);
            }
            catch {
                if (alive)
                    setMarket({ ok: false, error: "market_fetch_failed", stale: true });
            }
        };
        load();
        const id = window.setInterval(load, 15 * 60 * 1000);
        return () => {
            alive = false;
            window.clearInterval(id);
        };
    }, []);
    const rates = today?.data?.rates ?? null;
    const updatedAt = today?.data?.updated_at ? fmtDaNang(new Date(today.data.updated_at)) : null;
    const marketUpdatedAt = market?.ok && market.updated_at ? fmtDaNang(new Date(market.updated_at)) : null;
    const isHomePreview = embedded && limit === 3;
    const rows = useMemo(() => {
        return PAIRS.map((p) => {
            const { buy, sell } = p.mode === "g" ? calcFromG(market, formulas, p.base, p.quote) : calcFromVnd(rates, p.base, p.quote);
            return { ...p, buy, sell };
        });
    }, [rates, market, formulas]);
    const metaParts = useMemo(() => {
        const parts = [];
        parts.push(`${today?.date ?? "—"}`);
        if (updatedAt)
            parts.push(`VND ${updatedAt}`);
        if (marketUpdatedAt)
            parts.push(`G ${marketUpdatedAt}${market?.ok && market.stale ? " (устар.)" : ""}`);
        return parts;
    }, [today?.date, updatedAt, marketUpdatedAt, market?.ok]);
    const shown = rows.slice(0, limit ?? rows.length);
    const homeSummaryRows = useMemo(() => {
        const items = [
            { id: "rub-vnd-short", cur: "RUB", amount: 10_000 },
            { id: "usdt-vnd-short", cur: "USDT", amount: 100 },
            { id: "usd-vnd-short", cur: "USD", amount: 100 },
        ];
        return items.map(({ id, cur, amount }) => {
            const buyVnd = Number(rates?.[cur]?.buy_vnd);
            const result = Number.isFinite(buyVnd) ? amount * buyVnd : null;
            return {
                id,
                amountText: fmtSourceAmount(cur, amount),
                resultText: `${fmtInt(result)} vnd`,
                fromCode: cur,
                toCode: "VND",
                fromIcon: currencyBadge(cur),
                toIcon: currencyBadge("VND"),
            };
        });
    }, [rates]);
    const content = !today ? (_jsx("div", { className: "vx-meta", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" })) : !rates ? (_jsx("div", { className: "vx-meta", children: "\u041A\u0443\u0440\u0441 \u0435\u0449\u0451 \u043D\u0435 \u0437\u0430\u0434\u0430\u043D \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0435\u043C." })) : isHomePreview ? (_jsxs("div", { className: "mx-rateHero", role: "group", "aria-label": "\u041A\u0440\u0430\u0442\u043A\u0438\u0439 \u043A\u0443\u0440\u0441", children: [_jsxs("div", { className: "mx-rateHeroHead", children: ["\u041A\u0443\u0440\u0441 \u043D\u0430 ", fmtHumanRuDate(today?.date), ":"] }), _jsx("div", { className: "mx-rateHeroList", children: homeSummaryRows.map((row) => (_jsxs("div", { className: "mx-rateHeroRow", children: [_jsxs("div", { className: "mx-rateHeroFrom", children: [_jsx("span", { className: `mx-rateHeroMark is-${row.fromCode.toLowerCase()}`, "aria-hidden": "true", children: row.fromIcon }), _jsx("span", { className: "mx-rateHeroGive", children: row.amountText })] }), _jsx("span", { className: "mx-rateHeroArrow", "aria-hidden": "true", children: "\u2192" }), _jsx("div", { className: "mx-rateHeroResult", children: _jsx("div", { className: "mx-rateHeroGet", children: row.resultText }) })] }, row.id))) })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "mx-rateTable" + (embedded ? " mx-rateTableEmbedded" : ""), role: "table", "aria-label": "\u041A\u0443\u0440\u0441", children: [_jsxs("div", { className: "mx-rateRow mx-rateHead", role: "row", children: [_jsx("div", { className: "mx-rateCell mx-ratePairH", role: "columnheader", children: "\u041F\u0430\u0440\u0430" }), _jsx("div", { className: "mx-rateCell mx-rateBuyH", role: "columnheader", children: "\u041F\u043E\u043A\u0443\u043F\u043A\u0430" }), _jsx("div", { className: "mx-rateCell mx-rateSellH", role: "columnheader", children: "\u041F\u0440\u043E\u0434\u0430\u0436\u0430" })] }), shown.map((r) => (_jsxs("div", { className: "mx-rateRow", role: "row", children: [_jsxs("div", { className: "mx-rateCell mx-ratePair", role: "cell", children: [r.base, " \u2192 ", r.quote] }), _jsx("div", { className: "mx-rateCell mx-rateBuy " + (r.buy == null ? "vx-dash" : ""), role: "cell", children: fmt(r.id, r.quote, r.buy) }), _jsx("div", { className: "mx-rateCell mx-rateSell " + (r.sell == null ? "vx-dash" : ""), role: "cell", children: fmt(r.id, r.quote, r.sell) })] }, r.id)))] }), market && !market.ok && !embedded ? (_jsxs("div", { className: "vx-meta vx-mt10", children: ["\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C G: ", market.error] })) : null] }));
    if (embedded)
        return _jsx(_Fragment, { children: content });
    return (_jsxs("div", { className: "vx-rates2", children: [_jsx("div", { className: "vx-head", children: _jsxs("div", { children: [_jsx("div", { className: "h2 vx-m0", children: "\u041A\u0443\u0440\u0441" }), _jsx("div", { className: "vx-meta vx-metaLine", children: metaParts.map((p) => (_jsx("span", { children: p }, p))) })] }) }), content] }));
}
