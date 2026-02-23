import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth } from "./lib/api";
import type { UserStatus } from "./lib/types";

import RatesTab from "./tabs/RatesTab";
import CalculatorTab from "./tabs/CalculatorTab";
import AtmTab from "./tabs/AtmTab";
import GuideTab from "./tabs/GuideTab";
import ReviewsTab from "./tabs/ReviewsTab";

type Me = {
  ok: boolean;
  initData: string;
  user?: { id: number; username?: string; first_name?: string; last_name?: string };
  status?: UserStatus;
  isOwner?: boolean;
  error?: string;
};

type TabKey = "rates" | "calc" | "atm" | "guide" | "reviews";

const UI = {
  title: "Обмен валют — Дананг",
  fontImport:
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap",
};

function IconSwap({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H7a4 4 0 0 0-4 4v0" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h13a4 4 0 0 0 4-4v0" />
    </svg>
  );
}
function IconCalc({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 11h2" />
      <path d="M12 11h2" />
      <path d="M16 11h0" />
      <path d="M8 15h2" />
      <path d="M12 15h2" />
      <path d="M8 19h8" />
    </svg>
  );
}
function IconAtm({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10h18" />
      <path d="M5 10V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
      <path d="M7 10v10" />
      <path d="M12 10v10" />
      <path d="M17 10v10" />
      <path d="M5 20h14" />
    </svg>
  );
}
function IconGuide({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h7a2 2 0 0 1 2 2v13H5a2 2 0 0 1-2-2V6z" />
      <path d="M21 6h-7a2 2 0 0 0-2 2" />
      <path d="M21 6v13a2 2 0 0 1-2 2h-7" />
    </svg>
  );
}
function IconStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l3 7 7 .6-5.3 4.6 1.7 6.8L12 18l-6.4 3 1.7-6.8L2 9.6 9 9l3-7z" />
    </svg>
  );
}

function BottomBar({
  active,
  onChange,
  items,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  items: Array<{ key: TabKey; label: string; show: boolean; icon: React.ReactNode }>;
}) {
  const visible = items.filter((i) => i.show);
  return (
    <div className="vx-bottomWrap">
      <div className="vx-bottomBar" style={{ ["--cols" as any]: String(visible.length) }}>
        {visible.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={"vx-navBtn " + (isActive ? "vx-navBtnActive" : "")}
            >
              {isActive ? <div className="vx-navPill" /> : null}
              <span className="vx-navIcon">{t.icon}</span>
              <span className="vx-navLabel">{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const tg = getTg();
  const [me, setMe] = useState<Me>({ ok: false, initData: "" });

  const tabs: TabKey[] = ["rates", "calc", "atm", "guide", "reviews"];
  const [active, setActive] = useState<TabKey>("rates");
  const activeIndex = tabs.indexOf(active);

  // чтобы не “поднимался” бар при клавиатуре
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const vvBaseHeightRef = useRef<number>(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 0
  );

  // slider drag state
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{ down: boolean; dx: number; w: number }>({ down: false, dx: 0, w: 1 });

  const isDemo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);

  // auth
  useEffect(() => {
    tg?.ready();
    tg?.expand();

    const initData = tg?.initData || "";
    if (!initData && !isDemo) {
      setMe({ ok: false, initData: "", error: "Нет initData. Открой мини-приложение из Telegram." });
      return;
    }

    const fakeInit = "demo";
    const useInit = isDemo ? fakeInit : initData;

    (async () => {
      if (isDemo) {
        setMe({
          ok: true,
          initData: useInit,
          user: { id: 123456, username: "demo_user", first_name: "Demo" },
          status: "gold",
          isOwner: true,
        });
        return;
      }

      const r = await apiAuth(useInit);
      if (r.ok) setMe({ ok: true, initData: useInit, user: r.user, status: r.status, isOwner: r.isOwner });
      else setMe({ ok: false, initData: useInit, error: r.error });
    })();
  }, [tg, isDemo]);

  // keyboard detection (hide bottom bar while typing)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const isFieldFocused = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      return el.getAttribute?.("contenteditable") === "true";
    };

    const update = () => {
      const focused = isFieldFocused();
      if (!focused) {
        vvBaseHeightRef.current = vv.height;
        setKeyboardOpen(false);
        return;
      }
      const base = vvBaseHeightRef.current || vv.height;
      setKeyboardOpen(vv.height < base - 120);
    };

    vv.addEventListener("resize", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", () => setTimeout(update, 60));
    update();

    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", () => setTimeout(update, 60));
    };
  }, []);

  const bottomTabs = useMemo(
    () => [
      { key: "rates" as const, label: "Курс", show: true, icon: <IconSwap className="vx-i" /> },
      { key: "calc" as const, label: "Калькулятор", show: true, icon: <IconCalc className="vx-i" /> },
      { key: "atm" as const, label: "Банкоматы", show: true, icon: <IconAtm className="vx-i" /> },
      { key: "guide" as const, label: "Гид", show: true, icon: <IconGuide className="vx-i" /> },
      { key: "reviews" as const, label: "Отзывы", show: true, icon: <IconStar className="vx-i" /> },
    ],
    []
  );

  // keep tabs mounted (no remount => no “flash”)
  const pages = useMemo(
    () => ({
      rates: <RatesTab />,
      calc: <CalculatorTab me={me} />,
      atm: <AtmTab />,
      guide: <GuideTab />,
      reviews: <ReviewsTab />,
    }),
    [me]
  );

  const setTabSafe = (k: TabKey) => setActive(k);

  const beginDrag = (clientX: number) => {
    if (keyboardOpen) return;
    if (!wrapRef.current) return;
    const w = Math.max(1, wrapRef.current.getBoundingClientRect().width);
    setDrag({ down: true, dx: 0, w });
    (wrapRef.current as any).dataset.dragging = "1";
    (wrapRef.current as any).style.userSelect = "none";
  };

  const moveDrag = (clientX: number, startX: number) => {
    setDrag((d) => {
      if (!d.down) return d;
      return { ...d, dx: clientX - startX };
    });
  };

  const endDrag = () => {
    if (!drag.down) return;
    const threshold = drag.w * 0.22;
    let nextIndex = activeIndex;

    if (drag.dx < -threshold) nextIndex = Math.min(tabs.length - 1, activeIndex + 1);
    if (drag.dx > threshold) nextIndex = Math.max(0, activeIndex - 1);

    setDrag({ down: false, dx: 0, w: drag.w });
    if (wrapRef.current) (wrapRef.current as any).dataset.dragging = "0";
    if (nextIndex !== activeIndex) setActive(tabs[nextIndex]);
  };

  // touch swipe
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartXRef = useRef<number>(0);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (target?.closest?.(".vx-bottomWrap")) return;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const t = e.touches?.[0];
    if (!t) return;
    startRef.current = { x: t.clientX, y: t.clientY };
    dragStartXRef.current = t.clientX;
    beginDrag(t.clientX);
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const t = e.touches?.[0];
    if (!t) return;

    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    // если это вертикальный скролл — не трогаем
    if (Math.abs(dy) > Math.abs(dx) * 1.15) return;

    // горизонтальный — двигаем трек
    e.preventDefault();
    moveDrag(t.clientX, dragStartXRef.current);
  };

  const onTouchEnd = () => {
    startRef.current = null;
    endDrag();
  };

  // transform: base + drag
  const dragPercent = drag.down ? (drag.dx / drag.w) * 100 : 0;
  const trackX = -activeIndex * 100 + dragPercent;

  return (
    <div className={"vx-page" + (keyboardOpen ? " vx-kbOpen" : "")}>
      <style>{`@import url('${UI.fontImport}');`}</style>

      <div className="container">
        <div className="card vx-topCard">
          <div className="vx-title">{UI.title}</div>
          <div className="vx-topSub">
            {me.ok && me.user
              ? `Вы: ${me.user.first_name ?? ""} ${me.user.username ? "(@" + me.user.username + ")" : ""} • статус: ${me.status}`
              : me.error ?? "Авторизация..."}
          </div>
        </div>

        <div
          className="vx-pagesWrap"
          ref={wrapRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="vx-pagesTrack"
            style={{
              transform: `translate3d(${trackX}%,0,0)`,
            }}
          >
            {tabs.map((k) => (
              <div
                key={k}
                className={"vx-pagePane" + (k === active ? " vx-pageActive" : "")}
              >
                <div className="vx-card2">{pages[k]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomBar active={active} onChange={setTabSafe} items={bottomTabs} />
    </div>
  );
}