import React, { useEffect, useMemo, useState } from "react";
import { calcFromGRate, DEFAULT_G_FORMULAS, EXCHANGE_RATE_PAIRS } from "../domain/exchange";
import { apiGetGFormulas, apiGetMarketRates } from "../lib/api";
import type { MarketRatesResponse, TodayRatesResponse } from "../lib/types";

type Lang = "ru" | "en";
type Cur = "RUB" | "USD" | "USDT" | "EUR" | "THB" | "VND";

function normalizeEnRateSpacing(value: string, lang: Lang) {
  return lang === "en" ? value.replace(/,/g, " ") : value;
}

function fmt(pairId: string, quote: Cur, n: number | null, lang: Lang) {
  if (n == null || !Number.isFinite(n)) return "—";
  const digits = quote === "VND" ? 0 : pairId === "usd-usdt" ? 3 : 1;
  return normalizeEnRateSpacing(
    new Intl.NumberFormat(lang === "en" ? "en-US" : "ru-RU", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n),
    lang
  );
}

function fmtHumanDate(dateStr: string | null | undefined, lang: Lang) {
  if (!dateStr) return lang === "en" ? "today" : "сегодня";
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return String(dateStr);
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "ru-RU", { day: "numeric", month: "long" });
}

function calcFromVnd(rates: any, base: Cur, quote: Cur): { buy: number | null; sell: number | null } {
  if (!rates) return { buy: null, sell: null };
  if (base === quote) return { buy: 1, sell: 1 };
  const br = base === "VND" ? { buy_vnd: 1, sell_vnd: 1 } : rates?.[base];
  if (!br) return { buy: null, sell: null };
  const baseBuy = Number(br.buy_vnd);
  const baseSell = Number(br.sell_vnd);
  if (!Number.isFinite(baseBuy) || !Number.isFinite(baseSell) || baseBuy <= 0 || baseSell <= 0) return { buy: null, sell: null };
  if (quote === "VND") return { buy: baseBuy, sell: baseSell };
  const qr = rates?.[quote];
  if (!qr) return { buy: null, sell: null };
  const quoteBuy = Number(qr.buy_vnd);
  const quoteSell = Number(qr.sell_vnd);
  if (!Number.isFinite(quoteBuy) || !Number.isFinite(quoteSell) || quoteBuy <= 0 || quoteSell <= 0) return { buy: null, sell: null };
  return { buy: baseBuy / quoteSell, sell: baseSell / quoteBuy };
}

function currencyBadge(cur: Cur): string {
  switch (cur) {
    case "RUB": return "₽";
    case "USDT": return "₮";
    case "USD": return "$";
    case "EUR": return "€";
    case "THB": return "฿";
    case "VND": return "₫";
    default: return cur;
  }
}

function currencyHumanName(cur: Cur, lang: Lang): string {
  if (lang === "en") {
    switch (cur) {
      case "RUB": return "Ruble";
      case "USDT": return "USDT";
      case "USD": return "Dollar";
      case "EUR": return "Euro";
      case "THB": return "Baht";
      case "VND": return "Dong";
      default: return cur;
    }
  }
  switch (cur) {
    case "RUB": return "Рубль";
    case "USDT": return "USDT";
    case "USD": return "Доллар";
    case "EUR": return "Евро";
    case "THB": return "Бат";
    case "VND": return "Донг";
    default: return cur;
  }
}

type Props = { embedded?: boolean; limit?: number; lang?: Lang };

export default function RatesTab({ embedded = false, limit, lang = "ru" }: Props = {}) {
  const isEn = lang === "en";
  const [today, setToday] = useState<TodayRatesResponse | null>(null);
  const [market, setMarket] = useState<MarketRatesResponse | null>(null);
  const [formulas, setFormulas] = useState<Record<string, { buyMul: number; sellMul: number }>>(DEFAULT_G_FORMULAS);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    const loadToday = async () => {
      try {
        const res = await fetch(`/api/rates/today?_=${Date.now()}`, { cache: "no-store" });
        const json = await res.json();
        if (alive) setToday(json);
      } catch {
        if (alive) setToday(null);
      }
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void loadToday();
    };
    void loadToday();
    const id = window.setInterval(() => { void loadToday(); }, 30000);
    document.addEventListener("visibilitychange", refreshIfVisible);
    window.addEventListener("focus", refreshIfVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.removeEventListener("focus", refreshIfVisible);
    };
  }, []);

  useEffect(() => {
    apiGetGFormulas()
      .then((r: any) => {
        if (r && r.ok && r.formulas && typeof r.formulas === "object") setFormulas(r.formulas);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const m = await apiGetMarketRates();
        if (alive) setMarket(m);
      } catch {
        if (alive) setMarket({ ok: false, error: "market_fetch_failed", stale: true } as any);
      }
    };
    void load();
    const id = window.setInterval(load, 15 * 60 * 1000);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  // Tick every minute so the "updated N min ago" label stays fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rates: any = (today as any)?.data?.rates ?? null;
  const isHomePreview = embedded && limit === 3;

  const rows = useMemo(
    () =>
      EXCHANGE_RATE_PAIRS.map((p) => {
        const { buy, sell } = p.mode === "g" ? calcFromGRate(market, formulas, p.base, p.quote) : calcFromVnd(rates, p.base, p.quote);
        return { ...p, buy, sell };
      }),
    [rates, market, formulas]
  );

  const updatedLabel = useMemo(() => {
    const iso = (today as any)?.data?.updated_at;
    if (!iso) return null;
    const t = new Date(String(iso)).getTime();
    if (!Number.isFinite(t)) return null;
    const mins = Math.max(0, Math.round((nowMs - t) / 60_000));
    if (mins < 1) return isEn ? "updated just now" : "обновлён только что";
    if (mins < 60) return isEn ? `updated ${mins} min ago` : `обновлён ${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    return isEn ? `updated ${hours} h ago` : `обновлён ${hours} ч назад`;
  }, [today, nowMs, isEn]);

  const shown = rows.slice(0, limit ?? rows.length);

  if (!today) {
    return <div className="cx-rateUpdated">{isEn ? "Loading…" : "Загрузка…"}</div>;
  }
  if (!rates) {
    return <div className="cx-rateUpdated">{isEn ? "Rates have not been set yet." : "Курс ещё не задан владельцем."}</div>;
  }

  // Compact "Rates today" list on the home screen: unit buy rates for the top pairs.
  if (isHomePreview) {
    const previewIds = ["rub-vnd", "usdt-vnd", "usd-vnd"];
    const preview = rows.filter((r) => previewIds.includes(r.id));
    return (
      <div className="cx-miniRates" role="group" aria-label={isEn ? "Rates today" : "Курс сегодня"}>
        {preview.map((r) => (
          <div key={r.id} className="cx-miniRateRow">
            <span className="cx-miniPair">{r.base} → {r.quote}</span>
            <span className="cx-miniVal">{fmt(r.id, r.quote, r.buy, lang)}</span>
          </div>
        ))}
      </div>
    );
  }

  const hero = rows.find((r) => r.id === "rub-vnd") ?? null;
  const listed = shown.filter((r) => r.id !== "rub-vnd");

  return (
    <div className="cx-rates">
      <div className="cx-rateUpdated">
        {fmtHumanDate(today?.date, lang)}
        {updatedLabel ? ` · ${updatedLabel}` : ""}
      </div>

      {hero ? (
        <div className="cx-rateHero">
          <div className="cx-rateHeroRow">
            <div className="cx-rateHeroLeft">
              <span className="cx-curCircle" data-cur={hero.base} aria-hidden="true">{currencyBadge(hero.base as Cur)}</span>
              <div>
                <div className="cx-rateHeroName">
                  {currencyHumanName(hero.base as Cur, lang)} → {currencyHumanName(hero.quote as Cur, lang)}
                </div>
                <div className="cx-rateHeroSub">{isEn ? "Most popular pair" : "Самая частая пара"}</div>
              </div>
            </div>
            <div>
              <div className="cx-rateHeroVal">{fmt(hero.id, hero.quote as Cur, hero.buy, lang)}</div>
              <div className="cx-rateHeroValSub">{isEn ? "buy ₫" : "покупка ₫"}</div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="cx-rateCols" aria-hidden="true">
        <span>{isEn ? "Pair" : "Пара"}</span>
        <span>{isEn ? "Buy" : "Покупка"}</span>
        <span>{isEn ? "Sell" : "Продажа"}</span>
      </div>

      <div className="cx-rateList" role="table" aria-label={isEn ? "Rates" : "Курс"}>
        {listed.map((r) => (
          <div key={r.id} className="cx-rateItem" role="row">
            <span className="cx-ratePairCell" role="cell">
              <span className="cx-curCircle" data-cur={r.base} aria-hidden="true">{currencyBadge(r.base as Cur)}</span>
              <span className="cx-rateTicker">{r.quote === "VND" ? r.base : `${r.base} → ${r.quote}`}</span>
            </span>
            <span className={"cx-rateBuyVal" + (r.buy == null ? " vx-dash" : "")} role="cell">{fmt(r.id, r.quote as Cur, r.buy, lang)}</span>
            <span className={"cx-rateSellVal" + (r.sell == null ? " vx-dash" : "")} role="cell">{fmt(r.id, r.quote as Cur, r.sell, lang)}</span>
          </div>
        ))}
      </div>

      <div className="cx-rateFoot">
        {isEn ? (
          <>Buy — how many ₫ you get per 1 unit<br />Sell — how many ₫ you pay</>
        ) : (
          <>Покупка — сколько ₫ вы получите за 1 единицу<br />Продажа — сколько ₫ отдадите</>
        )}
      </div>

      {market && !market.ok && !embedded ? (
        <div className="cx-rateUpdated" style={{ marginTop: 10 }}>
          {isEn ? "Failed to refresh G" : "Не удалось обновить G"}: {(market as any).error}
        </div>
      ) : null}
    </div>
  );
}
