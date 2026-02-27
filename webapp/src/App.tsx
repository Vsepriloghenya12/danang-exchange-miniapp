import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth } from "./lib/api";
import type { UserStatus } from "./lib/types";

import RatesTab from "./tabs/RatesTab";
import CalculatorTab from "./tabs/CalculatorTab";
import AtmTab from "./tabs/AtmTab";
import ReviewsTab from "./tabs/ReviewsTab";
import StaffTab from "./tabs/StaffTab";
import OwnerPortal from "./admin/OwnerPortal";

type Me = {
  ok: boolean;
  initData: string;
  user?: { id: number; username?: string; first_name?: string; last_name?: string };
  status?: UserStatus;
  isOwner?: boolean;
  isAdmin?: boolean;
  error?: string;
};

type TabKey = "rates" | "calc" | "atm" | "reviews" | "staff";

type AnimClass = "" | "vx-animInL" | "vx-animInR";

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

function IconStar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 18.7 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" />
    </svg>
  );
}
function IconSettings({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1.2-2-3.4-2.3.8a8 8 0 0 0-5.2-3L11 0h2l.9 2.2a8 8 0 0 0 5.2 3l2.3-.8 2 3.4-2 1.2z" />
    </svg>
  );
}

function BottomBar({
  active,
  onChange,
  items,
  order,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  items: Array<{ key: TabKey; label: string; show: boolean; icon: React.ReactNode }>;
  order: TabKey[];
}) {
  const map = useMemo(() => {
    const m = new Map<TabKey, { key: TabKey; label: string; show: boolean; icon: React.ReactNode }>();
    for (const it of items) m.set(it.key, it);
    return m;
  }, [items]);

  const visibleOrder = useMemo(() => order.filter((k) => map.get(k)?.show), [order, map]);

  const tri = useMemo(() => {
    if (!visibleOrder.length) return [] as TabKey[];
    if (visibleOrder.length <= 3) return visibleOrder;
    const i = Math.max(0, visibleOrder.indexOf(active));
    const prev = visibleOrder[(i - 1 + visibleOrder.length) % visibleOrder.length];
    const next = visibleOrder[(i + 1) % visibleOrder.length];
    return [prev, active, next];
  }, [active, visibleOrder]);

  return (
    <div className="vx-bottomWrap">
      <div className="vx-bottomBar">
        {tri.map((k, idx) => {
          const t = map.get(k);
          if (!t) return null;
          const isActive = active === k;
          const pos = idx === 1 ? "vx-navPosC" : idx === 0 ? "vx-navPosL" : "vx-navPosR";
          return (
            <button
              key={k}
              type="button"
              onClick={() => onChange(k)}
              className={"vx-navBtn " + pos + " " + (isActive ? "vx-navBtnActive" : "")}
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
  // Owner portal is a separate browser page (/admin), not inside the miniapp UI.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    return <OwnerPortal />;
  }

  // Ensure the real background behind the app is true black (Telegram webview can show its own color otherwise).
  useEffect(() => {
    try {
      document.body.classList.add("vx-body-client");
      return () => document.body.classList.remove("vx-body-client");
    } catch {
      return;
    }
  }, []);

  const tg = getTg();

  // Order is circular for the "3-tab" bottom bar (prev / current / next)
  const baseOrder: TabKey[] = ["reviews", "rates", "calc", "atm", "staff"];

  const [me, setMe] = useState<Me>({ ok: false, initData: "" });
  const [tab, setTab] = useState<TabKey>("rates");
  const [anim, setAnim] = useState<AnimClass>("");
  const [hsStatus, setHsStatus] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Navigation order depends on role (staff tab only for admins)
  const tabOrder = useMemo<TabKey[]>(
    () => (me.isAdmin ? baseOrder : baseOrder.filter((t) => t !== "staff")),
    [me.isAdmin]
  );

  // Keyboard detection: hide bottom bar while typing so it doesn't jump above the keyboard.
  const vvBaseHeightRef = useRef<number>(
    typeof window !== "undefined" ? window.visualViewport?.height ?? window.innerHeight : 0
  );

  const isDemo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);

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
          isAdmin: true,
        });
        return;
      }

      const r = await apiAuth(useInit);
      if (r.ok)
        setMe({
          ok: true,
          initData: useInit,
          user: r.user,
          status: r.status,
          isOwner: r.isOwner,
          isAdmin: !!(r as any).isAdmin,
        });
      else setMe({ ok: false, initData: useInit, error: r.error });
    })();
  }, [tg, isDemo]);

  // Safety: if someone navigated to staff tab without permission, bounce back.
  useEffect(() => {
    if (tab === "staff" && !me.isAdmin) setTab("rates");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, me.isAdmin]);

  // Homescreen shortcut ("установить на телефон")
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

  // VisualViewport keyboard detection
  useEffect(() => {
    const vv = window.visualViewport;

    // Fallback: if VisualViewport is missing, hide bar while any input is focused.
    if (!vv) {
      const onFocusIn = (e: any) => {
        const t = e?.target as HTMLElement | null;
        const tag = t?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") setKeyboardOpen(true);
      };
      const onFocusOut = () => setKeyboardOpen(false);
      window.addEventListener("focusin", onFocusIn);
      window.addEventListener("focusout", onFocusOut);
      return () => {
        window.removeEventListener("focusin", onFocusIn);
        window.removeEventListener("focusout", onFocusOut);
      };
    }

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
      const open = vv.height < base - 120;
      setKeyboardOpen(open);
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

  // Background loader: webapp/public/brand/danang-bg.(svg|jpg|png|webp)
  const bgCandidates = useMemo(() => {
    const v = String(Date.now());
    const baseRaw = (import.meta as any)?.env?.BASE_URL || "/";
    const base = String(baseRaw).endsWith("/") ? String(baseRaw) : String(baseRaw) + "/";
    const rel = (p: string) => `${base}${p}?v=${v}`;
    const abs = (p: string) => `/${p}?v=${v}`;
    const exts = ["svg", "jpg", "png", "webp"];

    // Runtime (no rebuild): put a file into server/public, e.g. server/public/client-bg.jpg
    // It will be served as /client-bg.jpg
    const runtimeNames = ["client-bg", "bg", "background", "wallpaper"];
    const runtime = runtimeNames.flatMap((name) => exts.map((ext) => abs(`${name}.${ext}`)));

    // Backward compatibility: old name under /brand
    const legacy = [
      ...exts.map((ext) => rel(`brand/danang-bg.${ext}`)),
      ...exts.map((ext) => abs(`brand/danang-bg.${ext}`)),
    ];

    return [...runtime, ...legacy];
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

  // Logo loader (robust for ANY hosting path)
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

  const bottomTabs: Array<{ key: TabKey; label: string; show: boolean; icon: React.ReactNode }> = [
    { key: "rates", label: "Курс", show: true, icon: <IconSwap className="vx-i" /> },
    { key: "calc", label: "Калькулятор", show: true, icon: <IconCalc className="vx-i" /> },
    { key: "atm", label: "Банкоматы", show: true, icon: <IconAtm className="vx-i" /> },
    { key: "reviews", label: "Отзывы", show: true, icon: <IconStar className="vx-i" /> },
    { key: "staff", label: "Админ", show: !!me.isAdmin, icon: <IconSettings className="vx-i" /> },
  ];

  const changeTab = (next: TabKey) => {
    if (next === tab) return;

    const i = tabOrder.indexOf(tab);
    const j = tabOrder.indexOf(next);
    setAnim(j > i ? "vx-animInL" : "vx-animInR");
    setTab(next);
  };

  // Clear the animation class after it plays (so it can retrigger)
  useEffect(() => {
    if (!anim) return;
    const t = window.setTimeout(() => setAnim(""), 260);
    return () => window.clearTimeout(t);
  }, [anim]);

  // Swipe navigation between tabs
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (keyboardOpen) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName;
    if (target?.closest?.(".vx-bottomWrap")) return;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!e.touches?.[0]) return;
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const s = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!s) return;
    if (keyboardOpen) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest?.(".vx-bottomWrap")) return;

    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    if (Math.abs(dx) < 70) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.3) return;

    const i = tabOrder.indexOf(tab);
    if (i < 0) return;

    if (dx < 0 && i < tabOrder.length - 1) changeTab(tabOrder[i + 1]);
    if (dx > 0 && i > 0) changeTab(tabOrder[i - 1]);
  };

  // Keep tabs mounted (no remount => no flicker), but show only active
  const pages = useMemo(
    () => ({
      rates: <RatesTab />,
      calc: <CalculatorTab me={me} />,
      atm: <AtmTab />,
      reviews: <ReviewsTab />,
      staff: <StaffTab me={me} />,
    }),
    [me]
  );

  return (
    <div
      className={"vx-page theme-client" + (keyboardOpen ? " vx-kbOpen" : "")}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{`@import url('${UI.fontImport}');`}</style>

      {/* Background: injected via bgSrc */}
      <div
        className="bg-danang"
        aria-hidden="true"
        style={{ backgroundImage: bgSrc ? `url(\"${bgSrc}\")` : undefined }}
      />

      <div className="container">
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
                  setLogoIdx((x) => (x < logoCandidates.length - 1 ? x + 1 : x));
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

        <div className="vx-body">
          <div className="vx-card2">
            <div
              className={"vx-tabPane " + (tab === "rates" ? "is-active " + anim : "")}
              style={{ display: tab === "rates" ? "block" : "none" }}
            >
              {pages.rates}
            </div>
            <div
              className={"vx-tabPane " + (tab === "calc" ? "is-active " + anim : "")}
              style={{ display: tab === "calc" ? "block" : "none" }}
            >
              {pages.calc}
            </div>
            <div
              className={"vx-tabPane " + (tab === "atm" ? "is-active " + anim : "")}
              style={{ display: tab === "atm" ? "block" : "none" }}
            >
              {pages.atm}
            </div>            <div
              className={"vx-tabPane " + (tab === "reviews" ? "is-active " + anim : "")}
              style={{ display: tab === "reviews" ? "block" : "none" }}
            >
              {pages.reviews}
            </div>

            <div
              className={"vx-tabPane " + (tab === "staff" ? "is-active " + anim : "")}
              style={{ display: tab === "staff" ? "block" : "none" }}
            >
              {pages.staff}
            </div>
          </div>
        </div>
      </div>

      <BottomBar active={tab} onChange={changeTab} items={bottomTabs} order={tabOrder} />
    </div>
  );
}
