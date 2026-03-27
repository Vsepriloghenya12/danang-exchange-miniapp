import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiGetFaq } from "../lib/api";
export default function FaqTab() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [openId, setOpenId] = useState("");
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                setLoading(true);
                const r = await apiGetFaq();
                if (!mounted)
                    return;
                if (r?.ok) {
                    setItems(Array.isArray(r.items) ? r.items : []);
                    setErr("");
                }
                else {
                    setErr(String(r?.error || "Не удалось загрузить FAQ"));
                    setItems([]);
                }
            }
            catch (e) {
                if (!mounted)
                    return;
                setErr(String(e?.message || "Не удалось загрузить FAQ"));
                setItems([]);
            }
            finally {
                if (mounted)
                    setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);
    const list = useMemo(() => {
        const a = Array.isArray(items) ? items : [];
        return a
            .filter((x) => x && String(x.q || "").trim())
            .map((x) => ({ ...x, q: String(x.q || "").trim(), a: String(x.a || "").trim() }));
    }, [items]);
    if (loading) {
        return (_jsx("div", { className: "card", style: { padding: 14 }, children: _jsx("div", { className: "small", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) }));
    }
    if (err) {
        return (_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("div", { className: "h3", style: { marginBottom: 6 }, children: "FAQ" }), _jsx("div", { className: "small", children: err })] }));
    }
    if (!list.length) {
        return (_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("div", { className: "h3", style: { marginBottom: 6 }, children: "FAQ" }), _jsx("div", { className: "small", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u0432\u043E\u043F\u0440\u043E\u0441\u043E\u0432." })] }));
    }
    return (_jsx("div", { className: "mx-faq", children: list.map((it) => {
            const open = openId === it.id;
            return (_jsxs("div", { className: open ? "mx-faqItem is-open" : "mx-faqItem", children: [_jsxs("button", { type: "button", className: "mx-faqQ", onClick: () => setOpenId((x) => (x === it.id ? "" : it.id)), children: [_jsx("span", { children: it.q }), _jsx("span", { className: "mx-faqChevron", children: open ? "—" : "+" })] }), open ? _jsx("div", { className: "mx-faqA", children: it.a }) : null] }, it.id));
        }) }));
}
