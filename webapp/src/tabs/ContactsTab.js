import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function openLink(url) {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink)
        tg.openTelegramLink(url);
    else if (tg?.openLink)
        tg.openLink(url);
    else
        window.open(url, "_blank", "noopener,noreferrer");
}
function ContactCard({ role, handle }) {
    const username = handle.replace(/^@+/, "");
    const url = `https://t.me/${username}`;
    return (_jsxs("button", { type: "button", className: "card", onClick: () => openLink(url), style: {
            width: "100%",
            padding: 12,
            textAlign: "left",
            background: "rgba(255,255,255,.7)",
            border: "1px solid rgba(0,0,0,.08)",
            cursor: "pointer",
        }, children: [_jsx("div", { className: "small", style: { fontWeight: 900, marginBottom: 4 }, children: role }), _jsx("div", { className: "small", style: { opacity: 0.88 }, children: handle })] }));
}
export default function ContactsTab() {
    return (_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("div", { className: "small", style: { marginBottom: 12, lineHeight: 1.5 }, children: "\u041F\u043E \u0432\u043E\u043F\u0440\u043E\u0441\u0430\u043C \u043E\u0431\u043C\u0435\u043D\u0430, \u0430\u0444\u0438\u0448\u0438 \u0438 \u0440\u0430\u0431\u043E\u0442\u044B \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0432\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0430\u043C \u043D\u0430\u043F\u0440\u044F\u043C\u0443\u044E." }), _jsx(ContactCard, { role: "\u0410\u0434\u043C\u0438\u043D", handle: "@exchange_vn" }), _jsx("div", { style: { height: 10 } }), _jsx(ContactCard, { role: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440", handle: "@manager_exchange_vn" })] }));
}
