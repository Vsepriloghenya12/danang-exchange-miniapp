import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiSuggestAtm } from "../lib/api";
const FIND_ATM_URL = "https://maps.app.goo.gl/i11t9GR7bMhwnmHfA?g_st=i";
function openLink(url) {
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink)
        tg.openLink(url);
    else
        window.open(url, "_blank", "noopener,noreferrer");
}
export default function AtmTab({ isActive = true }) {
    const [active, setActive] = useState(null);
    const [suggestOpen, setSuggestOpen] = useState(false);
    const [suggestText, setSuggestText] = useState("");
    const [sending, setSending] = useState(false);
    // Telegram initData — used to authenticate API calls.
    const tg = window.Telegram?.WebApp;
    const initData = String(tg?.initData || "");
    const src = useMemo(() => {
        if (active === "vietcombank")
            return "/videos/vietcombank.mp4";
        if (active === "bidv")
            return "/videos/bidv.mp4";
        return "";
    }, [active]);
    const videoRef = useRef(null);
    useEffect(() => {
        if (isActive)
            return;
        const v = videoRef.current;
        if (!v)
            return;
        try {
            v.pause();
            v.currentTime = 0;
        }
        catch { }
    }, [isActive]);
    useEffect(() => {
        return () => {
            const v = videoRef.current;
            if (!v)
                return;
            try {
                v.pause();
                v.currentTime = 0;
            }
            catch { }
        };
    }, []);
    // When the modal is open, freeze page overscroll and hide the fixed bottom menu.
    // We reuse the same global switch that the Afisha bottom-sheet uses.
    useEffect(() => {
        const html = document.documentElement;
        if (suggestOpen || !!active)
            html.classList.add("mx-sheet-open");
        else
            html.classList.remove("mx-sheet-open");
        return () => html.classList.remove("mx-sheet-open");
    }, [suggestOpen, active]);
    async function submitSuggest() {
        const text = String(suggestText || "").trim();
        if (!text)
            return;
        if (!initData) {
            alert("Нет Telegram initData — откройте приложение внутри Telegram.");
            return;
        }
        setSending(true);
        try {
            const r = await apiSuggestAtm(initData, text);
            if (!r?.ok)
                throw new Error(r?.error || "send_failed");
            setSuggestOpen(false);
            setSuggestText("");
            const tg = window.Telegram?.WebApp;
            if (tg?.showPopup) {
                tg.showPopup({
                    title: "Спасибо!",
                    message: "Локация отправлена менеджеру.",
                    buttons: [{ type: "ok" }]
                });
            }
            else {
                alert("Локация отправлена менеджеру.");
            }
        }
        catch (e) {
            const msg = e?.message || "Не удалось отправить";
            const tg = window.Telegram?.WebApp;
            if (tg?.showPopup) {
                tg.showPopup({ title: "Ошибка", message: msg, buttons: [{ type: "ok" }] });
            }
            else {
                alert(msg);
            }
        }
        finally {
            setSending(false);
        }
    }
    return (_jsxs("div", { className: "vx-atm", children: [_jsx("div", { className: "vx-atmHintBox", children: _jsxs("div", { className: "vx-atmHint", children: ["\u0412\u044B \u043C\u043E\u0436\u0435\u0442\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u044C \u043D\u0430\u043B\u0438\u0447\u043D\u044B\u0435 \u0432 \u0431\u0430\u043D\u043A\u043E\u043C\u0430\u0442\u0430\u0445 ", _jsx("span", { className: "vx-bankBrand vx-bankBrandVcb", children: "VIETCOMBANK" }), " \u0438 ", _jsx("span", { className: "vx-bankBrand vx-bankBrandBidv", children: "BIDV" }), " \u0432 \u043B\u044E\u0431\u043E\u043C \u0433\u043E\u0440\u043E\u0434\u0435 \u0412\u044C\u0435\u0442\u043D\u0430\u043C\u0430."] }) }), _jsx("div", { className: "vx-sp14" }), _jsxs("div", { className: "vx-atmBtnGrid", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }, children: [_jsxs("button", { type: "button", className: "btn vx-atmBtn " + (active === "vietcombank" ? "vx-btnOn" : ""), onClick: () => setActive((p) => (p === "vietcombank" ? null : "vietcombank")), children: ["\u0412\u0438\u0434\u0435\u043E ", _jsx("span", { className: "vx-bankBrand vx-bankBrandVcb", children: "Vietcombank" })] }), _jsxs("button", { type: "button", className: "btn vx-atmBtn " + (active === "bidv" ? "vx-btnOn" : ""), onClick: () => setActive((p) => (p === "bidv" ? null : "bidv")), children: ["\u0412\u0438\u0434\u0435\u043E ", _jsx("span", { className: "vx-bankBrand vx-bankBrandBidv", children: "BIDV" })] })] }), _jsx("div", { className: "vx-sp14" }), _jsx("button", { className: "btn vx-atmFindBtn", type: "button", onClick: () => openLink(FIND_ATM_URL), children: "\u041D\u0430\u0439\u0442\u0438 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0438\u0439 \u043A\u043E \u043C\u043D\u0435 \u0431\u0430\u043D\u043A\u043E\u043C\u0430\u0442" }), _jsx("div", { className: "vx-sp14" }), _jsxs("div", { className: "vx-atmNote", children: ["\u0415\u0441\u043B\u0438 \u0432\u044B \u0432\u0438\u0434\u0438\u0442\u0435 \u0440\u044F\u0434\u043E\u043C \u0441 \u0441\u043E\u0431\u043E\u0439 \u0431\u0430\u043D\u043A\u043E\u043C\u0430\u0442 ", _jsx("span", { className: "vx-bankBrand vx-bankBrandVcb", children: "Vietcombank" }), " \u0438\u043B\u0438 ", _jsx("span", { className: "vx-bankBrand vx-bankBrandBidv", children: "BIDV" }), ", \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u043D\u0435 \u043E\u0442\u043C\u0435\u0447\u0435\u043D \u043D\u0430 \u043D\u0430\u0448\u0435\u0439 \u043A\u0430\u0440\u0442\u0435, \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0435\u0433\u043E \u043B\u043E\u043A\u0430\u0446\u0438\u044E \u043D\u0430\u0448\u0435\u043C\u0443 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443."] }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn vx-atmSuggestBtn", type: "button", onClick: () => setSuggestOpen(true), children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043B\u043E\u043A\u0430\u0446\u0438\u044E" }), active ? (_jsx("div", { className: "vx-modalOverlay", role: "dialog", "aria-modal": "true", onClick: () => setActive(null), children: _jsxs("div", { className: "vx-modalCard", onClick: (e) => e.stopPropagation(), children: [_jsx("div", { className: "vx-modalTitle", children: active === "vietcombank" ? _jsxs(_Fragment, { children: ["\u0412\u0438\u0434\u0435\u043E \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0434\u043B\u044F ", _jsx("span", { className: "vx-bankBrand vx-bankBrandVcb", children: "Vietcombank" })] }) : _jsxs(_Fragment, { children: ["\u0412\u0438\u0434\u0435\u043E \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u0434\u043B\u044F ", _jsx("span", { className: "vx-bankBrand vx-bankBrandBidv", children: "BIDV" })] }) }), _jsx("div", { className: "vx-sp12" }), _jsx("video", { ref: videoRef, className: "vx-atmVideo", controls: true, playsInline: true, preload: "metadata", src: src }), _jsx("div", { className: "vx-sp12" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setActive(null), children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C \u0432\u0438\u0434\u0435\u043E" })] }) })) : null, suggestOpen ? (_jsx("div", { className: "vx-modalOverlay", role: "dialog", "aria-modal": "true", children: _jsxs("div", { className: "vx-modalCard", children: [_jsx("div", { className: "vx-modalTitle", children: "\u041D\u043E\u0432\u044B\u0439 \u0431\u0430\u043D\u043A\u043E\u043C\u0430\u0442" }), _jsx("div", { className: "vx-modalSub", children: "\u0412\u0441\u0442\u0430\u0432\u044C\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0438\u043B\u0438 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 Google Maps" }), _jsx("div", { className: "vx-sp10" }), _jsx("textarea", { className: "input", style: { width: "100%", minHeight: 88 }, value: suggestText, onChange: (e) => setSuggestText(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: https://maps.app.goo.gl/... \u0438\u043B\u0438 \u0430\u0434\u0440\u0435\u0441" }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { style: { display: "flex", gap: 10 }, children: [_jsx("button", { type: "button", className: "btn", onClick: () => {
                                        if (sending)
                                            return;
                                        setSuggestOpen(false);
                                    }, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx("button", { type: "button", className: "btn vx-btnOn", disabled: sending || !String(suggestText || "").trim(), onClick: submitSuggest, children: sending ? "Отправка…" : "Отправить" })] })] }) })) : null] }));
}
