import React, { useEffect, useMemo, useState } from "react";
import { getTg } from "./lib/telegram";
import { apiAuth } from "./lib/api";
import type { UserStatus } from "./lib/types";

import RatesTab from "./tabs/RatesTab";
import CalculatorTab from "./tabs/CalculatorTab";
import AtmTab from "./tabs/AtmTab";
import GuideTab from "./tabs/GuideTab";
import ReviewsTab from "./tabs/ReviewsTab";
import AdminTab from "./tabs/AdminTab";

type Me = {
  ok: boolean;
  initData: string;
  user?: { id: number; username?: string; first_name?: string; last_name?: string };
  status?: UserStatus;
  isOwner?: boolean;
  error?: string;
};

type TabKey = "main" | "atm" | "guide" | "reviews" | "admin";

// --------------------
// UI (можно менять)
// --------------------
const UI = {
  title: "Обмен валют — Дананг",
  accent: "#22c55e",
  accent2: "#06b6d4",
  bgTop: "#f7fbff",
  bgBottom: "#f4fff8",
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
function IconSettings({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l2-1.2-2-3.4-2.3.8a8 8 0 0 0-5.2-3L11 0H13l-.9 2.2a8 8 0 0 0-5.2 3l-2.3-.8-2 3.4 2 1.2a7.8 7.8 0 0 0 .1 6l-2 1.2 2 3.4 2.3-.8a8 8 0 0 0 5.2 3L11 24h2l.9-2.2a8 8 0 0 0 5.2-3l2.3.8 2-3.4-2-1.2z" />
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
  const [tab, setTab] = useState<TabKey>("main");

  const isDemo = useMemo(() => new URLSearchParams(location.search).get("demo") === "1", []);

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

  // Если владелец не найден — не даём оставаться на вкладке Управление
  useEffect(() => {
    if (tab === "admin" && !me.isOwner) setTab("main");
  }, [tab, me.isOwner]);

  const bottomTabs: Array<{ key: TabKey; label: string; show: boolean; icon: React.ReactNode }> = [
    { key: "main", label: "Курс", show: true, icon: <IconSwap className="vx-i" /> },
    { key: "atm", label: "Банкоматы", show: true, icon: <IconAtm className="vx-i" /> },
    { key: "guide", label: "Гид", show: true, icon: <IconGuide className="vx-i" /> },
    { key: "reviews", label: "Отзывы", show: true, icon: <IconStar className="vx-i" /> },
    { key: "admin", label: "Упр.", show: !!me.isOwner, icon: <IconSettings className="vx-i" /> },
  ];

  return (
    <div className="vx-root">
      {/* Локальные стили — чтобы ничего не ломать в других файлах */}
      <style>{`
        :root{
          --vx-accent: ${UI.accent};
          --vx-accent2: ${UI.accent2};
          --vx-bgTop: ${UI.bgTop};
          --vx-bgBottom: ${UI.bgBottom};
        }
        .vx-root{
          min-height: 100vh;
          background:
            radial-gradient(1200px 600px at 20% -10%, rgba(34,197,94,0.22), transparent 55%),
            radial-gradient(900px 600px at 90% 0%, rgba(6,182,212,0.18), transparent 55%),
            linear-gradient(180deg, var(--vx-bgTop), var(--vx-bgBottom));
          padding: 20px 16px 140px;
          box-sizing: border-box;
        }
        .vx-phone{
          max-width: 420px;
          margin: 0 auto;
          border-radius: 44px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.40);
          box-shadow: 0 25px 80px rgba(2,6,23,0.14);
          overflow: hidden;
        }
        .vx-phoneInner{
          min-height: 820px;
          background: rgba(255,255,255,0.72);
          backdrop-filter: blur(2px);
        }
        .vx-top{
          padding: 16px 16px 10px;
        }
        .vx-title{
          font-size: 14px;
          font-weight: 800;
          letter-spacing: -0.02em;
          color: #0f172a;
        }
        .vx-sub{
          margin-top: 6px;
          font-size: 12px;
          color: rgba(15,23,42,0.65);
          line-height: 1.35;
        }
        .vx-chipRow{
          margin-top: 10px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .vx-chip{
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.75);
          font-size: 11px;
          font-weight: 700;
          color: rgba(15,23,42,0.78);
          backdrop-filter: blur(8px);
        }
        .vx-chipDot{
          width: 8px;
          height: 8px;
          border-radius: 99px;
          background: linear-gradient(135deg, var(--vx-accent), var(--vx-accent2));
        }
        .vx-content{
          padding: 10px 16px 24px;
        }
        .vx-stack{
          display: grid;
          gap: 12px;
        }
        /* чтобы твои старые блоки внутри табов выглядели мягче */
        .vx-content .card{
          border-radius: 22px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.78);
          box-shadow: 0 10px 30px rgba(2,6,23,0.08);
          backdrop-filter: blur(10px);
        }

        /* Bottom bar */
        .vx-bottomWrap{
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 50;
          padding: 0 16px;
          padding-bottom: calc(16px + env(safe-area-inset-bottom));
          box-sizing: border-box;
          pointer-events: none;
        }
        .vx-bottomBar{
          pointer-events: auto;
          max-width: 420px;
          margin: 0 auto;
          border-radius: 28px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.85);
          box-shadow: 0 12px 30px rgba(2,6,23,0.14);
          backdrop-filter: blur(12px);
          padding: 4px;
          display: grid;
          grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        }
        .vx-navBtn{
          position: relative;
          border: 0;
          background: transparent;
          border-radius: 22px;
          padding: 10px 6px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: rgba(15,23,42,0.55);
          font-weight: 700;
          font-size: 10px;
          letter-spacing: -0.01em;
          cursor: pointer;
          user-select: none;
        }
        .vx-navBtnActive{
          color: #0f172a;
        }
        .vx-navPill{
          position: absolute;
          inset: 0;
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(34,197,94,0.20), rgba(6,182,212,0.16));
          border: 1px solid rgba(15,23,42,0.08);
        }
        .vx-navIcon{
          position: relative;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
        }
        .vx-i{
          width: 20px;
          height: 20px;
        }
        .vx-navLabel{
          position: relative;
          max-width: 72px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1;
        }
      `}</style>

      <div className="vx-phone">
        <div className="vx-phoneInner">
          <div className="vx-top">
            <div className="vx-title">{UI.title}</div>
            <div className="vx-sub">
              {me.ok && me.user
                ? `Вы: ${me.user.first_name ?? ""}${me.user.username ? " (@" + me.user.username + ")" : ""} • статус: ${
                    me.status ?? "—"
                  }`
                : me.error ?? "Авторизация..."}
            </div>
            <div className="vx-chipRow">
              <span className="vx-chip">
                <span className="vx-chipDot" />
                Без комиссии
              </span>
              <span className="vx-chip">
                <span className="vx-chipDot" />
                25–40 минут
              </span>
              {me.isOwner ? (
                <span className="vx-chip">
                  <span className="vx-chipDot" />
                  владелец
                </span>
              ) : null}
            </div>
          </div>

          <div className="vx-content">
            {tab === "main" && (
              <div className="vx-stack">
                {/* Сверху курс, ниже калькулятор (как ты просил) */}
                <RatesTab me={me} />
                <CalculatorTab me={me} />
              </div>
            )}

            {tab === "atm" && <AtmTab />}
            {tab === "guide" && <GuideTab />}
            {tab === "reviews" && <ReviewsTab me={me} />}
            {tab === "admin" && me.isOwner && <AdminTab me={me} />}
          </div>
        </div>
      </div>

      <BottomBar active={tab} onChange={setTab} items={bottomTabs} />
    </div>
  );
}
