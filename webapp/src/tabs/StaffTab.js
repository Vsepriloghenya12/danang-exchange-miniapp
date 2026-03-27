import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGetBankIcons, bankIconUrl, apiAdminSetUserStatus, apiStaffGetRequests, apiStaffSetRequestState, apiStaffUpdateRequest, apiStaffUpsertContact, } from "../lib/api";
function getTg() {
    return window.Telegram?.WebApp;
}
// В админке оставляем только 3 статуса: в работе (ставится автоматически), готова, отклонена
const STATE_OPTIONS = [
    { v: "in_progress", l: "В работе" },
    { v: "done", l: "Готова" },
    { v: "canceled", l: "Отклонена" },
];
const stateLabel = {
    in_progress: "В работе",
    done: "Готова",
    canceled: "Отклонена",
    new: "В работе",
};
const STATUS_OPTIONS = [
    { v: "standard", l: "Стандарт" },
    { v: "silver", l: "Серебро" },
    { v: "gold", l: "Золото" },
];
function userStatusLabel(v) {
    const hit = STATUS_OPTIONS.find((x) => x.v === String(v || "standard"));
    return hit?.l || "Стандарт";
}
function shortId(id) {
    const s = String(id || "");
    return s.length > 6 ? s.slice(-6) : s;
}
function fmtDateTime(iso) {
    try {
        const d = new Date(iso);
        if (!Number.isFinite(d.getTime()))
            return "";
        return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
export default function StaffTab({ me }) {
    const tg = getTg();
    const initData = tg?.initData || me?.initData || "";
    const [loading, setLoading] = useState(true);
    const [icons, setIcons] = useState([]);
    const [requests, setRequests] = useState([]);
    const [contactsMap, setContactsMap] = useState({});
    const [usersMap, setUsersMap] = useState({});
    const [selectedId, setSelectedId] = useState("");
    const [view, setView] = useState("list");
    // Keep the latest selection/view accessible inside the polling interval.
    const selectedIdRef = useRef("");
    const viewRef = useRef("list");
    useEffect(() => {
        selectedIdRef.current = selectedId;
    }, [selectedId]);
    useEffect(() => {
        viewRef.current = view;
    }, [view]);
    const selectedReq = useMemo(() => requests.find((r) => String(r.id) === String(selectedId)) || null, [requests, selectedId]);
    const activeReqs = useMemo(() => (requests || [])
        .filter((r) => String(r?.state) !== "done" && String(r?.state) !== "canceled")
        .map((r) => ({ ...r, state: String(r.state) === "new" ? "in_progress" : r.state }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [requests]);
    const historyReqs = useMemo(
    // History = finished requests only
    () => (requests || [])
        .filter((r) => {
        const s = String(r?.state || "");
        return s === "done" || s === "canceled";
    })
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))), [requests]);
    const selectedTgId = selectedReq?.from?.id ? Number(selectedReq.from.id) : undefined;
    const selectedContact = useMemo(() => {
        if (!selectedTgId)
            return null;
        return contactsMap[String(selectedTgId)] || null;
    }, [contactsMap, selectedTgId]);
    const selectedUser = useMemo(() => {
        if (!selectedTgId)
            return null;
        return usersMap[String(selectedTgId)] || null;
    }, [usersMap, selectedTgId]);
    const selectedClientStatus = useMemo(() => {
        const raw = selectedUser?.status ||
            selectedContact?.status ||
            selectedReq?.status ||
            "standard";
        return raw === "gold" || raw === "silver" ? raw : "standard";
    }, [selectedUser?.status, selectedContact?.status, selectedReq?.status]);
    const [fullName, setFullName] = useState("");
    const [banks, setBanks] = useState([]);
    const [editSellCurrency, setEditSellCurrency] = useState("");
    const [editBuyCurrency, setEditBuyCurrency] = useState("");
    const [editSellAmount, setEditSellAmount] = useState("");
    const [editBuyAmount, setEditBuyAmount] = useState("");
    const [editPayMethod, setEditPayMethod] = useState("transfer");
    const [editReceiveMethod, setEditReceiveMethod] = useState("cash");
    const [editComment, setEditComment] = useState("");
    const [savingRequest, setSavingRequest] = useState(false);
    // sync editor when selection changes
    useEffect(() => {
        setFullName(selectedContact?.fullName || "");
        setBanks(Array.isArray(selectedContact?.banks) ? selectedContact.banks : []);
    }, [selectedContact?.id]);
    useEffect(() => {
        if (!selectedReq) {
            setEditSellCurrency("");
            setEditBuyCurrency("");
            setEditSellAmount("");
            setEditBuyAmount("");
            setEditPayMethod("transfer");
            setEditReceiveMethod("cash");
            setEditComment("");
            return;
        }
        setEditSellCurrency(String(selectedReq.sellCurrency || ""));
        setEditBuyCurrency(String(selectedReq.buyCurrency || ""));
        setEditSellAmount(String(selectedReq.sellAmount ?? ""));
        setEditBuyAmount(String(selectedReq.buyAmount ?? ""));
        setEditPayMethod(String(selectedReq.payMethod || "transfer"));
        setEditReceiveMethod(String(selectedReq.receiveMethod || "cash"));
        setEditComment(String(selectedReq.comment || ""));
    }, [selectedReq?.id]);
    async function loadAll(opts) {
        if (!initData)
            return;
        if (!opts?.silent)
            setLoading(true);
        try {
            const [ri, bi] = await Promise.allSettled([
                apiStaffGetRequests(initData),
                apiGetBankIcons(),
            ]);
            if (ri.status === "fulfilled" && ri.value?.ok) {
                setRequests(Array.isArray(ri.value.requests) ? ri.value.requests : []);
                setContactsMap(ri.value.contacts || {});
                setUsersMap(ri.value.users || {});
                // Prefer the newest active request as the default selection
                const list = Array.isArray(ri.value.requests) ? ri.value.requests : [];
                const active = list.filter((r) => String(r?.state) !== "done" && String(r?.state) !== "canceled");
                const firstActive = active.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
                const firstAny = list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
                const pick = firstActive || firstAny;
                const curSelectedId = selectedIdRef.current;
                if (pick && (!curSelectedId || !list.some((x) => String(x.id) === String(curSelectedId)))) {
                    setSelectedId(String(pick.id));
                }
                // If we're in details screen but the request disappeared, go back to the list.
                const curView = viewRef.current;
                if (curView === "detail" && curSelectedId && !list.some((x) => String(x.id) === String(curSelectedId))) {
                    setView("list");
                }
            }
            if (bi.status === "fulfilled" && bi.value?.ok) {
                setIcons(Array.from(new Set(Array.isArray(bi.value.icons) ? bi.value.icons : [])));
            }
        }
        finally {
            if (!opts?.silent)
                setLoading(false);
        }
    }
    useEffect(() => {
        tg?.expand?.();
        if (!initData)
            return;
        void loadAll();
        const id = window.setInterval(() => {
            void loadAll({ silent: true });
        }, 7000);
        return () => window.clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initData]);
    async function changeState(next) {
        if (!selectedReq)
            return;
        const r = await apiStaffSetRequestState(initData, String(selectedReq.id), next);
        if (!r?.ok) {
            tg?.showAlert?.(r?.error || "Ошибка");
            return;
        }
        await loadAll();
        // If a request is finished, move it to History (as expected by UX)
        if (next === "done" || next === "canceled") {
            setView("history");
        }
        tg?.HapticFeedback?.notificationOccurred?.("success");
    }
    async function saveRequestEdit() {
        if (!selectedReq || savingRequest)
            return;
        const state = String(selectedReq.state || "");
        if (state !== "in_progress" && state !== "new") {
            tg?.showAlert?.("Редактирование доступно только для заявки в работе.");
            return;
        }
        const payload = {
            sellCurrency: String(editSellCurrency || "").trim().toUpperCase(),
            buyCurrency: String(editBuyCurrency || "").trim().toUpperCase(),
            sellAmount: Number(String(editSellAmount || "").replace(",", ".")),
            buyAmount: Number(String(editBuyAmount || "").replace(",", ".")),
            payMethod: String(editPayMethod || "").trim().toLowerCase(),
            receiveMethod: String(editReceiveMethod || "").trim().toLowerCase(),
            comment: String(editComment || "").trim(),
        };
        if (!payload.sellCurrency || !payload.buyCurrency || (payload.sellCurrency === payload.buyCurrency && payload.sellCurrency !== "VND")) {
            tg?.showAlert?.("Проверь пару валют.");
            return;
        }
        if (!Number.isFinite(payload.sellAmount) || payload.sellAmount <= 0 || !Number.isFinite(payload.buyAmount) || payload.buyAmount <= 0) {
            tg?.showAlert?.("Проверь суммы заявки.");
            return;
        }
        setSavingRequest(true);
        try {
            const r = await apiStaffUpdateRequest(initData, String(selectedReq.id), payload);
            if (!r?.ok) {
                tg?.showAlert?.(r?.error || "Ошибка");
                return;
            }
            await loadAll();
            tg?.HapticFeedback?.notificationOccurred?.("success");
        }
        finally {
            setSavingRequest(false);
        }
    }
    async function changeClientStatus(next) {
        if (!selectedTgId)
            return;
        const r = await apiAdminSetUserStatus(initData, selectedTgId, next);
        if (!r?.ok) {
            tg?.showAlert?.(r?.error || "Ошибка");
            return;
        }
        setUsersMap((prev) => ({
            ...prev,
            [String(selectedTgId)]: {
                ...(prev[String(selectedTgId)] || { tg_id: selectedTgId }),
                status: next,
            },
        }));
        setContactsMap((prev) => {
            const cur = prev[String(selectedTgId)];
            if (!cur)
                return prev;
            return {
                ...prev,
                [String(selectedTgId)]: {
                    ...cur,
                    status: next,
                },
            };
        });
        await loadAll();
        tg?.HapticFeedback?.notificationOccurred?.("success");
    }
    async function saveContact() {
        if (!selectedTgId && !selectedReq?.from?.username)
            return;
        const payload = {
            tg_id: selectedTgId,
            username: selectedReq?.from?.username,
            fullName: fullName,
            banks: banks,
        };
        const r = await apiStaffUpsertContact(initData, payload);
        if (!r?.ok) {
            tg?.showAlert?.(r?.error || "Ошибка");
            return;
        }
        await loadAll();
        tg?.HapticFeedback?.notificationOccurred?.("success");
    }
    function toggleBank(name) {
        setBanks((prev) => {
            if (prev.includes(name))
                return prev.filter((x) => x !== name);
            return [...prev, name];
        });
    }
    function openDetails(id) {
        setSelectedId(String(id));
        setView("detail");
        try {
            const sc = document.getElementById("root");
            if (sc && sc.scrollTo)
                sc.scrollTo({ top: 0, behavior: "smooth" });
            else
                window.scrollTo({ top: 0, behavior: "smooth" });
        }
        catch {
            // ignore
        }
    }
    if (!initData) {
        return (_jsxs("div", { children: [_jsx("div", { className: "vx-head", children: _jsx("div", { className: "h2 vx-m0", children: "\u0410\u0434\u043C\u0438\u043D" }) }), _jsx("div", { className: "small", children: "\u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432\u043A\u043B\u0430\u0434\u043A\u0443 \u0430\u0434\u043C\u0438\u043D\u0430 \u0432\u043D\u0443\u0442\u0440\u0438 Telegram." })] }));
    }
    const Header = (_jsxs(_Fragment, { children: [_jsxs("div", { className: "vx-head", children: [_jsxs("div", { children: [_jsx("div", { className: "h2 vx-m0", children: "\u0410\u0434\u043C\u0438\u043D" }), _jsx("div", { className: "vx-meta", children: "\u0417\u0430\u044F\u0432\u043A\u0438 \u2022 \u0441\u0442\u0430\u0442\u0443\u0441 \u2022 \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" })] }), _jsx("div", { className: "row vx-rowWrap vx-gap6", style: { justifyContent: "flex-end" }, children: _jsx("button", { type: "button", className: "btn vx-btnSm", onClick: loadAll, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }) })] }), loading ? _jsx("div", { className: "vx-help", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) : null, _jsx("div", { className: "vx-sp12" })] }));
    return (_jsxs("div", { children: [Header, view === "list" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "h3 vx-m0", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 \u0437\u0430\u044F\u0432\u043A\u0438" }), _jsx("button", { type: "button", className: "btn vx-btnSm", onClick: () => setView("history"), disabled: historyReqs.length === 0, children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" })] }), _jsx("div", { className: "vx-sp10" }), activeReqs.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0417\u0430\u044F\u0432\u043E\u043A \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." })) : (_jsx("div", { className: "vx-reqList", children: activeReqs.slice(0, 40).map((r) => {
                            const u = r.from || {};
                            const who = u.username ? `@${u.username}` : `${u.first_name || ""} ${u.last_name || ""}`.trim() || `id ${u.id}`;
                            return (_jsxs("button", { type: "button", className: "vx-reqRow " + (String(r.id) === String(selectedId) ? "is-active" : ""), onClick: () => openDetails(String(r.id)), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsxs("b", { children: ["#", shortId(r.id)] }), _jsx("span", { className: "vx-muted", children: fmtDateTime(r.created_at) })] }), _jsx("div", { className: "vx-muted", children: who }), _jsxs("div", { children: [_jsxs("span", { className: "vx-tag", children: [r.sellCurrency, "\u2192", r.buyCurrency] }), _jsx("span", { className: "vx-tag", children: stateLabel[String(r.state)] || String(r.state) })] })] }, r.id));
                        }) }))] })) : null, view === "history" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "h3 vx-m0", children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F \u0437\u0430\u044F\u0432\u043E\u043A" }), _jsx("button", { type: "button", className: "btn vx-btnSm", onClick: () => setView("list"), children: "\u041D\u0430\u0437\u0430\u0434" })] }), _jsx("div", { className: "vx-sp10" }), historyReqs.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0417\u0430\u044F\u0432\u043E\u043A \u043F\u043E\u043A\u0430 \u043D\u0435\u0442." })) : (_jsx("div", { className: "vx-reqList", children: historyReqs.slice(0, 120).map((r) => {
                            const u = r.from || {};
                            const who = u.username ? `@${u.username}` : `${u.first_name || ""} ${u.last_name || ""}`.trim() || `id ${u.id}`;
                            return (_jsxs("button", { type: "button", className: "vx-reqRow " + (String(r.id) === String(selectedId) ? "is-active" : ""), onClick: () => openDetails(String(r.id)), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsxs("b", { children: ["#", shortId(r.id)] }), _jsx("span", { className: "vx-muted", children: fmtDateTime(r.created_at) })] }), _jsx("div", { className: "vx-muted", children: who }), _jsxs("div", { children: [_jsxs("span", { className: "vx-tag", children: [r.sellCurrency, "\u2192", r.buyCurrency] }), _jsx("span", { className: "vx-tag", children: stateLabel[String(r.state)] || String(r.state) })] })] }, r.id));
                        }) }))] })) : null, view === "detail" ? (!selectedReq ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: "btn vx-btnSm", onClick: () => setView("list"), children: "\u041D\u0430\u0437\u0430\u0434" }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("button", { type: "button", className: "btn vx-btnSm", onClick: () => setView("list"), children: "\u2190 \u041D\u0430\u0437\u0430\u0434" }), _jsx("div", { className: "vx-muted", children: fmtDateTime(selectedReq.created_at) })] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "h3 vx-m0", children: ["\u0417\u0430\u044F\u0432\u043A\u0430 #", shortId(selectedReq.id)] }), _jsxs("div", { className: "vx-muted", style: { marginTop: 4 }, children: ["\u041A\u043B\u0438\u0435\u043D\u0442: ", selectedReq.from?.username ? `@${selectedReq.from.username}` : "", " \u2022 id:", selectedReq.from?.id] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "grid", gap: 6 }, children: [_jsxs("div", { children: ["\uD83D\uDD01 ", _jsxs("b", { children: [selectedReq.sellCurrency, " \u2192 ", selectedReq.buyCurrency] })] }), _jsxs("div", { children: ["\uD83D\uDCB8 \u041E\u0442\u0434\u0430\u0451\u0442: ", _jsx("b", { children: selectedReq.sellAmount })] }), _jsxs("div", { children: ["\uD83C\uDFAF \u041F\u043E\u043B\u0443\u0447\u0438\u0442: ", _jsx("b", { children: selectedReq.buyAmount })] }), _jsxs("div", { children: ["\uD83D\uDCB3 \u041E\u043F\u043B\u0430\u0442\u0430: ", _jsx("b", { children: methodLabel(String(selectedReq.payMethod || "")) })] }), _jsxs("div", { children: ["\uD83D\uDCE6 \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435: ", _jsx("b", { children: methodLabel(String(selectedReq.receiveMethod || "")) })] }), selectedReq.comment ? _jsxs("div", { children: ["\uD83D\uDCDD \u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: ", _jsx("b", { children: selectedReq.comment })] }) : null, selectedReq.clientContact ? _jsxs("div", { children: ["\u260E\uFE0F \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ", _jsx("b", { children: selectedReq.clientContact })] }) : null] }), (String(selectedReq.state) === "in_progress" || String(selectedReq.state) === "new") ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u044F\u0432\u043A\u0438" }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u041F\u043E\u043A\u0430 \u0437\u0430\u044F\u0432\u043A\u0430 \u0432 \u0440\u0430\u0431\u043E\u0442\u0435, \u0430\u0434\u043C\u0438\u043D \u043C\u043E\u0436\u0435\u0442 \u0441\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C \u043F\u0430\u0440\u0443, \u0441\u0443\u043C\u043C\u044B \u0438 \u0441\u043F\u043E\u0441\u043E\u0431\u044B." }), _jsx("div", { className: "vx-sp8" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "grid", gap: 8 }, children: [_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [_jsx("select", { className: "input vx-in", value: editSellCurrency, onChange: (e) => setEditSellCurrency(e.target.value), children: ["RUB", "USDT", "USD", "EUR", "THB", "VND"].map((c) => _jsx("option", { value: c, children: c }, "sell-" + c)) }), _jsx("select", { className: "input vx-in", value: editBuyCurrency, onChange: (e) => setEditBuyCurrency(e.target.value), children: ["RUB", "USDT", "USD", "EUR", "THB", "VND"].map((c) => _jsx("option", { value: c, children: c }, "buy-" + c)) })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [_jsx("input", { className: "input vx-in", inputMode: "decimal", value: editSellAmount, onChange: (e) => setEditSellAmount(e.target.value), placeholder: "\u0421\u0443\u043C\u043C\u0430, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043E\u0442\u0434\u0430\u0451\u0442 \u043A\u043B\u0438\u0435\u043D\u0442" }), _jsx("input", { className: "input vx-in", inputMode: "decimal", value: editBuyAmount, onChange: (e) => setEditBuyAmount(e.target.value), placeholder: "\u0421\u0443\u043C\u043C\u0430, \u043A\u043E\u0442\u043E\u0440\u0443\u044E \u043F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 \u043A\u043B\u0438\u0435\u043D\u0442" })] }), _jsxs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }, children: [_jsxs("select", { className: "input vx-in", value: editPayMethod, onChange: (e) => setEditPayMethod(e.target.value), children: [_jsx("option", { value: "cash", children: "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435" }), _jsx("option", { value: "transfer", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434" }), _jsx("option", { value: "atm", children: "\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442" })] }), _jsxs("select", { className: "input vx-in", value: editReceiveMethod, onChange: (e) => setEditReceiveMethod(e.target.value), children: [_jsx("option", { value: "cash", children: "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435" }), _jsx("option", { value: "transfer", children: "\u041F\u0435\u0440\u0435\u0432\u043E\u0434" }), _jsx("option", { value: "atm", children: "\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442" })] })] }), _jsx("textarea", { className: "input vx-in", rows: 3, value: editComment, onChange: (e) => setEditComment(e.target.value.slice(0, 300)), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" })] }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { type: "button", className: "btn", onClick: saveRequestEdit, disabled: savingRequest, children: savingRequest ? "Сохраняю заявку…" : "Сохранить заявку" })] })) : null, _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("div", { className: "vx-sp8" }), _jsx("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: STATE_OPTIONS.map((s) => (_jsx("button", { type: "button", className: "btn vx-btnSm " + (String(selectedReq.state) === s.v ? "vx-btnOn" : ""), onClick: () => changeState(s.v), children: s.l }, s.v))) }), _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsxs("div", { className: "vx-muted", style: { marginTop: 4 }, children: ["\u0422\u0435\u043A\u0443\u0449\u0438\u0439 \u0441\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: userStatusLabel(selectedClientStatus) })] }), _jsx("div", { className: "vx-sp8" }), _jsx("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: STATUS_OPTIONS.map((s) => (_jsx("button", { type: "button", className: "btn vx-btnSm " + (selectedClientStatus === s.v ? "vx-btnOn" : ""), onClick: () => changeClientStatus(s.v), children: s.l }, s.v))) }), _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("div", { className: "vx-sp8" }), _jsx("input", { className: "input vx-in", value: fullName, onChange: (e) => setFullName(e.target.value), placeholder: "\u0424\u0418\u041E (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0418\u0432\u0430\u043D\u043E\u0432 \u0418\u0432\u0430\u043D)" }), _jsx("div", { className: "vx-sp10" }), icons.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0418\u043A\u043E\u043D\u043E\u043A \u0431\u0430\u043D\u043A\u043E\u0432 \u043D\u0435\u0442 (\u043F\u043E\u043B\u043E\u0436\u0438 \u0444\u0430\u0439\u043B\u044B \u0432 webapp/public/banks)." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "vx-muted", children: "\u0411\u0430\u043D\u043A\u0438 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("div", { className: "vx-sp8" }), _jsx("div", { className: "vx-bankGrid", children: icons.map((ic) => {
                                    const on = banks.includes(ic);
                                    return (_jsx("button", { type: "button", className: "vx-bankBtn " + (on ? "is-on" : ""), onClick: () => toggleBank(ic), title: ic, children: _jsx("img", { src: bankIconUrl(ic), alt: "", className: "vx-bankImg", onError: (e) => { const p = e.currentTarget.parentElement; if (p)
                                                p.style.display = "none"; } }) }, ic));
                                }) })] })), _jsx("div", { className: "vx-sp10" }), _jsx("button", { type: "button", className: "btn", onClick: saveContact, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442" }), selectedContact ? (_jsxs("div", { className: "vx-muted", style: { marginTop: 8 }, children: ["\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0440\u0430\u043D\u0435\u0435: ", selectedContact.fullName || "—"] })) : null] }))) : null] }));
}
