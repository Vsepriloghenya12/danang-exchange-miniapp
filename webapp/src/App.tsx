import React, { useEffect, useMemo, useRef, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth, apiEvent } from "./lib/api";
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
  error?: string;
};

type ScreenKey = "home" | "calc" | "afisha" | "atm" | "reviews" | "staff" | "pay" | "history" | "other" | "faq" | "about" | "contacts";

const UI = {
  title: "Обмен валют — Дананг",
  fontImport:
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800;900&family=Inter:wght@500;600;700;800;900&family=DM+Sans:wght@700;800;900&display=swap",
};

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

function IconChevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mx-header">
      <button type="button" className="mx-backBtn" onClick={onBack} aria-label="Назад">
        <IconArrowLeft className="mx-i" />
      </button>
      <div className="mx-hTitle">{title}</div>
      <div style={{ width: 40 }} />
    </div>
  );
}

function NavCard({
  title,
  subtitle,
  iconSrc,
  onClick,
}: {
  title: string;
  subtitle?: string;
  iconSrc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mx-navCard" onClick={onClick}>
      <img className="mx-navIcon" src={iconSrc} alt="" />
      <div className="mx-navText">
        <div className="mx-navTitle">{title}</div>
        {subtitle ? <div className="mx-navSub">{subtitle}</div> : null}
      </div>
      <IconChevron className="mx-i mx-chev" />
    </button>
  );
}

function StatusIcon({ status }: { status?: UserStatus }) {
  // Telegram WebView can be slow to paint images after navigation.
  // We avoid showing a "dot" placeholder: keep a stable tile and fade the icon in when loaded.
  const bust = `v48-${String(status || "").toLowerCase() || "x"}`;
  const candidates = useMemo(() => {
    const s = String(status || "").toLowerCase();
    const list: string[] = [];
    if (s) {
      list.push(`/brand/status-${s}.png`);
      list.push(`/brand/status-${s}.webp`);
      list.push(`/brand/status-${s}.svg`);
      list.push(`/brand/status-${s}.jpg`);
      list.push(`/brand/status-${s}.jpeg`);
    }
    list.push(
      "/brand/status.png",
      "/brand/status.webp",
      "/brand/status.svg",
      "/brand/status.jpg",
      "/brand/status.jpeg"
    );
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


function HeaderLogo() {
  // cache-bust for Telegram WebView
  const bust = "v42";
  const candidates = useMemo(
    () => [
      "/brand/header-logo.png",
      "/brand/header-logo.webp",
      "/brand/header-logo.svg",
      "/brand/header-logo.jpg",
      "/brand/logo.png",
      "/brand/logo.jpg",
      "/brand/logo.webp",
    ],
    []
  );
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);
  const src = `${candidates[Math.min(idx, candidates.length - 1)]}?${bust}`;

  return (
    <div className="mx-headerLogoWrap" aria-label="Логотип">
      {!ok ? <div className="mx-headerLogoFallback" /> : null}
      <img
        key={src}
        className="mx-headerLogoImg"
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


function MainLogo() {
  // Center logo on the home screen (wide). Cache-bust for Telegram WebView.
  const bust = "v1";
  const candidates = useMemo(
    () => [
      "/brand/main-logo.png",
      "/brand/main-logo.webp",
      "/brand/main-logo.svg",
      "/brand/main-logo.jpg",
      "/brand/logo.png",
      "/brand/logo.webp",
      "/brand/logo.jpg",
    ],
    []
  );
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(false);
  const src = `${candidates[Math.min(idx, candidates.length - 1)]}?${bust}`;

  return (
    <div className="mx-mainLogoWrap" aria-label="Cash A Lot">
      {!ok ? <div className="mx-mainLogoFallback" /> : null}
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
      "/brand/main-logo.png?v1",
      "/brand/status-standard.svg?v48-standard",
      "/brand/status-silver.svg?v48-silver",
      "/brand/status-gold.svg?v48-gold",
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

  // Allow Afisha screen to override the back button (e.g. return from list -> categories).
  const afishaBackRef = useRef<null | (() => boolean)>(null);

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
  const [courseExpanded, setCourseExpanded] = useState(false);

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

  const goHome = () => {
    setScreen("home");
  };

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

  const displayName = useMemo(() => {
    const u = me.user;
    const n = String(u?.first_name || u?.username || "").trim();
    return n || "";
  }, [me.user?.first_name, me.user?.username]);

  const showStatusInfo = () => {
    const st = normalizeStatus(me.status);
    const title = `Ваш статус: ${statusTitle(st)}`;
    const msg =
      st === "gold"
        ? "Курс стал ещё лучше."
        : st === "silver"
          ? "Повышенный курс."
          : "• Базовые условия\n• Все функции приложения доступны";

    if (tg?.showPopup) {
      tg.showPopup({
        title,
        message: msg,
        buttons: [{ type: "close", text: "Ок" }],
      });
    } else if (tg?.showAlert) {
      tg.showAlert(`${title}\n\n${msg}`);
    } else {
      alert(`${title}\n\n${msg}`);
    }
  };

  return (
    <div className="vx-page theme-client">
      <style>{`@import url('${UI.fontImport}');`}</style>

      <div className="container">
        {screen === "home" ? (
          <>
            <div className="mx-topRow mx-topRowHome">
              <button
                type="button"
                className="mx-themeBtn"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Тёмная тема" : "Светлая тема"}
              >
                {theme === "dark" ? <IconMoon className="mx-themeI" /> : <IconSun className="mx-themeI" />}
              </button>

              <div className="mx-topCenter">
                <MainLogo />
              </div>

              <button type="button" className="mx-statusBtn" onClick={showStatusInfo} aria-label="Ваш статус">
                <StatusIcon status={me.status} />
              </button>
            </div>

            <div className="mx-card">
              <div className="mx-cardHead">
                <div>
                  <div className="mx-cardTitle">Курс</div>
                  <div className="mx-cardSub">{me.ok ? UI.title : me.error ?? "Авторизация…"}</div>
                </div>
              </div>

              <div className="mx-courseBody">
                <RatesTab embedded limit={courseExpanded ? undefined : 3} />
              </div>

              <div className="mx-btnRow">
                <button type="button" className="mx-btn" onClick={() => setCourseExpanded((v) => !v)}>
                  {courseExpanded ? "Свернуть" : "Все курсы"}
                </button>
                <button
                  type="button"
                  className="mx-btn mx-btnPrimary"
                  onClick={() => goTo("calc","home_calc_btn")}
                >
                  Оставить заявку
                </button>
              </div>
            </div>

            {/* Extra gap so the "Курс" card shadow doesn't visually "dirty" the first nav card */}
            <div className="mx-sp18" />

            <NavCard
              title="Афиша"
              subtitle="События, спорт, вечеринки"
              iconSrc="/brand/icons/tab-afisha-256.png?v=1"
              onClick={() => goTo("afisha","nav_afisha")}
            />
            <div className="mx-sp10" />
            <NavCard
              title="Банкоматы"
              subtitle="VIETCOMBANK и BIDV"
              iconSrc="/brand/icons/tab-atm-256.png?v=1"
              onClick={() => goTo("atm","nav_atm")}
            />
            <div className="mx-sp10" />
            <NavCard
              title="Отзывы"
              subtitle="Отзывы клиентов"
              iconSrc="/brand/icons/tab-reviews-256.png?v=1"
              onClick={() => goTo("reviews","nav_reviews")}
            />

            {me.isAdmin ? (
              <>
                <div className="mx-sp10" />
                <NavCard
                  title="Админ"
                  subtitle="Заявки"
                  iconSrc="/brand/icons/tab-rates-256.png?v=1"
                  onClick={() => goTo("staff","nav_staff")}
                />
              </>
            ) : null}

            <div className="mx-sp24" />
          </>
        ) : null}

        {screen === "calc" ? (
          <>
            <ScreenHeader title="Оставить заявку" onBack={goHome} />
            <CalculatorTab me={me} />
          </>
        ) : null}

        {screen === "pay" ? (
          <>
            <ScreenHeader title="Оплата и брони" onBack={goHome} />
            <PaymentsTab />
          </>
        ) : null}

        {screen === "afisha" ? (
          <>
            <ScreenHeader
              title="Афиша"
              onBack={() => {
                const handled = afishaBackRef.current?.() ?? false;
                if (!handled) goHome();
              }}
            />
            <AfishaTab registerBack={(fn) => (afishaBackRef.current = fn)} />
          </>
        ) : null}

        {screen === "atm" ? (
          <>
            <ScreenHeader title="Банкоматы" onBack={goHome} />
            <AtmTab />
          </>
        ) : null}

        {screen === "reviews" ? (
          <>
            <ScreenHeader title="Отзывы" onBack={goHome} />
            <ReviewsTab />
          </>
        ) : null}

        {screen === "staff" ? (
          <>
            <ScreenHeader title="Админ" onBack={goHome} />
            <StaffTab me={me} />
          </>
        ) : null}

        {screen === "history" ? (
          <>
            <ScreenHeader title="Моя история" onBack={goHome} />
            <HistoryTab me={me} />
          </>
        ) : null}


{screen === "other" ? (
  <>
    <ScreenHeader title="Прочее" onBack={goHome} />
    <OtherTab
      onFaq={() => goTo("faq","other_faq")}
      onAbout={() => goTo("about","other_about")}
      onContacts={() => goTo("contacts","other_contacts")}
    />
  </>
) : null}

{screen === "faq" ? (
  <>
    <ScreenHeader title="FAQ" onBack={() => goTo("other","faq_back")} />
    <FaqTab />
  </>
) : null}

{screen === "contacts" ? (
  <>
    <ScreenHeader title="Контакты" onBack={() => goTo("other","contacts_back")} />
    <ContactsTab />
  </>
) : null}

        {screen === "about" ? (
          <>
            <ScreenHeader title="О приложении" onBack={goHome} />
            <AboutTab />
          </>
        ) : null}

              </div>

      {/* Bottom menu */}
      <div className="mx-bottomNav" role="navigation" aria-label="Нижнее меню">
        <button
          type="button"
          className={"mx-bottomBtn " + (screen === "pay" ? "is-on" : "")}
          onClick={() => goTo("pay","bottom_pay")}
        >
          Оплата и брони
        </button>
        <button
          type="button"
          className={"mx-bottomBtn " + (screen === "history" ? "is-on" : "")}
          onClick={() => goTo("history","bottom_history")}
        >
          Моя история
        </button>
        <button
          type="button"
          className={"mx-bottomBtn " + (screen === "other" ? "is-on" : "")}
          onClick={() => goTo("other","bottom_other")}
        >
          Прочее
        </button>
      </div>
    </div>
  );
}
