import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth, apiEvent, apiWarmup } from "./lib/api";
import type { UserStatus } from "./lib/types";

import RatesTab from "./tabs/RatesTab";
import CalculatorTab from "./tabs/CalculatorTab";
import AfishaTab from "./tabs/AfishaTab";
import AtmTab from "./tabs/AtmTab";
import ReviewsTab from "./tabs/ReviewsTab";
import StaffTab from "./tabs/StaffTab";
import HistoryTab from "./tabs/HistoryTab";
import AboutTab from "./tabs/AboutTab";
import OtherTab from "./tabs/OtherTab";
import FaqTab from "./tabs/FaqTab";
import ContactsTab from "./tabs/ContactsTab";
import PaymentsTab from "./tabs/PaymentsTab";
import OwnerPortal from "./admin/OwnerPortal";

type Me = {
  ok: boolean;
  initData: string;
  user?: { id: number; username?: string; first_name?: string; last_name?: string };
  status?: UserStatus;
  isOwner?: boolean;
  isAdmin?: boolean;
  adminChat?: { tgId: number | null; username?: string; deepLink?: string };
  blocked?: boolean;
  hasSavedContact?: boolean;
  error?: string;
};

type ScreenKey = "home" | "calc" | "afisha" | "atm" | "reviews" | "staff" | "pay" | "history" | "other" | "faq" | "about" | "contacts";
type Lang = "ru" | "en";
type HomeSection = "calc" | "afisha" | "atm" | "reviews";

type LaunchTarget = {
  screen?: ScreenKey;
  eventId?: string;
};

function readPreferredLang(): Lang {
  try {
    const fromUrl = String(new URLSearchParams(window.location.search).get("lang") || "").toLowerCase();
    if (fromUrl === "en") return "en";
    if (fromUrl === "ru") return "ru";
  } catch {
    // ignore
  }

  try {
    const v = String(localStorage.getItem("mx_lang") || "").toLowerCase();
    return v === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}

const UI = {
  title: "Обмен валют — Дананг",
  fontImport:
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800;900&family=Inter:wght@500;600;700;800;900&family=DM+Sans:wght@700;800;900&display=swap",
};

function openExternal(url: string) {
  const tg = getTg();
  if (tg?.openTelegramLink && /^https:\/\/t\.me\//i.test(url)) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function IconSun({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07l1.41-1.41" />
      <path d="M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function IconMoon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* More centered moon icon (Telegram WebView sometimes shows the old path off-center) */}
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function IconArrowLeft({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ScreenHeader({ title, onBack, lang }: { title: string; onBack?: () => void; lang?: Lang }) {
  return (
    <div className="mx-header">
      {onBack ? (
        <button
          type="button"
          className="mx-backBtn"
          onClick={onBack}
          aria-label={lang === "en" ? "Back" : "Назад"}
          title={lang === "en" ? "Back" : "Назад"}
        >
          <IconArrowLeft className="mx-i" />
        </button>
      ) : (
        <div style={{ width: 40 }} />
      )}
      <div className="mx-hTitle">{title}</div>
      <div style={{ width: 40 }} />
    </div>
  );
}

function ScreenPane({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={"mx-screenPane " + (active ? "is-active" : "is-hidden")}>{children}</div>;
}

function StatusIcon({ status }: { status?: UserStatus }) {
  // Telegram WebView can be slow to paint images after navigation.
  // Use real existing files first, otherwise Telegram spends time trying missing assets.
  const bust = `v48-${String(status || "").toLowerCase() || "x"}`;
  const candidates = useMemo(() => {
    const s = String(status || "").toLowerCase();
    const list: string[] = [];
    if (s) list.push(`/brand/status-${s}.svg`);
    list.push("/brand/status.svg");
    return list;
  }, [status]);

  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setIdx(0);
    setOk(false);
  }, [status]);

  const src = `${candidates[Math.min(idx, candidates.length - 1)]}?${bust}`;

  return (
    <div className="mx-statusWrap" aria-label="Статус">
      {!ok ? <div className="mx-statusSkeleton" aria-hidden="true" /> : null}
      <img
        key={src}
        className="mx-statusImg"
        src={src}
        alt=""
        loading="eager"
        decoding="async"
        style={{ opacity: ok ? 1 : 0 }}
        onLoad={() => setOk(true)}
        onError={() => {
          setOk(false);
          setIdx((x) => (x < candidates.length - 1 ? x + 1 : x));
        }}
      />
    </div>
  );
}



function MainLogo({ theme }: { theme: "light" | "dark" }) {
  // Separate logo files for light/dark themes. Easy to replace later.
  const bust = theme === "dark" ? "v31-dark" : "v31-light";
  const candidates = useMemo(
    () =>
      theme === "dark"
        ? [
            "/brand/main-logo-dark.png",
            "/brand/main-logo.png",
            "/brand/main-logo.webp",
            "/brand/main-logo.jpg",
            "/brand/logo.png",
            "/brand/logo.webp",
            "/brand/logo.jpg",
          ]
        : [
            "/brand/main-logo-light.png",
            "/brand/main-logo.png",
            "/brand/main-logo.webp",
            "/brand/main-logo.jpg",
            "/brand/logo.png",
            "/brand/logo.webp",
            "/brand/logo.jpg",
          ],
    [theme]
  );
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setIdx(0);
    setOk(false);
  }, [theme]);

  const src = `${candidates[Math.min(idx, candidates.length - 1)]}?${bust}`;

  return (
    <div className="mx-mainLogoWrap" aria-label="Cash A Lot">
      <img
        key={src}
        className="mx-mainLogoImg"
        src={src}
        alt=""
        loading="eager"
        decoding="async"
        onLoad={() => setOk(true)}
        onError={() => {
          setOk(false);
          setIdx((x) => (x < candidates.length - 1 ? x + 1 : x));
        }}
      />
    </div>
  );
}

function normalizeStatus(s: any): UserStatus {
  const v = String(s ?? "").toLowerCase().trim();
  if (v === "gold") return "gold";
  if (v === "silver") return "silver";
  return "standard";
}

function statusTitle(s: UserStatus) {
  if (s === "gold") return "Золото";
  if (s === "silver") return "Серебро";
  return "Стандарт";
}

function parseLaunchTarget(tg: any): LaunchTarget {
  try {
    const q = new URLSearchParams(window.location.search || "");
    const rawEventId = String(q.get("event") || q.get("afisha") || "").trim();
    const rawScreen = String(q.get("screen") || "").toLowerCase().trim();
    if (rawEventId) return { screen: "afisha", eventId: rawEventId };
    if (rawScreen === "afisha") return { screen: "afisha" };

    const startParam = String(tg?.initDataUnsafe?.start_param || q.get("startapp") || "").trim();
    if (!startParam) return {};

    const m = startParam.match(/^afisha[:_\/-](.+)$/i);
    if (m?.[1]) return { screen: "afisha", eventId: decodeURIComponent(m[1]) };
    if (/^afisha$/i.test(startParam)) return { screen: "afisha" };
  } catch {}
  return {};
}

export default function App() {
  // Owner portal is a separate browser page (/admin), not inside the miniapp UI.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    return <OwnerPortal />;
  }

  // Light/Dark toggle for the client miniapp.
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const v = String(localStorage.getItem("mx_theme") || "").toLowerCase();
      return v === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("mx_theme", theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Warm up critical images early to avoid a visible "pop-in" in Telegram WebView.
  useEffect(() => {
    const urls = [
      "/brand/main-logo-light.png?v31-light",
      "/brand/main-logo-dark.png?v31-dark",
      "/brand/header-logo-light.png?v31-light",
      "/brand/header-logo-dark.png?v31-dark",
      "/brand/status-standard.svg?v48-standard",
      "/brand/status-silver.svg?v48-silver",
      "/brand/status-gold.svg?v48-gold",
      "/brand/icons/tab-afisha-256.png?v=1",
      "/brand/icons/tab-atm-256.png?v=1",
      "/brand/icons/tab-rates-256.png?v=1",
      "/brand/icons/tab-reviews-256.png?v=1",
      "/brand/afisha-sport.png?v=afisha-cats-20260328-2",
      "/brand/afisha-party.png?v=afisha-cats-20260328-2",
      "/brand/afisha-culture.png?v=afisha-cats-20260328-2",
      "/brand/afisha-food.png?v=afisha-cats-20260328-2",
      "/brand/afisha-music.png?v=afisha-cats-20260328-2",
      "/brand/afisha-games.png?v=afisha-cats-20260328-2",
      "/brand/afisha-market.png?v=afisha-cats-20260328-2",
      "/brand/afisha-learning.png?v=afisha-cats-20260328-2",
      "/brand/afisha-misc.png?v=afisha-cats-20260328-2",
      "/brand/afisha-all.jpg?v=afisha-cats-20260328-2",
    ];
    try {
      urls.forEach((u) => {
        const img = new Image();
        img.decoding = "async";
        img.src = u;
      });
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));


  const [lang, setLang] = useState<Lang>(() => readPreferredLang());

  useEffect(() => {
    try {
      document.documentElement.setAttribute("lang", lang);
      localStorage.setItem("mx_lang", lang);

      const url = new URL(window.location.href);
      if (url.searchParams.get("lang") !== lang) {
        url.searchParams.set("lang", lang);
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      // ignore
    }
  }, [lang]);

  useEffect(() => {
    const syncLang = () => setLang(readPreferredLang());
    const onRuntimeLangSwitch = (event: Event) => {
      const next = String((event as CustomEvent<string>)?.detail || "").toLowerCase();
      if (next === "ru" || next === "en") setLang(next);
    };

    try {
      (window as any).__mxSetAppLang = (next: string) => {
        const normalized = String(next || "").toLowerCase();
        if (normalized === "ru" || normalized === "en") setLang(normalized);
      };
    } catch {
      // ignore
    }

    window.addEventListener("mx:lang-runtime-switch", onRuntimeLangSwitch as EventListener);
    window.addEventListener("storage", syncLang);
    window.addEventListener("popstate", syncLang);
    return () => {
      window.removeEventListener("mx:lang-runtime-switch", onRuntimeLangSwitch as EventListener);
      window.removeEventListener("storage", syncLang);
      window.removeEventListener("popstate", syncLang);
      try {
        delete (window as any).__mxSetAppLang;
      } catch {
        // ignore
      }
    };
  }, []);

  const toggleLang = () => setLang((v) => (v === "ru" ? "en" : "ru"));
  const isEn = lang === "en";

  useEffect(() => {
    try {
      document.body.classList.add("vx-body-client");
      return () => document.body.classList.remove("vx-body-client");
    } catch {
      return;
    }
  }, []);

  // Preload status icons to avoid a visible "loading" placeholder when returning to the home screen.
  useEffect(() => {
    try {
      const sts = ["standard", "silver", "gold"];
      const exts = [".svg", ".png", ".webp"];
      for (const s of sts) {
        for (const ext of exts) {
          const img = new Image();
          img.src = `/brand/status-${s}${ext}`;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const tg = getTg();

  // Haptic feedback for buttons only (no vibration while typing/entering data).
  useEffect(() => {
    const handler = (e: any) => {
      const t = (e?.target as HTMLElement | null) ?? null;
      if (!t) return;
      const btn = t.closest?.("button") as HTMLButtonElement | null;
      if (!btn) return;
      if (btn.disabled) return;
      if (btn.getAttribute("data-nohaptic") === "1") return;
      try {
        const w = (window as any).Telegram?.WebApp;
        w?.HapticFeedback?.impactOccurred?.("light");
      } catch {
        // ignore
      }
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  const [me, setMe] = useState<Me>({ ok: false, initData: "" });
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [launchAfishaEventId, setLaunchAfishaEventId] = useState<string>("");
  const [homeSection, setHomeSection] = useState<HomeSection>("calc");
  const [courseExpanded, setCourseExpanded] = useState(false);
  const [visited, setVisited] = useState<Record<string, boolean>>({ home: true });
  const homeCalcRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisited((prev) => (prev[screen] ? prev : { ...prev, [screen]: true }));
  }, [screen]);

  // Demo mode for opening the webapp in a normal browser without Telegram initData.
  // IMPORTANT: must be declared before any hooks that reference it (avoid TDZ runtime crash).
  const isDemo = useMemo(() => new URLSearchParams(window.location.search).get("demo") === "1", []);

  const sessionId = useMemo(() => {
    try {
      // session per app open
      return (crypto as any).randomUUID ? (crypto as any).randomUUID() : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    } catch {
      return `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  }, []);

  const didTrackOpen = useRef(false);
  useEffect(() => {
    if (!me.ok || !me.initData || isDemo) return;
    if (didTrackOpen.current) return;
    didTrackOpen.current = true;

    const platform = (window as any).Telegram?.WebApp?.platform || "";
    void apiEvent(me.initData, {
      name: "app_open",
      sessionId,
      platform,
      path: window.location.pathname + window.location.search,
    });
  }, [me.ok, me.initData, isDemo, sessionId]);

  useEffect(() => {
    if (!me.ok || !me.initData || isDemo) return;
    const platform = (window as any).Telegram?.WebApp?.platform || "";
    void apiEvent(me.initData, {
      name: "screen_open",
      sessionId,
      platform,
      path: window.location.pathname + window.location.search,
      props: { screen },
    });
  }, [screen, me.ok, me.initData, isDemo, sessionId]);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

    const launchTarget = parseLaunchTarget(tg);
    if (launchTarget.screen === "afisha") {
      setScreen("home");
      setHomeSection("afisha");
      if (launchTarget.eventId) setLaunchAfishaEventId(launchTarget.eventId);
    }

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
          adminChat: { tgId: 123456, username: "demo_admin" },
          blocked: false,
          hasSavedContact: true,
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
          adminChat: (r as any).adminChat,
          blocked: !!(r as any).blocked,
          hasSavedContact: !!(r as any).hasSavedContact,
        });
      else setMe({ ok: false, initData: useInit, error: r.error });
    })();
  }, [tg, isDemo]);

  // Blacklist screen: show only an owner-provided image from /brand/blocked.(png|jpg|webp)
  const blockedCandidates = useMemo(
    () => ["/brand/blocked.webp", "/brand/blocked.png", "/brand/blocked.jpg", "/brand/blocked.jpeg"],
    []
  );
  const [blockedIdx, setBlockedIdx] = useState(0);
  const [blockedOk, setBlockedOk] = useState(false);
  const blockedSrc = blockedCandidates[Math.min(blockedIdx, blockedCandidates.length - 1)];

  if (me.ok && me.blocked) {
    return (
      <div className="vx-blockedOnly">
        <img
          className="vx-blockedImg"
          src={blockedSrc}
          alt=""
          onLoad={() => setBlockedOk(true)}
          onError={() => {
            setBlockedOk(false);
            setBlockedIdx((x) => (x < blockedCandidates.length - 1 ? x + 1 : x));
          }}
        />
        {!blockedOk && blockedIdx >= blockedCandidates.length - 1 ? (
          <div className="vx-blockedFallback">Доступ ограничен</div>
        ) : null}
      </div>
    );
  }

  useEffect(() => {
    if (!me.ok) return;
    const warm = apiWarmup();
    const run = () => {
      void warm.todayRates().catch(() => {});
      void warm.marketRates().catch(() => {});
      void warm.gFormulas().catch(() => {});
      void warm.bonuses().catch(() => {});
      void warm.afisha()
        .then((r: any) => {
          const urls = Array.isArray(r?.events)
            ? Array.from(
                new Set(
                  r.events
                    .map((ev: any) => String(ev?.previewImageUrl || ev?.imageUrl || "").trim())
                    .filter(Boolean)
                )
              ).slice(0, 10)
            : [];
          urls.forEach((u) => {
            try {
              const img = new Image();
              img.decoding = "async";
              (img as any).loading = "eager";
              img.src = u;
            } catch {
              // ignore
            }
          });
        })
        .catch(() => {});
      void warm.atms().catch(() => {});
      void warm.faq().catch(() => {});
      void warm.reviews().catch(() => {});
      if (me.initData && me.initData !== "demo") void warm.myRequests(me.initData).catch(() => {});
    };

    const t = window.setTimeout(run, 60);
    return () => window.clearTimeout(t);
  }, [me.ok, me.initData]);

  useEffect(() => {
    if (screen === "calc" || screen === "afisha" || screen === "atm" || screen === "reviews") {
      setHomeSection(screen === "calc" ? "calc" : screen);
      setScreen("home");
    }
  }, [screen]);

  const openHomeSection = (next: HomeSection, target: string) => {
    trackClick(target, { to: next, surface: "home_tabs" });
    setHomeSection(next);
    if (screen !== "home") setScreen("home");
    if (next !== "calc") {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        homeCalcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  };

  const scrollToHomeCalc = () => openHomeSection("calc", "home_calc_btn");
  const goHome = () => setScreen("home");
  const isOtherBranch = screen === "other" || screen === "faq" || screen === "about" || screen === "contacts";

  const trackClick = (target: string, props: any = {}) => {
    try {
      if (!me.ok || !me.initData || isDemo) return;
      const platform = (window as any).Telegram?.WebApp?.platform || "";
      void apiEvent(me.initData, {
        name: "click",
        sessionId,
        platform,
        path: window.location.pathname + window.location.search,
        props: { target, ...props },
      });
    } catch {
      // ignore
    }
  };

  const goTo = (next: ScreenKey, target: string) => {
    trackClick(target, { to: next });
    setScreen(next);
  };

  const showStatusInfo = () => {
    const st = normalizeStatus(me.status);
    const title = isEn
      ? `Your status: ${st === "gold" ? "Gold" : st === "silver" ? "Silver" : "Standard"}`
      : `Ваш статус: ${statusTitle(st)}`;
    const msg = isEn
      ? st === "gold"
        ? "Your exchange rate is even better."
        : st === "silver"
          ? "You have an improved rate."
          : "• Standard conditions\n• All app functions are available"
      : st === "gold"
        ? "Курс стал ещё лучше."
        : st === "silver"
          ? "Повышенный курс."
          : "• Базовые условия\n• Все функции приложения доступны";

    if (tg?.showPopup) {
      tg.showPopup({
        title,
        message: msg,
        buttons: [{ type: "close", text: isEn ? "OK" : "Ок" }],
      });
    } else if (tg?.showAlert) {
      tg.showAlert(`${title}

${msg}`);
    } else {
      alert(`${title}

${msg}`);
    }
  };

  return (
    <div className={`vx-page theme-client ${screen === "home" ? "mx-homePage" : ""}`}>
      <div className="container">
        <ScreenPane active={screen === "home"}>
          <div className="mx-homeLayout">
            <div className="mx-homeLead">
              <div className="mx-topRow mx-topRowHome">
                <div className="mx-homeControlsStack">
                  <button
                    type="button"
                    className="mx-langSwitchBtn mx-homeLangSwitchBtn"
                    onClick={toggleLang}
                    aria-label={isEn ? "Switch to Russian" : "Переключить на английский"}
                    title={isEn ? "Switch to Russian" : "Переключить на английский"}
                  >
                    {isEn ? "RU" : "EN"}
                  </button>
                  <button
                    type="button"
                    className="mx-themeBtn mx-homeThemeBtn"
                    onClick={toggleTheme}
                    aria-label={theme === "dark" ? (isEn ? "Dark theme" : "Тёмная тема") : (isEn ? "Light theme" : "Светлая тема")}
                  >
                    {theme === "dark" ? <IconMoon className="mx-themeI" /> : <IconSun className="mx-themeI" />}
                  </button>
                </div>

                <div className="mx-topCenter">
                  <MainLogo theme={theme} />
                </div>

                <button type="button" className="mx-statusBtn" onClick={showStatusInfo} aria-label={isEn ? "Your status" : "Ваш статус"}>
                  <StatusIcon status={me.status} />
                </button>
              </div>

              <div className="mx-homeTabs" role="tablist" aria-label={isEn ? "Home sections" : "Разделы главной"}>
                <button
                  type="button"
                  className={"mx-homeTab " + (homeSection === "calc" ? "is-active" : "")}
                  onClick={scrollToHomeCalc}
                  aria-current={homeSection === "calc" ? "page" : undefined}
                >
                  {isEn ? "Calculator" : "Калькулятор"}
                </button>
                <button
                  type="button"
                  className={"mx-homeTab " + (homeSection === "afisha" ? "is-active" : "")}
                  onClick={() => openHomeSection("afisha", "home_tab_afisha")}
                  aria-current={homeSection === "afisha" ? "page" : undefined}
                >
                  {isEn ? "Events" : "Афиша"}
                </button>
                <button
                  type="button"
                  className={"mx-homeTab " + (homeSection === "atm" ? "is-active" : "")}
                  onClick={() => openHomeSection("atm", "home_tab_atm")}
                  aria-current={homeSection === "atm" ? "page" : undefined}
                >
                  {isEn ? "ATMs" : "Банкоматы"}
                </button>
                <button
                  type="button"
                  className={"mx-homeTab " + (homeSection === "reviews" ? "is-active" : "")}
                  onClick={() => openHomeSection("reviews", "home_tab_reviews")}
                  aria-current={homeSection === "reviews" ? "page" : undefined}
                >
                  {isEn ? "Reviews" : "Отзывы"}
                </button>
              </div>

              {homeSection === "calc" ? (
                <>
                  <div ref={homeCalcRef} className="mx-homeCalcSection">
                    <CalculatorTab me={me} lang={lang} />
                  </div>

                  <div className="mx-card">
                    <div className="mx-cardHead">
                      <div>
                        <div className="mx-cardTitle">{isEn ? "Rates" : "Курс"}</div>
                        <div className="mx-cardSub">{me.ok ? (isEn ? "Currency exchange — Da Nang" : UI.title) : me.error ?? (isEn ? "Authorizing…" : "Авторизация…")}</div>
                      </div>
                    </div>

                    <div className="mx-courseBody">
                      <RatesTab embedded limit={courseExpanded ? undefined : 3} lang={lang} />
                    </div>

                    <div className="mx-btnRow">
                      <button type="button" className="mx-btn" onClick={() => setCourseExpanded((v) => !v)}>
                        {courseExpanded ? (isEn ? "Collapse" : "Свернуть") : (isEn ? "All rates" : "Все курсы")}
                      </button>
                      {me.isAdmin ? (
                        <button type="button" className="mx-btn mx-btnPrimary" onClick={() => goTo("staff", "home_admin_btn")}>
                          {isEn ? "Admin" : "Админ"}
                        </button>
                      ) : (
                        <button type="button" className="mx-btn mx-btnPrimary" onClick={scrollToHomeCalc}>
                          {isEn ? "Calculator" : "Калькулятор"}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              ) : null}

              {homeSection === "afisha" ? (
                <div className="mx-homePanel">
                  <AfishaTab
                    lang={lang}
                    focusEventId={launchAfishaEventId}
                    onFocusHandled={(id) => setLaunchAfishaEventId((prev) => (prev === id ? "" : prev))}
                  />
                </div>
              ) : null}

              {homeSection === "atm" ? (
                <div className="mx-homePanel">
                  <AtmTab isActive={screen === "home" && homeSection === "atm"} lang={lang} />
                </div>
              ) : null}

              {homeSection === "reviews" ? (
                <div className="mx-homePanel">
                  <ReviewsTab lang={lang} />
                </div>
              ) : null}
            </div>
          </div>
        </ScreenPane>

        {visited.pay ? (
          <ScreenPane active={screen === "pay"}>
            <>
              <ScreenHeader title={isEn ? "Payments and booking" : "Оплаты и бронирование"} onBack={goHome} lang={lang} />
              <PaymentsTab lang={lang} />
            </>
          </ScreenPane>
        ) : null}

        {visited.staff ? (
          <ScreenPane active={screen === "staff"}>
            <>
              <ScreenHeader title={isEn ? "Admin" : "Админ"} onBack={goHome} lang={lang} />
              <StaffTab me={me} lang={lang} />
            </>
          </ScreenPane>
        ) : null}

        {visited.history ? (
          <ScreenPane active={screen === "history"}>
            <>
              <ScreenHeader title={isEn ? "My history" : "Моя история"} onBack={goHome} lang={lang} />
              <HistoryTab me={me} lang={lang} />
            </>
          </ScreenPane>
        ) : null}

        {visited.other ? (
          <ScreenPane active={screen === "other"}>
            <>
              <ScreenHeader title={isEn ? "More" : "Прочее"} onBack={goHome} lang={lang} />
              <OtherTab
                lang={lang}
                onFaq={() => goTo("faq", "other_faq")}
                onAbout={() => goTo("about", "other_about")}
                onContacts={() => goTo("contacts", "other_contacts")}
                onOrderApp={() => openExternal("https://t.me/Tutenhaman")}
              />
            </>
          </ScreenPane>
        ) : null}

        {visited.faq ? (
          <ScreenPane active={screen === "faq"}>
            <>
              <ScreenHeader title="FAQ" onBack={() => setScreen("other")} lang={lang} />
              <FaqTab lang={lang} />
            </>
          </ScreenPane>
        ) : null}

        {visited.contacts ? (
          <ScreenPane active={screen === "contacts"}>
            <>
              <ScreenHeader title={isEn ? "Contacts" : "Контакты"} onBack={() => setScreen("other")} lang={lang} />
              <ContactsTab lang={lang} />
            </>
          </ScreenPane>
        ) : null}

        {visited.about ? (
          <ScreenPane active={screen === "about"}>
            <>
              <ScreenHeader title={isEn ? "About app" : "О приложении"} onBack={() => setScreen("other")} lang={lang} />
              <AboutTab lang={lang} />
            </>
          </ScreenPane>
        ) : null}
      </div>

      <div className="mx-bottomNav" role="navigation" aria-label={isEn ? "Bottom menu" : "Нижнее меню"}>
        <button
          type="button"
          className={"mx-bottomBtn " + (screen === "pay" ? "is-on" : "")}
          onClick={() => goTo("pay", "bottom_pay")}
        >
          {isEn ? "Payments and booking" : "Оплаты и бронирование"}
        </button>
        <button
          type="button"
          className={"mx-bottomBtn " + (screen === "history" ? "is-on" : "")}
          onClick={() => goTo("history", "bottom_history")}
        >
          {isEn ? "My history" : "Моя история"}
        </button>
        <button
          type="button"
          className={"mx-bottomBtn " + (isOtherBranch ? "is-on" : "")}
          onClick={() => goTo("other", "bottom_other")}
        >
          {isEn ? "More" : "Прочее"}
        </button>
      </div>
    </div>
  );
}
