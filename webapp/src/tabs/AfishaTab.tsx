import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiAfishaClick, apiGetAfisha } from "../lib/api";
import type { AfishaCategory, AfishaEvent } from "../lib/types";

type Lang = "ru" | "en";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function openLink(url: string) {
  const tg = getTg();
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

const CAT_LABELS: Record<Lang, Array<{ key: AfishaCategory; label: string }>> = {
  ru: [
    { key: "sport", label: "Спорт" },
    { key: "party", label: "Вечеринки" },
    { key: "culture", label: "Культура и искусство" },
    { key: "games", label: "Игры" },
    { key: "market", label: "Ярмарки" },
    { key: "food", label: "Еда" },
    { key: "music", label: "Музыка" },
    { key: "learning", label: "Обучение" },
    { key: "misc", label: "Разное" },
  ],
  en: [
    { key: "sport", label: "Sport" },
    { key: "party", label: "Parties" },
    { key: "culture", label: "Culture & art" },
    { key: "games", label: "Games" },
    { key: "market", label: "Markets" },
    { key: "food", label: "Food" },
    { key: "music", label: "Music" },
    { key: "learning", label: "Learning" },
    { key: "misc", label: "Other" },
  ],
};

function iso(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function endOfWeekFrom(d: Date) {
  // RU week: Monday..Sunday
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const daysToSun = (7 - day) % 7;
  return addDays(x, daysToSun);
}

function nextMondayFrom(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const daysToMon = (8 - (day === 0 ? 7 : day)) % 7; // Monday => 0
  return addDays(x, daysToMon || 7);
}

function endOfMonthFrom(d: Date) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth() + 1, 0);
}

type DatePreset =
  | "any"
  | "today"
  | "tomorrow"
  | "weekend"
  | "thisWeek"
  | "nextWeek"
  | "thisMonth"
  | "custom";

const DATE_PRESET_LABELS: Record<Lang, Array<{ key: DatePreset; label: string }>> = {
  ru: [
    { key: "any", label: "Любая дата" },
    { key: "today", label: "Сегодня" },
    { key: "tomorrow", label: "Завтра" },
    { key: "weekend", label: "На этих выходных" },
    { key: "thisWeek", label: "На этой неделе" },
    { key: "nextWeek", label: "На следующей неделе" },
    { key: "thisMonth", label: "В этом месяце" },
    { key: "custom", label: "Пользовательский период" },
  ],
  en: [
    { key: "any", label: "Any date" },
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "weekend", label: "This weekend" },
    { key: "thisWeek", label: "This week" },
    { key: "nextWeek", label: "Next week" },
    { key: "thisMonth", label: "This month" },
    { key: "custom", label: "Custom period" },
  ],
};

function fmtDate(isoStr: string, lang: Lang = "ru") {
  try {
    const d = new Date(isoStr);
    if (!Number.isFinite(d.getTime())) return isoStr;
    return d.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return isoStr;
  }
}

function fmtTime(value?: string) {
  const s = String(value || '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

function afishaSortKey(ev: AfishaEvent) {
  return `${String(ev?.date || '')}T${fmtTime((ev as any)?.time) || '99:99'}`;
}

function presetRange(p: DatePreset): { from: string; to: string } {
  const now = new Date();
  if (p === "any") return { from: "", to: "" };
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

function filterLabel(p: DatePreset, f: string, t: string, lang: Lang) {
  const presetLabel = DATE_PRESET_LABELS[lang].find((x) => x.key === p)?.label || "";
  if (p !== "custom") return presetLabel;
  if (!f && !t) return presetLabel;
  if (f && t) return `${presetLabel}: ${fmtDate(f, lang)} — ${fmtDate(t, lang)}`;
  if (f) return `${presetLabel}: ${lang === "en" ? "from" : "с"} ${fmtDate(f, lang)}`;
  return `${presetLabel}: ${lang === "en" ? "to" : "по"} ${fmtDate(t, lang)}`;
}

function getEventCats(ev: AfishaEvent): AfishaCategory[] {
  const raw = (ev as any)?.categories;
  const list = Array.isArray(raw) ? raw : (ev as any)?.category ? [(ev as any).category] : [];
  // migrate legacy/removed category "city" => "culture"
  return list
    .map((x) => String(x || "").toLowerCase().trim())
    .map((x) => (x === "city" ? "culture" : x))
    .filter(Boolean) as AfishaCategory[];
}

function IconShare({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

function buildBrowserShareUrl(ev: AfishaEvent) {
  const u = new URL(`${window.location.origin}${window.location.pathname}`);
  u.searchParams.set("screen", "afisha");
  u.searchParams.set("event", ev.id);
  return u.toString();
}

export default function AfishaTab({
  registerBack,
  focusEventId,
  onFocusHandled,
  lang = "ru",
}: {
  registerBack?: (fn: () => boolean) => void;
  focusEventId?: string;
  onFocusHandled?: (id: string) => void;
  lang?: Lang;
}) {
  const tg = getTg();
  const isEn = lang === "en";
  const CATS = CAT_LABELS[lang];
  const DATE_PRESETS = DATE_PRESET_LABELS[lang];
  const initData = tg?.initData || "";

  // Selected categories for filtering (multi-select). Empty array = show all categories.
  const [cats, setCats] = useState<AfishaCategory[]>([]);

  // Applied date filter
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Bottom sheet (date / categories)
  const [sheet, setSheet] = useState<null | "date" | "cats">(null);
  const sheetOpen = sheet !== null;

  const [draftPreset, setDraftPreset] = useState<DatePreset>("any");
  const [draftFrom, setDraftFrom] = useState<string>("");
  const [draftTo, setDraftTo] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(false);
  const [events, setEvents] = useState<AfishaEvent[]>([]);
  const [err, setErr] = useState<string>("");
  const [flashId, setFlashId] = useState<string>("");
  const [readyImageUrls, setReadyImageUrls] = useState<Record<string, true>>({});

  // Bottom sheet refs
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const flashTimerRef = useRef<number | null>(null);

  // When a sheet is open, hard-lock the scroll container.
  // In Telegram Android WebView, drag gestures can otherwise "pull" the whole app (rubber-band)
  // and show a bottom gap.
  useEffect(() => {
    const html = document.documentElement;
    const sc = document.getElementById("root") as HTMLElement | null;

    if (!sheetOpen) {
      try {
        html.classList.remove("mx-sheet-open");
      } catch {}
      if (sc) {
        sc.style.overflow = "";
        sc.style.touchAction = "";
      }
      return;
    }

    try {
      html.classList.add("mx-sheet-open");
    } catch {}

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
    const onTouchMove = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".mx-sheetList")) return;
      e.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchmove", onTouchMove as any);
      try {
        html.classList.remove("mx-sheet-open");
      } catch {}
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
    if (!sheetOpen) return;
    const el = listRef.current;
    if (!el) return;

    let startY = 0;
    let startX = 0;

    const onStart = (e: TouchEvent) => {
      const t = e.touches?.[0];
      if (!t) return;
      startY = t.clientY;
      startX = t.clientX;
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches?.[0];
      if (!t) return;

      const dy = t.clientY - startY;
      const dx = t.clientX - startX;

      // Don't interfere with horizontal gestures.
      if (Math.abs(dx) > Math.abs(dy)) return;

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

    el.addEventListener("touchstart", onStart, { passive: true } as any);
    el.addEventListener("touchmove", onMove, { passive: false } as any);
    return () => {
      el.removeEventListener("touchstart", onStart as any);
      el.removeEventListener("touchmove", onMove as any);
    };
  }, [sheetOpen, sheet]);

  // Let App.tsx override the top header back button: close an open sheet.
  useEffect(() => {
    if (!registerBack) return;
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
  const ptrRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const canStartDrag = (target: HTMLElement) => {
    if (target.closest("input,select,textarea")) return false;
    // IMPORTANT: dragging the sheet from inside the list/grid causes a visual "lift" (gap at the bottom)
    // in Telegram Android WebView. Restrict swipe-to-close to the handle/top area only.
    if (target.closest(".mx-sheetList")) return false;
    if (target.closest(".mx-sheetHandle")) return true;
    if (target.closest(".mx-sheetTitle")) return true;
    // Allow dragging from the top padding area of the sheet.
    return !!target.closest(".mx-sheet");
  };

  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (!sheetOpen) return;
    if (e.pointerType === "mouse" && (e as any).button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (!t || !canStartDrag(t)) return;

    // Prevent the gesture from scrolling the page (Telegram WebView sometimes scrolls anyway).
    try {
      e.preventDefault();
    } catch {}

    ptrRef.current = e.pointerId;
    startYRef.current = e.clientY;
    dragYRef.current = 0;
    setDragY(0);
    setDragging(true);
    try {
      (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
    } catch {}
  };

  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (ptrRef.current !== e.pointerId) return;
    const dy = e.clientY - startYRef.current;
    // Only allow dragging DOWN to close. Swiping up should never move the sheet.
    const next = dy > 0 ? dy : 0;
    dragYRef.current = next;
    setDragY(next);

    if (Math.abs(next) > 6) {
      try {
        e.preventDefault();
      } catch {}
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (ptrRef.current !== e.pointerId) return;
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
  const touchIdRef = useRef<number | null>(null);
  const onSheetTouchStart = (e: React.TouchEvent) => {
    if (!sheetOpen) return;
    const t = e.target as HTMLElement | null;
    if (!t || !canStartDrag(t)) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    touchIdRef.current = touch.identifier;
    startYRef.current = touch.clientY;
    dragYRef.current = 0;
    setDragY(0);
    setDragging(true);
  };
  const onSheetTouchMove = (e: React.TouchEvent) => {
    if (touchIdRef.current == null) return;
    const touch = Array.from(e.touches).find((x) => x.identifier === touchIdRef.current) || e.touches?.[0];
    if (!touch) return;
    const dy = touch.clientY - startYRef.current;
    // Only allow dragging DOWN to close. Swiping up should never move the sheet.
    const next = dy > 0 ? dy : 0;
    dragYRef.current = next;
    setDragY(next);
    if (Math.abs(next) > 6) e.preventDefault();
  };
  const onSheetTouchEnd = () => {
    if (touchIdRef.current == null) return;
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
    if (!sheetOpen) return;
    // open a sheet with current values
    setDraftPreset(datePreset);
    setDraftFrom(from);
    setDraftTo(to);
  }, [sheetOpen, datePreset, from, to]);

  const appliedLabel = useMemo(() => filterLabel(datePreset, from, to, lang), [datePreset, from, to, lang]);

  const catsLabel = useMemo(() => {
    if (!cats || cats.length === 0) return isEn ? "All" : "Все";
    if (cats.length === 1) return CATS.find((x) => x.key === cats[0])?.label || (isEn ? "Category" : "Категория");
    const names = cats
      .slice(0, 2)
      .map((k) => CATS.find((x) => x.key === k)?.label)
      .filter(Boolean);
    return names.length ? `${names.join(", ")}${cats.length > 2 ? ` +${cats.length - 2}` : ""}` : `${isEn ? "Categories" : "Категории"}: ${cats.length}`;
  }, [cats, CATS, isEn]);

  // Always show the list of events. Filters (date/categories) just narrow it down.
  const params = useMemo(() => {
    return { from: from || undefined, to: to || undefined };
  }, [from, to]);

  useEffect(() => {
    if (!focusEventId) return;
    setCats([]);
    setDatePreset("any");
    setFrom("");
    setTo("");
  }, [focusEventId]);

  const filteredEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
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
    const groups: Array<{ date: string; items: AfishaEvent[] }> = [];
    for (const ev of filteredEvents) {
      const date = String(ev?.date || '');
      const last = groups[groups.length - 1];
      if (!last || last.date !== date) groups.push({ date, items: [ev] });
      else last.items.push(ev);
    }
    return groups;
  }, [filteredEvents]);

  const preloadImageUrls = useMemo(
    () =>
      filteredEvents
        .slice(0, 8)
        .map((ev) => String(ev?.previewImageUrl || ev?.imageUrl || "").trim())
        .filter(Boolean),
    [filteredEvents],
  );

  function markImageReady(url: string) {
    const key = String(url || "").trim();
    if (!key) return;
    setReadyImageUrls((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }

  useEffect(() => {
    const pending = preloadImageUrls.filter((url) => !readyImageUrls[url]);
    if (!pending.length) return;

    const imgs: HTMLImageElement[] = [];
    pending.forEach((url) => {
      const img = new Image();
      img.decoding = "async";
      img.loading = "eager";
      img.onload = () => markImageReady(url);
      img.onerror = () => markImageReady(url);
      img.src = url;
      imgs.push(img);
    });

    return () => {
      imgs.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [preloadImageUrls, readyImageUrls]);

  useEffect(() => {
    if (!focusEventId || loading) return;
    const target = filteredEvents.find((x) => String(x.id) === String(focusEventId));
    if (!target) return;
    const el = cardRefs.current[target.id];
    if (!el) return;

    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashId(target.id);
        if (flashTimerRef.current != null) window.clearTimeout(flashTimerRef.current);
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
        if (!alive) return;
        if (!r?.ok) {
          setEvents([]);
          setErr(String((r as any)?.error || (isEn ? "Error" : "Ошибка")));
        } else {
          const arr = Array.isArray((r as any)?.events) ? ((r as any).events as AfishaEvent[]) : [];
          setEvents(arr);
        }
      } catch {
        if (!alive) return;
        setEvents([]);
        setErr(isEn ? "Loading error" : "Ошибка загрузки");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params, isEn]);

  async function onClick(ev: AfishaEvent, kind: "details" | "location") {
    try {
      if (initData) await apiAfishaClick(initData, ev.id, kind);
    } catch {}
    openLink(kind === "details" ? ev.detailsUrl : ev.locationUrl);
  }

  function onShare(ev: AfishaEvent) {
    const targetUrl = String(ev.shareUrl || "").trim() || buildBrowserShareUrl(ev);
    const shareText = `${ev.title}
${fmtDate(ev.date, lang)}`;
    const shareTextWithLink = `${shareText}
${targetUrl}`;
    const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(targetUrl)}&text=${encodeURIComponent(shareText)}`;
    const tg = getTg();
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(tgShareUrl);
      return;
    }
    if ((navigator as any)?.share) {
      void (navigator as any).share({ title: ev.title, text: shareTextWithLink }).catch(() => {});
      return;
    }
    openLink(tgShareUrl);
  }

  return (
    <div className="mx-afisha">
      {/* Filters row (always on categories page) */}
      <div className="mx-filterRow">
        <button type="button" className="mx-filterBtn" onClick={() => setSheet("date")}>
          <div className="mx-filterBtnLeft">
            <div className="mx-filterBtnHint">{isEn ? "Date" : "Дата"}</div>
            <div className="mx-filterBtnVal">{appliedLabel}</div>
          </div>
          <div className="mx-filterBtnChev">▾</div>
        </button>

        <button type="button" className="mx-filterBtn" onClick={() => setSheet("cats")}>
          <div className="mx-filterBtnLeft">
            <div className="mx-filterBtnHint">{isEn ? "Categories" : "Категории"}</div>
            <div className="mx-filterBtnVal">{catsLabel}</div>
          </div>
          <div className="mx-filterBtnChev">▾</div>
        </button>
      </div>

      {/* Events list (always visible). Filters narrow it down. */}
      {loading ? <div className="mx-muted">{isEn ? "Loading…" : "Загрузка…"}</div> : null}
      {!loading && err ? <div className="mx-muted">{err}</div> : null}
      {!loading && !err && filteredEvents.length === 0 ? <div className="mx-muted">{isEn ? "No events yet." : "Пока нет мероприятий."}</div> : null}

      <div className="mx-list">
        {groupedEvents.map((group) => (
            <div key={group.date} className="mx-afGroup">
            <div className="mx-afGroupDate">{fmtDate(group.date, lang)}</div>
            {group.items.map((ev) => {
              const timeLabel = fmtTime((ev as any)?.time);
              const imageUrl = String(ev.previewImageUrl || ev.imageUrl || "").trim();
              const imageReady = imageUrl ? !!readyImageUrls[imageUrl] : false;
              return (
                <div
                  key={ev.id}
                  ref={(node) => {
                    cardRefs.current[ev.id] = node;
                  }}
                  className={"mx-afEvCard" + (imageUrl ? " has-img" : "") + (imageReady ? " is-img-ready" : " is-img-loading") + (flashId === ev.id ? " is-flash" : "")}
                >
                  {imageUrl ? (
                    <>
                      <img
                        className={"mx-afEvBg" + (imageReady ? " is-ready" : "")}
                        src={imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        aria-hidden="true"
                        onLoad={() => markImageReady(imageUrl)}
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                          markImageReady(imageUrl);
                        }}
                      />
                      {!imageReady ? <div className="mx-afEvSkeleton" aria-hidden="true" /> : null}
                    </>
                  ) : null}
                  <div className="mx-afEvBody">
                    <div className="mx-afTitle">{ev.title}</div>
                    {ev.comment ? <div className="mx-afComment">{ev.comment}</div> : null}
                    <div className="mx-afMeta">{timeLabel ? `${fmtDate(ev.date, lang)} • ${timeLabel}` : fmtDate(ev.date, lang)}</div>

                    <div className="mx-btnRow mx-afBtnRow" style={{ marginTop: 10 }}>
                      <button type="button" className="mx-btn mx-afLinkBtn mx-afActionBtn" onClick={() => onClick(ev, "details")} style={{ opacity: 0.8 }}>
                        {isEn ? "Details" : "Подробнее"}
                      </button>
                      <button type="button" className="mx-btn mx-btnPrimary mx-afLinkBtn mx-afActionBtn" onClick={() => onClick(ev, "location")} style={{ opacity: 0.8 }}>
                        {isEn ? "Location" : "Локация"}
                      </button>
                      <button type="button" className="mx-btn mx-afShareBtn" onClick={() => onShare(ev)} aria-label={isEn ? "Share event" : "Поделиться мероприятием"}>
                        <IconShare className="mx-i" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Bottom sheets */}
      {sheetOpen ? (
        <div className="mx-sheetOverlay" onClick={() => setSheet(null)} role="dialog">
          <div
            ref={sheetRef}
            className={"mx-sheet" + (sheet === "cats" ? " mx-sheet--cats" : "") + (dragging ? " is-dragging" : "")}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
            onTouchCancel={onSheetTouchEnd}
            style={{
              // No negative translate: this was creating a visible bottom gap when swiping up.
              transform: `translateY(${Math.max(0, dragY)}px)`,
              transition: dragging ? "none" : undefined,
            }}
          >
            <div className="mx-sheetHandle" />

            {sheet === "date" ? (
              <>
                <div className="mx-sheetTitle">{isEn ? "Select period" : "Выберите период"}</div>
                <div ref={listRef} className="mx-sheetList">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      className={"mx-sheetItem " + (draftPreset === p.key ? "on" : "")}
                      onClick={() => setDraftPreset(p.key)}
                    >
                      <span className="mx-sheetItemText">{p.label}</span>
                      {draftPreset === p.key ? <span className="mx-sheetCheck">✓</span> : <span />}
                    </button>
                  ))}
                </div>

                {draftPreset === "custom" ? (
                  <div className="mx-sheetCustom">
                    <div className="mx-customRow">
                      <div className="mx-customLbl">{isEn ? "From" : "С"}</div>
                      <input className="mx-dateInput" type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} />
                    </div>
                    <div className="mx-customRow">
                      <div className="mx-customLbl">{isEn ? "To" : "По"}</div>
                      <input className="mx-dateInput" type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} />
                    </div>
                  </div>
                ) : null}

                <div className="mx-sheetFooter">
                  <button
                    type="button"
                    className="mx-sheetBtn"
                    onClick={() => {
                      const p = draftPreset;
                      setDatePreset(p);
                      if (p === "custom") {
                        setFrom(draftFrom);
                        setTo(draftTo);
                      } else {
                        const r = presetRange(p);
                        setFrom(r.from);
                        setTo(r.to);
                      }
                      setSheet(null);
                    }}
                  >
                    {isEn ? "Show results" : "Показать результаты"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-sheetTitle">{isEn ? "Categories" : "Категории"}</div>
                <div ref={listRef} className="mx-sheetList mx-sheetList--cats">
                  <div className="mx-afCats mx-afCats--sheet">
                    <button
                      type="button"
                      className={"mx-afCatBtn mx-afCat--all" + (cats.length === 0 ? " is-on" : "")}
                      onClick={() => setCats([])}
                    >
                      <div>
                        <div className="mx-afCatLabel">{isEn ? "All categories" : "Все категории"}</div>
                      </div>
                    </button>

                    {CATS.map((c) => {
                      const on = cats.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          className={"mx-afCatBtn mx-afCat--" + c.key + (on ? " is-on" : "")}
                          onClick={() => {
                            setCats((prev) => {
                              const has = prev.includes(c.key);
                              return has ? prev.filter((x) => x !== c.key) : [...prev, c.key];
                            });
                          }}
                        >
                          <div>
                            <div className="mx-afCatLabel">{c.label}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="mx-sheetFooter">
                  <button type="button" className="mx-sheetBtn" onClick={() => setSheet(null)}>
                    {isEn ? "Done" : "Готово"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
