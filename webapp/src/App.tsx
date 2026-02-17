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

type TabKey = "rates" | "calc" | "atm" | "guide" | "reviews" | "admin";

const UI = {
  title: "Обмен валют — Дананг",
  // Если Google Fonts не грузится в Telegram — будет фолбэк на системный шрифт.
  fontImport:
    "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap",
  accent: "#22c55e",
  accent2: "#06b6d4",
};
const STATUS_RU: Record<UserStatus, string> = {
  standard: "стандарт",
  silver: "серебро",
  gold: "золото",
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
    <div className="vx-bottomWrap" style={{ ["--cols" as any]: String(visible.length) }}>
      <div className="vx-bottomBar">
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
  const [tab, setTab] = useState<TabKey>("rates");

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

  useEffect(() => {
    if (tab === "admin" && !me.isOwner) setTab("rates");
  }, [tab, me.isOwner]);

  const bottomTabs: Array<{ key: TabKey; label: string; show: boolean; icon: React.ReactNode }> = [
    { key: "rates", label: "Курс", show: true, icon: <IconSwap className="vx-i" /> },
    { key: "calc", label: "Калькулятор", show: true, icon: <IconCalc className="vx-i" /> },
    { key: "atm", label: "Банкоматы", show: true, icon: <IconAtm className="vx-i" /> },
    { key: "guide", label: "Гид", show: true, icon: <IconGuide className="vx-i" /> },
    { key: "reviews", label: "Отзывы", show: true, icon: <IconStar className="vx-i" /> },
    { key: "admin", label: "Упр.", show: !!me.isOwner, icon: <IconSettings className="vx-i" /> },
  ];

  return (
    <div className="vx-page">
      <style>{`
        @import url('${UI.fontImport}');

        .vx-page{
          min-height: 100vh;
          padding: 14px 12px;
          box-sizing: border-box;
          color: #0f172a;
          font-family: "Manrope", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial;
          -webkit-font-smoothing: antialiased;
          text-rendering: optimizeLegibility;
          background:
            radial-gradient(1200px 600px at 20% -10%, rgba(34,197,94,0.18), transparent 55%),
            radial-gradient(900px 600px at 90% 0%, rgba(6,182,212,0.14), transparent 55%),
            linear-gradient(180deg, rgba(247,251,255,1), rgba(244,255,248,1));
        }

        /* Базовая типографика */
        .vx-page *{ box-sizing: border-box; }
        .vx-page .h1{ font-size: 22px; font-weight: 900; letter-spacing: -0.02em; }
        .vx-page .small{ font-size: 13px; opacity: 0.85; }

        /* Заголовки внутри вкладок (часто используются классы .h2/.h3) */
        .vx-page .h2{ font-size: 18px; font-weight: 900; letter-spacing: -0.015em; margin: 0 0 10px 0; }
        .vx-page .h3{ font-size: 15px; font-weight: 900; margin: 0 0 8px 0; }
        .vx-page h2{ font-size: 18px; font-weight: 900; margin: 0 0 10px 0; }
        .vx-page h3{ font-size: 15px; font-weight: 900; margin: 0 0 8px 0; }

        /* Приводим карточки к единому премиум-стилю (и для твоих табов тоже) */
        .vx-page .container{ max-width: 420px; margin: 0 auto; }
        .vx-page .card{
          border-radius: 24px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.80);
          box-shadow: 0 10px 30px rgba(2,6,23,0.08);
          backdrop-filter: blur(10px);
          padding: 14px;
        }

        /* На всякий случай: если где-то оставалась старая верхняя панель вкладок */
        .vx-page .tabs{ display: none !important; }

        /* Не ломаем твой layout: гарантируем, что в карточках/формах текст не белый */
        .vx-page .card,
        .vx-page .h1,
        .vx-page .small,
        .vx-page label,
        .vx-page input,
        .vx-page select,
        .vx-page textarea{ color: #0f172a !important; }
        .vx-page input::placeholder,
        .vx-page textarea::placeholder{
          color: rgba(15,23,42,0.45) !important;
        }
        .vx-page input,
        .vx-page select,
        .vx-page textarea{
          max-width: 100%;
          box-sizing: border-box;
        }

        /* Формы — делаем одинаковые высоты и аккуратные радиусы */
        .vx-page input,
        .vx-page select{
          height: 48px;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.16);
          background: rgba(255,255,255,0.92);
          padding: 0 14px;
          font-weight: 800;
          font-size: 15px;
          outline: none;
        }
        .vx-page textarea{
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.16);
          background: rgba(255,255,255,0.92);
          padding: 12px 14px;
          font-weight: 700;
        }
        .vx-page button{ border-radius: 18px; }

        .vx-body{
          /* много места под плавающий бар, чтобы ничего не перекрывалось */
          padding-bottom: calc(170px + env(safe-area-inset-bottom));
        }

        /* Обёртка-карточка для секций (чтобы курс/калькулятор выглядели как бар) */
        .vx-card2{
          border-radius: 26px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.82);
          box-shadow: 0 12px 34px rgba(2,6,23,0.10);
          backdrop-filter: blur(12px);
          padding: 14px;
        }
        /* Если внутри табов уже есть .card — убираем двойные рамки */
        .vx-card2 .card{
          background: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        /* Фикс белого текста внутри секций, но НЕ трогаем кнопки */
        .vx-card2 :where(h1,h2,h3,h4,p,div,span,small,label,li){
          color: #0f172a;
        }
        .vx-card2 button,
        .vx-card2 button *{
          color: inherit;
        }

        .vx-stack{
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .vx-stack > *{
          width: 100%;
          min-width: 0;
        }

        /* Bottom bar (плавающий) */
        .vx-bottomWrap{
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 999;
          padding: 0 12px;
          padding-bottom: calc(12px + env(safe-area-inset-bottom));
          box-sizing: border-box;
          pointer-events: none;
        }
        .vx-bottomBar{
          pointer-events: auto;
          max-width: 420px;
          margin: 0 auto;
          border-radius: 28px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.88);
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
          font-weight: 800;
          font-size: 10px;
          letter-spacing: -0.01em;
          cursor: pointer;
          user-select: none;
        }
        .vx-navBtnActive{ color: #0f172a; }
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
        .vx-i{ width: 20px; height: 20px; }
        .vx-navLabel{
          position: relative;
          max-width: 80px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          line-height: 1;
        }

        /* Telegram WebView иногда даёт странные стили кнопкам */
        .vx-bottomBar button{ -webkit-tap-highlight-color: transparent; }

        /* --- Починка раскладки калькулятора (без доступа к внутренним файлам) ---
           Подхватываем самые типичные классы/структуры: row/calcRow и т.п.
           Если у тебя внутри другие классы — всё равно подействует на select+input в строках.
        */
        .vx-body .row,
        .vx-body .calcRow,
        .vx-body .calc-row,
        .vx-body .exchangeRow,
        .vx-body .exchange-row{
          display: grid !important;
          grid-template-columns: 92px 1fr auto;
          gap: 10px;
          align-items: center;
        }
        .vx-body .row select,
        .vx-body .calcRow select,
        .vx-body .calc-row select,
        .vx-body .exchangeRow select,
        .vx-body .exchange-row select{
          width: 92px;
          padding-right: 28px;
        }
        .vx-body .row input,
        .vx-body .calcRow input,
        .vx-body .calc-row input,
        .vx-body .exchangeRow input,
        .vx-body .exchange-row input{
          width: 100%;
          min-width: 0;
        }
        .vx-body .row button,
        .vx-body .calcRow button,
        .vx-body .calc-row button,
        .vx-body .exchangeRow button,
        .vx-body .exchange-row button{
          height: 48px;
          min-width: 48px;
          padding: 0;
          border: 1px solid rgba(15,23,42,0.16);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 6px 16px rgba(2,6,23,0.06);
        }
      `}</style>

      <div className="container">
        <div className="card">
          <div className="h1">{UI.title}</div>
          <div className="small">
            {me.ok && me.user
              ? `Вы: ${me.user.first_name ?? ""} ${me.user.username ? "(@" + me.user.username + ")" : ""} • статус: ${me.status ? STATUS_RU[me.status] : "—"}`
              : me.error ?? "Авторизация..."}
          </div>
        </div>

        <div className="vx-body">
          {tab === "rates" && (
            <div className="vx-card2">
              <RatesTab me={me} />
            </div>
          )}
          {tab === "calc" && (
            <div className="vx-card2">
              <CalculatorTab me={me} />
            </div>
          )}
          {tab === "atm" && (
            <div className="vx-card2">
              <AtmTab />
            </div>
          )}
          {tab === "guide" && (
            <div className="vx-card2">
              <GuideTab />
            </div>
          )}
          {tab === "reviews" && (
            <div className="vx-card2">
              <ReviewsTab me={me} />
            </div>
          )}
          {tab === "admin" && me.isOwner && (
            <div className="vx-card2">
              <AdminTab me={me} />
            </div>
          )}
        </div>
      </div>

      <BottomBar active={tab} onChange={setTab} items={bottomTabs} />
    </div>
  );
}
