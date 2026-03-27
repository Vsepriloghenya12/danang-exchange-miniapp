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
const CONTACT_URL = "https://t.me/love_2604";
export default function PaymentsTab() {
    return (_jsxs("div", { className: "card", style: { padding: 14 }, children: [_jsx("div", { className: "small", style: { lineHeight: 1.55 }, children: "\u0415\u0441\u043B\u0438 \u0432\u044B \u0445\u043E\u0442\u0438\u0442\u0435 \u043E\u0444\u043E\u0440\u043C\u0438\u0442\u044C \u0438\u043B\u0438 \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0432\u0438\u0437\u0443 \u0432\u043E \u0412\u044C\u0435\u0442\u043D\u0430\u043C, \u0430 \u0442\u0430\u043A\u0436\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043F\u043E\u043C\u043E\u0449\u044C \u0441 \u0431\u0440\u043E\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435\u043C \u043E\u0442\u0435\u043B\u0435\u0439 \u0438 \u0430\u0432\u0438\u0430\u0431\u0438\u043B\u0435\u0442\u043E\u0432 \u043F\u043E \u0432\u0441\u0435\u043C\u0443 \u043C\u0438\u0440\u0443, \u043F\u0440\u043E\u0441\u0442\u043E \u043E\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0437\u0430\u044F\u0432\u043A\u0443 \u043D\u0438\u0436\u0435. \u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440 \u0441 \u0440\u0430\u0434\u043E\u0441\u0442\u044C\u044E \u043F\u043E\u043C\u043E\u0436\u0435\u0442 \u0432\u0430\u043C!" }), _jsx("div", { className: "vx-sp12" }), _jsx("button", { type: "button", className: "btn", onClick: () => openLink(CONTACT_URL), style: { width: "100%" }, children: "\u041E\u0421\u0422\u0410\u0412\u0418\u0422\u042C \u0417\u0410\u042F\u0412\u041A\u0423" })] }));
}
