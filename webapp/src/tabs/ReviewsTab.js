import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import { apiAddReview, apiGetReviewEligible, apiGetReviews } from "../lib/api";
function getTg() {
    return window.Telegram?.WebApp;
}
function fmtDate(iso) {
    try {
        const d = new Date(iso);
        if (!Number.isFinite(d.getTime()))
            return "";
        return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    catch {
        return "";
    }
}
export default function ReviewsTab() {
    const tg = getTg();
    const initData = tg?.initData || "";
    const [loading, setLoading] = useState(true);
    const [reviews, setReviews] = useState([]);
    const [eligibleLoading, setEligibleLoading] = useState(false);
    const [eligible, setEligible] = useState([]);
    const [selectedRequestId, setSelectedRequestId] = useState("");
    const [anonymous, setAnonymous] = useState(false);
    const [text, setText] = useState("");
    async function loadPublic() {
        setLoading(true);
        try {
            const json = await apiGetReviews();
            setReviews(Array.isArray(json?.reviews) ? json.reviews : []);
        }
        catch {
            setReviews([]);
        }
        finally {
            setLoading(false);
        }
    }
    async function loadEligible() {
        if (!initData)
            return;
        setEligibleLoading(true);
        try {
            const json = await apiGetReviewEligible(initData);
            const list = Array.isArray(json?.eligible) ? json.eligible : [];
            setEligible(list);
            if (!selectedRequestId && list.length > 0)
                setSelectedRequestId(String(list[0].id));
        }
        catch {
            setEligible([]);
        }
        finally {
            setEligibleLoading(false);
        }
    }
    useEffect(() => {
        tg?.expand?.();
        loadPublic();
        loadEligible();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const canSend = useMemo(() => {
        return initData && selectedRequestId && text.trim().length >= 3;
    }, [initData, selectedRequestId, text]);
    async function sendReview() {
        if (!canSend)
            return;
        try {
            const r = await apiAddReview(initData, {
                requestId: selectedRequestId,
                text: text.trim(),
                anonymous
            });
            if (!r?.ok)
                throw new Error(r?.error || "fail");
            setText("");
            setAnonymous(false);
            await loadEligible();
            await loadPublic();
            tg?.HapticFeedback?.notificationOccurred?.("success");
        }
        catch {
            tg?.HapticFeedback?.notificationOccurred?.("error");
        }
    }
    return (_jsxs("div", { className: "vx-reviews", children: [_jsxs("div", { className: "vx-revCompose", children: [_jsx("div", { className: "vx-revH", children: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432" }), !initData && (_jsx("div", { className: "vx-muted", children: "\u0427\u0442\u043E\u0431\u044B \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u043E\u0442\u0437\u044B\u0432, \u043E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0432\u043D\u0443\u0442\u0440\u0438 Telegram." })), initData && eligibleLoading && _jsx("div", { className: "vx-muted", children: "\u041F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u043C \u0441\u0434\u0435\u043B\u043A\u0438\u2026" }), initData && !eligibleLoading && eligible.length === 0 && (_jsx("div", { className: "vx-muted", children: "\u041E\u0442\u0437\u044B\u0432 \u043C\u043E\u0436\u043D\u043E \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0442\u043E\u043B\u044C\u043A\u043E \u043F\u043E\u0441\u043B\u0435 \u0441\u043E\u0432\u0435\u0440\u0448\u0435\u043D\u0438\u044F \u0441\u0434\u0435\u043B\u043A\u0438." })), initData && !eligibleLoading && eligible.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "vx-gap8 vx-center", style: { display: "flex", flexWrap: "wrap" }, children: _jsx("select", { className: "input vx-in", value: selectedRequestId, onChange: (e) => setSelectedRequestId(e.target.value), style: { flex: "1 1 220px" }, children: eligible.map((r) => (_jsxs("option", { value: r.id, children: [r.sellCurrency, "\u2192", r.buyCurrency, " \u2022 ", fmtDate(r.created_at)] }, r.id))) }) }), _jsxs("label", { className: "vx-checkRow", children: [_jsx("input", { type: "checkbox", checked: anonymous, onChange: (e) => setAnonymous(e.target.checked) }), _jsx("span", { children: "\u041E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0430\u043D\u043E\u043D\u0438\u043C\u043D\u043E" })] }), _jsx("textarea", { placeholder: "\u041D\u0430\u043F\u0438\u0448\u0438 \u043E\u0442\u0437\u044B\u0432 (\u043C\u0438\u043D\u0438\u043C\u0443\u043C 3 \u0441\u0438\u043C\u0432\u043E\u043B\u0430)", value: text, onChange: (e) => setText(e.target.value), rows: 3, className: "vx-revText" }), _jsx("button", { onClick: sendReview, disabled: !canSend, className: "vx-primary", children: "\u041E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043D\u0430 \u043C\u043E\u0434\u0435\u0440\u0430\u0446\u0438\u044E" })] }))] }), _jsx("div", { className: "vx-revH", children: "\u041E\u043F\u0443\u0431\u043B\u0438\u043A\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u043E\u0442\u0437\u044B\u0432\u044B" }), loading && _jsx("div", { children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }), !loading && reviews.length === 0 && _jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043E\u0442\u0437\u044B\u0432\u043E\u0432." }), _jsx("div", { className: "vx-revList", children: reviews.map((r) => (_jsxs("div", { className: "vx-revCard", children: [_jsxs("div", { className: "vx-revTop", children: [_jsx("div", { className: "vx-revName", children: r.displayName || "" }), _jsx("div", { className: "vx-muted", children: fmtDate(r.created_at) })] }), _jsx("div", { className: "vx-revTextOut", children: r.text }), r.company_reply?.text && (_jsxs("div", { className: "vx-revReply", children: [_jsx("div", { className: "vx-revReplyH", children: "\u041E\u0442\u0432\u0435\u0442 \u043A\u043E\u043C\u043F\u0430\u043D\u0438\u0438" }), _jsx("div", { className: "vx-revTextOut", children: r.company_reply.text })] }))] }, r.id))) })] }));
}
