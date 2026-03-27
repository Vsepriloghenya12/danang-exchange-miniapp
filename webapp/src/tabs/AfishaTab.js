import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiAfishaClick, apiGetAfisha } from "../lib/api";
function getTg() {
    return window.Telegram?.WebApp;
}
function openLink(url) {
    const tg = getTg();
    if (tg?.openLink)
        tg.openLink(url);
    else
        window.open(url, "_blank", "noopener,noreferrer");
}
const CATS = [
    { key: "sport", label: "Спорт" },
    { key: "party", label: "Вечеринки" },
    { key: "culture", label: "Культура и искусство" },
    { key: "games", label: "Игры" },
    { key: "market", label: "Ярмарки" },
    { key: "food", label: "Еда" },
    { key: "music", label: "Музыка" },
    { key: "learning", label: "Обучение" },
    { key: "misc", label: "Разное" },
];
function iso(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}
function endOfWeekFrom(d) {
    // RU week: Monday..Sunday
    const x = new Date(d);
    const day = x.getDay(); // 0 Sun ... 6 Sat
    const daysToSun = (7 - day) % 7;
    return addDays(x, daysToSun);
}
function nextMondayFrom(d) {
    const x = new Date(d);
    const day = x.getDay();
    const daysToMon = (8 - (day === 0 ? 7 : day)) % 7; // Monday => 0
    return addDays(x, daysToMon || 7);
}
function endOfMonthFrom(d) {
    const x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth() + 1, 0);
}
const DATE_PRESETS = [
    { key: "any", label: "Любая дата" },
    { key: "today", label: "Сегодня" },
    { key: "tomorrow", label: "Завтра" },
    { key: "weekend", label: "На этих выходных" },
    { key: "thisWeek", label: "На этой неделе" },
    { key: "nextWeek", label: "На следующей неделе" },
    { key: "thisMonth", label: "В этом месяце" },
    { key: "custom", label: "Пользовательские настройки временного периода" },
];
function fmtDate(isoStr) {
    try {
        const d = new Date(isoStr);
        if (!Number.isFinite(d.getTime()))
            return isoStr;
        return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    catch {
        return isoStr;
    }
}
function fmtTime(value) {
    const s = String(value || '').trim();
    return /^\d{2}:\d{2}$/.test(s) ? s : '';
}
function afishaSortKey(ev) {
    return `${String(ev?.date || '')}T${fmtTime(ev?.time) || '99:99'}`;
}
function presetRange(p) {
    const now = new Date();
    if (p === "any")
        return { from: "", to: "" };
    if (p === "today") {
        const x = iso(now);
        return { from: x, to: x };
    }
    if (p === "tomorrow") {
        const x = iso(addDays(now, 1));
        return { from: x, to: x };
    }
    if (p === "weekend") {
        const day = now.getDay();
        // Sat (6) => Sat..Sun, Sun (0) => Sun only, else => next Sat..Sun
        if (day === 6) {
            const s = iso(now);
            const e = iso(addDays(now, 1));
            return { from: s, to: e };
        }
        if (day === 0) {
            const s = iso(now);
            return { from: s, to: s };
        }
        // next Saturday
        const nextSat = addDays(now, (6 - day + 7) % 7);
        return { from: iso(nextSat), to: iso(addDays(nextSat, 1)) };
    }
    if (p === "thisWeek") {
        // from today till Sunday
        return { from: iso(now), to: iso(endOfWeekFrom(now)) };
    }
    if (p === "nextWeek") {
        const mon = nextMondayFrom(now);
        const sun = endOfWeekFrom(mon);
        return { from: iso(mon), to: iso(sun) };
    }
    if (p === "thisMonth") {
        return { from: iso(now), to: iso(endOfMonthFrom(now)) };
    }
    return { from: "", to: "" };
}
function filterLabel(p, f, t) {
    const presetLabel = DATE_PRESETS.find((x) => x.key === p)?.label || "";
    if (p !== "custom")
        return presetLabel;
    if (!f && !t)
        return presetLabel;
    if (f && t)
        return `${presetLabel}: ${fmtDate(f)} — ${fmtDate(t)}`;
    if (f)
        return `${presetLabel}: c ${fmtDate(f)}`;
    return `${presetLabel}: по ${fmtDate(t)}`;
}
function getEventCats(ev) {
    const raw = ev?.categories;
    const list = Array.isArray(raw) ? raw : ev?.category ? [ev.category] : [];
    // migrate legacy/removed category "city" => "culture"
    return list
        .map((x) => String(x || "").toLowerCase().trim())
        .map((x) => (x === "city" ? "culture" : x))
        .filter(Boolean);
}
function IconShare({ className = "" }) {
    return (_jsxs("svg", { viewBox: "0 0 24 24", className: className, fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [_jsx("path", { d: "M7 17L17 7" }), _jsx("path", { d: "M9 7h8v8" })] }));
}
function buildBrowserShareUrl(ev) {
    const u = new URL(`${window.location.origin}${window.location.pathname}`);
    u.searchParams.set("screen", "afisha");
    u.searchParams.set("event", ev.id);
    return u.toString();
}
export default function AfishaTab({ registerBack, focusEventId, onFocusHandled }) {
    const tg = getTg();
    const initData = tg?.initData || "";
    // Selected categories for filtering (multi-select). Empty array = show all categories.
    const [cats, setCats] = useState([]);
    // Applied date filter
    const [datePreset, setDatePreset] = useState("any");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    // Bottom sheet (date / categories)
    const [sheet, setSheet] = useState(null);
    const sheetOpen = sheet !== null;
    const [draftPreset, setDraftPreset] = useState("any");
    const [draftFrom, setDraftFrom] = useState("");
    const [draftTo, setDraftTo] = useState("");
    const [loading, setLoading] = useState(false);
    const [events, setEvents] = useState([]);
    const [err, setErr] = useState("");
    const [flashId, setFlashId] = useState("");
    // Bottom sheet refs
    const sheetRef = useRef(null);
    const listRef = useRef(null);
    const cardRefs = useRef({});
    const flashTimerRef = useRef(null);
    // When a sheet is open, hard-lock the scroll container.
    // In Telegram Android WebView, drag gestures can otherwise "pull" the whole app (rubber-band)
    // and show a bottom gap.
    useEffect(() => {
        const html = document.documentElement;
        const sc = document.getElementById("root");
        if (!sheetOpen) {
            try {
                html.classList.remove("mx-sheet-open");
            }
            catch { }
            if (sc) {
                sc.style.overflow = "";
                sc.style.touchAction = "";
            }
            return;
        }
        try {
            html.classList.add("mx-sheet-open");
        }
        catch { }
        const prev = {
            overflow: sc?.style.overflow || "",
            touchAction: sc?.style.touchAction || "",
            scrollTop: sc ? sc.scrollTop : 0,
        };
        if (sc) {
            sc.style.overflow = "hidden";
            sc.style.touchAction = "none";
        }
        // Extra protection: block touchmove outside of the scrollable list.
        const onTouchMove = (e) => {
            const t = e.target;
            if (t?.closest?.(".mx-sheetList"))
                return;
            e.preventDefault();
        };
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        return () => {
            document.removeEventListener("touchmove", onTouchMove);
            try {
                html.classList.remove("mx-sheet-open");
            }
            catch { }
            if (sc) {
                sc.style.overflow = prev.overflow;
                sc.style.touchAction = prev.touchAction;
                sc.scrollTop = prev.scrollTop;
            }
        };
    }, [sheetOpen]);
    useEffect(() => {
        return () => {
            if (flashTimerRef.current != null) {
                window.clearTimeout(flashTimerRef.current);
            }
        };
    }, []);
    // Prevent scroll-chain "rubber-band" inside the sheet list.
    // Telegram Android WebView can visually "lift" the sheet and reveal a bottom gap
    // when the user swipes on a list/grid that can't scroll further.
    useEffect(() => {
        if (!sheetOpen)
            return;
        const el = listRef.current;
        if (!el)
            return;
        let startY = 0;
        let startX = 0;
        const onStart = (e) => {
            const t = e.touches?.[0];
            if (!t)
                return;
            startY = t.clientY;
            startX = t.clientX;
        };
        const onMove = (e) => {
            const t = e.touches?.[0];
            if (!t)
                return;
            const dy = t.clientY - startY;
            const dx = t.clientX - startX;
            // Don't interfere with horizontal gestures.
            if (Math.abs(dx) > Math.abs(dy))
                return;
            const canScroll = el.scrollHeight > el.clientHeight + 1;
            if (!canScroll) {
                // The grid/list doesn't scroll -> block WebView overscroll completely.
                e.preventDefault();
                return;
            }
            const atTop = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            // If the user tries to scroll past the ends, block it to avoid chaining to the WebView.
            if ((atTop && dy > 0) || (atBottom && dy < 0)) {
                e.preventDefault();
            }
        };
        el.addEventListener("touchstart", onStart, { passive: true });
        el.addEventListener("touchmove", onMove, { passive: false });
        return () => {
            el.removeEventListener("touchstart", onStart);
            el.removeEventListener("touchmove", onMove);
        };
    }, [sheetOpen, sheet]);
    // Let App.tsx override the top header back button: close an open sheet.
    useEffect(() => {
        if (!registerBack)
            return;
        registerBack(() => {
            if (sheetOpen) {
                setSheet(null);
                return true;
            }
            return false;
        });
    }, [registerBack, sheetOpen]);
    // Swipe-to-close for the bottom sheet
    const dragYRef = useRef(0);
    const startYRef = useRef(0);
    const ptrRef = useRef(null);
    const [dragY, setDragY] = useState(0);
    const [dragging, setDragging] = useState(false);
    const canStartDrag = (target) => {
        if (target.closest("input,select,textarea"))
            return false;
        // IMPORTANT: dragging the sheet from inside the list/grid causes a visual "lift" (gap at the bottom)
        // in Telegram Android WebView. Restrict swipe-to-close to the handle/top area only.
        if (target.closest(".mx-sheetList"))
            return false;
        if (target.closest(".mx-sheetHandle"))
            return true;
        if (target.closest(".mx-sheetTitle"))
            return true;
        // Allow dragging from the top padding area of the sheet.
        return !!target.closest(".mx-sheet");
    };
    const onSheetPointerDown = (e) => {
        if (!sheetOpen)
            return;
        if (e.pointerType === "mouse" && e.button !== 0)
            return;
        const t = e.target;
        if (!t || !canStartDrag(t))
            return;
        // Prevent the gesture from scrolling the page (Telegram WebView sometimes scrolls anyway).
        try {
            e.preventDefault();
        }
        catch { }
        ptrRef.current = e.pointerId;
        startYRef.current = e.clientY;
        dragYRef.current = 0;
        setDragY(0);
        setDragging(true);
        try {
            e.currentTarget?.setPointerCapture?.(e.pointerId);
        }
        catch { }
    };
    const onSheetPointerMove = (e) => {
        if (ptrRef.current !== e.pointerId)
            return;
        const dy = e.clientY - startYRef.current;
        // Only allow dragging DOWN to close. Swiping up should never move the sheet.
        const next = dy > 0 ? dy : 0;
        dragYRef.current = next;
        setDragY(next);
        if (Math.abs(next) > 6) {
            try {
                e.preventDefault();
            }
            catch { }
        }
    };
    const endDrag = (e) => {
        if (ptrRef.current !== e.pointerId)
            return;
        ptrRef.current = null;
        setDragging(false);
        const dy = dragYRef.current;
        dragYRef.current = 0;
        if (dy > 120) {
            setSheet(null);
            setDragY(0);
            return;
        }
        setDragY(0);
    };
    // Touch fallback (iOS Telegram WebView can be flaky with pointer events)
    const touchIdRef = useRef(null);
    const onSheetTouchStart = (e) => {
        if (!sheetOpen)
            return;
        const t = e.target;
        if (!t || !canStartDrag(t))
            return;
        const touch = e.touches?.[0];
        if (!touch)
            return;
        touchIdRef.current = touch.identifier;
        startYRef.current = touch.clientY;
        dragYRef.current = 0;
        setDragY(0);
        setDragging(true);
    };
    const onSheetTouchMove = (e) => {
        if (touchIdRef.current == null)
            return;
        const touch = Array.from(e.touches).find((x) => x.identifier === touchIdRef.current) || e.touches?.[0];
        if (!touch)
            return;
        const dy = touch.clientY - startYRef.current;
        // Only allow dragging DOWN to close. Swiping up should never move the sheet.
        const next = dy > 0 ? dy : 0;
        dragYRef.current = next;
        setDragY(next);
        if (Math.abs(next) > 6)
            e.preventDefault();
    };
    const onSheetTouchEnd = () => {
        if (touchIdRef.current == null)
            return;
        touchIdRef.current = null;
        setDragging(false);
        const dy = dragYRef.current;
        dragYRef.current = 0;
        if (dy > 120) {
            setSheet(null);
            setDragY(0);
            return;
        }
        setDragY(0);
    };
    useEffect(() => {
        if (!sheetOpen)
            return;
        // open a sheet with current values
        setDraftPreset(datePreset);
        setDraftFrom(from);
        setDraftTo(to);
    }, [sheetOpen, datePreset, from, to]);
    const appliedLabel = useMemo(() => filterLabel(datePreset, from, to), [datePreset, from, to]);
    const catsLabel = useMemo(() => {
        if (!cats || cats.length === 0)
            return "Все";
        if (cats.length === 1)
            return CATS.find((x) => x.key === cats[0])?.label || "Категория";
        const names = cats
            .slice(0, 2)
            .map((k) => CATS.find((x) => x.key === k)?.label)
            .filter(Boolean);
        return names.length ? `${names.join(", ")}${cats.length > 2 ? ` +${cats.length - 2}` : ""}` : `Категории: ${cats.length}`;
    }, [cats]);
    // Always show the list of events. Filters (date/categories) just narrow it down.
    const params = useMemo(() => {
        return { from: from || undefined, to: to || undefined };
    }, [from, to]);
    useEffect(() => {
        if (!focusEventId)
            return;
        setCats([]);
        setDatePreset("any");
        setFrom("");
        setTo("");
    }, [focusEventId]);
    const filteredEvents = useMemo(() => {
        if (!events || events.length === 0)
            return [];
        const set = new Set((cats || []).map((c) => String(c)));
        const base = !cats || cats.length === 0
            ? [...events]
            : events.filter((e) => {
                const ec = getEventCats(e);
                return ec.some((x) => set.has(String(x)));
            });
        return base.sort((a, b) => afishaSortKey(a).localeCompare(afishaSortKey(b)));
    }, [events, cats]);
    const groupedEvents = useMemo(() => {
        const groups = [];
        for (const ev of filteredEvents) {
            const date = String(ev?.date || '');
            const last = groups[groups.length - 1];
            if (!last || last.date !== date)
                groups.push({ date, items: [ev] });
            else
                last.items.push(ev);
        }
        return groups;
    }, [filteredEvents]);
    useEffect(() => {
        if (!focusEventId || loading)
            return;
        const target = filteredEvents.find((x) => String(x.id) === String(focusEventId));
        if (!target)
            return;
        const el = cardRefs.current[target.id];
        if (!el)
            return;
        const raf1 = window.requestAnimationFrame(() => {
            const raf2 = window.requestAnimationFrame(() => {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                setFlashId(target.id);
                if (flashTimerRef.current != null)
                    window.clearTimeout(flashTimerRef.current);
                flashTimerRef.current = window.setTimeout(() => {
                    setFlashId((cur) => (cur === target.id ? "" : cur));
                }, 2200);
                onFocusHandled?.(target.id);
            });
            return () => window.cancelAnimationFrame(raf2);
        });
        return () => window.cancelAnimationFrame(raf1);
    }, [focusEventId, filteredEvents, loading, onFocusHandled]);
    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setErr("");
            try {
                const r = await apiGetAfisha(params);
                if (!alive)
                    return;
                if (!r?.ok) {
                    setEvents([]);
                    setErr(String(r?.error || "Ошибка"));
                }
                else {
                    const arr = Array.isArray(r?.events) ? r.events : [];
                    setEvents(arr);
                }
            }
            catch {
                if (!alive)
                    return;
                setEvents([]);
                setErr("Ошибка загрузки");
            }
            finally {
                if (alive)
                    setLoading(false);
            }
        })();
        return () => {
            alive = false;
        };
    }, [params]);
    async function onClick(ev, kind) {
        try {
            if (initData)
                await apiAfishaClick(initData, ev.id, kind);
        }
        catch { }
        openLink(kind === "details" ? ev.detailsUrl : ev.locationUrl);
    }
    function onShare(ev) {
        const targetUrl = String(ev.shareUrl || "").trim() || buildBrowserShareUrl(ev);
        const shareText = `${ev.title}
${fmtDate(ev.date)}`;
        const shareTextWithLink = `${shareText}
${targetUrl}`;
        const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(targetUrl)}&text=${encodeURIComponent(shareText)}`;
        const tg = getTg();
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(tgShareUrl);
            return;
        }
        if (navigator?.share) {
            void navigator.share({ title: ev.title, text: shareTextWithLink }).catch(() => { });
            return;
        }
        openLink(tgShareUrl);
    }
    return (_jsxs("div", { className: "mx-afisha", children: [_jsxs("div", { className: "mx-filterRow", children: [_jsxs("button", { type: "button", className: "mx-filterBtn", onClick: () => setSheet("date"), children: [_jsxs("div", { className: "mx-filterBtnLeft", children: [_jsx("div", { className: "mx-filterBtnHint", children: "\u0414\u0430\u0442\u0430" }), _jsx("div", { className: "mx-filterBtnVal", children: appliedLabel })] }), _jsx("div", { className: "mx-filterBtnChev", children: "\u25BE" })] }), _jsxs("button", { type: "button", className: "mx-filterBtn", onClick: () => setSheet("cats"), children: [_jsxs("div", { className: "mx-filterBtnLeft", children: [_jsx("div", { className: "mx-filterBtnHint", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), _jsx("div", { className: "mx-filterBtnVal", children: catsLabel })] }), _jsx("div", { className: "mx-filterBtnChev", children: "\u25BE" })] })] }), loading ? _jsx("div", { className: "mx-muted", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430\u2026" }) : null, !loading && err ? _jsx("div", { className: "mx-muted", children: err }) : null, !loading && !err && filteredEvents.length === 0 ? _jsx("div", { className: "mx-muted", children: "\u041F\u043E\u043A\u0430 \u043D\u0435\u0442 \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0439." }) : null, _jsx("div", { className: "mx-list", children: groupedEvents.map((group) => (_jsxs("div", { className: "mx-afGroup", children: [_jsx("div", { className: "mx-afGroupDate", children: fmtDate(group.date) }), group.items.map((ev) => {
                            const timeLabel = fmtTime(ev?.time);
                            return (_jsxs("div", { ref: (node) => {
                                    cardRefs.current[ev.id] = node;
                                }, className: "mx-afEvCard" + (ev.imageUrl ? " has-img" : "") + (flashId === ev.id ? " is-flash" : ""), children: [ev.imageUrl ? _jsx("div", { className: "mx-afEvBg", style: { backgroundImage: `url(${ev.imageUrl})` }, "aria-hidden": "true" }) : null, _jsxs("div", { className: "mx-afEvBody", children: [_jsx("div", { className: "mx-afTitle", children: ev.title }), ev.comment ? _jsx("div", { className: "mx-afComment", children: ev.comment }) : null, _jsx("div", { className: "mx-afMeta", children: timeLabel ? `${fmtDate(ev.date)} • ${timeLabel}` : fmtDate(ev.date) }), _jsxs("div", { className: "mx-btnRow mx-afBtnRow", style: { marginTop: 10 }, children: [_jsx("button", { type: "button", className: "mx-btn mx-afLinkBtn mx-afActionBtn", onClick: () => onClick(ev, "details"), style: { opacity: 0.8 }, children: "\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0435\u0435" }), _jsx("button", { type: "button", className: "mx-btn mx-btnPrimary mx-afLinkBtn mx-afActionBtn", onClick: () => onClick(ev, "location"), style: { opacity: 0.8 }, children: "\u041B\u043E\u043A\u0430\u0446\u0438\u044F" }), _jsx("button", { type: "button", className: "mx-btn mx-afShareBtn", onClick: () => onShare(ev), "aria-label": "\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u043C\u0435\u0440\u043E\u043F\u0440\u0438\u044F\u0442\u0438\u0435\u043C", children: _jsx(IconShare, { className: "mx-i" }) })] })] })] }, ev.id));
                        })] }, group.date))) }), sheetOpen ? (_jsx("div", { className: "mx-sheetOverlay", onClick: () => setSheet(null), role: "dialog", children: _jsxs("div", { ref: sheetRef, className: "mx-sheet" + (sheet === "cats" ? " mx-sheet--cats" : "") + (dragging ? " is-dragging" : ""), onClick: (e) => e.stopPropagation(), onPointerDown: onSheetPointerDown, onPointerMove: onSheetPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onTouchStart: onSheetTouchStart, onTouchMove: onSheetTouchMove, onTouchEnd: onSheetTouchEnd, onTouchCancel: onSheetTouchEnd, style: {
                        // No negative translate: this was creating a visible bottom gap when swiping up.
                        transform: `translateY(${Math.max(0, dragY)}px)`,
                        transition: dragging ? "none" : undefined,
                    }, children: [_jsx("div", { className: "mx-sheetHandle" }), sheet === "date" ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "mx-sheetTitle", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0435\u0440\u0438\u043E\u0434" }), _jsx("div", { ref: listRef, className: "mx-sheetList", children: DATE_PRESETS.map((p) => (_jsxs("button", { type: "button", className: "mx-sheetItem " + (draftPreset === p.key ? "on" : ""), onClick: () => setDraftPreset(p.key), children: [_jsx("span", { className: "mx-sheetItemText", children: p.label }), draftPreset === p.key ? _jsx("span", { className: "mx-sheetCheck", children: "\u2713" }) : _jsx("span", {})] }, p.key))) }), draftPreset === "custom" ? (_jsxs("div", { className: "mx-sheetCustom", children: [_jsxs("div", { className: "mx-customRow", children: [_jsx("div", { className: "mx-customLbl", children: "\u0421" }), _jsx("input", { className: "mx-dateInput", type: "date", value: draftFrom, onChange: (e) => setDraftFrom(e.target.value) })] }), _jsxs("div", { className: "mx-customRow", children: [_jsx("div", { className: "mx-customLbl", children: "\u041F\u043E" }), _jsx("input", { className: "mx-dateInput", type: "date", value: draftTo, onChange: (e) => setDraftTo(e.target.value) })] })] })) : null, _jsx("div", { className: "mx-sheetFooter", children: _jsx("button", { type: "button", className: "mx-sheetBtn", onClick: () => {
                                            const p = draftPreset;
                                            setDatePreset(p);
                                            if (p === "custom") {
                                                setFrom(draftFrom);
                                                setTo(draftTo);
                                            }
                                            else {
                                                const r = presetRange(p);
                                                setFrom(r.from);
                                                setTo(r.to);
                                            }
                                            setSheet(null);
                                        }, children: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B" }) })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "mx-sheetTitle", children: "\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }), _jsx("div", { ref: listRef, className: "mx-sheetList mx-sheetList--cats", children: _jsxs("div", { className: "mx-afCats mx-afCats--sheet", children: [_jsx("button", { type: "button", className: "mx-afCatBtn mx-afCat--all" + (cats.length === 0 ? " is-on" : ""), onClick: () => setCats([]), children: _jsx("div", { children: _jsx("div", { className: "mx-afCatLabel", children: "\u0412\u0441\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0438\u0438" }) }) }), CATS.map((c) => {
                                                const on = cats.includes(c.key);
                                                return (_jsx("button", { type: "button", className: "mx-afCatBtn mx-afCat--" + c.key + (on ? " is-on" : ""), onClick: () => {
                                                        setCats((prev) => {
                                                            const has = prev.includes(c.key);
                                                            return has ? prev.filter((x) => x !== c.key) : [...prev, c.key];
                                                        });
                                                    }, children: _jsx("div", { children: _jsx("div", { className: "mx-afCatLabel", children: c.label }) }) }, c.key));
                                            })] }) }), _jsx("div", { className: "mx-sheetFooter", children: _jsx("button", { type: "button", className: "mx-sheetBtn", onClick: () => setSheet(null), children: "\u0413\u043E\u0442\u043E\u0432\u043E" }) })] }))] }) })) : null] }));
}
