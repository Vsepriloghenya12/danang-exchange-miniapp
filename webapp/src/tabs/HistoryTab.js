import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGetMyRequests } from "../lib/api";
function getTg() {
    return window.Telegram?.WebApp;
}
const stateLabel = {
    in_progress: "В работе",
    done: "Готова",
    canceled: "Отклонена",
    new: "В работе",
};
function shortId(id) {
    const s = String(id || "");
    return s.length > 6 ? s.slice(-6) : s;
}
function fmtDateTime(iso) {
    try {
        const d = new Date(iso);
        if (!Number.isFinite(d.getTime()))
            return "";
        return d.toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    catch {
        return "";
    }
}
function methodLabel(m) {
    const v = String(m || "").toLowerCase();
    if (v === "cash")
        return "Наличные";
    if (v === "transfer")
        return "Перевод";
    if (v === "atm")
        return "Банкомат";
    if (v === "other")
        return "Другое";
    return m || "—";
}
export default function HistoryTab({ me }) {
    const tg = getTg();
    const initData = tg?.initData || me?.initData || "";
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [requests, setRequests] = useState([]);
    async function load() {
        if (!initData)
            return;
        setLoading(true);
        setError("");
        try {
            const r = await apiGetMyRequests(initData);
            if (!r?.ok) {
                setError(r?.error || "Ошибка");
                setRequests([]);
                return;
            }
            setRequests(Array.isArray(r.requests) ? r.requests : []);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        if (!initData)
            return;
        load();
        const id = window.setInterval(load, 12_000);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initData]);
    const list = useMemo(() => (requests || []).slice().sort((a, b) => String(b?.created_at).localeCompare(String(a?.created_at))), [requests]);
    if (!initData) {
        return _jsx("div", { className: "small", children: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u00AB\u041C\u043E\u044F \u0438\u0441\u0442\u043E\u0440\u0438\u044F\u00BB \u0432\u043D\u0443\u0442\u0440\u0438 Telegram." });
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "vx-head", style: { alignItems: "center" }, children: [_jsxs("div", { children: [_jsx("div", { className: "h2 vx-m0", children: "\u0421\u0434\u0435\u043B\u043A\u0438" }), _jsx("div", { className: "vx-meta", children: "\u0412\u0430\u0448\u0438 \u0437\u0430\u044F\u0432\u043A\u0438 \u043D\u0430 \u043E\u0431\u043C\u0435\u043D" })] }), _jsx("div", { className: "row vx-rowWrap vx-gap6", style: { justifyContent: "flex-end" }, children: _jsx("button", { type: "button", className: "btn vx-btnSm", onClick: load, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }) })] }), loading ? _jsx("div", { className: "vx-help", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) : null, error ? _jsx("div", { className: "vx-help", children: error }) : null, _jsx("div", { className: "vx-sp12" }), list.length === 0 && !loading ? _jsx("div", { className: "small", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0441\u0434\u0435\u043B\u043E\u043A." }) : null, _jsx("div", { className: "vx-reqList", children: list.map((r) => {
                    const st = String(r?.state || "");
                    const stNorm = st === "new" ? "in_progress" : st;
                    const title = `${r?.sellCurrency} → ${r?.buyCurrency}`;
                    const meta = `${fmtDateTime(String(r?.created_at || ""))} • #${shortId(String(r?.id || ""))}`;
                    const line1 = `Отдаёте: ${r?.sellAmount} ${r?.sellCurrency}`;
                    const line2 = `Получаете: ${r?.buyAmount} ${r?.buyCurrency}`;
                    const methods = `${methodLabel(String(r?.payMethod || ""))} → ${methodLabel(String(r?.receiveMethod || ""))}`;
                    const comment = String(r?.comment || "").trim();
                    return (_jsxs("button", { type: "button", className: "vx-reqRow", onClick: () => {
                            const msg = `${title}\n` +
                                `${meta}\n\n` +
                                `${line1}\n${line2}\n` +
                                `Способ: ${methods}\n` +
                                `Статус: ${stateLabel[stNorm] || stNorm}`;
                            tg?.showAlert?.(msg);
                        }, children: [_jsxs("div", { className: "vx-reqTop", children: [_jsx("div", { style: { fontWeight: 950 }, children: title }), _jsx("div", { className: "vx-tag", style: { whiteSpace: "nowrap" }, children: stateLabel[stNorm] || stNorm })] }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: meta }), _jsx("div", { className: "small", style: { marginTop: 6, opacity: 0.92 }, children: line1 }), _jsx("div", { className: "small", style: { marginTop: 2, opacity: 0.92 }, children: line2 })] }, String(r?.id)));
                }) })] }));
}
