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
          isOwner: true
        });
        return;
      }

      const r = await apiAuth(useInit);
      if (r.ok) setMe({ ok: true, initData: useInit, user: r.user, status: r.status, isOwner: r.isOwner });
      else setMe({ ok: false, initData: useInit, error: r.error });
    })();
  }, [tg, isDemo]);

  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: "rates", label: "Курс", show: true },
    { key: "calc", label: "Калькулятор", show: true },
    { key: "atm", label: "Банкоматы", show: true },
    { key: "guide", label: "Гид", show: true },
    { key: "reviews", label: "Отзывы", show: true },
    { key: "admin", label: "Управление", show: !!me.isOwner }
  ];

  return (
    <div className="container">
      <div className="card">
        <div className="h1">Обмен валют — Дананг</div>
        <div className="small">
          {me.ok && me.user
            ? `Вы: ${me.user.first_name ?? ""} ${me.user.username ? "(@" + me.user.username + ")" : ""} • статус: ${me.status}`
            : me.error ?? "Авторизация..."}
        </div>
      </div>

      <div className="tabs">
        {tabs.filter(t => t.show).map(t => (
          <div key={t.key} className={`tab ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "rates" && <RatesTab me={me} />}
      {tab === "calc" && <CalculatorTab me={me} />}
      {tab === "atm" && <AtmTab />}
      {tab === "guide" && <GuideTab />}
      {tab === "reviews" && <ReviewsTab me={me} />}
      {tab === "admin" && me.isOwner && <AdminTab me={me} />}
    </div>
  );
}
