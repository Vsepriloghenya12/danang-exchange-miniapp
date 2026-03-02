import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiAfishaClick, apiGetAfisha } from "../lib/api";
import type { AfishaCategory, AfishaEvent, AfishaFilterCategory } from "../lib/types";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function openLink(url: string) {
  const tg = getTg();
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

const CATS: Array<{ key: Exclude<AfishaFilterCategory, "all">; label: string; sub?: string }> = [
  { key: "sport", label: "Спорт" },
  { key: "party", label: "Вечеринки" },
  { key: "culture", label: "Культура и искусство" },
  { key: "city", label: "Городские мероприятия" },
  { key: "food", label: "Еда" },
  { key: "music", label: "Музыка" },
];

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

const DATE_PRESETS: Array<{ key: DatePreset; label: string }> = [
  { key: "any", label: "Любая дата" },
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "weekend", label: "На этих выходных" },
  { key: "thisWeek", label: "На этой неделе" },
  { key: "nextWeek", label: "На следующей неделе" },
  { key: "thisMonth", label: "В этом месяце" },
  { key: "custom", label: "Пользовательские настройки временного периода" },
];

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function AfishaTab({
  registerBack,
}: {
  registerBack?: (fn: () => boolean) => void;
}) {
  const tg = getTg();
  const initData = tg?.initData || "";

  type CatKey = Exclude<AfishaFilterCategory, "all">;

  // Category selection screen -> events list screen
  const [view, setView] = useState<"cats" | "list">("cats");

  // Selected categories for filtering on the list screen (multi-select).
  // Empty array = "all categories".
  const [cats, setCats] = useState<AfishaCategory[]>([]);

  // Applied filter (used in queries)
  const [datePreset, setDatePreset] = useState<DatePreset>("any");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  // Bottom sheet (date / categories)
  const [sheet, setSheet] = useState<null | "date" | "cats">(null);
  const sheetOpen = sheet !== null;
  const [draftPreset, setDraftPreset] = useState<DatePreset>("any");
  const [draftFrom, setDraftFrom] = useState<string>("");
  const [draftTo, setDraftTo] = useState<string>("");

  const [draftCats, setDraftCats] = useState<AfishaCategory[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [events, setEvents] = useState<AfishaEvent[]>([]);
  const [err, setErr] = useState<string>("");

  // Hide the fixed bottom menu while any sheet is open (prevents overlap with the footer button)
  useEffect(() => {
    try {
      const el = document.documentElement;
      if (sheetOpen) el.classList.add("mx-sheet-open");
      else el.classList.remove("mx-sheet-open");
      return () => el.classList.remove("mx-sheet-open");
    } catch {
      return;
    }
  }, [sheetOpen]);

  // Let App.tsx override the top header back button:
  // 1) close an open sheet, 2) go back from list -> categories.
  useEffect(() => {
    if (!registerBack) return;
    registerBack(() => {
      if (sheetOpen) {
        setSheet(null);
        return true;
      }
      if (view === "list") {
        setView("cats");
        return true;
      }
      return false;
    });
  }, [registerBack, sheetOpen, view]);

  // Swipe-to-close for the bottom sheet
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragYRef = useRef(0);
  const startYRef = useRef(0);
  const ptrRef = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);

  const canStartDrag = (target: HTMLElement) => {
    // Avoid interfering with inputs
    if (target.closest("input,select,textarea")) return false;
    // If gesture starts on the list while it is scrolled, allow scrolling instead of dragging
    if (target.closest(".mx-sheetList")) {
      const ls = listRef.current;
      if (ls && ls.scrollTop > 0) return false;
    }
    return true;
  };

  const onSheetPointerDown = (e: React.PointerEvent) => {
    if (!sheetOpen) return;
    if (e.pointerType === "mouse" && (e as any).button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (!t || !canStartDrag(t)) return;

    ptrRef.current = e.pointerId;
    startYRef.current = e.clientY;
    dragYRef.current = 0;
    setDragY(0);
    setDragging(true);
    try {
      (e.currentTarget as any)?.setPointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onSheetPointerMove = (e: React.PointerEvent) => {
    if (ptrRef.current !== e.pointerId) return;
    const dy = e.clientY - startYRef.current;
    // Resist upward drag
    const next = dy < 0 ? dy * 0.25 : dy;
    dragYRef.current = next;
    setDragY(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (ptrRef.current !== e.pointerId) return;
    ptrRef.current = null;
    setDragging(false);

    const dy = dragYRef.current;
    dragYRef.current = 0;
    // Close if pulled down enough; otherwise snap back
    if (dy > 120) {
      setSheetOpen(false);
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
    const next = dy < 0 ? dy * 0.25 : dy;
    dragYRef.current = next;
    setDragY(next);
    // Prevent page scroll while dragging the sheet
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
    setDraftCats(cats);
  }, [sheetOpen, datePreset, from, to, cats]);

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

  function filterLabel(p: DatePreset, f: string, t: string) {
    const presetLabel = DATE_PRESETS.find((x) => x.key === p)?.label || "";
    if (p !== "custom") return presetLabel;
    if (!f && !t) return presetLabel;
    if (f && t) return `${presetLabel}: ${fmtDate(f)} — ${fmtDate(t)}`;
    if (f) return `${presetLabel}: c ${fmtDate(f)}`;
    return `${presetLabel}: по ${fmtDate(t)}`;
  }

  const appliedLabel = useMemo(() => filterLabel(datePreset, from, to), [datePreset, from, to]);

  const catsLabel = useMemo(() => {
    if (!cats || cats.length === 0) return "Все категории";
    if (cats.length === 1) return CATS.find((x) => x.key === cats[0])?.label || "Категория";
    return `Категории: ${cats.length}`;
  }, [cats]);

  const params = useMemo(() => {
    // load events only when a category is selected and the list screen is open
    if (view !== "list") return null;
    // We always load all categories for the selected date range and filter client-side (supports multi-select).
    return { from: from || undefined, to: to || undefined };
  }, [from, to, view]);

  const filteredEvents = useMemo(() => {
    if (!events || events.length === 0) return [];
    if (!cats || cats.length === 0) return events;
    const set = new Set(cats);
    return events.filter((e) => set.has(e.category));
  }, [events, cats]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!params) {
        setLoading(false);
        setEvents([]);
        setErr("");
        return;
      }

      setLoading(true);
      setErr("");
      try {
        const r = await apiGetAfisha(params);
        if (!alive) return;
        if (!r?.ok) {
          setEvents([]);
          setErr(String((r as any)?.error || "Ошибка"));
        } else {
          setEvents(Array.isArray((r as any)?.events) ? ((r as any).events as AfishaEvent[]) : []);
        }
      } catch {
        if (!alive) return;
        setEvents([]);
        setErr("Ошибка загрузки");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [params]);

  async function onClick(ev: AfishaEvent, kind: "details" | "location") {
    try {
      if (initData) await apiAfishaClick(initData, ev.id, kind);
    } catch {
      // ignore
    }
    openLink(kind === "details" ? ev.detailsUrl : ev.locationUrl);
  }

  return (
    <div className="mx-afisha">
      {view === "list" ? (
        <div className="mx-filterRow">
          <button type="button" className="mx-filterBtn" onClick={() => setSheet("date")}>
            <div className="mx-filterBtnLeft">
              <div className="mx-filterBtnHint">Дата</div>
              <div className="mx-filterBtnVal">{appliedLabel}</div>
            </div>
            <div className="mx-filterBtnChev">▾</div>
          </button>
          <button type="button" className="mx-filterBtn" onClick={() => setSheet("cats")}> 
            <div className="mx-filterBtnLeft">
              <div className="mx-filterBtnHint">Категории</div>
              <div className="mx-filterBtnVal">{catsLabel}</div>
            </div>
            <div className="mx-filterBtnChev">▾</div>
          </button>
        </div>
      ) : null}

      {sheetOpen ? (
        <div
          className="mx-sheetOverlay"
          onClick={() => setSheet(null)}
          role="dialog"
          aria-label={sheet === "date" ? "Фильтр даты" : "Фильтр категорий"}
        >
          <div
            ref={sheetRef}
            className={"mx-sheet" + (dragging ? " is-dragging" : "")}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onSheetPointerDown}
            onPointerMove={onSheetPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onTouchStart={onSheetTouchStart}
            onTouchMove={onSheetTouchMove}
            onTouchEnd={onSheetTouchEnd}
            style={{
              transform: `translateY(${Math.max(-24, dragY)}px)`,
              transition: dragging ? "none" : undefined,
            }}
          >
            <div className="mx-sheetHandle" />

            {sheet === "date" ? (
              <>
                <div className="mx-sheetTitle">Выберите период</div>
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
                      <div className="mx-customLbl">С</div>
                      <input
                        className="mx-dateInput"
                        type="date"
                        value={draftFrom}
                        onChange={(e) => setDraftFrom(e.target.value)}
                      />
                    </div>
                    <div className="mx-customRow">
                      <div className="mx-customLbl">По</div>
                      <input
                        className="mx-dateInput"
                        type="date"
                        value={draftTo}
                        onChange={(e) => setDraftTo(e.target.value)}
                      />
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
                    Показать результаты
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-sheetTitle">Выберите категории</div>
                <div ref={listRef} className="mx-sheetList">
                  {CATS.map((c) => {
                    const on = draftCats.includes(c.key);
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={"mx-sheetItem " + (on ? "on" : "")}
                        onClick={() => {
                          setDraftCats((prev) => {
                            const has = prev.includes(c.key);
                            return has ? prev.filter((x) => x !== c.key) : [...prev, c.key];
                          });
                        }}
                      >
                        <span className="mx-sheetItemText">{c.label}</span>
                        {on ? <span className="mx-sheetCheck">✓</span> : <span />}
                      </button>
                    );
                  })}
                </div>
                <div className="mx-sheetFooter">
                  <button
                    type="button"
                    className="mx-sheetBtn"
                    onClick={() => {
                      setCats(draftCats);
                      setSheet(null);
                    }}
                  >
                    Показать результаты
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {view === "cats" ? (
        <div className="mx-afCats">
          {CATS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={"mx-afCatBtn mx-afCat--" + c.key}
              onClick={() => {
                setCats([c.key as AfishaCategory]);
                setView("list");
              }}
            >
              <div>
                <div className="mx-afCatLabel">{c.label}</div>
                <div className="mx-afCatSub">Открыть мероприятия</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mx-afTop">
            <button
              type="button"
              className="mx-afBack"
              onClick={() => {
                setView("cats");
                setCats([]);
              }}
            >
              ← Категории
            </button>
            <div className="mx-afTopTitle">
              {cats && cats.length === 1 ? CATS.find((x) => x.key === cats[0])?.label || "" : catsLabel}
            </div>
          </div>

          {loading ? <div className="mx-muted">Загрузка…</div> : null}
          {!loading && err ? <div className="mx-muted">{err}</div> : null}
          {!loading && !err && filteredEvents.length === 0 ? <div className="mx-muted">Пока нет мероприятий.</div> : null}

          <div className="mx-list">
            {filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className={"mx-afEvCard" + (ev.imageUrl ? " has-img" : "")}
                style={ev.imageUrl ? ({ backgroundImage: `url(${ev.imageUrl})` } as any) : undefined}
              >
                <div className="mx-afEvBody">
                  <div className="mx-afTitle">{ev.title}</div>
                  {ev.comment ? <div className="mx-afComment">{ev.comment}</div> : null}
                  <div className="mx-afMeta">{fmtDate(ev.date)}</div>

                  <div className="mx-btnRow" style={{ marginTop: 10 }}>
                    <button type="button" className="mx-btn mx-afLinkBtn" onClick={() => onClick(ev, "details")}>
                      Подробнее
                    </button>
                    <button type="button" className="mx-btn mx-btnPrimary mx-afLinkBtn" onClick={() => onClick(ev, "location")}>
                      Локация
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
