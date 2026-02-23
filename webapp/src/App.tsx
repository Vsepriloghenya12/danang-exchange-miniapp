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
  const [active, setActive] = useState<TabKey>("rates");
  const [hsStatus, setHsStatus] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const tabs: TabKey[] = ["rates", "calc", "atm", "guide", "reviews"];
  const activeIndex = Math.max(0, tabs.indexOf(active));

  // Prevent double-swipes triggering multiple tab changes quickly
  const swipeLockRef = useRef(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const isDemo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);

  // ---------- AUTH ----------
  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

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

  // ---------- Homescreen shortcut ----------
  useEffect(() => {
    if (!tg || isDemo) return;
    if (!tg.checkHomeScreenStatus) return;

    const onChecked = (e: any) => {
      if (e?.status) setHsStatus(String(e.status));
    };
    const onAdded = () => setHsStatus("added");

    tg.onEvent?.("homeScreenChecked", onChecked);
    tg.onEvent?.("homeScreenAdded", onAdded);

    try {
      tg.checkHomeScreenStatus?.((status) => setHsStatus(String(status)));
    } catch {}

    return () => {
      tg.offEvent?.("homeScreenChecked", onChecked);
      tg.offEvent?.("homeScreenAdded", onAdded);
    };
  }, [tg, isDemo]);

  // ---------- Keyboard detection (hide bar in CSS) ----------
  const vvBaseHeightRef = useRef<number>(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 0
  );

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

    const onResize = () => update();
    const onFocusIn = () => update();
    const onFocusOut = () => window.setTimeout(update, 60);

    vv.addEventListener("resize", onResize);
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);
    update();

    return () => {
      vv.removeEventListener("resize", onResize);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  // ---------- Background loader ----------
  // Put your background here: webapp/public/brand/danang-bg.(svg|jpg|png|webp)
  const bgCandidates = useMemo(() => {
    const v = String(Date.now());
    const baseRaw = (import.meta as any)?.env?.BASE_URL || "/";
    const base = String(baseRaw).endsWith("/") ? String(baseRaw) : String(baseRaw) + "/";
    const rel = (p: string) => `${base}${p}?v=${v}`;
    const abs = (p: string) => `/${p}?v=${v}`;
    const exts = ["svg", "jpg", "png", "webp"];
    return [...exts.map((ext) => rel(`brand/danang-bg.${ext}`)), ...exts.map((ext) => abs(`brand/danang-bg.${ext}`))];
  }, []);

  const [bgSrc, setBgSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const src of bgCandidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        });
        if (cancelled) return;
        if (ok) {
          setBgSrc(src);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bgCandidates]);

  // ---------- Logo loader ----------
  const logoCandidates = useMemo(() => {
    const v = String(Date.now());
    const rel = (p: string) => `${p}?v=${v}`;
    const abs = (p: string) => `/${p}?v=${v}`;
    const bundled = new URL("./brand/logo.png", import.meta.url).toString();
    return [
      rel("brand/logo.svg"),
      rel("brand/logo.png"),
      rel("brand/logo.jpg"),
      rel("brand/logo.jpeg"),
      rel("brand/logo.webp"),
      abs("brand/logo.svg"),
      abs("brand/logo.png"),
      abs("brand/logo.jpg"),
      abs("brand/logo.jpeg"),
      abs("brand/logo.webp"),
      bundled,
    ];
  }, []);

  const [logoIdx, setLogoIdx] = useState(0);
  const [logoOk, setLogoOk] = useState(false);
  const logoSrc = logoCandidates[Math.min(logoIdx, logoCandidates.length - 1)];

  // ---------- Tabs (keep mounted => no flashing) ----------
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

  const goToIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(tabs.length - 1, idx));
    setActive(tabs[clamped]);
  };

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (keyboardOpen) return;
    if (swipeLockRef.current) return;

    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (target?.closest?.(".vx-bottomWrap")) return;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const t = e.touches?.[0];
    if (!t) return;
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!s) return;
    if (keyboardOpen) return;
    if (swipeLockRef.current) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".vx-bottomWrap")) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    if (Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.3) return;

    swipeLockRef.current = true;

    if (dx < 0) goToIndex(activeIndex + 1);
    else goToIndex(activeIndex - 1);

    window.setTimeout(() => {
      swipeLockRef.current = false;
    }, 280);
  };

  const trackStyle: React.CSSProperties = useMemo(
    () => ({
      width: `${tabs.length * 100}%`,
      transform: `translate3d(${-activeIndex * 100}%,0,0)`,
    }),
    [activeIndex]
  );

  return (
    <div className={"vx-page" + (keyboardOpen ? " vx-kbOpen" : "")}> 
      <style>{`@import url('${UI.fontImport}');`}</style>

      {/* Background (under all UI) */}
      <div
        className="vx-bg"
        aria-hidden="true"
        style={{ ["--bg-url" as any]: bgSrc ? `url(\"${bgSrc}\")` : "none" } as React.CSSProperties}
      />

      <div className="container" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="card vx-topCard">
          <div className="vx-topRow">
            <div className="vx-logo" aria-label="Лого">
              {!logoOk ? <span className="vx-logoFallback">DX</span> : null}
              <img
                className="vx-logoImg"
                src={logoSrc}
                alt=""
                onLoad={() => setLogoOk(true)}
                onError={() => {
                  setLogoOk(false);
                  setLogoIdx((i) => (i < logoCandidates.length - 1 ? i + 1 : i));
                }}
              />
            </div>

            <div className="vx-topText">
              <div className="vx-title">{UI.title}</div>
              <div className="vx-topSub">
                {me.ok && me.user
                  ? `Вы: ${me.user.first_name ?? ""} ${me.user.username ? "(@" + me.user.username + ")" : ""} • статус: ${me.status}`
                  : me.error ?? "Авторизация..."}
              </div>
            </div>
          </div>

          {tg?.addToHomeScreen && tg?.checkHomeScreenStatus && hsStatus !== "unsupported" ? (
            <div className="vx-installRow">
              {hsStatus === "added" ? (
                <div className="small">Установлено на телефон ✅</div>
              ) : (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    try {
                      tg.addToHomeScreen?.();
                    } catch {
                      tg.showAlert?.("Не получилось установить. Попробуй обновить Telegram.");
                    }
                  }}
                >
                  Установить на телефон
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Slider (tabs do NOT remount => no flashing) */}
        <div className="vx-pagesWrap">
          <div className="vx-pagesTrack" style={trackStyle}>
            {tabs.map((k) => (
              <div key={k} className={"vx-pagePane" + (k === active ? " vx-pageActive" : "")}> 
                <div className="vx-card2">{pages[k]}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <BottomBar active={active} onChange={setActive} items={bottomTabs} />
    </div>
  );
}
