import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from "react";
import AdminTab from "../tabs/AdminTab";
// Standalone admin dashboard for PC.
// Auth is done via ADMIN_WEB_KEY (server env) passed in header x-admin-key.
// This page is meant to be opened in a normal browser: https://<domain>/admin
const LS_KEY = "danang_admin_key";
export default function AdminStandalone() {
    const [adminKey, setAdminKey] = useState(() => {
        try {
            return localStorage.getItem(LS_KEY) || "";
        }
        catch {
            return "";
        }
    });
    const [input, setInput] = useState(adminKey);
    const authed = useMemo(() => adminKey.trim().length > 0, [adminKey]);
    useEffect(() => {
        try {
            if (adminKey)
                localStorage.setItem(LS_KEY, adminKey);
            else
                localStorage.removeItem(LS_KEY);
        }
        catch {
            // ignore
        }
    }, [adminKey]);
    return (_jsx("div", { className: "vx-page vx-adminStandalone", children: _jsxs("div", { className: "container vx-adminContainer", children: [_jsx("div", { className: "card vx-topCard", children: _jsxs("div", { className: "vx-topRow", children: [_jsxs("div", { className: "vx-topText", children: [_jsx("div", { className: "vx-title", children: "\u0410\u0434\u043C\u0438\u043D\u043A\u0430 \u2014 \u041E\u0431\u043C\u0435\u043D \u0432\u0430\u043B\u044E\u0442 (\u0414\u0430\u043D\u0430\u043D\u0433)" }), _jsx("div", { className: "vx-topSub", children: "\u041E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u0443 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430. \u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u043D\u0430 \u041F\u041A." })] }), authed ? (_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => {
                                    setAdminKey("");
                                    setInput("");
                                }, children: "\u0412\u044B\u0439\u0442\u0438" })) : null] }) }), !authed ? (_jsxs("div", { className: "card", children: [_jsx("div", { className: "h2", children: "\u0412\u0445\u043E\u0434" }), _jsxs("div", { className: "small vx-mt6", children: ["\u0412\u0432\u0435\u0434\u0438 \u0430\u0434\u043C\u0438\u043D-\u043A\u043B\u044E\u0447 (\u043F\u0435\u0440\u0435\u043C\u0435\u043D\u043D\u0430\u044F \u0441\u0435\u0440\u0432\u0435\u0440\u0430 ", _jsx("b", { children: "ADMIN_WEB_KEY" }), ")."] }), _jsx("div", { className: "vx-mt10", children: _jsx("input", { className: "input", type: "password", value: input, onChange: (e) => setInput(e.target.value), placeholder: "ADMIN_WEB_KEY", autoFocus: true }) }), _jsxs("div", { className: "vx-mt10 row vx-rowWrap vx-gap8", children: [_jsx("button", { className: "btn", type: "button", onClick: () => setAdminKey(input.trim()), disabled: !input.trim(), children: "\u0412\u043E\u0439\u0442\u0438" }), _jsx("a", { className: "vx-btnGhost", href: "/", target: "_blank", rel: "noreferrer", children: "\u041E\u0442\u043A\u0440\u044B\u0442\u044C \u043C\u0438\u043D\u0438-\u0430\u043F\u043F" })] }), _jsx("div", { className: "vx-note vx-mt10", children: "\u0421\u043E\u0432\u0435\u0442: \u043F\u043E\u0441\u0442\u0430\u0432\u044C \u0434\u043B\u0438\u043D\u043D\u044B\u0439 \u043A\u043B\u044E\u0447 (32+ \u0441\u0438\u043C\u0432\u043E\u043B\u0430) \u0438 \u0445\u0440\u0430\u043D\u0438 \u0435\u0433\u043E \u0442\u043E\u043B\u044C\u043A\u043E \u0443 \u0441\u0435\u0431\u044F." })] })) : (
                // We reuse existing AdminTab UI, but instead of Telegram initData we pass a special token.
                // api.ts detects the prefix "adminkey:" and sends x-admin-key.
                _jsx("div", { className: "vx-card2", children: _jsx(AdminTab, { me: { initData: `adminkey:${adminKey}` } }) }))] }) }));
}
