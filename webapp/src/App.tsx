import React, { useEffect, useMemo, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth } from "./lib/api";
import type { UserStatus } from "./lib/types";

import RatesTab from "./tabs/RatesTab";
import CalculatorTab from "./tabs/CalculatorTab";
import AfishaTab from "./tabs/AfishaTab";
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
  adminChat?: { tgId: number | null; username?: string; deepLink?: string };
  blocked?: boolean;
  error?: string;
};

type ScreenKey = "home" | "calc" | "afisha" | "atm" | "reviews" | "staff";

const UI = {
  title: "Обмен валют — Дананг",
  fontImport:
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@500;600;700;800&display=swap",
};

function IconArrowLeft({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function IconChevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
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
  // Telegram WebView caching + inconsistent image format fallback can cause the status icon to look "not loaded".
  // We try multiple extensions and also add a tiny cache-buster.
  const bust = "v31";
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
  const src = `${candidates[Math.min(idx, candidates.length - 1)]}?${bust}`;

  return (
    <div className="mx-statusWrap" aria-label="Статус">
      {!ok ? <div className="mx-statusFallback">{status === "gold" ? "G" : status === "silver" ? "S" : "•"}</div> : null}
      <img
        className="mx-statusImg"
        src={src}
        alt=""
        onLoad={() => setOk(true)}
        onError={() => {
          setOk(false);
          setIdx((x) => (x < candidates.length - 1 ? x + 1 : x));
        }}
      />
    </div>
  );
}

export default function App() {
  // Owner portal is a separate browser page (/admin), not inside the miniapp UI.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/admin")) {
    return <OwnerPortal />;
  }

  useEffect(() => {
    try {
      document.body.classList.add("vx-body-client");
      return () => document.body.classList.remove("vx-body-client");
    } catch {
      return;
    }
  }, []);

  const tg = getTg();
  const [me, setMe] = useState<Me>({ ok: false, initData: "" });
  const [screen, setScreen] = useState<ScreenKey>("home");
  const [courseExpanded, setCourseExpanded] = useState(false);

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

  return (
    <div className="vx-page theme-client">
      <style>{`@import url('${UI.fontImport}');`}</style>

      <div className="container">
        {screen === "home" ? (
          <>
            <div className="mx-topRow">
              <StatusIcon status={me.status} />
              <div className="mx-weather">Погода: —</div>
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
                  {courseExpanded ? "Свернуть" : "Весь курс"}
                </button>
                <button
                  type="button"
                  className="mx-btn mx-btnPrimary"
                  onClick={() => {
                    setScreen("calc");
                  }}
                >
                  Калькулятор
                </button>
              </div>
            </div>

            <div className="mx-sp12" />

            <NavCard
              title="Афиша"
              subtitle="События, спорт, вечеринки"
              iconSrc="/brand/icons/tab-afisha-256.png?v=1"
              onClick={() => setScreen("afisha")}
            />
            <div className="mx-sp10" />
            <NavCard
              title="Банкоматы"
              subtitle="VIETCOMBANK и BIDV"
              iconSrc="/brand/icons/tab-atm-256.png?v=1"
              onClick={() => setScreen("atm")}
            />
            <div className="mx-sp10" />
            <NavCard
              title="Отзывы"
              subtitle="Отзывы клиентов"
              iconSrc="/brand/icons/tab-reviews-256.png?v=1"
              onClick={() => setScreen("reviews")}
            />

            {me.isAdmin ? (
              <>
                <div className="mx-sp10" />
                <NavCard
                  title="Админ"
                  subtitle="Заявки"
                  iconSrc="/brand/icons/tab-rates-256.png?v=1"
                  onClick={() => setScreen("staff")}
                />
              </>
            ) : null}

            <div className="mx-sp24" />
          </>
        ) : null}

        {screen === "calc" ? (
          <>
            <ScreenHeader title="Калькулятор" onBack={goHome} />
            <CalculatorTab me={me} />
          </>
        ) : null}

        {screen === "afisha" ? (
          <>
            <ScreenHeader title="Афиша" onBack={goHome} />
            <AfishaTab />
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
      </div>
    </div>
  );
}
