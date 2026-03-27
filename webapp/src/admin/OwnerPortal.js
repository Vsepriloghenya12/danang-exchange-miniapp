import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import AdminTab from "../tabs/AdminTab";
import { apiAdminGetAdmins, apiAdminSetAdmins, apiAdminGetBlacklist, apiAdminSetBlacklist, apiAdminGetPublishTemplate, apiAdminSetPublishTemplate, apiAdminPublish, apiAdminUsers, apiAdminGetRequests, apiAdminSetRequestState, apiAdminGetContacts, apiAdminUpsertContact, apiAdminGetReports, apiAdminGetAfisha, apiAdminCreateAfisha, apiAdminUpdateAfisha, apiAdminEventsSummary, apiGetBankIcons, bankIconUrl, apiAdminGetRatesRange, apiAdminSetRatesForDate, apiGetTodayRates, apiAdminGetGFormulas, apiAdminSetGFormulas, apiAdminGetFaq, apiAdminSetFaq, } from "../lib/api";
const LS_KEY = "dx_admin_key";
const LS_CASH_DEFAULT_RATES = "dx_cash_default_rates_v1";
const LS_CASH_OVERRIDES = "dx_cash_overrides_v1";
// Cross-pair formulas (multipliers) — defaults match the current app logic.
// BUY = G * buyMul, SELL = G * sellMul
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
const G_FORMULA_KEYS = Object.keys(DEFAULT_G_FORMULAS);
const STATUS_OPTIONS = [
    { v: "standard", l: "Стандарт" },
    { v: "silver", l: "Серебро" },
    { v: "gold", l: "Золото" },
];
function statusLabelRu(v) {
    const hit = STATUS_OPTIONS.find((x) => x.v === String(v || "standard"));
    return hit?.l || "Стандарт";
}
function normU(u) {
    return String(u || "").trim().replace(/^@+/, "");
}
function todayISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function shiftISO(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
const DEFAULT_TEMPLATE = `Доброе утро!\n\nКурс на {{date}}:\n\n{{rates}}\n\n🛵    Бесплатная доставка\n             С 10:00 до 16:00.\n        при обмене от 20 000₽\n\n⏩БОЛЕЕ ВЫГОДНЫЙ КУРС  ⏪\n  при дистанционном обмене                        ⠀              от 20 000₽\n💳  Перевод на вьетнамский счёт;\n📥  Получение в банкоматах BIDV Vietcombank;`;
function fmtAfTime(value) {
    const s = String(value || "").trim();
    return /^\d{2}:\d{2}$/.test(s) ? s : "";
}
function fmtAfDateTime(ev) {
    const date = String(ev?.date || "");
    const time = fmtAfTime(ev?.time);
    return time ? `${date} • ${time}` : date;
}
export default function OwnerPortal() {
    // Owner portal is opened in a regular browser; keep background consistent with the miniapp.
    useEffect(() => {
        try {
            document.body.classList.add("vx-body-client");
            return () => document.body.classList.remove("vx-body-client");
        }
        catch {
            return;
        }
    }, []);
    useEffect(() => {
        let mounted = true;
        const syncInstalled = () => {
            if (!mounted)
                return;
            try {
                setInstallDone(Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || navigator?.standalone === true));
            }
            catch { }
        };
        const onBeforeInstall = (event) => {
            event.preventDefault?.();
            if (!mounted)
                return;
            setInstallPrompt(event);
            setInstallSupported(true);
        };
        const onInstalled = () => {
            if (!mounted)
                return;
            setInstallDone(true);
            setInstallPrompt(null);
            setInstallSupported(true);
        };
        syncInstalled();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/owner-sw.js').catch(() => { });
        }
        window.addEventListener('beforeinstallprompt', onBeforeInstall);
        window.addEventListener('appinstalled', onInstalled);
        window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', syncInstalled);
        return () => {
            mounted = false;
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
            window.matchMedia?.('(display-mode: standalone)')?.removeEventListener?.('change', syncInstalled);
        };
    }, []);
    async function installOwnerApp() {
        if (installDone)
            return;
        if (installPrompt) {
            try {
                await installPrompt.prompt();
                const choice = await installPrompt.userChoice;
                if (choice?.outcome === 'accepted') {
                    setInstallDone(true);
                    showOk('Страница владельца установлена');
                }
            }
            catch { }
            setInstallPrompt(null);
            return;
        }
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
        if (isIos) {
            showOk('На iPhone/iPad: Поделиться → На экран Домой');
            return;
        }
        showOk('Открой меню браузера и выбери «Установить приложение»');
    }
    const [key, setKey] = useState(() => {
        try {
            return localStorage.getItem(LS_KEY) || "";
        }
        catch {
            return "";
        }
    });
    // keep a draft input so we don't treat partial/incorrect values as a "logged in" session
    const [draftKey, setDraftKey] = useState(key);
    const [installPrompt, setInstallPrompt] = useState(null);
    const [installSupported, setInstallSupported] = useState(false);
    const [installDone, setInstallDone] = useState(() => {
        try {
            return window.matchMedia?.('(display-mode: standalone)')?.matches || navigator?.standalone === true;
        }
        catch {
            return false;
        }
    });
    const token = useMemo(() => (key ? `adminkey:${key}` : ""), [key]);
    const me = useMemo(() => ({ initData: token }), [token]);
    const [tab, setTab] = useState("rates");
    const [banner, setBanner] = useState(null);
    function humanizeErr(text) {
        const t = String(text || "").trim();
        if (t === "bad_admin_key")
            return "Неверный ключ";
        if (t === "admin_key_not_configured")
            return "На сервере не задан ADMIN_WEB_KEY";
        if (t === "group_not_set")
            return "Не задана группа (в группе сделай /setgroup)";
        if (t === "rates_missing")
            return "Сначала задай курс на сегодня";
        if (t === "not_owner")
            return "Только владелец";
        if (t === "tg_send_failed")
            return "Telegram: не удалось отправить";
        if (t === "bad_image")
            return "Неверная картинка";
        if (t === "No initData")
            return "Нет авторизации";
        return t || "Ошибка";
    }
    function showErr(text) {
        setBanner({ type: "err", text: humanizeErr(text) });
    }
    function showOk(text) {
        setBanner({ type: "ok", text });
        window.setTimeout(() => setBanner(null), 1800);
    }
    const [adminsText, setAdminsText] = useState("");
    const [blacklistText, setBlacklistText] = useState("");
    const [tpl, setTpl] = useState(DEFAULT_TEMPLATE);
    const [imageDataUrl, setImageDataUrl] = useState(null);
    const [isPublishing, setIsPublishing] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [bankIcons, setBankIcons] = useState([]);
    // FAQ editor (owner)
    const [faqItems, setFaqItems] = useState([]);
    const [faqLoading, setFaqLoading] = useState(false);
    const [faqSaving, setFaqSaving] = useState(false);
    const [faqLoaded, setFaqLoaded] = useState(false);
    // G-formulas editor (owner)
    const [gFormulasDraft, setGFormulasDraft] = useState(() => {
        const d = {};
        for (const k of G_FORMULA_KEYS) {
            d[k] = {
                buyMul: String(DEFAULT_G_FORMULAS[k]?.buyMul ?? ""),
                sellMul: String(DEFAULT_G_FORMULAS[k]?.sellMul ?? "")
            };
        }
        return d;
    });
    const [gFormulasLoaded, setGFormulasLoaded] = useState(false);
    const [gFormulasSaving, setGFormulasSaving] = useState(false);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [clientsLoading, setClientsLoading] = useState(false);
    const [clientSearch, setClientSearch] = useState("");
    const [cUsername, setCUsername] = useState("");
    const [cTgId, setCTgId] = useState("");
    const [cFullName, setCFullName] = useState("");
    const [cStatus, setCStatus] = useState("standard");
    const [cBanks, setCBanks] = useState([]);
    const [repFrom, setRepFrom] = useState(() => shiftISO(-7));
    const [repTo, setRepTo] = useState(() => todayISO());
    const [repOnlyDone, setRepOnlyDone] = useState(true);
    const [repTgId, setRepTgId] = useState("");
    const [report, setReport] = useState(null);
    // Cashbox / Profit calculator ("КАССА")
    const [cashFrom, setCashFrom] = useState(() => shiftISO(-7));
    const [cashTo, setCashTo] = useState(() => todayISO());
    const [cashOnlyDone, setCashOnlyDone] = useState(true);
    const [cashUseHistoryRates, setCashUseHistoryRates] = useState(true);
    const [cashLoading, setCashLoading] = useState(false);
    const [cashReport, setCashReport] = useState(null);
    const [cashRatesByDate, setCashRatesByDate] = useState({});
    // Draft (editable) rates per day (strings). Saved to server via /admin/rates/date.
    const [cashDayDraft, setCashDayDraft] = useState({});
    const [cashDaySaving, setCashDaySaving] = useState({});
    const [cashDefaultRates, setCashDefaultRates] = useState(() => {
        try {
            const raw = localStorage.getItem(LS_CASH_DEFAULT_RATES);
            const j = raw ? JSON.parse(raw) : null;
            if (j && typeof j === "object")
                return j;
        }
        catch {
            // ignore
        }
        return {
            RUB: { buy: "", sell: "" },
            USD: { buy: "", sell: "" },
            USDT: { buy: "", sell: "" },
            EUR: { buy: "", sell: "" },
            THB: { buy: "", sell: "" },
        };
    });
    const [cashOverrides, setCashOverrides] = useState(() => {
        try {
            const raw = localStorage.getItem(LS_CASH_OVERRIDES);
            const j = raw ? JSON.parse(raw) : null;
            if (j && typeof j === "object")
                return j;
        }
        catch {
            // ignore
        }
        return {};
    });
    // persist cashbox settings locally (owner can tune rates per deal)
    useEffect(() => {
        try {
            localStorage.setItem(LS_CASH_DEFAULT_RATES, JSON.stringify(cashDefaultRates || {}));
        }
        catch {
            // ignore
        }
    }, [cashDefaultRates]);
    useEffect(() => {
        try {
            localStorage.setItem(LS_CASH_OVERRIDES, JSON.stringify(cashOverrides || {}));
        }
        catch {
            // ignore
        }
    }, [cashOverrides]);
    // Analytics (events)
    const [anFrom, setAnFrom] = useState(() => shiftISO(-7));
    const [anTo, setAnTo] = useState(() => todayISO());
    const [anLoading, setAnLoading] = useState(false);
    const [anData, setAnData] = useState(null);
    const [reqView, setReqView] = useState("active");
    const [reqSelectedId, setReqSelectedId] = useState("");
    const [reqHistFrom, setReqHistFrom] = useState(() => shiftISO(-7));
    const [reqHistTo, setReqHistTo] = useState(() => todayISO());
    const [reqFullName, setReqFullName] = useState("");
    const [reqBanks, setReqBanks] = useState([]);
    // Afisha (owner portal): active + history with date range + click counters
    const [afActive, setAfActive] = useState([]);
    const [afHistory, setAfHistory] = useState([]);
    const [afLoading, setAfLoading] = useState(false);
    const [afCreateCats, setAfCreateCats] = useState(["sport"]);
    const [afCreateDate, setAfCreateDate] = useState(() => todayISO());
    const [afCreateTime, setAfCreateTime] = useState("");
    const [afCreateTitle, setAfCreateTitle] = useState("");
    const [afCreateComment, setAfCreateComment] = useState("");
    const [afCreateDetailsUrl, setAfCreateDetailsUrl] = useState("");
    const [afCreateLocationUrl, setAfCreateLocationUrl] = useState("");
    const [afCreateImageDataUrl, setAfCreateImageDataUrl] = useState(null);
    const [afEditId, setAfEditId] = useState("");
    const [afEditCats, setAfEditCats] = useState(["sport"]);
    const [afEditDate, setAfEditDate] = useState("");
    const [afEditTime, setAfEditTime] = useState("");
    const [afEditTitle, setAfEditTitle] = useState("");
    const [afEditComment, setAfEditComment] = useState("");
    const [afEditDetailsUrl, setAfEditDetailsUrl] = useState("");
    const [afEditLocationUrl, setAfEditLocationUrl] = useState("");
    const [afEditImageUrl, setAfEditImageUrl] = useState("");
    const [afEditImageDataUrl, setAfEditImageDataUrl] = useState(null);
    const [afHistFrom, setAfHistFrom] = useState(() => shiftISO(-14));
    const [afHistTo, setAfHistTo] = useState(() => todayISO());
    const saveTplTimer = useRef(null);
    async function loadAll() {
        if (!token)
            return;
        setBanner(null);
        const [a, bl, t, c] = await Promise.allSettled([
            apiAdminGetAdmins(token),
            apiAdminGetBlacklist(token),
            apiAdminGetPublishTemplate(token),
            apiAdminGetContacts(token)
        ]);
        if (a.status === "fulfilled" && a.value?.ok) {
            setAdminsText((a.value.adminTgIds || []).join(","));
        }
        else if (a.status === "fulfilled" && !a.value?.ok) {
            showErr(a.value?.error || "Ошибка");
        }
        else if (a.status === "rejected") {
            showErr("Ошибка");
        }
        if (bl.status === "fulfilled" && bl.value?.ok) {
            setBlacklistText((bl.value.usernames || []).join("\n"));
        }
        else if (bl.status === "fulfilled" && !bl.value?.ok) {
            showErr(bl.value?.error || "Ошибка");
        }
        if (t.status === "fulfilled" && t.value?.ok) {
            const s = String(t.value.template || "").trim();
            setTpl(s || DEFAULT_TEMPLATE);
        }
        else if (t.status === "fulfilled" && !t.value?.ok) {
            showErr(t.value?.error || "Ошибка");
        }
        if (c.status === "fulfilled" && c.value?.ok) {
            setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
        }
        else if (c.status === "fulfilled" && !c.value?.ok) {
            showErr(c.value?.error || "Ошибка");
        }
    }
    async function loadFaq() {
        if (!token || faqLoading)
            return;
        setFaqLoading(true);
        try {
            const r = await apiAdminGetFaq(token);
            if (r?.ok) {
                const arr = Array.isArray(r.items) ? r.items : [];
                setFaqItems(arr.map((x) => ({
                    id: String(x.id || `faq_${Date.now()}_${Math.random().toString(16).slice(2)}`),
                    q: String(x.q || "").trim(),
                    a: String(x.a || "").trim()
                })));
                setFaqLoaded(true);
            }
            else {
                showErr(r?.error || "Ошибка");
            }
        }
        catch (e) {
            showErr(e?.message || "Ошибка");
        }
        finally {
            setFaqLoading(false);
        }
    }
    async function saveFaq() {
        if (!token || faqSaving)
            return;
        setFaqSaving(true);
        try {
            const items = (faqItems || [])
                .map((x) => ({ ...x, q: String(x.q || "").trim(), a: String(x.a || "").trim() }))
                .filter((x) => x.q && x.a);
            const r = await apiAdminSetFaq(token, items);
            if (r?.ok) {
                showOk("Сохранено");
                const arr = Array.isArray(r.items) ? r.items : items;
                setFaqItems(arr.map((x) => ({ id: String(x.id), q: String(x.q || ""), a: String(x.a || "") })));
            }
            else {
                showErr(r?.error || "Ошибка");
            }
        }
        catch (e) {
            showErr(e?.message || "Ошибка");
        }
        finally {
            setFaqSaving(false);
        }
    }
    function addFaqItem() {
        const id = `faq_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        setFaqItems((prev) => [...(prev || []), { id, q: "", a: "" }]);
    }
    function moveFaq(id, dir) {
        setFaqItems((prev) => {
            const a = [...(prev || [])];
            const i = a.findIndex((x) => x.id === id);
            if (i < 0)
                return a;
            const j = i + dir;
            if (j < 0 || j >= a.length)
                return a;
            const tmp = a[i];
            a[i] = a[j];
            a[j] = tmp;
            return a;
        });
    }
    async function loadClients() {
        if (!token || clientsLoading)
            return;
        setClientsLoading(true);
        try {
            const [u, r, bi, c] = await Promise.allSettled([
                apiAdminUsers(token),
                apiAdminGetRequests(token),
                apiGetBankIcons(),
                apiAdminGetContacts(token),
            ]);
            if (u.status === "fulfilled" && u.value?.ok) {
                setUsers(Array.isArray(u.value.users) ? u.value.users : []);
            }
            if (r.status === "fulfilled" && r.value?.ok) {
                setRequests(Array.isArray(r.value.requests) ? r.value.requests : []);
            }
            if (bi.status === "fulfilled" && bi.value?.ok) {
                setBankIcons(Array.from(new Set(Array.isArray(bi.value.icons) ? bi.value.icons : [])));
            }
            if (c.status === "fulfilled" && c.value?.ok) {
                setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
            }
        }
        finally {
            setClientsLoading(false);
        }
    }
    const AF_CATS = [
        { k: 'sport', l: 'Спорт' },
        { k: 'party', l: 'Вечеринки' },
        { k: 'culture', l: 'Культура и искусство' },
        { k: 'games', l: 'Игры' },
        { k: 'market', l: 'Ярмарки' },
        { k: 'food', l: 'Еда' },
        { k: 'music', l: 'Музыка' },
        { k: 'learning', l: 'Обучение' },
        { k: 'misc', l: 'Разное' },
    ];
    function afCatLabel(k) {
        const f = AF_CATS.find((x) => x.k === k);
        return f ? f.l : k;
    }
    function afCatsLabel(ev) {
        const raw = Array.isArray(ev?.categories) ? ev.categories : ev?.category ? [ev.category] : [];
        const cats = Array.from(new Set(raw.map((x) => String(x || "")).filter(Boolean))).slice(0, 3);
        return cats.length ? cats.map((c) => afCatLabel(c)).join(", ") : "—";
    }
    async function loadAfishaLists() {
        if (!token || afLoading)
            return;
        setAfLoading(true);
        try {
            const a = await apiAdminGetAfisha(token, { scope: 'active' });
            if (a?.ok)
                setAfActive(Array.isArray(a.events) ? a.events : []);
            const h = await apiAdminGetAfisha(token, { scope: 'history', from: afHistFrom, to: afHistTo });
            if (h?.ok)
                setAfHistory(Array.isArray(h.events) ? h.events : []);
        }
        finally {
            setAfLoading(false);
        }
    }
    async function loadAnalytics() {
        if (!token || anLoading)
            return;
        setAnLoading(true);
        try {
            const r = await apiAdminEventsSummary(token, { from: anFrom, to: anTo });
            if (!r?.ok) {
                showErr(r?.error || "Ошибка");
                setAnData(null);
            }
            else {
                setAnData(r);
            }
        }
        finally {
            setAnLoading(false);
        }
    }
    const screenRu = {
        home: 'Главная',
        calc: 'Оставить заявку',
        afisha: 'Афиша',
        atm: 'Банкоматы',
        reviews: 'Отзывы',
        staff: 'Админ',
        pay: 'Оплаты и бронирование',
        history: 'Моя история',
        about: 'О приложении',
        support: 'Поддержка',
    };
    function screenLabel(s) {
        const k = String(s || '').trim();
        return screenRu[k] || k || '—';
    }
    const eventRu = {
        app_open: 'Запуск приложения',
        screen_open: 'Открытие вкладки',
        click: 'Клик',
        auth: 'Авторизация',
    };
    function eventLabel(s) {
        const k = String(s || '').trim();
        return eventRu[k] || k || '—';
    }
    // Click target labels (client UI buttons)
    const clickRu = {
        // Home
        home_calc_btn: 'Главная → Оставить заявку',
        // Main nav cards
        nav_afisha: 'Главная → Афиша',
        nav_atm: 'Главная → Банкоматы',
        nav_reviews: 'Главная → Отзывы',
        // Bottom menu
        bottom_pay: 'Нижнее меню → Оплаты и бронирование',
        bottom_history: 'Нижнее меню → Моя история',
        bottom_about: 'Нижнее меню → О приложении',
        bottom_other: 'Нижнее меню → Прочее',
        other_faq: 'Прочее → FAQ',
        other_about: 'Прочее → О приложении',
        other_contacts: 'Прочее → Контакты',
        faq_back: 'FAQ → Назад',
        contacts_back: 'Контакты → Назад',
    };
    function clickLabel(s) {
        const k = String(s || '').trim();
        return clickRu[k] || k || '—';
    }
    function startEditAfisha(ev) {
        if (!ev)
            return;
        setAfEditId(String(ev.id || ''));
        const cats = Array.isArray(ev.categories) ? ev.categories : ev.category ? [ev.category] : ['sport'];
        setAfEditCats(cats.map((x) => String(x || '')).filter(Boolean).slice(0, 3));
        setAfEditDate(String(ev.date || ''));
        setAfEditTime(fmtAfTime(ev.time));
        setAfEditTitle(String(ev.title || ''));
        setAfEditComment(String(ev.comment || ''));
        setAfEditDetailsUrl(String(ev.detailsUrl || ''));
        setAfEditLocationUrl(String(ev.locationUrl || ''));
        setAfEditImageUrl(String(ev.imageUrl || ''));
        setAfEditImageDataUrl(null);
    }
    function toggleEditAfisha(ev) {
        const id = String(ev?.id || "");
        if (!id)
            return;
        if (afEditId === id) {
            setAfEditId("");
            return;
        }
        startEditAfisha(ev);
    }
    async function createAfisha() {
        if (!token)
            return;
        const payload = {
            categories: afCreateCats,
            date: afCreateDate,
            time: fmtAfTime(afCreateTime) || undefined,
            title: afCreateTitle.trim(),
            comment: afCreateComment.trim(),
            detailsUrl: afCreateDetailsUrl.trim(),
            locationUrl: afCreateLocationUrl.trim(),
            imageDataUrl: afCreateImageDataUrl || undefined,
        };
        const r = await apiAdminCreateAfisha(token, payload);
        if (!r?.ok)
            return showErr(r?.error || 'Ошибка');
        showOk('Создано');
        setAfCreateTitle('');
        setAfCreateTime('');
        setAfCreateComment('');
        setAfCreateDetailsUrl('');
        setAfCreateLocationUrl('');
        setAfCreateImageDataUrl(null);
        await loadAfishaLists();
    }
    async function saveAfisha() {
        if (!token || !afEditId)
            return;
        try {
            const payload = {
                categories: afEditCats,
                date: afEditDate,
                time: fmtAfTime(afEditTime) || '',
                title: afEditTitle.trim(),
                comment: afEditComment.trim(),
                detailsUrl: afEditDetailsUrl.trim(),
                locationUrl: afEditLocationUrl.trim(),
            };
            if (afEditImageDataUrl)
                payload.imageDataUrl = afEditImageDataUrl;
            const r = await apiAdminUpdateAfisha(token, afEditId, payload);
            if (!r?.ok)
                return showErr(r?.error || 'Ошибка');
            showOk('Сохранено');
            await loadAfishaLists();
        }
        catch (e) {
            showErr(e?.message || 'Ошибка сохранения');
        }
    }
    function renderAfishaEditForm() {
        if (!afEditId)
            return null;
        return (_jsxs(_Fragment, { children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435" }) }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("div", { style: { flex: "1 1 260px", display: "flex", gap: 8, flexWrap: "wrap" }, children: AF_CATS.map((c) => {
                                const on = afEditCats.includes(c.k);
                                const disabled = !on && afEditCats.length >= 3;
                                return (_jsx("button", { type: "button", className: "btn vx-btnSm " + (on ? "vx-btnOn" : ""), disabled: disabled, onClick: () => {
                                        setAfEditCats((prev) => {
                                            const has = prev.includes(c.k);
                                            if (has)
                                                return prev.length <= 1 ? prev : prev.filter((x) => x !== c.k);
                                            if (prev.length >= 3)
                                                return prev;
                                            return [...prev, c.k];
                                        });
                                    }, title: disabled ? "Максимум 3 категории" : "", children: c.l }, c.k));
                            }) }), _jsx("input", { className: "input vx-in", type: "date", value: afEditDate, onChange: (e) => setAfEditDate(e.target.value), style: { flex: "0 0 170px" } }), _jsx("input", { className: "input vx-in", type: "time", value: afEditTime, onChange: (e) => setAfEditTime(e.target.value), style: { flex: "0 0 130px" } })] }), _jsx("div", { className: "vx-muted", style: { marginTop: 6 }, children: "\u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u043E 3 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439" }), _jsx("div", { className: "vx-sp8" }), _jsx("input", { className: "input vx-in", value: afEditTitle, onChange: (e) => setAfEditTitle(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435" }), _jsx("div", { className: "vx-sp8" }), _jsx("textarea", { className: "input vx-in", value: afEditComment, onChange: (e) => setAfEditComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043F\u043E\u043A\u0430\u0436\u0435\u0442\u0441\u044F \u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u043F\u043E\u0434 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C)", rows: 3, style: { resize: 'vertical' } }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0424\u043E\u0442\u043E \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F" }), afEditImageUrl ? _jsxs("div", { className: "vx-muted", children: ["\u0422\u0435\u043A\u0443\u0449\u0435\u0435: ", _jsx("a", { href: afEditImageUrl, target: "_blank", rel: "noreferrer", children: afEditImageUrl })] }) : null, _jsx("div", { className: "vx-sp6" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { type: "file", accept: "image/*", onChange: (e) => {
                                const f = e.target.files?.[0];
                                if (!f)
                                    return;
                                const r = new FileReader();
                                r.onload = () => setAfEditImageDataUrl(String(r.result || "") || null);
                                r.readAsDataURL(f);
                            } }), afEditImageDataUrl ? _jsx("img", { className: "vx-pubThumb", src: afEditImageDataUrl, alt: "" }) : null] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u043A\u043D\u043E\u043F\u043A\u0438 \u00AB\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435\u00BB" }), _jsx("div", { className: "vx-sp6" }), _jsx("input", { className: "input vx-in", value: afEditDetailsUrl, onChange: (e) => setAfEditDetailsUrl(e.target.value), placeholder: "https://..." }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u043A\u043D\u043E\u043F\u043A\u0438 \u00AB\u041B\u043E\u043A\u0430\u0446\u0438\u044F\u00BB" }), _jsx("div", { className: "vx-sp6" }), _jsx("input", { className: "input vx-in", value: afEditLocationUrl, onChange: (e) => setAfEditLocationUrl(e.target.value), placeholder: "https://..." }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "row", style: { gap: 10, flexWrap: "wrap" }, children: [_jsx("button", { className: "btn", type: "button", onClick: saveAfisha, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setAfEditId(""), children: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C" })] })] }));
    }
    useEffect(() => {
        if (!token)
            return;
        loadAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);
    useEffect(() => {
        if (!token)
            return;
        if (tab === "clients" || tab === "requests")
            loadClients();
        if (tab === "afisha")
            loadAfishaLists();
        if (tab === "analytics")
            loadAnalytics();
        if (tab === "rates" && !gFormulasLoaded)
            loadGFormulas();
        if (tab === "faq" && !faqLoaded)
            loadFaq();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, token, gFormulasLoaded]);
    // autosave template (no button)
    useEffect(() => {
        if (!token)
            return;
        if (saveTplTimer.current)
            window.clearTimeout(saveTplTimer.current);
        saveTplTimer.current = window.setTimeout(async () => {
            try {
                await apiAdminSetPublishTemplate(token, tpl);
            }
            catch {
                // ignore
            }
        }, 600);
        return () => {
            if (saveTplTimer.current)
                window.clearTimeout(saveTplTimer.current);
        };
    }, [tpl, token]);
    async function onLogin() {
        try {
            localStorage.setItem(LS_KEY, draftKey);
        }
        catch {
            // ignore
        }
        setKey(draftKey);
    }
    function logout() {
        try {
            localStorage.removeItem(LS_KEY);
        }
        catch {
            // ignore
        }
        setKey("");
        setDraftKey("");
        setBanner(null);
    }
    async function saveAdmins() {
        const list = adminsText
            .split(/[,\s]+/)
            .map((x) => x.trim())
            .filter(Boolean)
            .map((x) => Number(x))
            .filter((n) => Number.isFinite(n) && n > 0);
        const r = await apiAdminSetAdmins(token, list);
        if (!r?.ok) {
            showErr(r?.error || "Ошибка");
            return;
        }
        showOk("Сохранено ✅");
    }
    async function saveBlacklist() {
        const list = blacklistText
            .split(/[\n,;\s]+/)
            .map((x) => normU(x).toLowerCase())
            .filter(Boolean);
        // unique
        const unique = Array.from(new Set(list));
        const r = await apiAdminSetBlacklist(token, unique);
        if (!r?.ok) {
            showErr(r?.error || "Ошибка");
            return;
        }
        setBlacklistText((r.usernames || []).join("\n"));
        showOk("Сохранено ✅");
    }
    function resetGFormulasToDefault() {
        const d = {};
        for (const k of G_FORMULA_KEYS) {
            d[k] = {
                buyMul: String(DEFAULT_G_FORMULAS[k]?.buyMul ?? ""),
                sellMul: String(DEFAULT_G_FORMULAS[k]?.sellMul ?? "")
            };
        }
        setGFormulasDraft(d);
    }
    async function loadGFormulas() {
        try {
            const r = await apiAdminGetGFormulas(token);
            if (!r?.ok || !r?.formulas)
                return;
            const next = {};
            for (const k of G_FORMULA_KEYS) {
                const v = r.formulas?.[k] || DEFAULT_G_FORMULAS[k];
                next[k] = {
                    buyMul: String(v?.buyMul ?? DEFAULT_G_FORMULAS[k].buyMul),
                    sellMul: String(v?.sellMul ?? DEFAULT_G_FORMULAS[k].sellMul)
                };
            }
            setGFormulasDraft(next);
            setGFormulasLoaded(true);
        }
        catch {
            // ignore
        }
    }
    async function saveGFormulas() {
        if (gFormulasSaving)
            return;
        setGFormulasSaving(true);
        try {
            const next = {};
            for (const k of G_FORMULA_KEYS) {
                const v = gFormulasDraft[k] || {};
                const buy = Number(String(v.buyMul ?? "").replace(",", ".").trim());
                const sell = Number(String(v.sellMul ?? "").replace(",", ".").trim());
                next[k] = {
                    buyMul: Number.isFinite(buy) && buy > 0 ? buy : DEFAULT_G_FORMULAS[k].buyMul,
                    sellMul: Number.isFinite(sell) && sell > 0 ? sell : DEFAULT_G_FORMULAS[k].sellMul
                };
            }
            const r = await apiAdminSetGFormulas(token, next);
            if (!r?.ok) {
                showErr(r?.error || "Ошибка");
                return;
            }
            showOk("Сохранено ✅");
            // reload normalized values from server
            setGFormulasLoaded(false);
            await loadGFormulas();
        }
        finally {
            setGFormulasSaving(false);
        }
    }
    function openClientEditor(u, c, tgId) {
        setCUsername(u.username || "");
        setCTgId(String(tgId));
        setCFullName(c?.fullName || "");
        setCStatus(c?.status || u.status || "standard");
        setCBanks(Array.isArray(c?.banks) ? c.banks : []);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function openContactOnlyEditor(c) {
        setCUsername(String(c?.username || ""));
        setCTgId(c?.tg_id ? String(c.tg_id) : "");
        setCFullName(String(c?.fullName || ""));
        setCStatus(c?.status || "standard");
        setCBanks(Array.isArray(c?.banks) ? c.banks : []);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
    function toggleBank(name) {
        setCBanks((prev) => {
            if (prev.includes(name))
                return prev.filter((x) => x !== name);
            return [...prev, name];
        });
    }
    async function publishNow() {
        if (isPublishing)
            return;
        setBanner({ type: "ok", text: "Публикую…" });
        setIsPublishing(true);
        try {
            const r = await apiAdminPublish(token, { template: tpl, imageDataUrl });
            if (!r?.ok) {
                showErr(r?.error || "Ошибка публикации");
                return;
            }
            showOk(`Опубликовано ✅ (id ${r.message_id || "–"}, ${r.mode || ""}${r.warn ? ", " + String(r.warn).slice(0, 80) : ""})`);
        }
        catch (e) {
            showErr(e?.message || "Ошибка запроса");
        }
        finally {
            setIsPublishing(false);
        }
    }
    async function upsertContact() {
        const username = normU(cUsername);
        const tgIdRaw = String(cTgId || "").trim();
        const tgIdNum = tgIdRaw ? Number(tgIdRaw) : undefined;
        const tg_id = Number.isFinite(tgIdNum) && Number(tgIdNum) > 0 ? Number(tgIdNum) : undefined;
        // if tg_id not specified, try to infer it from known users by username
        let inferredTgId = tg_id;
        if (!inferredTgId && username) {
            const u = (users || []).find((x) => String(x?.username || "").toLowerCase() === String(username).toLowerCase());
            const maybe = u?.tg_id ? Number(u.tg_id) : undefined;
            if (Number.isFinite(maybe) && Number(maybe) > 0)
                inferredTgId = Number(maybe);
        }
        if (!username && !inferredTgId) {
            showErr("Укажи username или tg_id");
            return;
        }
        const payload = {
            ...(username ? { username } : {}),
            ...(inferredTgId ? { tg_id: inferredTgId } : {}),
            fullName: cFullName,
            status: cStatus,
            banks: cBanks
        };
        const r = await apiAdminUpsertContact(token, payload);
        if (!r?.ok) {
            showErr(r?.error || "Ошибка");
            return;
        }
        setCUsername("");
        setCTgId("");
        setCFullName("");
        setCStatus("standard");
        setCBanks([]);
        const c = await apiAdminGetContacts(token);
        if (c?.ok)
            setContacts(c.contacts);
        showOk("Сохранено ✅");
    }
    async function runReport() {
        const tgIdNum = repTgId.trim() ? Number(repTgId.trim()) : undefined;
        const r = await apiAdminGetReports(token, {
            from: repFrom,
            to: repTo,
            onlyDone: repOnlyDone,
            ...(tgIdNum ? { tgId: tgIdNum } : {}),
        });
        if (!r?.ok) {
            showErr(r?.error || "Ошибка отчёта");
            return;
        }
        setReport(r);
    }
    function toNumLoose(s) {
        const n = Number(String(s ?? "").replace(/\s+/g, "").replace(",", ".").trim());
        return Number.isFinite(n) ? n : Number.NaN;
    }
    function fmtRate(n) {
        const x = Number(n);
        if (!Number.isFinite(x))
            return "";
        // show up to 4 decimals, but trim trailing zeros
        const s = x.toFixed(4).replace(/0+$/g, "").replace(/\.$/g, "");
        return s;
    }
    async function loadCashbox() {
        if (!token || cashLoading)
            return;
        setCashLoading(true);
        try {
            const [rep, rr, today] = await Promise.allSettled([
                apiAdminGetReports(token, { from: cashFrom, to: cashTo, onlyDone: cashOnlyDone }),
                apiAdminGetRatesRange(token, { from: cashFrom, to: cashTo }),
                apiGetTodayRates(),
            ]);
            if (rep.status === "fulfilled" && rep.value?.ok) {
                setCashReport(rep.value);
            }
            else if (rep.status === "fulfilled" && rep.value && !rep.value.ok) {
                showErr(rep.value?.error || "Ошибка");
            }
            if (rr.status === "fulfilled" && rr.value?.ok) {
                const map = {};
                for (const it of rr.value.items || []) {
                    if (it?.date && it?.rates)
                        map[String(it.date)] = it.rates;
                }
                setCashRatesByDate(map);
            }
            // auto-fill defaults from today's rates once (if empty)
            if (today.status === "fulfilled" && today.value?.ok) {
                const rates = today.value?.data?.rates;
                if (rates && typeof rates === "object") {
                    setCashDefaultRates((prev) => {
                        const next = { ...(prev || {}) };
                        for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
                            const p = next[cur] || { buy: "", sell: "" };
                            const r = rates?.[cur];
                            const buy = toNumLoose(r?.buy_vnd);
                            const sell = toNumLoose(r?.sell_vnd);
                            // fill only when empty
                            if ((!p.buy || !String(p.buy).trim()) && Number.isFinite(buy) && buy > 0)
                                p.buy = fmtRate(buy);
                            if ((!p.sell || !String(p.sell).trim()) && Number.isFinite(sell) && sell > 0)
                                p.sell = fmtRate(sell);
                            next[cur] = p;
                        }
                        return next;
                    });
                }
            }
        }
        finally {
            setCashLoading(false);
        }
    }
    // Auto-load cashbox data when entering the tab / changing filters
    useEffect(() => {
        if (tab !== "cashbox")
            return;
        if (!token)
            return;
        loadCashbox();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, token, cashFrom, cashTo, cashOnlyDone]);
    async function saveCashDayRates(date) {
        if (!token)
            return;
        const day = String(date || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
            showErr("Неверная дата");
            return;
        }
        setCashDaySaving((prev) => ({ ...(prev || {}), [day]: true }));
        try {
            const draft = cashDayDraft?.[day] || {};
            const mk = (cur) => {
                const d = draft?.[cur] || {};
                const def = cashDefaultRates?.[cur] || {};
                const buy = toNumLoose(d.buy != null ? d.buy : def.buy);
                const sell = toNumLoose(d.sell != null ? d.sell : def.sell);
                return { buy, sell };
            };
            const USD = mk("USD");
            const RUB = mk("RUB");
            const USDT = mk("USDT");
            if (![USD, RUB, USDT].every((x) => Number.isFinite(x.buy) && Number.isFinite(x.sell) && x.buy > 0 && x.sell > 0)) {
                showErr("Заполни buy/sell для USD, RUB и USDT");
                return;
            }
            const payload = {
                USD: { buy_vnd: USD.buy, sell_vnd: USD.sell },
                RUB: { buy_vnd: RUB.buy, sell_vnd: RUB.sell },
                USDT: { buy_vnd: USDT.buy, sell_vnd: USDT.sell },
            };
            const EUR = mk("EUR");
            const THB = mk("THB");
            if (Number.isFinite(EUR.buy) && Number.isFinite(EUR.sell) && EUR.buy > 0 && EUR.sell > 0) {
                payload.EUR = { buy_vnd: EUR.buy, sell_vnd: EUR.sell };
            }
            if (Number.isFinite(THB.buy) && Number.isFinite(THB.sell) && THB.buy > 0 && THB.sell > 0) {
                payload.THB = { buy_vnd: THB.buy, sell_vnd: THB.sell };
            }
            const r = await apiAdminSetRatesForDate(token, day, payload);
            if (!r?.ok) {
                showErr(r?.error || "Ошибка сохранения курса");
                return;
            }
            setCashRatesByDate((prev) => ({ ...(prev || {}), [day]: payload }));
            showOk(`Курс сохранён за ${day}`);
        }
        finally {
            setCashDaySaving((prev) => ({ ...(prev || {}), [day]: false }));
        }
    }
    function fmtNum(n) {
        const x = Number(n);
        if (!Number.isFinite(x))
            return "–";
        return String(Math.trunc(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }
    function fmtDt(iso) {
        const d = new Date(String(iso || ""));
        const t = d.getTime();
        if (!Number.isFinite(t))
            return String(iso || "");
        return d.toLocaleString("ru-RU");
    }
    function who(req) {
        const u = req?.from?.username ? "@" + req.from.username : "";
        const name = [req?.from?.first_name, req?.from?.last_name].filter(Boolean).join(" ");
        return u || name || (req?.from?.id ? "id " + req.from.id : "–");
    }
    function stateRu(s) {
        const v = String(s || "");
        if (v === "new")
            return "Принята";
        if (v === "in_progress")
            return "В работе";
        if (v === "done")
            return "Готово";
        if (v === "canceled")
            return "Отклонена";
        return v || "–";
    }
    function methodRu(m) {
        const v = String(m || "");
        if (v === "cash")
            return "Наличные";
        if (v === "transfer")
            return "Перевод";
        if (v === "atm")
            return "Банкомат";
        if (v === "other")
            return "Другое";
        return v || "–";
    }
    const contactsByTg = useMemo(() => {
        const m = {};
        for (const c of contacts || []) {
            if (c?.tg_id)
                m[String(c.tg_id)] = c;
        }
        return m;
    }, [contacts]);
    const contactsByUsername = useMemo(() => {
        const m = {};
        for (const c of contacts || []) {
            if (c?.username)
                m[String(c.username).toLowerCase()] = c;
        }
        return m;
    }, [contacts]);
    const manualClientRows = useMemo(() => {
        const rows = [];
        const seen = new Set();
        for (const u of users || []) {
            const tgId = Number(u?.tg_id);
            if (!Number.isFinite(tgId) || tgId <= 0)
                continue;
            const uname = u?.username ? String(u.username).toLowerCase() : "";
            const c = contactsByTg[String(tgId)] || (uname ? contactsByUsername[uname] : undefined);
            seen.add(`tg:${tgId}`);
            if (uname)
                seen.add(`u:${uname}`);
            rows.push({ kind: "user", u, c, tgId, sortDate: String(u?.last_seen_at || c?.updated_at || c?.created_at || "") });
        }
        for (const c of contacts || []) {
            if (!c)
                continue;
            const tgIdNum = c?.tg_id ? Number(c.tg_id) : Number.NaN;
            const uname = c?.username ? String(c.username).toLowerCase() : "";
            if (Number.isFinite(tgIdNum) && seen.has(`tg:${tgIdNum}`))
                continue;
            if (uname && seen.has(`u:${uname}`))
                continue;
            if (Number.isFinite(tgIdNum))
                seen.add(`tg:${tgIdNum}`);
            if (uname)
                seen.add(`u:${uname}`);
            rows.push({ kind: "contact", c, tgId: Number.isFinite(tgIdNum) ? tgIdNum : undefined, sortDate: String(c?.updated_at || c?.created_at || "") });
        }
        return rows
            .slice()
            .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")))
            .slice(0, 300);
    }, [users, contacts, contactsByTg, contactsByUsername]);
    const filteredClientRows = useMemo(() => {
        const q = String(clientSearch || "").trim().toLowerCase();
        if (!q)
            return manualClientRows;
        return manualClientRows.filter((row) => {
            const u = row.kind === "user" ? row.u : null;
            const c = row.c;
            const tgId = row.tgId;
            const username = String(u?.username || c?.username || "").toLowerCase();
            const fullName = String(c?.fullName || [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "").toLowerCase();
            const status = String(c?.status || u?.status || "standard").toLowerCase();
            const statusRu = statusLabelRu(status).toLowerCase();
            const banks = Array.isArray(c?.banks) ? c.banks.join(" ").toLowerCase() : "";
            const tgText = tgId ? String(tgId) : "";
            const hay = [username, fullName, status, statusRu, banks, tgText].join(" ");
            return hay.includes(q);
        });
    }, [manualClientRows, clientSearch]);
    // Cashbox computed rows (profit in VND)
    const cashComputed = useMemo(() => {
        const reqs = Array.isArray(cashReport?.requests) ? cashReport.requests : [];
        const draftToRates = (draft) => {
            if (!draft || typeof draft !== "object")
                return null;
            const out = {};
            for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
                const d = draft[cur];
                const buy = toNumLoose(d?.buy);
                const sell = toNumLoose(d?.sell);
                if (Number.isFinite(buy) && Number.isFinite(sell) && buy > 0 && sell > 0) {
                    out[cur] = { buy_vnd: buy, sell_vnd: sell };
                }
            }
            return Object.keys(out).length ? out : null;
        };
        const getBaseRates = (dateKey) => {
            if (!cashUseHistoryRates)
                return null;
            // Prefer draft (editable) rates for live preview; fall back to saved ratesByDate
            const dr = draftToRates(cashDayDraft?.[dateKey]);
            if (dr)
                return dr;
            return cashRatesByDate?.[dateKey] || null;
        };
        const getAutoRate = (rates, cur, kind) => {
            const c = String(cur || "").toUpperCase();
            if (!c || c === "VND")
                return 1;
            const key = kind === "in" ? "sell_vnd" : "buy_vnd";
            const n1 = toNumLoose(rates?.[c]?.[key]);
            if (Number.isFinite(n1) && n1 > 0)
                return n1;
            const def = cashDefaultRates?.[c];
            const n2 = toNumLoose(kind === "in" ? def?.sell : def?.buy);
            if (Number.isFinite(n2) && n2 > 0)
                return n2;
            return Number.NaN;
        };
        const getEffectiveRate = (id, rates, cur, kind) => {
            const c = String(cur || "").toUpperCase();
            if (!c || c === "VND")
                return 1;
            const ov = cashOverrides?.[String(id)] || {};
            const ovText = kind === "in" ? ov.in : ov.out;
            const ovNum = toNumLoose(ovText);
            if (Number.isFinite(ovNum) && ovNum > 0)
                return ovNum;
            return getAutoRate(rates, c, kind);
        };
        const rows = reqs.map((r) => {
            const id = String(r?.id || "");
            const created = String(r?.created_at || "");
            const dateKey = /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : "";
            const sellCur = String(r?.sellCurrency || "").toUpperCase();
            const buyCur = String(r?.buyCurrency || "").toUpperCase();
            const sellAmount = Number(r?.sellAmount);
            const buyAmount = Number(r?.buyAmount);
            const baseRates = getBaseRates(dateKey);
            const inAuto = getAutoRate(baseRates, sellCur, "in");
            const outAuto = getAutoRate(baseRates, buyCur, "out");
            const inRate = getEffectiveRate(id, baseRates, sellCur, "in");
            const outRate = getEffectiveRate(id, baseRates, buyCur, "out");
            const inVnd = sellCur === "VND" ? sellAmount : sellAmount * inRate;
            const outVnd = buyCur === "VND" ? buyAmount : buyAmount * outRate;
            const profit = Number.isFinite(inVnd) && Number.isFinite(outVnd) ? inVnd - outVnd : Number.NaN;
            const ov = cashOverrides?.[id] || {};
            const inValue = sellCur === "VND" ? "" : (ov.in != null ? String(ov.in) : fmtRate(inAuto));
            const outValue = buyCur === "VND" ? "" : (ov.out != null ? String(ov.out) : fmtRate(outAuto));
            return {
                id,
                dateKey,
                created_at: created,
                who: who(r),
                state: String(r?.state || ""),
                payMethod: r?.payMethod,
                receiveMethod: r?.receiveMethod,
                sellCur,
                buyCur,
                sellAmount,
                buyAmount,
                inAuto,
                outAuto,
                inValue,
                outValue,
                profit,
                profitOk: Number.isFinite(profit),
                missingRates: (!Number.isFinite(inRate) && sellCur !== "VND") || (!Number.isFinite(outRate) && buyCur !== "VND"),
            };
        });
        const totalProfit = rows.reduce((acc, x) => (Number.isFinite(x.profit) ? acc + x.profit : acc), 0);
        const missing = rows.reduce((acc, x) => (x.missingRates ? acc + 1 : acc), 0);
        return { rows, totalProfit, missing, total: rows.length };
    }, [cashReport, cashRatesByDate, cashDayDraft, cashOverrides, cashDefaultRates, cashUseHistoryRates]);
    // Cashbox summary grouped by day (helps input per-day selling prices like in Excel)
    const cashByDay = useMemo(() => {
        const map = {};
        for (const x of cashComputed.rows || []) {
            const dk = String(x?.dateKey || "").trim();
            if (!dk)
                continue;
            if (!map[dk])
                map[dk] = { date: dk, cnt: 0, profit: 0, sell: {}, buy: {} };
            map[dk].cnt++;
            if (Number.isFinite(x.profit))
                map[dk].profit += x.profit;
            const sc = String(x.sellCur || "");
            const bc = String(x.buyCur || "");
            if (sc && Number.isFinite(Number(x.sellAmount))) {
                map[dk].sell[sc] = (map[dk].sell[sc] || 0) + Number(x.sellAmount);
            }
            if (bc && Number.isFinite(Number(x.buyAmount))) {
                map[dk].buy[bc] = (map[dk].buy[bc] || 0) + Number(x.buyAmount);
            }
        }
        return Object.keys(map)
            .sort((a, b) => b.localeCompare(a))
            .map((k) => map[k]);
    }, [cashComputed.rows]);
    // Seed day drafts from saved rates / defaults (do not overwrite existing drafts)
    useEffect(() => {
        if (!cashByDay.length)
            return;
        setCashDayDraft((prev) => {
            const next = { ...(prev || {}) };
            let changed = false;
            for (const d of cashByDay) {
                const date = String(d?.date || "");
                if (!date || next[date])
                    continue;
                const saved = cashRatesByDate?.[date] || null;
                const seeded = {};
                for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
                    const sBuy = toNumLoose(saved?.[cur]?.buy_vnd);
                    const sSell = toNumLoose(saved?.[cur]?.sell_vnd);
                    const def = cashDefaultRates?.[cur] || {};
                    const buy = Number.isFinite(sBuy) && sBuy > 0 ? fmtRate(sBuy) : String(def.buy || "");
                    const sell = Number.isFinite(sSell) && sSell > 0 ? fmtRate(sSell) : String(def.sell || "");
                    seeded[cur] = { buy, sell };
                }
                next[date] = seeded;
                changed = true;
            }
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cashByDay, cashRatesByDate, cashDefaultRates]);
    const reqSelected = useMemo(() => (requests || []).find((r) => String(r?.id) === String(reqSelectedId)) || null, [requests, reqSelectedId]);
    const selectedTgId = reqSelected?.from?.id ? Number(reqSelected.from.id) : undefined;
    const selectedUsername = reqSelected?.from?.username ? String(reqSelected.from.username) : "";
    const reqSelectedContact = useMemo(() => {
        if (!reqSelected)
            return null;
        if (selectedTgId && contactsByTg[String(selectedTgId)])
            return contactsByTg[String(selectedTgId)];
        if (selectedUsername)
            return contactsByUsername[String(selectedUsername).toLowerCase()] || null;
        return null;
    }, [reqSelected, selectedTgId, selectedUsername, contactsByTg, contactsByUsername]);
    // Sync request contact editor on selection change
    useEffect(() => {
        setReqFullName(reqSelectedContact?.fullName || "");
        setReqBanks(Array.isArray(reqSelectedContact?.banks) ? reqSelectedContact.banks : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reqSelectedContact?.id, reqSelectedId]);
    const reqActive = useMemo(() => (requests || [])
        .filter((r) => {
        const s = String(r?.state || "");
        return s !== "done" && s !== "canceled";
    })
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))), [requests]);
    const reqRejected = useMemo(() => (requests || [])
        .filter((r) => String(r?.state || "") === "canceled")
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))), [requests]);
    const reqHistoryAll = useMemo(() => (requests || [])
        .filter((r) => String(r?.state || "") === "done")
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))), [requests]);
    const reqHistory = useMemo(() => {
        const from = reqHistFrom ? new Date(reqHistFrom + "T00:00:00").getTime() : NaN;
        const to = reqHistTo ? new Date(reqHistTo + "T23:59:59").getTime() : NaN;
        return reqHistoryAll.filter((r) => {
            const t = new Date(String(r?.created_at || "")).getTime();
            if (!Number.isFinite(t))
                return true;
            if (Number.isFinite(from) && t < from)
                return false;
            if (Number.isFinite(to) && t > to)
                return false;
            return true;
        });
    }, [reqHistoryAll, reqHistFrom, reqHistTo]);
    function reqShortId(id) {
        const s = String(id || "");
        return s.length > 6 ? s.slice(-6) : s;
    }
    function openReqDetails(id) {
        setReqSelectedId(String(id));
        setReqView("detail");
        try {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
        catch {
            // ignore
        }
    }
    async function setReqState(next) {
        if (!reqSelected)
            return;
        const r = await apiAdminSetRequestState(token, String(reqSelected.id), next);
        if (!r?.ok) {
            showErr(r?.error || "Ошибка");
            return;
        }
        await loadClients();
        if (next === "done")
            setReqView("history");
        if (next === "canceled")
            setReqView("rejected");
        showOk("Сохранено ✅");
    }
    async function saveReqContact() {
        if (!reqSelected)
            return;
        if (!selectedTgId && !selectedUsername) {
            showErr("Нет tg_id/username");
            return;
        }
        const payload = {
            ...(selectedTgId ? { tg_id: selectedTgId } : {}),
            ...(selectedUsername ? { username: selectedUsername } : {}),
            fullName: reqFullName,
            banks: reqBanks,
        };
        const r = await apiAdminUpsertContact(token, payload);
        if (!r?.ok) {
            showErr(r?.error || "Ошибка");
            return;
        }
        const c = await apiAdminGetContacts(token);
        if (c?.ok)
            setContacts(Array.isArray(c.contacts) ? c.contacts : []);
        showOk("Сохранено ✅");
    }
    function toggleReqBank(name) {
        setReqBanks((prev) => {
            if (prev.includes(name))
                return prev.filter((x) => x !== name);
            return [...prev, name];
        });
    }
    const reqAgg = useMemo(() => {
        const m = {};
        for (const r of requests || []) {
            const id = r?.from?.id;
            if (!id)
                continue;
            const k = String(id);
            if (!m[k])
                m[k] = { cnt: 0, sell: {}, buy: {} };
            m[k].cnt += 1;
            const sc = String(r.sellCurrency || "");
            const sa = Number(r.sellAmount);
            if (sc && Number.isFinite(sa))
                m[k].sell[sc] = (m[k].sell[sc] || 0) + sa;
            const bc = String(r.buyCurrency || "");
            const ba = Number(r.buyAmount);
            if (bc && Number.isFinite(ba))
                m[k].buy[bc] = (m[k].buy[bc] || 0) + ba;
        }
        return m;
    }, [requests]);
    if (!token) {
        return (_jsxs("div", { className: "vx-page theme-owner", children: [_jsx("style", { children: `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@500;600;700;800&display=swap');` }), _jsx("div", { className: "container", children: _jsxs("div", { className: "card", children: [_jsx("div", { className: "h1", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435 \u0432\u043B\u0430\u0434\u0435\u043B\u044C\u0446\u0430" }), _jsx("div", { className: "vx-sp12" }), _jsx("input", { className: "input vx-in", value: draftKey, onChange: (e) => setDraftKey(e.target.value), placeholder: "ADMIN_WEB_KEY", type: "password" }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: onLogin, children: "\u0412\u043E\u0439\u0442\u0438" }), _jsxs("div", { className: "vx-installRow", children: [_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: installOwnerApp, disabled: installDone, children: installDone ? "Установлено" : "Установить на устройство" }), _jsx("span", { className: "vx-muted", children: installPrompt || installSupported ? "Откроется установка owner-страницы" : "Можно установить через меню браузера" })] })] }) })] }));
    }
    return (_jsxs("div", { className: "vx-page theme-owner", children: [_jsx("style", { children: `@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@500;600;700;800&display=swap');` }), _jsxs("div", { className: "container", children: [_jsx("div", { className: "card vx-topCard", style: { paddingLeft: 14, paddingRight: 14 }, children: _jsxs("div", { className: "row vx-between vx-center", style: { gap: 12 }, children: [_jsxs("div", { children: [_jsx("div", { className: "vx-title", children: "\u0423\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435" }), _jsx("div", { className: "vx-topSub", children: "/admin" })] }), _jsxs("div", { className: "vx-chatActionRow", children: [_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: installOwnerApp, disabled: installDone, children: installDone ? "Установлено" : "Установить" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: loadAll, children: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: logout, children: "\u0412\u044B\u0439\u0442\u0438" })] })] }) }), banner ? (_jsx("div", { className: banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk", children: banner.text })) : null, _jsxs("div", { className: "vx-adminSeg", style: { marginTop: 0 }, children: [_jsx("button", { className: tab === "rates" ? "on" : "", onClick: () => setTab("rates"), children: "\u041A\u0443\u0440\u0441" }), _jsx("button", { className: tab === "bonuses" ? "on" : "", onClick: () => setTab("bonuses"), children: "\u041D\u0430\u0434\u0431\u0430\u0432\u043A\u0438" }), _jsx("button", { className: tab === "reviews" ? "on" : "", onClick: () => setTab("reviews"), children: "\u041E\u0442\u0437\u044B\u0432\u044B" }), _jsx("button", { className: tab === "clients" ? "on" : "", onClick: () => setTab("clients"), children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }), _jsx("button", { className: tab === "requests" ? "on" : "", onClick: () => setTab("requests"), children: "\u0417\u0430\u044F\u0432\u043A\u0438" }), _jsx("button", { className: tab === "afisha" ? "on" : "", onClick: () => setTab("afisha"), children: "\u0410\u0444\u0438\u0448\u0430" }), _jsx("button", { className: tab === "faq" ? "on" : "", onClick: () => setTab("faq"), children: "FAQ" }), _jsx("button", { className: tab === "cashbox" ? "on" : "", onClick: () => setTab("cashbox"), children: "\u041A\u0430\u0441\u0441\u0430" }), _jsx("button", { className: tab === "reports" ? "on" : "", onClick: () => setTab("reports"), children: "\u041E\u0442\u0447\u0451\u0442\u044B" }), _jsx("button", { className: tab === "analytics" ? "on" : "", onClick: () => setTab("analytics"), children: "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430" })] }), _jsx("div", { className: "vx-mt10" }), tab === "rates" ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "card", children: _jsx(AdminTab, { me: me, forcedSection: "rates", hideHeader: true, hideSeg: true }) }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0424\u043E\u0440\u043C\u0443\u043B\u044B \u043A\u0440\u043E\u0441\u0441\u2011\u043A\u0443\u0440\u0441\u043E\u0432 (G)" }) }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: resetGFormulasToDefault, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C" })] }), _jsx("div", { className: "vx-sp6" }), _jsxs("div", { className: "small", style: { opacity: 0.85 }, children: ["\u042D\u0442\u0438 \u0444\u043E\u0440\u043C\u0443\u043B\u044B \u043F\u0440\u0438\u043C\u0435\u043D\u044F\u044E\u0442\u0441\u044F \u043A \u043F\u0430\u0440\u0430\u043C \u0431\u0435\u0437 VND. \u041A\u0443\u0440\u0441 \u0441\u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044F \u0442\u0430\u043A: ", _jsx("b", { children: "BUY = G \u00D7 buyMul" }), ", ", _jsx("b", { children: "SELL = G \u00D7 sellMul" }), "."] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rateRow", style: { opacity: 0.9 }, children: [_jsx("div", { className: "vx-code", children: "\u041F\u0430\u0440\u0430" }), _jsxs("div", { className: "vx-fields", children: [_jsx("div", { className: "vx-field", children: _jsx("div", { className: "small", children: _jsx("b", { children: "buyMul" }) }) }), _jsx("div", { className: "vx-field", children: _jsx("div", { className: "small", children: _jsx("b", { children: "sellMul" }) }) })] })] }), G_FORMULA_KEYS.map((k) => (_jsxs("div", { className: "vx-rateRow", children: [_jsx("div", { className: "vx-code", children: k }), _jsxs("div", { className: "vx-fields", children: [_jsx("div", { className: "vx-field", children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: gFormulasDraft[k]?.buyMul ?? "", onChange: (e) => setGFormulasDraft((prev) => ({
                                                                ...(prev || {}),
                                                                [k]: { ...(prev?.[k] || {}), buyMul: e.target.value }
                                                            })), placeholder: String(DEFAULT_G_FORMULAS[k]?.buyMul ?? "") }) }), _jsx("div", { className: "vx-field", children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: gFormulasDraft[k]?.sellMul ?? "", onChange: (e) => setGFormulasDraft((prev) => ({
                                                                ...(prev || {}),
                                                                [k]: { ...(prev?.[k] || {}), sellMul: e.target.value }
                                                            })), placeholder: String(DEFAULT_G_FORMULAS[k]?.sellMul ?? "") }) })] })] }, k))), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: saveGFormulas, disabled: gFormulasSaving, children: gFormulasSaving ? "Сохраняю…" : "Сохранить формулы" })] }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u041F\u0443\u0431\u043B\u0438\u043A\u0430\u0446\u0438\u044F \u0432 \u0433\u0440\u0443\u043F\u043F\u0443" }) }), _jsx("div", { className: "vx-sp10" }), _jsx("textarea", { className: "vx-revText", rows: 10, value: tpl, onChange: (e) => setTpl(e.target.value) }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { type: "file", accept: "image/*", onChange: (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f)
                                                        return;
                                                    const r = new FileReader();
                                                    r.onload = () => setImageDataUrl(String(r.result || "") || null);
                                                    r.readAsDataURL(f);
                                                } }), imageDataUrl ? (_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setImageDataUrl(null), children: "\u0423\u0431\u0440\u0430\u0442\u044C \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0443" })) : null, imageDataUrl ? (_jsx("img", { className: "vx-pubThumb", src: imageDataUrl, alt: "" })) : null] }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: publishNow, disabled: isPublishing, children: isPublishing ? "Публикую…" : "Опубликовать" })] }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0410\u0434\u043C\u0438\u043D\u044B (tg_id)" }) }), _jsx("div", { className: "vx-sp10" }), _jsx("input", { className: "input vx-in", value: adminsText, onChange: (e) => setAdminsText(e.target.value), placeholder: "11111111,22222222" }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: saveAdmins, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" })] }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0427\u0451\u0440\u043D\u044B\u0439 \u0441\u043F\u0438\u0441\u043E\u043A (username)" }) }), _jsx("div", { className: "vx-sp6" }), _jsxs("div", { className: "small", style: { opacity: 0.85 }, children: ["\u0411\u0435\u0437 @ \u2022 \u0447\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E/\u043F\u0440\u043E\u0431\u0435\u043B/\u043D\u043E\u0432\u0443\u044E \u0441\u0442\u0440\u043E\u043A\u0443. \u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F\u043C \u0438\u0437 \u0427\u0421 \u0431\u0443\u0434\u0435\u0442 \u043F\u043E\u043A\u0430\u0437\u0430\u043D\u0430 \u0442\u043E\u043B\u044C\u043A\u043E \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0430", _jsx("code", { style: { paddingLeft: 6 }, children: "/brand/blocked.png" }), "."] }), _jsx("div", { className: "vx-sp10" }), _jsx("textarea", { className: "vx-revText", rows: 4, value: blacklistText, onChange: (e) => setBlacklistText(e.target.value), placeholder: "baduser\\nspammer" }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: saveBlacklist, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" })] })] })) : null, tab === "bonuses" ? _jsx(AdminTab, { me: me, forcedSection: "bonuses", hideHeader: true, hideSeg: true }) : null, tab === "reviews" ? _jsx(AdminTab, { me: me, forcedSection: "reviews", hideHeader: true, hideSeg: true }) : null, tab === "clients" ? (_jsx(_Fragment, { children: _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u041A\u0430\u0440\u0442\u043E\u0447\u043A\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (username \u0438\u043B\u0438 tg_id)" }) }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: loadClients, disabled: clientsLoading, children: clientsLoading ? "Обновляю…" : "Обновить" })] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsx("input", { className: "input vx-in", value: cUsername, onChange: (e) => setCUsername(e.target.value), placeholder: "username (\u0431\u0435\u0437 @)", style: { flex: "1 1 220px" } }), _jsx("input", { className: "input vx-in", value: cTgId, onChange: (e) => setCTgId(e.target.value), placeholder: "tg_id (\u043E\u043F\u0446.)", style: { flex: "1 1 140px" } }), _jsx("select", { className: "input vx-in", value: cStatus, onChange: (e) => setCStatus(e.target.value), children: STATUS_OPTIONS.map((s) => (_jsx("option", { value: s.v, children: s.l }, s.v))) })] }), _jsx("div", { className: "vx-sp8" }), _jsx("input", { className: "input vx-in", value: cFullName, onChange: (e) => setCFullName(e.target.value), placeholder: "\u0418\u043C\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (\u043A\u0430\u043A \u043F\u043E\u0434\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0430\u0434\u043C\u0438\u043D)" }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: "\u0411\u0430\u043D\u043A\u0438" }), bankIcons.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0418\u043A\u043E\u043D\u043E\u043A \u043D\u0435\u0442 (\u0444\u0430\u0439\u043B\u044B \u0432 webapp/public/banks)." })) : (_jsx("div", { className: "vx-bankGrid", children: bankIcons.map((ic) => {
                                        const on = cBanks.includes(ic);
                                        return (_jsx("button", { type: "button", className: "vx-bankBtn " + (on ? "is-on" : ""), onClick: () => toggleBank(ic), title: ic, children: _jsx("img", { src: bankIconUrl(ic), alt: "", className: "vx-bankImg", onError: (e) => { const p = e.currentTarget.parentElement; if (p)
                                                    p.style.display = "none"; } }) }, ic));
                                    }) })), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: upsertContact, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C" }), _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041A\u043B\u0438\u0435\u043D\u0442\u044B" }) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043D\u0430 \u043A\u043B\u0438\u0435\u043D\u0442\u0430, \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0435\u0433\u043E \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0443 \u0434\u043B\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F \u0438\u043C\u0435\u043D\u0438, \u0441\u0442\u0430\u0442\u0443\u0441\u0430 \u0438 \u0431\u0430\u043D\u043A\u043E\u0432." }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("input", { className: "input vx-in", value: clientSearch, onChange: (e) => setClientSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A: username, tg_id, \u0438\u043C\u044F, \u0441\u0442\u0430\u0442\u0443\u0441, \u0431\u0430\u043D\u043A", style: { flex: "1 1 280px" } }), clientSearch ? (_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setClientSearch(""), children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C" })) : null, _jsxs("div", { className: "vx-muted", children: ["\u041D\u0430\u0439\u0434\u0435\u043D\u043E: ", _jsx("b", { children: filteredClientRows.length })] })] }), _jsx("div", { className: "vx-sp10" }), manualClientRows.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u043E\u0432. \u041C\u043E\u0436\u043D\u043E \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E \u043F\u043E username \u0438\u043B\u0438 tg_id \u2014 \u043E\u043D \u0441\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u0441\u044F \u0434\u0430\u0436\u0435 \u0431\u0435\u0437 \u0441\u0434\u0435\u043B\u043E\u043A." })) : filteredClientRows.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u041F\u043E \u0432\u0430\u0448\u0435\u043C\u0443 \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B." })) : (_jsx("div", { className: "vx-contactList", children: filteredClientRows.map((row) => {
                                        const u = row.kind === "user" ? row.u : null;
                                        const c = row.c;
                                        const tgId = row.tgId;
                                        const uname = (u?.username || c?.username) ? String(u?.username || c?.username).toLowerCase() : "";
                                        const agg = tgId ? (reqAgg[String(tgId)] || { cnt: 0, sell: {}, buy: {} }) : { cnt: 0, sell: {}, buy: {} };
                                        const isNew = agg.cnt === 1;
                                        const userTitle = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
                                        const who = uname ? "@" + uname : (c?.fullName || userTitle || (tgId ? `id ${tgId}` : "Клиент без Telegram ID"));
                                        const adminName = c?.fullName ? c.fullName : "—";
                                        const banks = Array.isArray(c?.banks) ? c.banks : [];
                                        const sumSellText = (() => {
                                            const sell = agg.sell || {};
                                            const items = Object.entries(sell)
                                                .filter(([, v]) => Number(v) > 0)
                                                .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
                                            return items.length ? items.map(([k, v]) => `${k}: ${fmtNum(v)}`).join(' • ') : '—';
                                        })();
                                        const sumBuyText = (() => {
                                            const buy = agg.buy || {};
                                            const items = Object.entries(buy)
                                                .filter(([, v]) => Number(v) > 0)
                                                .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
                                            return items.length ? items.map(([k, v]) => `${k}: ${fmtNum(v)}`).join(' • ') : '—';
                                        })();
                                        const isEditing = (tgId && String(cTgId || "") === String(tgId)) || (!tgId && uname && String(cUsername || "").toLowerCase() === uname);
                                        const clickHandler = row.kind === "user"
                                            ? () => openClientEditor(u, c, Number(tgId))
                                            : () => openContactOnlyEditor(c);
                                        return (_jsxs("div", { className: "vx-contactRow is-clickable" + (isEditing ? " vx-cardSel" : ""), onClick: clickHandler, children: [_jsxs("div", { className: "row vx-between vx-center", style: { gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsxs("div", { children: [_jsx("b", { children: who }), tgId ? _jsxs("span", { className: "vx-muted", children: [" \u2022 id:", tgId] }) : null, isNew ? _jsx("span", { className: "vx-tag vx-tagNew", children: "\u041D\u043E\u0432\u044B\u0439" }) : null] }), _jsxs("div", { className: "vx-muted", style: { marginTop: 2 }, children: ["\u0418\u043C\u044F (\u0430\u0434\u043C\u0438\u043D): ", _jsx("b", { children: adminName })] }), row.kind !== "user" ? (_jsx("div", { className: "vx-muted", style: { marginTop: 2 }, children: "\u0415\u0449\u0451 \u043D\u0435 \u0437\u0430\u0445\u043E\u0434\u0438\u043B \u0432 \u043C\u0438\u043D\u0438\u2011\u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435" })) : null, banks.length ? (_jsx("div", { className: "vx-bankInline", style: { marginTop: 6 }, children: banks.slice(0, 6).map((ic) => (_jsx("img", { src: bankIconUrl(ic), alt: "", className: "vx-bankInlineImg", title: ic, onError: (e) => { e.currentTarget.style.display = "none"; } }, ic))) })) : null] }), _jsxs("div", { style: { textAlign: "right", maxWidth: 420 }, children: [_jsx("div", { className: "vx-muted", children: "\u041E\u0442\u0434\u0430\u043B" }), _jsx("div", { children: _jsx("b", { children: sumSellText }) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u041F\u043E\u043B\u0443\u0447\u0438\u043B" }), _jsx("div", { children: _jsx("b", { children: sumBuyText }) }), _jsxs("div", { className: "vx-muted", style: { marginTop: 6 }, children: ["\u0421\u0434\u0435\u043B\u043E\u043A: ", _jsx("b", { children: fmtNum(agg.cnt) })] })] })] }), _jsx("div", { className: "vx-sp8" }), _jsxs("div", { className: "row vx-rowWrap vx-gap6", style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: [_jsxs("span", { className: "vx-tag", children: ["\u0421\u0442\u0430\u0442\u0443\u0441: ", _jsx("b", { children: statusLabelRu(c?.status || u?.status || "standard") })] }), _jsx("span", { className: "vx-tag", children: "\u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u0434\u043B\u044F \u0440\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F" })] })] }, String(c?.id || tgId || uname)));
                                    }) }))] }) })) : null, tab === "requests" ? (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "h3 vx-m0", children: "\u0417\u0430\u044F\u0432\u043A\u0438" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: loadClients, disabled: clientsLoading, children: clientsLoading ? "Обновляю…" : "Обновить" })] }), _jsx("div", { className: "vx-sp10" }), reqView !== "detail" ? (_jsxs("div", { className: "row vx-rowWrap vx-gap6", children: [_jsxs("button", { className: "btn vx-btnSm " + (reqView === "active" ? "vx-btnOn" : ""), onClick: () => setReqView("active"), children: ["\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435 (", reqActive.length, ")"] }), _jsxs("button", { className: "btn vx-btnSm " + (reqView === "rejected" ? "vx-btnOn" : ""), onClick: () => setReqView("rejected"), children: ["\u041E\u0442\u043A\u043B\u043E\u043D\u0451\u043D\u043D\u044B\u0435 (", reqRejected.length, ")"] }), _jsxs("button", { className: "btn vx-btnSm " + (reqView === "history" ? "vx-btnOn" : ""), onClick: () => setReqView("history"), children: ["\u0418\u0441\u0442\u043E\u0440\u0438\u044F (", reqHistoryAll.length, ")"] })] })) : null, _jsx("div", { className: "vx-sp10" }), reqView === "active" ? (reqActive.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u043D\u0435\u0442." })) : (_jsx("div", { className: "vx-reqList", children: reqActive.slice(0, 60).map((r) => {
                                    const whoText = who(r);
                                    const sid = reqShortId(r.id);
                                    const st = String(r?.state) === "new" ? "in_progress" : String(r?.state);
                                    return (_jsxs("button", { type: "button", className: "vx-reqRow", onClick: () => openReqDetails(String(r.id)), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsxs("b", { children: ["#", sid] }), _jsx("span", { className: "vx-muted", children: fmtDt(r.created_at) })] }), _jsx("div", { className: "vx-muted", children: whoText }), _jsxs("div", { children: [_jsxs("span", { className: "vx-tag", children: [r.sellCurrency, "\u2192", r.buyCurrency] }), _jsx("span", { className: "vx-tag", children: stateRu(st) })] })] }, r.id));
                                }) }))) : null, reqView === "rejected" ? (reqRejected.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u041E\u0442\u043A\u043B\u043E\u043D\u0451\u043D\u043D\u044B\u0445 \u0437\u0430\u044F\u0432\u043E\u043A \u043D\u0435\u0442." })) : (_jsx("div", { className: "vx-reqList", children: reqRejected.slice(0, 120).map((r) => {
                                    const whoText = who(r);
                                    const sid = reqShortId(r.id);
                                    return (_jsxs("button", { type: "button", className: "vx-reqRow", onClick: () => openReqDetails(String(r.id)), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsxs("b", { children: ["#", sid] }), _jsx("span", { className: "vx-muted", children: fmtDt(r.created_at) })] }), _jsx("div", { className: "vx-muted", children: whoText }), _jsxs("div", { children: [_jsxs("span", { className: "vx-tag", children: [r.sellCurrency, "\u2192", r.buyCurrency] }), _jsx("span", { className: "vx-tag", children: stateRu(r.state) })] })] }, r.id));
                                }) }))) : null, reqView === "history" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u0421" }), _jsx("input", { className: "input vx-in", type: "date", value: reqHistFrom, onChange: (e) => setReqHistFrom(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E" }), _jsx("input", { className: "input vx-in", type: "date", value: reqHistTo, onChange: (e) => setReqHistTo(e.target.value) })] })] }), _jsx("div", { className: "vx-sp10" }), reqHistory.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0412 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0435 \u043D\u0435\u0442 \u0437\u0430\u044F\u0432\u043E\u043A." })) : (_jsx("div", { className: "vx-reqList", children: reqHistory.slice(0, 200).map((r) => {
                                            const whoText = who(r);
                                            const sid = reqShortId(r.id);
                                            return (_jsxs("button", { type: "button", className: "vx-reqRow", onClick: () => openReqDetails(String(r.id)), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsxs("b", { children: ["#", sid] }), _jsx("span", { className: "vx-muted", children: fmtDt(r.created_at) })] }), _jsx("div", { className: "vx-muted", children: whoText }), _jsxs("div", { children: [_jsxs("span", { className: "vx-tag", children: [r.sellCurrency, "\u2192", r.buyCurrency] }), _jsx("span", { className: "vx-tag", children: stateRu(r.state) })] })] }, r.id));
                                        }) }))] })) : null, reqView === "detail" ? (!reqSelected ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setReqView("active"), children: "\u2190 \u041D\u0430\u0437\u0430\u0434" }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0417\u0430\u044F\u0432\u043A\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u0430." })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setReqView("active"), children: "\u2190 \u041D\u0430\u0437\u0430\u0434" }), _jsx("div", { className: "vx-muted", children: fmtDt(reqSelected.created_at) })] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "h3 vx-m0", children: ["\u0417\u0430\u044F\u0432\u043A\u0430 #", reqShortId(reqSelected.id)] }), _jsxs("div", { className: "vx-muted", style: { marginTop: 4 }, children: ["\u041A\u043B\u0438\u0435\u043D\u0442: ", selectedUsername ? "@" + selectedUsername : "", " ", selectedTgId ? "• id:" + selectedTgId : ""] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { style: { display: "grid", gap: 6 }, children: [_jsxs("div", { children: ["\uD83D\uDD01 ", _jsxs("b", { children: [reqSelected.sellCurrency, " \u2192 ", reqSelected.buyCurrency] })] }), _jsxs("div", { children: ["\uD83D\uDCB8 \u041E\u0442\u0434\u0430\u0451\u0442: ", _jsx("b", { children: reqSelected.sellAmount })] }), _jsxs("div", { children: ["\uD83C\uDFAF \u041F\u043E\u043B\u0443\u0447\u0438\u0442: ", _jsx("b", { children: reqSelected.buyAmount })] }), _jsxs("div", { children: ["\uD83D\uDCB3 \u041E\u043F\u043B\u0430\u0442\u0430: ", _jsx("b", { children: methodRu(reqSelected.payMethod) })] }), _jsxs("div", { children: ["\uD83D\uDCE6 \u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435: ", _jsx("b", { children: methodRu(reqSelected.receiveMethod) })] }), reqSelected.comment ? _jsxs("div", { children: ["\uD83D\uDCDD \u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439: ", _jsx("b", { children: reqSelected.comment })] }) : null, reqSelected.clientContact ? _jsxs("div", { children: ["\u260E\uFE0F \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ", _jsx("b", { children: reqSelected.clientContact })] }) : null] }), _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u0421\u0442\u0430\u0442\u0443\u0441" }), _jsx("div", { className: "vx-sp8" }), _jsxs("div", { className: "row vx-rowWrap vx-gap6", children: [_jsx("button", { className: "btn vx-btnSm " + ((String(reqSelected.state) === "new" || String(reqSelected.state) === "in_progress") ? "vx-btnOn" : ""), onClick: () => setReqState("in_progress"), children: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435" }), _jsx("button", { className: "btn vx-btnSm " + (String(reqSelected.state) === "done" ? "vx-btnOn" : ""), onClick: () => setReqState("done"), children: "\u0413\u043E\u0442\u043E\u0432\u043E" }), _jsx("button", { className: "btn vx-btnSm " + (String(reqSelected.state) === "canceled" ? "vx-btnOn" : ""), onClick: () => setReqState("canceled"), children: "\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430" })] }), _jsx("div", { className: "hr" }), _jsx("div", { className: "small", children: "\u041A\u043E\u043D\u0442\u0430\u043A\u0442 \u043A\u043B\u0438\u0435\u043D\u0442\u0430" }), _jsx("div", { className: "vx-sp8" }), _jsx("input", { className: "input vx-in", value: reqFullName, onChange: (e) => setReqFullName(e.target.value), placeholder: "\u0418\u043C\u044F \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (\u043A\u0430\u043A \u043F\u043E\u0434\u043F\u0438\u0441\u044B\u0432\u0430\u0435\u0442 \u0430\u0434\u043C\u0438\u043D)" }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: "\u0411\u0430\u043D\u043A\u0438" }), bankIcons.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0418\u043A\u043E\u043D\u043E\u043A \u043D\u0435\u0442 (\u0444\u0430\u0439\u043B\u044B \u0432 webapp/public/banks)." })) : (_jsx("div", { className: "vx-bankGrid", children: bankIcons.map((ic) => {
                                            const on = reqBanks.includes(ic);
                                            return (_jsx("button", { type: "button", className: "vx-bankBtn " + (on ? "is-on" : ""), onClick: () => toggleReqBank(ic), title: ic, children: _jsx("img", { src: bankIconUrl(ic), alt: "", className: "vx-bankImg", onError: (e) => { const p = e.currentTarget.parentElement; if (p)
                                                        p.style.display = "none"; } }) }, ic));
                                        }) })), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: saveReqContact, children: "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u043A\u043E\u043D\u0442\u0430\u043A\u0442" })] }))) : null] })) : null, tab === "afisha" ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "h3 vx-m0", children: "\u0410\u0444\u0438\u0448\u0430" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: loadAfishaLists, disabled: afLoading, children: afLoading ? "Обновляю…" : "Обновить" })] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041D\u043E\u0432\u043E\u0435 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435" }) }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("div", { style: { flex: "1 1 260px", display: "flex", gap: 8, flexWrap: "wrap" }, children: AF_CATS.map((c) => {
                                                    const on = afCreateCats.includes(c.k);
                                                    const disabled = !on && afCreateCats.length >= 3;
                                                    return (_jsx("button", { type: "button", className: "btn vx-btnSm " + (on ? "vx-btnOn" : ""), disabled: disabled, onClick: () => {
                                                            setAfCreateCats((prev) => {
                                                                const has = prev.includes(c.k);
                                                                if (has)
                                                                    return prev.length <= 1 ? prev : prev.filter((x) => x !== c.k);
                                                                if (prev.length >= 3)
                                                                    return prev;
                                                                return [...prev, c.k];
                                                            });
                                                        }, title: disabled ? "Максимум 3 категории" : "", children: c.l }, c.k));
                                                }) }), _jsx("input", { className: "input vx-in", type: "date", value: afCreateDate, onChange: (e) => setAfCreateDate(e.target.value), style: { flex: "0 0 170px" } }), _jsx("input", { className: "input vx-in", type: "time", value: afCreateTime, onChange: (e) => setAfCreateTime(e.target.value), style: { flex: "0 0 130px" } })] }), _jsx("div", { className: "vx-muted", style: { marginTop: 6 }, children: "\u041C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u043E 3 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0439" }), _jsx("div", { className: "vx-sp8" }), _jsx("input", { className: "input vx-in", value: afCreateTitle, onChange: (e) => setAfCreateTitle(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F" }), _jsx("div", { className: "vx-sp8" }), _jsx("textarea", { className: "input vx-in", value: afCreateComment, onChange: (e) => setAfCreateComment(e.target.value), placeholder: "\u041A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0439 (\u043F\u043E\u043A\u0430\u0436\u0435\u0442\u0441\u044F \u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 \u043F\u043E\u0434 \u043D\u0430\u0437\u0432\u0430\u043D\u0438\u0435\u043C)", rows: 3, style: { resize: 'vertical' } }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0424\u043E\u0442\u043E \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u044F (\u0431\u0443\u0434\u0435\u0442 \u0444\u043E\u043D\u043E\u043C \u043A\u0430\u0440\u0442\u043E\u0447\u043A\u0438 \u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u0430)" }), _jsx("div", { className: "vx-sp6" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, children: [_jsx("input", { type: "file", accept: "image/*", onChange: (e) => {
                                                    const f = e.target.files?.[0];
                                                    if (!f)
                                                        return;
                                                    const r = new FileReader();
                                                    r.onload = () => setAfCreateImageDataUrl(String(r.result || "") || null);
                                                    r.readAsDataURL(f);
                                                } }), afCreateImageDataUrl ? (_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setAfCreateImageDataUrl(null), children: "\u0423\u0431\u0440\u0430\u0442\u044C \u0444\u043E\u0442\u043E" })) : null, afCreateImageDataUrl ? _jsx("img", { className: "vx-pubThumb", src: afCreateImageDataUrl, alt: "" }) : null] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u043A\u043D\u043E\u043F\u043A\u0438 \u00AB\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435\u00BB (\u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0430/\u043F\u043E\u0441\u0442 \u043E \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0438)" }), _jsx("div", { className: "vx-sp6" }), _jsx("input", { className: "input vx-in", value: afCreateDetailsUrl, onChange: (e) => setAfCreateDetailsUrl(e.target.value), placeholder: "https://..." }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u0421\u0441\u044B\u043B\u043A\u0430 \u0434\u043B\u044F \u043A\u043D\u043E\u043F\u043A\u0438 \u00AB\u041B\u043E\u043A\u0430\u0446\u0438\u044F\u00BB (Google Maps / 2GIS / etc.)" }), _jsx("div", { className: "vx-sp6" }), _jsx("input", { className: "input vx-in", value: afCreateLocationUrl, onChange: (e) => setAfCreateLocationUrl(e.target.value), placeholder: "https://..." }), _jsx("div", { className: "vx-sp10" }), _jsx("button", { className: "btn", type: "button", onClick: createAfisha, children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0435" }) }), _jsx("div", { className: "vx-muted", children: afActive.length })] }), _jsx("div", { className: "vx-sp10" }), afActive.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0410\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0439 \u043D\u0435\u0442." })) : (_jsx("div", { className: "vx-reqList", children: afActive.map((ev) => {
                                            const clicks = ev?.clicks || { details: 0, location: 0 };
                                            const total = Number(clicks.details || 0) + Number(clicks.location || 0);
                                            const isOn = afEditId === String(ev.id);
                                            return (_jsxs("div", { children: [_jsxs("button", { type: "button", className: "vx-reqRow " + (isOn ? "is-active" : ""), onClick: () => toggleEditAfisha(ev), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsx("b", { children: fmtAfDateTime(ev) }), _jsx("span", { className: "vx-muted", children: afCatsLabel(ev) })] }), _jsx("div", { children: _jsx("b", { children: String(ev.title || "") }) }), _jsxs("div", { className: "vx-muted", children: ["\u041A\u043B\u0438\u043A\u0438: ", total, " (\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435 ", Number(clicks.details || 0), ", \u041B\u043E\u043A\u0430\u0446\u0438\u044F ", Number(clicks.location || 0), ")"] })] }), isOn ? (_jsx("div", { className: "vx-reqExpand", children: renderAfishaEditForm() })) : null] }, ev.id));
                                        }) }))] }), _jsx("div", { className: "vx-sp12" }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", style: { gap: 10 }, children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0418\u0441\u0442\u043E\u0440\u0438\u044F" }) }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: loadAfishaLists, disabled: afLoading, children: afLoading ? "…" : "Обновить" })] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u0421" }), _jsx("input", { className: "input vx-in", type: "date", value: afHistFrom, onChange: (e) => setAfHistFrom(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E" }), _jsx("input", { className: "input vx-in", type: "date", value: afHistTo, onChange: (e) => setAfHistTo(e.target.value) })] })] }), _jsx("div", { className: "vx-sp10" }), afHistory.length === 0 ? (_jsx("div", { className: "vx-muted", children: "\u0412 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u043E\u043C \u0434\u0438\u0430\u043F\u0430\u0437\u043E\u043D\u0435 \u043D\u0435\u0442 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0439." })) : (_jsx("div", { className: "vx-reqList", children: afHistory.map((ev) => {
                                            const clicks = ev?.clicks || { details: 0, location: 0 };
                                            const total = Number(clicks.details || 0) + Number(clicks.location || 0);
                                            const isOn = afEditId === String(ev.id);
                                            return (_jsxs("div", { children: [_jsxs("button", { type: "button", className: "vx-reqRow " + (isOn ? "is-active" : ""), onClick: () => toggleEditAfisha(ev), children: [_jsxs("div", { className: "vx-reqTop", children: [_jsx("b", { children: fmtAfDateTime(ev) }), _jsx("span", { className: "vx-muted", children: afCatsLabel(ev) })] }), _jsx("div", { children: _jsx("b", { children: String(ev.title || "") }) }), _jsxs("div", { className: "vx-muted", children: ["\u041A\u043B\u0438\u043A\u0438: ", total, " (\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435 ", Number(clicks.details || 0), ", \u041B\u043E\u043A\u0430\u0446\u0438\u044F ", Number(clicks.location || 0), ")"] })] }), isOn ? (_jsx("div", { className: "vx-reqExpand", children: renderAfishaEditForm() })) : null] }, ev.id));
                                        }) }))] })] })) : null, tab === "faq" ? (_jsxs("div", { className: "card", children: [_jsxs("div", { className: "row vx-between vx-center", style: { gap: 10, flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsx("div", { className: "h2", children: "FAQ" }), _jsx("div", { className: "small", style: { opacity: 0.85 }, children: "\u041A\u043B\u0438\u0435\u043D\u0442 \u0432\u0438\u0434\u0438\u0442 \u044D\u0442\u0438 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 \u00AB\u041F\u0440\u043E\u0447\u0435\u0435 \u2192 FAQ\u00BB." })] }), _jsxs("div", { className: "row", style: { gap: 8, flexWrap: "wrap" }, children: [_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: addFaqItem, children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" }), _jsx("button", { className: "btn", type: "button", onClick: saveFaq, disabled: faqSaving, children: faqSaving ? "Сохранение…" : "Сохранить" })] })] }), _jsx("div", { className: "vx-sp12" }), faqLoading ? _jsx("div", { className: "small", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) : null, (!faqItems || faqItems.length === 0) && !faqLoading ? (_jsx("div", { className: "small", style: { opacity: 0.8 }, children: "\u041F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442\u043E. \u041D\u0430\u0436\u043C\u0438 \u00AB\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C\u00BB." })) : null, (faqItems || []).map((it, i) => (_jsxs("div", { className: "vx-faqRow", children: [_jsxs("div", { className: "row vx-between vx-center", style: { gap: 10 }, children: [_jsxs("div", { className: "small", style: { fontWeight: 900 }, children: ["\u0412\u043E\u043F\u0440\u043E\u0441 #", i + 1] }), _jsxs("div", { className: "row", style: { gap: 6 }, children: [_jsx("button", { className: "btn vx-btnXs", type: "button", onClick: () => moveFaq(it.id, -1), disabled: i === 0, children: "\u2191" }), _jsx("button", { className: "btn vx-btnXs", type: "button", onClick: () => moveFaq(it.id, 1), disabled: i === faqItems.length - 1, children: "\u2193" }), _jsx("button", { className: "btn vx-btnXs", type: "button", onClick: () => setFaqItems((prev) => (prev || []).filter((x) => x.id !== it.id)), children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] })] }), _jsx("div", { className: "vx-sp6" }), _jsx("input", { className: "input vx-in", value: it.q, onChange: (e) => setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, q: e.target.value } : x))), placeholder: "\u0412\u043E\u043F\u0440\u043E\u0441\u2026" }), _jsx("div", { className: "vx-sp6" }), _jsx("textarea", { className: "input vx-in", value: it.a, onChange: (e) => setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, a: e.target.value } : x))), placeholder: "\u041E\u0442\u0432\u0435\u0442\u2026", rows: 3 }), _jsx("div", { className: "vx-sp12" })] }, it.id)))] })) : null, tab === "cashbox" ? (_jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u041A\u0430\u043B\u044C\u043A\u0443\u043B\u044F\u0442\u043E\u0440 \u043F\u0440\u0438\u0431\u044B\u043B\u0438 (\u041A\u0410\u0421\u0421\u0410)" }) }), _jsxs("div", { className: "vx-muted", style: { marginTop: 6 }, children: ["\u041B\u043E\u0433\u0438\u043A\u0430 \u043A\u0430\u043A \u0432 \u0442\u0432\u043E\u0435\u0439 \u0442\u0430\u0431\u043B\u0438\u0446\u0435: ", _jsx("b", { children: "\u041A\u0410\u0421\u0421\u0410 = (\u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u043A\u043B\u0438\u0435\u043D\u0442 \u043E\u0442\u0434\u0430\u043B) \u2212 (\u0446\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u0442\u043E\u0433\u043E, \u0447\u0442\u043E \u043A\u043B\u0438\u0435\u043D\u0442 \u043F\u043E\u043B\u0443\u0447\u0438\u043B)" }), ", \u0432 VND. \u0414\u043B\u044F \u043E\u0446\u0435\u043D\u043A\u0438 \u0438\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0435\u043C \u043A\u0443\u0440\u0441\u044B ", _jsx("b", { children: "sell_vnd" }), " (\u0432\u0445\u043E\u0434) \u0438 ", _jsx("b", { children: "buy_vnd" }), " (\u0432\u044B\u0445\u043E\u0434).", _jsx("b", { children: "\u0413\u043B\u0430\u0432\u043D\u043E\u0435:" }), " \u0442\u044B \u043C\u043E\u0436\u0435\u0448\u044C \u043F\u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0440\u0430\u0437\u043D\u044B\u0435 \u0446\u0435\u043D\u044B ", _jsx("b", { children: "\u043F\u043E \u0434\u043D\u044F\u043C" }), " (\u043A\u0430\u043A \u0432 Excel) \u0438/\u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u0430\u0432\u0438\u0442\u044C \u043A\u0443\u0440\u0441 ", _jsx("b", { children: "\u043F\u043E \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u043E\u0439 \u0441\u0434\u0435\u043B\u043A\u0435" }), "."] }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u0421" }), _jsx("input", { className: "input vx-in", type: "date", value: cashFrom, onChange: (e) => setCashFrom(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E" }), _jsx("input", { className: "input vx-in", type: "date", value: cashTo, onChange: (e) => setCashTo(e.target.value) })] })] }), _jsxs("label", { className: "vx-checkRow", children: [_jsx("input", { type: "checkbox", checked: cashOnlyDone, onChange: (e) => setCashOnlyDone(e.target.checked) }), _jsx("span", { children: "\u0422\u043E\u043B\u044C\u043A\u043E \u00AB\u0413\u043E\u0442\u043E\u0432\u043E\u00BB" })] }), _jsxs("label", { className: "vx-checkRow", children: [_jsx("input", { type: "checkbox", checked: cashUseHistoryRates, onChange: (e) => setCashUseHistoryRates(e.target.checked) }), _jsx("span", { children: "\u041F\u043E\u0434\u0441\u0442\u0430\u0432\u043B\u044F\u0442\u044C \u043A\u0443\u0440\u0441\u044B \u043F\u043E \u0434\u0430\u0442\u0430\u043C (\u0438\u0437 \u0432\u043A\u043B\u0430\u0434\u043A\u0438 \u00AB\u041A\u0443\u0440\u0441\u00BB)" })] }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }, children: [_jsx("button", { className: "btn", type: "button", onClick: loadCashbox, disabled: cashLoading, children: cashLoading ? "Загрузка..." : "Пересчитать" }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => {
                                            setCashOverrides({});
                                            showOk("Сброшены ручные курсы по сделкам");
                                        }, children: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0440\u0443\u0447\u043D\u044B\u0435 (\u0441\u0434\u0435\u043B\u043A\u0438)" })] }), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041A\u0443\u0440\u0441\u044B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E (VND \u0437\u0430 1 \u0435\u0434\u0438\u043D\u0438\u0446\u0443)" }) }), _jsxs("div", { className: "vx-muted", style: { marginTop: 6 }, children: [_jsx("b", { children: "buy_vnd" }), " \u2014 \u043F\u043E \u044D\u0442\u043E\u043C\u0443 \u043A\u0443\u0440\u0441\u0443 \u043C\u044B ", _jsx("u", { children: "\u043F\u043E\u043A\u0443\u043F\u0430\u0435\u043C" }), " \u0432\u0430\u043B\u044E\u0442\u0443 \u0443 \u043A\u043B\u0438\u0435\u043D\u0442\u0430 (\u044D\u0442\u043E \u0441\u0435\u0431\u0435\u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C). ", _jsx("b", { children: "sell_vnd" }), " \u2014 \u043F\u043E \u044D\u0442\u043E\u043C\u0443 \u043A\u0443\u0440\u0441\u0443 \u043C\u044B ", _jsx("u", { children: "\u043F\u0440\u043E\u0434\u0430\u0451\u043C" }), " \u0432\u0430\u043B\u044E\u0442\u0443."] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-tableWrap", children: _jsxs("table", { className: "vx-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0412\u0430\u043B\u044E\u0442\u0430" }), _jsx("th", { children: "buy_vnd" }), _jsx("th", { children: "sell_vnd" })] }) }), _jsx("tbody", { children: ["RUB", "USD", "USDT", "EUR", "THB"].map((cur) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: cur }) }), _jsx("td", { children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: cashDefaultRates?.[cur]?.buy ?? "", onChange: (e) => setCashDefaultRates((prev) => ({
                                                                ...(prev || {}),
                                                                [cur]: { buy: e.target.value, sell: prev?.[cur]?.sell ?? "" },
                                                            })), placeholder: "0" }) }), _jsx("td", { children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: cashDefaultRates?.[cur]?.sell ?? "", onChange: (e) => setCashDefaultRates((prev) => ({
                                                                ...(prev || {}),
                                                                [cur]: { buy: prev?.[cur]?.buy ?? "", sell: e.target.value },
                                                            })), placeholder: "0" }) })] }, cur))) })] }) }), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041F\u043E \u0434\u043D\u044F\u043C: \u043E\u0431\u044A\u0451\u043C \u0438 \u043A\u0443\u0440\u0441\u044B" }) }), _jsxs("div", { className: "vx-muted", style: { marginTop: 6 }, children: ["\u0417\u0434\u0435\u0441\u044C \u043C\u043E\u0436\u043D\u043E \u0432\u044B\u0431\u0440\u0430\u0442\u044C \u0434\u0435\u043D\u044C \u0438 \u0443\u043A\u0430\u0437\u0430\u0442\u044C, ", _jsx("b", { children: "\u043F\u043E \u043A\u0430\u043A\u043E\u0439 \u0446\u0435\u043D\u0435" }), " \u0442\u044B \u043F\u043E\u043A\u0443\u043F\u0430\u043B/\u043F\u0440\u043E\u0434\u0430\u0432\u0430\u043B \u0432\u0430\u043B\u044E\u0442\u0443. \u042D\u0442\u0438 \u043A\u0443\u0440\u0441\u044B \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u043F\u043E\u0434\u0441\u0442\u0430\u0432\u044F\u0442\u0441\u044F \u0432\u043E \u0432\u0441\u0435 \u0441\u0434\u0435\u043B\u043A\u0438 \u044D\u0442\u043E\u0433\u043E \u0434\u043D\u044F."] }), cashByDay.length ? (_jsx("div", { style: { marginTop: 10 }, children: cashByDay.slice(0, 31).map((d) => {
                                    const day = String(d.date || "");
                                    const draft = cashDayDraft?.[day] || {};
                                    const saving = !!cashDaySaving?.[day];
                                    const sellEntries = Object.entries(d.sell || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
                                    const buyEntries = Object.entries(d.buy || {}).sort((a, b) => Number(b[1]) - Number(a[1]));
                                    return (_jsxs("div", { className: "vx-metricCard", style: { marginBottom: 10 }, children: [_jsxs("div", { className: "row vx-between vx-center", style: { gap: 10 }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontWeight: 950 }, children: day }), _jsxs("div", { className: "vx-muted", style: { marginTop: 2 }, children: ["\u0421\u0434\u0435\u043B\u043E\u043A: ", _jsx("b", { children: fmtNum(d.cnt) }), " \u00B7 \u041F\u0440\u0438\u0431\u044B\u043B\u044C: ", _jsx("b", { children: fmtNum(d.profit) }), " VND"] })] }), _jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => saveCashDayRates(day), disabled: saving, children: saving ? "Сохраняю…" : "Сохранить курс" })] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u041E\u0442\u0434\u0430\u043B:" }), _jsx("div", { className: "vx-chipRow", children: sellEntries.length ? (sellEntries.slice(0, 12).map(([k, v]) => (_jsxs("span", { className: "vx-chip", children: [k, ": ", _jsx("b", { children: fmtNum(v) })] }, k)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043B\u0443\u0447\u0438\u043B:" }), _jsx("div", { className: "vx-chipRow", children: buyEntries.length ? (buyEntries.slice(0, 12).map(([k, v]) => (_jsxs("span", { className: "vx-chip", children: [k, ": ", _jsx("b", { children: fmtNum(v) })] }, k)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "vx-tableWrap", children: _jsxs("table", { className: "vx-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0412\u0430\u043B\u044E\u0442\u0430" }), _jsx("th", { children: "buy_vnd" }), _jsx("th", { children: "sell_vnd" })] }) }), _jsx("tbody", { children: ["RUB", "USD", "USDT", "EUR", "THB"].map((cur) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("b", { children: cur }) }), _jsx("td", { children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(draft?.[cur]?.buy ?? ""), onChange: (e) => {
                                                                                const v = e.target.value;
                                                                                setCashDayDraft((prev) => {
                                                                                    const next = { ...(prev || {}) };
                                                                                    const dayObj = { ...(next[day] || {}) };
                                                                                    const curObj = { ...(dayObj[cur] || {}) };
                                                                                    curObj.buy = v;
                                                                                    dayObj[cur] = curObj;
                                                                                    next[day] = dayObj;
                                                                                    return next;
                                                                                });
                                                                            }, placeholder: String(cashDefaultRates?.[cur]?.buy || "0") }) }), _jsx("td", { children: _jsx("input", { className: "input vx-in", inputMode: "decimal", value: String(draft?.[cur]?.sell ?? ""), onChange: (e) => {
                                                                                const v = e.target.value;
                                                                                setCashDayDraft((prev) => {
                                                                                    const next = { ...(prev || {}) };
                                                                                    const dayObj = { ...(next[day] || {}) };
                                                                                    const curObj = { ...(dayObj[cur] || {}) };
                                                                                    curObj.sell = v;
                                                                                    dayObj[cur] = curObj;
                                                                                    next[day] = dayObj;
                                                                                    return next;
                                                                                });
                                                                            }, placeholder: String(cashDefaultRates?.[cur]?.sell || "0") }) })] }, cur))) })] }) })] }, day));
                                }) })) : (_jsx("div", { className: "vx-muted", style: { marginTop: 10 }, children: "\u041D\u0435\u0442 \u0441\u0434\u0435\u043B\u043E\u043A \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434." })), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u0418\u0442\u043E\u0433\u0438" }) }), _jsxs("div", { className: "vx-metricGrid", children: [_jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0421\u0434\u0435\u043B\u043E\u043A" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(cashComputed.total) })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041F\u0440\u0438\u0431\u044B\u043B\u044C (VND)" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(cashComputed.totalProfit) })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0411\u0435\u0437 \u043A\u0443\u0440\u0441\u043E\u0432" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(cashComputed.missing) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4, fontSize: 12 }, children: "\u0415\u0441\u043B\u0438 \u0435\u0441\u0442\u044C \u00AB\u0411\u0435\u0437 \u043A\u0443\u0440\u0441\u043E\u0432\u00BB \u2014 \u0437\u0430\u043F\u043E\u043B\u043D\u0438 \u043A\u0443\u0440\u0441\u044B \u043F\u043E \u0443\u043C\u043E\u043B\u0447\u0430\u043D\u0438\u044E \u0438\u043B\u0438 \u043F\u043E\u043F\u0440\u0430\u0432\u044C \u043A\u043E\u043D\u043A\u0440\u0435\u0442\u043D\u044B\u0435 \u0441\u0434\u0435\u043B\u043A\u0438." })] })] }), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u0421\u0434\u0435\u043B\u043A\u0438" }) }), _jsxs("div", { className: "vx-muted", children: ["\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E: ", cashComputed.rows.length || 0] }), cashComputed.rows.length ? (_jsx("div", { className: "vx-tableWrap", children: _jsxs("table", { className: "vx-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { children: "\u041F\u0430\u0440\u0430" }), _jsx("th", { children: "\u041E\u0442\u0434\u0430\u043B" }), _jsx("th", { children: "\u041F\u043E\u043B\u0443\u0447\u0438\u043B" }), _jsx("th", { children: "\u041A\u0443\u0440\u0441 \u0432\u0445\u043E\u0434\u0430 (sell_vnd)" }), _jsx("th", { children: "\u041A\u0443\u0440\u0441 \u0432\u044B\u0445\u043E\u0434\u0430 (buy_vnd)" }), _jsx("th", { children: "\u041A\u0410\u0421\u0421\u0410 (VND)" }), _jsx("th", {})] }) }), _jsx("tbody", { children: cashComputed.rows.slice(0, 300).map((x) => (_jsxs("tr", { children: [_jsx("td", { children: x.dateKey ? x.dateKey : fmtDt(x.created_at) }), _jsx("td", { children: x.who }), _jsxs("td", { children: [x.sellCur, " \u2192 ", x.buyCur] }), _jsxs("td", { children: [fmtNum(x.sellAmount), " ", x.sellCur] }), _jsxs("td", { children: [fmtNum(x.buyAmount), " ", x.buyCur] }), _jsx("td", { children: x.sellCur === "VND" ? (_jsx("span", { className: "vx-muted", children: "\u2013" })) : (_jsx("input", { className: "input vx-in", inputMode: "decimal", value: x.inValue, onChange: (e) => {
                                                                const v = e.target.value;
                                                                setCashOverrides((prev) => {
                                                                    const next = { ...(prev || {}) };
                                                                    const cur = { ...(next[x.id] || {}) };
                                                                    if (!String(v || "").trim())
                                                                        delete cur.in;
                                                                    else
                                                                        cur.in = v;
                                                                    if (!cur.in && !cur.out)
                                                                        delete next[x.id];
                                                                    else
                                                                        next[x.id] = cur;
                                                                    return next;
                                                                });
                                                            }, placeholder: fmtRate(x.inAuto) })) }), _jsx("td", { children: x.buyCur === "VND" ? (_jsx("span", { className: "vx-muted", children: "\u2013" })) : (_jsx("input", { className: "input vx-in", inputMode: "decimal", value: x.outValue, onChange: (e) => {
                                                                const v = e.target.value;
                                                                setCashOverrides((prev) => {
                                                                    const next = { ...(prev || {}) };
                                                                    const cur = { ...(next[x.id] || {}) };
                                                                    if (!String(v || "").trim())
                                                                        delete cur.out;
                                                                    else
                                                                        cur.out = v;
                                                                    if (!cur.in && !cur.out)
                                                                        delete next[x.id];
                                                                    else
                                                                        next[x.id] = cur;
                                                                    return next;
                                                                });
                                                            }, placeholder: fmtRate(x.outAuto) })) }), _jsx("td", { children: x.profitOk ? (_jsx("b", { style: { color: x.profit < 0 ? "#c0392b" : undefined }, children: fmtNum(x.profit) })) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) }), _jsx("td", { children: cashOverrides?.[x.id] ? (_jsx("button", { className: "btn vx-btnSm", type: "button", onClick: () => setCashOverrides((prev) => {
                                                                const next = { ...(prev || {}) };
                                                                delete next[x.id];
                                                                return next;
                                                            }), children: "\u0421\u0431\u0440\u043E\u0441" })) : null })] }, x.id))) })] }) })) : (_jsx("div", { className: "vx-muted", children: "\u041D\u0435\u0442 \u0441\u0434\u0435\u043B\u043E\u043A \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434." }))] })) : null, tab === "reports" ? (_jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u041E\u0442\u0447\u0451\u0442\u044B" }) }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u0421" }), _jsx("input", { className: "input vx-in", type: "date", value: repFrom, onChange: (e) => setRepFrom(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E" }), _jsx("input", { className: "input vx-in", type: "date", value: repTo, onChange: (e) => setRepTo(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "tg_id (\u043E\u043F\u0446.)" }), _jsx("input", { className: "input vx-in", value: repTgId, onChange: (e) => setRepTgId(e.target.value), placeholder: "123456" })] })] }), _jsxs("label", { className: "vx-checkRow", children: [_jsx("input", { type: "checkbox", checked: repOnlyDone, onChange: (e) => setRepOnlyDone(e.target.checked) }), _jsx("span", { children: "\u0422\u043E\u043B\u044C\u043A\u043E \u00AB\u0413\u043E\u0442\u043E\u0432\u043E\u00BB" })] }), _jsx("button", { className: "btn", type: "button", onClick: runReport, children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C" }), report?.ok ? (_jsxs("div", { className: "vx-sp10", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u041C\u0435\u0442\u0440\u0438\u043A\u0438" }) }), _jsxs("div", { className: "vx-metricGrid", children: [_jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0412\u0441\u0435\u0433\u043E \u0441\u0434\u0435\u043B\u043E\u043A" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(report.metrics?.total) })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0421\u0442\u0430\u0442\u0443\u0441\u044B" }), _jsxs("div", { className: "vx-metricLine", children: ["\u041F\u0440\u0438\u043D\u044F\u0442\u0430: ", _jsx("b", { children: fmtNum(report.metrics?.states?.new) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u0412 \u0440\u0430\u0431\u043E\u0442\u0435: ", _jsx("b", { children: fmtNum(report.metrics?.states?.in_progress) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u0413\u043E\u0442\u043E\u0432\u043E: ", _jsx("b", { children: fmtNum(report.metrics?.states?.done) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u041E\u0442\u043A\u043B\u043E\u043D\u0435\u043D\u0430: ", _jsx("b", { children: fmtNum(report.metrics?.states?.canceled) })] })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041E\u043F\u043B\u0430\u0442\u0430" }), _jsxs("div", { className: "vx-metricLine", children: ["\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435: ", _jsx("b", { children: fmtNum(report.metrics?.pay?.cash) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u041F\u0435\u0440\u0435\u0432\u043E\u0434: ", _jsx("b", { children: fmtNum(report.metrics?.pay?.transfer) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u0414\u0440\u0443\u0433\u043E\u0435: ", _jsx("b", { children: fmtNum(report.metrics?.pay?.other) })] })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435" }), _jsxs("div", { className: "vx-metricLine", children: ["\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u0435: ", _jsx("b", { children: fmtNum(report.metrics?.receive?.cash) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u041F\u0435\u0440\u0435\u0432\u043E\u0434: ", _jsx("b", { children: fmtNum(report.metrics?.receive?.transfer) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u0411\u0430\u043D\u043A\u043E\u043C\u0430\u0442: ", _jsx("b", { children: fmtNum(report.metrics?.receive?.atm) })] }), _jsxs("div", { className: "vx-metricLine", children: ["\u0414\u0440\u0443\u0433\u043E\u0435: ", _jsx("b", { children: fmtNum(report.metrics?.receive?.other) })] })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041E\u0442\u0434\u0430\u0451\u0442 (\u0432\u0430\u043B\u044E\u0442\u0430)" }), _jsx("div", { className: "vx-chipRow", children: Object.entries(report.metrics?.sellCurrency || {}).length ? (Object.entries(report.metrics?.sellCurrency || {})
                                                            .sort((a, b) => Number(b[1]) - Number(a[1]))
                                                            .map(([k, v]) => (_jsxs("span", { className: "vx-chip", children: [k, ": ", _jsx("b", { children: fmtNum(v) })] }, k)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043B\u0443\u0447\u0430\u0435\u0442 (\u0432\u0430\u043B\u044E\u0442\u0430)" }), _jsx("div", { className: "vx-chipRow", children: Object.entries(report.metrics?.buyCurrency || {}).length ? (Object.entries(report.metrics?.buyCurrency || {})
                                                            .sort((a, b) => Number(b[1]) - Number(a[1]))
                                                            .map(([k, v]) => (_jsxs("span", { className: "vx-chip", children: [k, ": ", _jsx("b", { children: fmtNum(v) })] }, k)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) })] })] }), _jsx("div", { className: "vx-sp12" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u0421\u0434\u0435\u043B\u043A\u0438" }) }), _jsxs("div", { className: "vx-muted", children: ["\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E: ", report.requests?.length || 0] }), Array.isArray(report.requests) && report.requests.length ? (_jsx("div", { className: "vx-tableWrap", children: _jsxs("table", { className: "vx-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u0414\u0430\u0442\u0430" }), _jsx("th", { children: "\u041A\u043B\u0438\u0435\u043D\u0442" }), _jsx("th", { children: "\u041F\u0430\u0440\u0430" }), _jsx("th", { children: "\u041E\u0442\u0434\u0430\u043B" }), _jsx("th", { children: "\u041F\u043E\u043B\u0443\u0447\u0438\u043B" }), _jsx("th", { children: "\u041E\u043F\u043B\u0430\u0442\u0430" }), _jsx("th", { children: "\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u0438\u0435" }), _jsx("th", { children: "\u0421\u0442\u0430\u0442\u0443\u0441" })] }) }), _jsx("tbody", { children: report.requests.slice(0, 200).map((r) => (_jsxs("tr", { children: [_jsx("td", { children: fmtDt(r.created_at) }), _jsx("td", { children: who(r) }), _jsxs("td", { children: [String(r.sellCurrency), " \u2192 ", String(r.buyCurrency)] }), _jsx("td", { children: fmtNum(r.sellAmount) }), _jsx("td", { children: fmtNum(r.buyAmount) }), _jsx("td", { children: methodRu(r.payMethod) }), _jsx("td", { children: methodRu(r.receiveMethod) }), _jsx("td", { children: _jsx("b", { children: stateRu(r.state) }) })] }, r.id))) })] }) })) : (_jsx("div", { className: "vx-muted", children: "\u041D\u0435\u0442 \u0441\u0434\u0435\u043B\u043E\u043A \u0437\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0439 \u043F\u0435\u0440\u0438\u043E\u0434." }))] })) : null] })) : null, tab === "analytics" ? (_jsxs("div", { className: "card", children: [_jsx("div", { className: "small", children: _jsx("b", { children: "\u0421\u0442\u0430\u0442\u0438\u0441\u0442\u0438\u043A\u0430" }) }), _jsx("div", { className: "vx-sp10" }), _jsxs("div", { className: "vx-rowWrap", style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [_jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u0421" }), _jsx("input", { className: "input vx-in", type: "date", value: anFrom, onChange: (e) => setAnFrom(e.target.value) })] }), _jsxs("div", { style: { flex: "1 1 160px" }, children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E" }), _jsx("input", { className: "input vx-in", type: "date", value: anTo, onChange: (e) => setAnTo(e.target.value) })] })] }), _jsx("button", { className: "btn", type: "button", onClick: loadAnalytics, disabled: anLoading, children: anLoading ? "Загрузка..." : "Показать" }), !anData ? (_jsx("div", { className: "vx-muted", children: "\u0414\u0430\u043D\u043D\u044B\u0445 \u043F\u043E\u043A\u0430 \u043D\u0435\u0442. \u041E\u0442\u043A\u0440\u043E\u0439 \u043A\u043B\u0438\u0435\u043D\u0442\u0441\u043A\u043E\u0435 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u0438 \u043F\u043E\u043A\u043B\u0438\u043A\u0430\u0439 \u0432\u043A\u043B\u0430\u0434\u043A\u0438/\u043A\u043D\u043E\u043F\u043A\u0438 \u2014 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u043E\u044F\u0432\u044F\u0442\u0441\u044F \u0437\u0434\u0435\u0441\u044C." })) : anData.db === false ? (_jsx("div", { className: "vx-muted", children: "\u0411\u0430\u0437\u0430 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0430 (DATABASE_URL)." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u0418\u0442\u043E\u0433\u0438" }) }), _jsxs("div", { className: "vx-metricGrid", children: [_jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u044F" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(anData?.totals?.events) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4, fontSize: 12 }, children: "\u0412\u0441\u0435 \u0437\u0430\u0444\u0438\u043A\u0441\u0438\u0440\u043E\u0432\u0430\u043D\u043D\u044B\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434." })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u041F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439 \u0432\u0441\u0435\u0433\u043E" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(anData?.totals?.all_users) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4, fontSize: 12 }, children: "\u0412\u0441\u0435 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438, \u043A\u043E\u0442\u043E\u0440\u044B\u0435 \u043A\u043E\u0433\u0434\u0430-\u043B\u0438\u0431\u043E \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u043B\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435." })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0423\u043D\u0438\u043A\u0430\u043B\u044C\u043D\u044B\u0445 \u0437\u0430 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(anData?.totals?.users) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4, fontSize: 12 }, children: "\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0440\u0430\u0437\u043D\u044B\u0445 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0435\u0439 \u0431\u044B\u043B\u043E \u0430\u043A\u0442\u0438\u0432\u043D\u043E \u0432 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0434\u0430\u0442\u044B." })] }), _jsxs("div", { className: "vx-metricCard", children: [_jsx("div", { className: "vx-muted", children: "\u0417\u0430\u043F\u0443\u0441\u043A\u043E\u0432 (\u0441\u0435\u0441\u0441\u0438\u0439)" }), _jsx("div", { className: "vx-metricVal", children: fmtNum(anData?.totals?.sessions) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4, fontSize: 12 }, children: "\u0421\u0435\u0441\u0441\u0438\u044F = \u043E\u0434\u0438\u043D \u0437\u0430\u043F\u0443\u0441\u043A \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F (session_id). \u041E\u0434\u0438\u043D \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044C \u043C\u043E\u0436\u0435\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0442\u044C \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u0435 \u043C\u043D\u043E\u0433\u043E \u0440\u0430\u0437." })] })] }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041F\u0435\u0440\u0435\u0445\u043E\u0434\u044B \u043F\u043E \u0432\u043A\u043B\u0430\u0434\u043A\u0430\u043C" }) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442, \u043A\u0430\u043A\u0438\u0435 \u044D\u043A\u0440\u0430\u043D\u044B \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u043B\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438 \u0447\u0430\u0449\u0435 \u0432\u0441\u0435\u0433\u043E." }), _jsx("div", { className: "vx-chipRow", children: Array.isArray(anData?.byScreen) && anData.byScreen.length ? (anData.byScreen.slice(0, 30).map((x) => (_jsxs("span", { className: "vx-chip", children: [screenLabel(x.screen), ": ", _jsx("b", { children: fmtNum(x.cnt) })] }, x.screen)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u041A\u043B\u0438\u043A\u0438" }) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u041F\u043E\u043A\u0430\u0437\u044B\u0432\u0430\u0435\u0442 \u043D\u0430 \u043A\u0430\u043A\u0438\u0435 \u043A\u043D\u043E\u043F\u043A\u0438 \u0438 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u044B \u0432\u043D\u0443\u0442\u0440\u0438 \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F \u043D\u0430\u0436\u0438\u043C\u0430\u043B\u0438 \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u0438." }), _jsx("div", { className: "vx-chipRow", children: Array.isArray(anData?.byClick) && anData.byClick.length ? (anData.byClick.slice(0, 50).map((x) => (_jsxs("span", { className: "vx-chip", children: [clickLabel(x.target), ": ", _jsx("b", { children: fmtNum(x.cnt) })] }, x.target)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) }), _jsx("div", { className: "vx-sp10" }), _jsx("div", { className: "small", children: _jsx("b", { children: "\u0421\u043E\u0431\u044B\u0442\u0438\u044F" }) }), _jsx("div", { className: "vx-muted", style: { marginTop: 4 }, children: "\u0421\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0435 \u0441\u043E\u0431\u044B\u0442\u0438\u044F \u043F\u0440\u0438\u043B\u043E\u0436\u0435\u043D\u0438\u044F: \u043E\u0442\u043A\u0440\u044B\u0442\u0438\u044F, \u0432\u043E\u0437\u0432\u0440\u0430\u0442\u044B, \u043E\u0442\u043F\u0440\u0430\u0432\u043A\u0438 \u0437\u0430\u044F\u0432\u043E\u043A \u0438 \u0434\u0440\u0443\u0433\u0438\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044F." }), _jsx("div", { className: "vx-chipRow", children: Array.isArray(anData?.byEvent) && anData.byEvent.length ? (anData.byEvent.slice(0, 50).map((x) => (_jsxs("span", { className: "vx-chip", children: [eventLabel(x.event_name), ": ", _jsx("b", { children: fmtNum(x.cnt) })] }, x.event_name)))) : (_jsx("span", { className: "vx-muted", children: "\u2013" })) })] }))] })) : null] })] }));
}
