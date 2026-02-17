import React, { useEffect, useMemo, useRef, useState } from "react";

type Currency = "RUB" | "USD" | "USDT" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type PayMethod = "cash" | "transfer";
type ClientStatus = "standard" | "silver" | "gold";

type Rates = {
  USD: { buy_vnd: number; sell_vnd: number };
  RUB: { buy_vnd: number; sell_vnd: number };
  USDT: { buy_vnd: number; sell_vnd: number };
};

type RateKey = Exclude<Currency, "VND">;
function isRateKey(c: Currency): c is RateKey {
  return c !== "VND";
}

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function parseNum(input: string): number {
  const s = (input || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(cur: Currency, n: number) {
  if (!Number.isFinite(n)) return "";
  if (cur === "VND") return Math.round(n).toString();
  return (Math.round(n * 100) / 100).toString();
}

function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  // правила из твоей логики
  if (buyCurrency === "USD") return ["cash"]; // доллары только наличкой
  if (buyCurrency === "RUB") return ["transfer"]; // рубли только перевод
  if (buyCurrency === "USDT") return ["transfer"]; // usdt только перевод
  return ["cash", "transfer", "atm"]; // VND
}

function methodLabel(m: ReceiveMethod | PayMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

function normalizeStatus(s: any): ClientStatus {
  const v = String(s ?? "").toLowerCase().trim();
  if (["gold", "голд", "золото"].includes(v)) return "gold";
  if (["silver", "силвер", "сильвер", "серебро"].includes(v)) return "silver";
  return "standard";
}

function statusLabel(s: ClientStatus) {
  if (s === "gold") return "Голд";
  if (s === "silver") return "Сильвер";
  return "Стандарт";
}

/**
 * Доп. коэффициент за ATM/перевод.
 * Считаем ТОЛЬКО когда получаем VND и receiveMethod=transfer/atm.
 * ВАЖНОЕ ПРАВИЛО: если ХОТЬ ЧТО-ТО стоит на «наличные» (payMethod или receiveMethod) — бонус НЕ считаем.
 *
 * Шаги:
 * - для RUB: +1
 * - для USD/USDT: +100
 */
function methodBonusForRate(
  sellCurrency: Currency,
  buyCurrency: Currency,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod
): number {
  if (buyCurrency !== "VND") return 0;

  // если хоть где-то наличные — отменяем ATM/перевод бонус
  if (payMethod === "cash" || receiveMethod === "cash") return 0;

  // бонус только если получаем через перевод/банкомат
  if (receiveMethod !== "transfer" && receiveMethod !== "atm") return 0;

  if (sellCurrency === "RUB") return 1;
  if (sellCurrency === "USD" || sellCurrency === "USDT") return 100;

  return 0;
}

/**
 * Надбавка по статусу/сумме.
 * RUB (₽):
 *  <50k:   standard 0,  silver +1, gold +2
 *  50-100: standard +1, silver +2, gold +3
 *  100-200:standard +2, silver +3, gold +4
 *  200k+:  standard +3, silver +4, gold +5
 *
 * USD/USDT:
 *  <1000:  standard 0,   silver +100, gold +150
 *  1000-3000: standard +100, silver +150, gold +200
 *  3000+:  standard +150, silver +200, gold +250
 */
function tierBonusForRate(sellCurrency: Currency, sellAmount: number, status: ClientStatus): number {
  if (sellAmount <= 0) return 0;

  if (sellCurrency === "RUB") {
    const a = sellAmount;
    if (a < 50_000) {
      if (status === "silver") return 1;
      if (status === "gold") return 2;
      return 0;
    }
    if (a < 100_000) {
      if (status === "standard") return 1;
      if (status === "silver") return 2;
      return 3;
    }
    if (a < 200_000) {
      if (status === "standard") return 2;
      if (status === "silver") return 3;
      return 4;
    }
    if (status === "standard") return 3;
    if (status === "silver") return 4;
    return 5;
  }

  if (sellCurrency === "USD" || sellCurrency === "USDT") {
    const a = sellAmount;

    if (a < 1000) {
      if (status === "silver") return 100;
      if (status === "gold") return 150;
      return 0;
    }
    if (a < 3000) {
      if (status === "standard") return 100;
      if (status === "silver") return 150;
      return 200;
    }
    if (status === "standard") return 150;
    if (status === "silver") return 200;
    return 250;
  }

  return 0;
}

function applyRateBonuses(
  baseRates: Rates,
  sellCurrency: Currency,
  buyCurrency: Currency,
  sellAmountForTier: number,
  status: ClientStatus,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod
): Rates {
  const next: Rates = {
    USD: { ...baseRates.USD },
    RUB: { ...baseRates.RUB },
    USDT: { ...baseRates.USDT },
  };

  // бонусы применяем только когда ОТДАЁМ (RUB/USD/USDT) и ПОЛУЧАЕМ VND
  if (buyCurrency === "VND" && isRateKey(sellCurrency)) {
    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status);
    const method = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    next[sellCurrency].buy_vnd = baseRates[sellCurrency].buy_vnd + tier + method;
  }

  return next;
}

// sell -> VND по buy_vnd (если sell != VND)
// VND -> buy по sell_vnd (если buy != VND)
function calcBuyAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  const vnd =
    sellCurrency === "VND" ? sellAmount : sellAmount * rates[sellCurrency as RateKey].buy_vnd;

  if (buyCurrency === "VND") return vnd;
  return vnd / rates[buyCurrency as RateKey].sell_vnd;
}

function calcSellAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const vndCost = buyCurrency === "VND" ? buyAmount : buyAmount * rates[buyCurrency as RateKey].sell_vnd;
  if (sellCurrency === "VND") return vndCost;
  return vndCost / rates[sellCurrency as RateKey].buy_vnd;
}

export default function CalculatorTab(_props: any) {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);

  const [sellCurrency, setSellCurrency] = useState<Currency>("USD");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");

  // ✅ как отдаёт (нал/перевод)
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  // ✅ как получает (нал/перевод/банкомат)
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeStatus(_props?.user?.status));

  useEffect(() => {
    const allowed = allowedReceiveMethods(buyCurrency);
    if (!allowed.includes(receiveMethod)) setReceiveMethod(allowed[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyCurrency]);

  useEffect(() => {
    tg?.ready?.();
    tg?.expand?.();

    (async () => {
      try {
        const res = await fetch("/api/rates/today");
        const json = await res.json();
        const r: Rates | null = json?.data?.rates ?? null;
        setRates(r);
      } catch {
        setRates(null);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // статус (если есть /api/me — тихо подхватим)
  useEffect(() => {
    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) return;

    (async () => {
      try {
        const res = await fetch("/api/me", { headers: { Authorization: `tma ${initData}` } });
        const json = await res.json();
        const raw = json?.data?.status ?? json?.status ?? json?.data?.user?.status ?? json?.user?.status;
        if (raw) setClientStatus(normalizeStatus(raw));
      } catch {
        // ignore
      }
    })();
  }, []);

  const sellAmount = useMemo(() => parseNum(sellText), [sellText]);
  const buyAmount = useMemo(() => parseNum(buyText), [buyText]);

  // пересчёт
  useEffect(() => {
    if (!rates) return;

    if (lastEdited.current === "sell") {
      const effectiveRates = applyRateBonuses(
        rates,
        sellCurrency,
        buyCurrency,
        sellAmount,
        clientStatus,
        payMethod,
        receiveMethod
      );
      const out = calcBuyAmount(effectiveRates, sellCurrency, buyCurrency, sellAmount);
      const next = sellText ? formatAmount(buyCurrency, out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      // если вводят "получу" — считаем сколько нужно отдать, учитывая что бонус зависит от суммы
      let guess = calcSellAmount(rates, sellCurrency, buyCurrency, buyAmount);
      for (let i = 0; i < 3; i++) {
        const effectiveRates = applyRateBonuses(
          rates,
          sellCurrency,
          buyCurrency,
          guess,
          clientStatus,
          payMethod,
          receiveMethod
        );
        const nextGuess = calcSellAmount(effectiveRates, sellCurrency, buyCurrency, buyAmount);
        if (Math.abs(nextGuess - guess) < 1e-7) {
          guess = nextGuess;
          break;
        }
        guess = nextGuess;
      }

      const next = buyText ? formatAmount(sellCurrency, guess) : "";
      if (next !== sellText) setSellText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellText, buyText, sellCurrency, buyCurrency, rates, payMethod, receiveMethod, clientStatus]);

  const rateInfo = useMemo(() => {
    if (!rates) return null;
    if (buyCurrency !== "VND") return null;
    if (!(sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) return null;

    const amt = parseNum(sellText);
    const base = rates[sellCurrency].buy_vnd;
    const tier = tierBonusForRate(sellCurrency, amt, clientStatus);
    const m = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    return { base, tier, m, eff: base + tier + m };
  }, [rates, sellCurrency, buyCurrency, sellText, clientStatus, payMethod, receiveMethod]);

  const canSend =
    !!rates &&
    sellCurrency !== buyCurrency &&
    parseNum(sellText) > 0 &&
    parseNum(buyText) > 0 &&
    !!receiveMethod;

  function swapCurrencies() {
    setSellCurrency(buyCurrency);
    setBuyCurrency(sellCurrency);
    const a = sellText;
    const b = buyText;
    setSellText(b);
    setBuyText(a);
  }

  async function sendRequest() {
    if (!canSend || !rates) return;

    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) {
      tg2?.showAlert?.("Нет initData. Открой мини-приложение из Telegram (/start).");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseNum(sellText),
      buyAmount: parseNum(buyText),
      payMethod, // ✅ новое
      receiveMethod,
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!json?.ok) {
        tg2?.HapticFeedback?.notificationOccurred?.("error");
        tg2?.showAlert?.(`Ошибка: ${json?.error || "fail"}`);
        return;
      }

      tg2?.HapticFeedback?.notificationOccurred?.("success");
      tg2?.showPopup?.({
        title: "Отправлено",
        message: "Заявка отправлена в группу ✅",
        buttons: [{ type: "ok" }],
      });
    } catch (e: any) {
      tg2?.HapticFeedback?.notificationOccurred?.("error");
      tg2?.showAlert?.(`Ошибка сети: ${e?.message || e}`);
    }
  }

  return (
    <div className="vx-calc">
<div className="vx-calcTitle">
        <div className="h2 vx-m0">Калькулятор</div>
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
      </div>

      {loading && <div className="vx-help">Загрузка курсов…</div>}
      {!loading && !rates && (
        <div className="vx-help">
          Курсы не загружены. Проверь, что владелец задал курс на сегодня.
        </div>
      )}

      <div className="vx-calcBox">
        <div className="vx-exRow">
          <select value={sellCurrency} onChange={(e) => setSellCurrency(e.target.value as Currency)}>
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
                        <option value="EUR">EUR</option>
            <option value="THB">THB</option>
<option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={sellText}
            onChange={(e) => {
              lastEdited.current = "sell";
              setSellText(e.target.value);
            }}
          />

          <button type="button" onClick={swapCurrencies} className="vx-iconBtn" title="Поменять местами">
            ⇄
          </button>
        </div>

        <div className="vx-sp10" />

        <div className="vx-exRow">
          <select value={buyCurrency} onChange={(e) => setBuyCurrency(e.target.value as Currency)}>
            <option value="RUB">RUB</option>
            <option value="USD">USD</option>
            <option value="USDT">USDT</option>
                        <option value="EUR">EUR</option>
            <option value="THB">THB</option>
<option value="VND">VND</option>
          </select>

          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={buyText}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(e.target.value);
            }}
          />

          <div className="vx-iconBtn vx-iconBtnGhost" aria-hidden="true">⇄</div>
        </div>

        <div className="vx-subTitle">Как отдаёте деньги</div>
        <div className="vx-methods">
          {(["cash", "transfer"] as PayMethod[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPayMethod(m)}
              className={"vx-pill " + (payMethod === m ? "vx-pillActive" : "")}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>

        <div className="vx-subTitle">Как получаете</div>
        <div className="vx-methods">
          {allowedReceiveMethods(buyCurrency).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setReceiveMethod(m)}
              className={"vx-pill " + (receiveMethod === m ? "vx-pillActive" : "")}
            >
              {methodLabel(m)}
            </button>
          ))}
        </div>

        {rateInfo && (
          <div className="vx-rateLine">
            Курс: <b>{rateInfo.base}</b>
            {rateInfo.m ? <> + <b>{rateInfo.m}</b></> : null}
            {rateInfo.tier ? <> + <b>{rateInfo.tier}</b></> : null}
            {" = "}
            <b>{rateInfo.eff}</b>
          </div>
        )}

        <div className="vx-sp12" />

        <button type="button" onClick={sendRequest} disabled={!canSend} className="vx-primary">
          Оформить заявку
        </button>

        <div className="vx-sp10" />
        <div className="vx-help">
          Вводи сумму в любом поле — второе пересчитается автоматически. Если где-то выбрано «Наличные» —
          надбавка за «Перевод/Банкомат» не применяется.
        </div>
      </div>
    </div>
  );
}
