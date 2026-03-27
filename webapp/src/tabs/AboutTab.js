import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function openLink(url) {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(url))
        tg.openTelegramLink(url);
    else if (tg?.openLink)
        tg.openLink(url);
    else
        window.open(url, "_blank", "noopener,noreferrer");
}
export default function AboutTab() {
    return (_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("div", { className: "small", style: { lineHeight: 1.6, whiteSpace: "pre-line" }, children: `Приложение-помощник для туристов и локалов Дананга. Здесь можно найти интересные мероприятия и активности на любой вкус, а также обменять валюту, забронировать и оплатить отели, билеты, оформить e-visa.

Если вы хотите опубликовать своё мероприятие в разделе «Афиша», пожалуйста, напишите нам.` }), _jsx("div", { style: { height: 12 } }), _jsx("button", { type: "button", className: "btn", onClick: () => openLink("https://t.me/exchange_vn_dn"), children: "\u041D\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u043D\u0430\u043C" })] }));
}
