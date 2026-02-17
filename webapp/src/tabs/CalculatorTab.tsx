import React, { useEffect, useMemo, useRef, useState } from "react";

type Currency = "RUB" | "USDT" | "USD" | "EUR" | "THB" | "VND";
type ReceiveMethod = "cash" | "transfer" | "atm";
type PayMethod = "cash" | "transfer";
type ClientStatus = "standard" | "silver" | "gold";

type RateKey = Exclude<Currency, "VND">;
type RateEntry = { buy_vnd: number; sell_vnd: number };
type Rates = Partial<Record<RateKey, RateEntry>>;

const PAIRS_ORDER: Array<[Currency, Currency]> = [
  ["RUB", "VND"],
  ["USDT", "VND"],
  ["USD", "VND"],
  ["EUR", "VND"],
  ["THB", "VND"],
  ["RUB", "USDT"],
  ["RUB", "USD"],
  ["RUB", "EUR"],
  ["RUB", "THB"], // у тебя было "rud-thb" — считаю опечаткой
  ["USD", "USDT"],
  ["EUR", "USD"],
  ["EUR", "USDT"],
  ["THB", "USD"],
  ["THB", "USDT"],
  ["THB", "EUR"],
];

function pairId(a: Currency, b: Currency) {
  return `${a}-${b}`;
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

function methodLabel(m: ReceiveMethod | PayMethod) {
  if (m === "cash") return "Наличные";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

function allowedReceiveMethods(buyCurrency: Currency): ReceiveMethod[] {
  // Логика как раньше + для новых валют:
  // ВND: все варианты
  // USD/EUR/THB: наличные (если хочешь — скажи, сделаю по твоим правилам)
  // RUB/USDT: перевод
  if (buyCurrency === "VND") return ["cash", "transfer", "atm"];
  if (buyCurrency === "RUB") return ["transfer"];
  if (buyCurrency === "USDT") return ["transfer"];
  if (buyCurrency === "USD") return ["cash"];
  if (buyCurrency === "EUR") return ["cash"];
  if (buyCurrency === "THB") return ["cash"];
  return ["cash"];
}

function getRate(rates: Rates | null, c: Currency): RateEntry | null {
  if (!rates) return null;
  if (c === "VND") return { buy_vnd: 1, sell_vnd: 1 }; // не используем напрямую, но удобно
  const r = rates[c as RateKey];
  if (!r) return null;
  const buy = Number(r.buy_vnd);
  const sell = Number(r.sell_vnd);
  if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) return null;
  return { buy_vnd: buy, sell_vnd: sell };
}

/**
 * Надбавка по статусу/сумме:
 * - RUB: +1..+5
 * - USD/USDT:
 *   <1000:  silver +100, gold +150
 *   1000–3000: standard +100, silver +150, gold +200
 *   >=3000: standard +150, silver +200, gold +250
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

    // ✅ “дыра” закрыта: 1000–3000
    if (a < 3000) {
      if (status === "standard") return 100;
      if (status === "silver") return 150;
      return 200; // gold
    }

    // >=3000
    if (status === "standard") return 150;
    if (status === "silver") return 200;
    return 250; // gold
  }

  return 0;
}

/**
 * Доп. коэффициент ATM/Перевод:
 * - применяется только когда покупаем VND и receiveMethod = transfer/atm
 * - если ХОТЬ ЧТО-ТО = “Наличные” (payMethod или receiveMethod) — бонус отменяем
 * - шаг: RUB +1, USD/USDT +100
 */
function methodBonusForRate(
  sellCurrency: Currency,
  buyCurrency: Currency,
  payMethod: PayMethod,
  receiveMethod: ReceiveMethod
): number {
  if (buyCurrency !== "VND") return 0;

  // ✅ если хоть что-то "наличные" — бонус отменяем
  if (payMethod === "cash" || receiveMethod === "cash") return 0;

  // сюда мы попадаем только если receiveMethod = transfer | atm
  if (receiveMethod === "transfer" || receiveMethod === "atm") {
    if (sellCurrency === "RUB") return 1;
    if (sellCurrency === "USD" || sellCurrency === "USDT") return 100;
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
  const next: Rates = { ...baseRates };

  // бонусы применяем только когда ОТДАЁМ (RUB/USD/USDT) и ПОЛУЧАЕМ VND
  if (buyCurrency === "VND" && sellCurrency !== "VND") {
    const r = getRate(baseRates, sellCurrency);
    if (!r) return next;

    const tier = tierBonusForRate(sellCurrency, sellAmountForTier, status);
    const method = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);

    next[sellCurrency as RateKey] = {
      buy_vnd: r.buy_vnd + tier + method,
      sell_vnd: r.sell_vnd,
    };
  }

  return next;
}

function calcBuyAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, sellAmount: number): number {
  if (sellAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return sellAmount;

  let vnd: number;

  if (sellCurrency === "VND") vnd = sellAmount;
  else {
    const sr = getRate(rates, sellCurrency);
    if (!sr) return Number.NaN;
    vnd = sellAmount * sr.buy_vnd;
  }

  if (buyCurrency === "VND") return vnd;

  const br = getRate(rates, buyCurrency);
  if (!br) return Number.NaN;
  return vnd / br.sell_vnd;
}

function calcSellAmount(rates: Rates, sellCurrency: Currency, buyCurrency: Currency, buyAmount: number): number {
  if (buyAmount <= 0) return 0;
  if (sellCurrency === buyCurrency) return buyAmount;

  const vndCost = (() => {
    if (buyCurrency === "VND") return buyAmount;
    const br = getRate(rates, buyCurrency);
    if (!br) return Number.NaN;
    return buyAmount * br.sell_vnd;
  })();

  if (!Number.isFinite(vndCost)) return Number.NaN;

  if (sellCurrency === "VND") return vndCost;

  const sr = getRate(rates, sellCurrency);
  if (!sr) return Number.NaN;
  return vndCost / sr.buy_vnd;
}

function calcPairRate(rates: Rates | null, a: Currency, b: Currency): number | null {
  if (!rates) return null;
  const one = 1;
  const r = calcBuyAmount(rates, a, b, one);
  return Number.isFinite(r) ? r : null;
}

export default function CalculatorTab(props: any) {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState<Rates | null>(null);

  // стартовая пара
  const [sellCurrency, setSellCurrency] = useState<Currency>("RUB");
  const [buyCurrency, setBuyCurrency] = useState<Currency>("VND");

  const [sellText, setSellText] = useState("");
  const [buyText, setBuyText] = useState("");

  const lastEdited = useRef<"sell" | "buy">("sell");

  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [receiveMethod, setReceiveMethod] = useState<ReceiveMethod>("cash");

  const [clientStatus, setClientStatus] = useState<ClientStatus>(normalizeStatus(props?.user?.status));

  // пары в порядке + “custom” (если вдруг получилась не из списка)
  const knownPairIds = useMemo(() => new Set(PAIRS_ORDER.map(([a, b]) => pairId(a, b))), []);
  const currentPairId = pairId(sellCurrency, buyCurrency);
  const pairSelectValue = knownPairIds.has(currentPairId) ? currentPairId : "custom";

  // подстроим receiveMethod под валюту получения
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

  // подтянуть статус если есть /api/me (не обязателен)
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

  // проверка “есть ли курс” (чтобы не было белого экрана)
  const missing = useMemo(() => {
    const miss: Currency[] = [];
    if (!rates) return miss;
    if (sellCurrency !== "VND" && !getRate(rates, sellCurrency)) miss.push(sellCurrency);
    if (buyCurrency !== "VND" && !getRate(rates, buyCurrency)) miss.push(buyCurrency);
    return Array.from(new Set(miss));
  }, [rates, sellCurrency, buyCurrency]);

  const canCalc = !!rates && missing.length === 0;

  // пересчёт
  useEffect(() => {
    if (!rates) return;
    if (!canCalc) return;

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
      const next = sellText && Number.isFinite(out) ? formatAmount(buyCurrency, out) : "";
      if (next !== buyText) setBuyText(next);
    } else {
      let guess = calcSellAmount(rates, sellCurrency, buyCurrency, buyAmount);

      // 2–3 итерации чтобы учесть бонус, зависящий от суммы
      for (let i = 0; i < 3; i++) {
        const effectiveRates = applyRateBonuses(
          rates,
          sellCurrency,
          buyCurrency,
          Number.isFinite(guess) ? guess : 0,
          clientStatus,
          payMethod,
          receiveMethod
        );
        const nextGuess = calcSellAmount(effectiveRates, sellCurrency, buyCurrency, buyAmount);
        if (!Number.isFinite(nextGuess)) break;
        if (Math.abs(nextGuess - guess) < 1e-7) {
          guess = nextGuess;
          break;
        }
        guess = nextGuess;
      }

      const next = buyText && Number.isFinite(guess) ? formatAmount(sellCurrency, guess) : "";
      if (next !== sellText) setSellText(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellText, buyText, sellCurrency, buyCurrency, rates, payMethod, receiveMethod, clientStatus, canCalc]);

  function onSelectPair(id: string) {
    const found = PAIRS_ORDER.find(([a, b]) => pairId(a, b) === id);
    if (!found) return;
    const [a, b] = found;
    setSellCurrency(a);
    setBuyCurrency(b);
    // не трогаем суммы — пользователь может менять пары “на лету”
  }

  function swapDirection() {
    // ✅ одна кнопка, без дублей
    setSellCurrency(buyCurrency);
    setBuyCurrency(sellCurrency);
    const a = sellText;
    const b = buyText;
    setSellText(b);
    setBuyText(a);
  }

  const rateInfo = useMemo(() => {
    if (!rates) return null;

    // показываем “эффективный курс” только для пар * -> VND, где применяются бонусы
    if (buyCurrency !== "VND") return null;
    if (!(sellCurrency === "RUB" || sellCurrency === "USD" || sellCurrency === "USDT")) return null;

    const base = getRate(rates, sellCurrency)?.buy_vnd ?? null;
    if (!base) return null;

    const tier = tierBonusForRate(sellCurrency, sellAmount, clientStatus);
    const m = methodBonusForRate(sellCurrency, buyCurrency, payMethod, receiveMethod);
    return { base, tier, m, eff: base + tier + m };
  }, [rates, sellCurrency, buyCurrency, sellAmount, clientStatus, payMethod, receiveMethod]);

  const canSend =
    canCalc &&
    sellCurrency !== buyCurrency &&
    parseNum(sellText) > 0 &&
    parseNum(buyText) > 0 &&
    !!receiveMethod;

  async function sendRequest() {
    if (!canSend || !rates) return;

    const tg2 = getTg();
    const initData = tg2?.initData || "";
    if (!initData) {
      tg2?.showAlert?.("Нет initData. Открой мини-приложение через /start в Telegram.");
      return;
    }

    const payload = {
      sellCurrency,
      buyCurrency,
      sellAmount: parseNum(sellText),
      buyAmount: parseNum(buyText),
      payMethod,      // добавил (можно игнорировать на сервере)
      receiveMethod,
    };

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `tma ${initData}` },
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
      <style>{`
        .vx-calc{ display:flex; flex-direction:column; gap:12px; }
        .vx-title{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
        .vx-muted{ font-size:12px; color: rgba(15,23,42,0.55); font-weight:800; }
        .vx-box{
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.62);
          border-radius: 22px;
          padding: 12px;
          overflow: hidden;
        }
        .vx-row{
          display:grid;
          grid-template-columns: 110px 1fr;
          gap:10px;
          align-items:center;
        }
        .vx-row select, .vx-row input{
          width:100%;
          height:48px;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.12);
          background: rgba(255,255,255,0.92);
          padding: 0 14px;
          font-size: 14px;
          font-weight: 900;
          color: #0f172a;
          outline: none;
          box-sizing:border-box;
        }
        .vx-row input::placeholder{ color: rgba(15,23,42,0.45); font-weight: 800; }

        .vx-swapWrap{ display:flex; justify-content:center; padding: 8px 0; }
        .vx-swapBtn{
          height:44px;
          min-width: 52px;
          padding: 0 14px;
          display:grid;
          place-items:center;
          border-radius: 18px;
          border: 1px solid rgba(15,23,42,0.16);
          background: rgba(255,255,255,0.92);
          box-shadow: 0 6px 16px rgba(2,6,23,0.06);
          cursor:pointer;
          font-weight: 950;
          color: #0f172a;
          user-select:none;
        }

        .vx-section{ margin-top: 10px; font-size: 12px; font-weight: 900; color: rgba(15,23,42,0.62); }
        .vx-methods{ display:flex; gap:8px; flex-wrap:wrap; margin-top: 6px; }
        .vx-pill{
          border-radius: 999px;
          border: 1px solid rgba(15,23,42,0.12);
          background: rgba(255,255,255,0.70);
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 900;
          color: #0f172a;
          cursor:pointer;
          user-select:none;
        }
        .vx-pillActive{
          border-color: rgba(15,23,42,0.10);
          background: linear-gradient(135deg, rgba(34,197,94,0.22), rgba(6,182,212,0.18));
        }

        .vx-rateLine{ margin-top: 10px; font-size: 12px; font-weight: 900; color: rgba(15,23,42,0.72); }
        .vx-rateLine b{ color: rgba(15,23,42,0.92); }

        .vx-primary{
          height: 52px;
          border-radius: 18px;
          border: 0;
          width: 100%;
          cursor: pointer;
          font-weight: 950;
          letter-spacing: -0.01em;
          color: white;
          background: linear-gradient(135deg, var(--vx-accent, #22c55e), var(--vx-accent2, #06b6d4));
          box-shadow: 0 18px 40px rgba(34,197,94,0.22);
        }
        .vx-primary:disabled{ opacity: 0.55; cursor: not-allowed; }

        .vx-help{ font-size: 12px; color: rgba(15,23,42,0.60); font-weight: 700; line-height: 1.35; }
        .vx-warn{ font-size: 12px; color: rgba(185,28,28,0.85); font-weight: 900; }
        .vx-list{ margin-top:10px; display:flex; flex-direction:column; gap:6px; }
        .vx-item{
          display:flex;
          justify-content:space-between;
          gap:10px;
          padding:10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(15,23,42,0.10);
          background: rgba(255,255,255,0.55);
          font-size:12px;
          font-weight:900;
          color:#0f172a;
        }
        .vx-item span:last-child{ color: rgba(15,23,42,0.78); }
      `}</style>

      <div className="vx-title">
        <div style={{ fontSize: 18, fontWeight: 950 }}>Калькулятор</div>
        <div className="vx-muted">Статус: {statusLabel(clientStatus)}</div>
      </div>

      {loading && <div className="vx-help">Загрузка курсов…</div>}
      {!loading && !rates && (
        <div className="vx-help">Курсы не загружены. Проверь курс на сегодня.</div>
      )}

      <div className="vx-box">
        {/* Пары в нужном порядке */}
        <div className="vx-row">
          <select value={pairSelectValue} onChange={(e) => onSelectPair(e.target.value)}>
            {PAIRS_ORDER.map(([a, b]) => (
              <option key={pairId(a, b)} value={pairId(a, b)}>
                {a} → {b}
              </option>
            ))}
            {!knownPairIds.has(currentPairId) && (
              <option value="custom">
                {sellCurrency} → {buyCurrency}
              </option>
            )}
          </select>
          <div className="vx-help" style={{ margin: 0 }}>
            Валютная пара
          </div>
        </div>

        <div style={{ height: 10 }} />

        <div className="vx-row">
          <div className="vx-help" style={{ margin: 0, fontWeight: 900 }}>
            Отдаю ({sellCurrency})
          </div>
          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={sellText}
            onChange={(e) => {
              lastEdited.current = "sell";
              setSellText(e.target.value);
            }}
          />
        </div>

        <div className="vx-swapWrap">
          <button type="button" className="vx-swapBtn" onClick={swapDirection} title="Поменять направление">
            ⇄
          </button>
        </div>

        <div className="vx-row">
          <div className="vx-help" style={{ margin: 0, fontWeight: 900 }}>
            Получаю ({buyCurrency})
          </div>
          <input
            inputMode="decimal"
            placeholder="Сумма"
            value={buyText}
            onChange={(e) => {
              lastEdited.current = "buy";
              setBuyText(e.target.value);
            }}
          />
        </div>

        {missing.length > 0 && (
          <div style={{ marginTop: 10 }} className="vx-warn">
            Нет курса для: {missing.join(", ")}. Задай EUR/THB в курсе на сегодня — и всё заработает.
          </div>
        )}

        <div className="vx-section">Как отдаёте деньги</div>
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

        <div className="vx-section">Как получаете</div>
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
            {rateInfo.m ? (
              <>
                {" "}
                + <b>{rateInfo.m}</b>
              </>
            ) : null}
            {rateInfo.tier ? (
              <>
                {" "}
                + <b>{rateInfo.tier}</b>
              </>
            ) : null}
            {" = "}
            <b>{rateInfo.eff}</b>
          </div>
        )}

        <div style={{ height: 12 }} />

        <button type="button" onClick={sendRequest} disabled={!canSend} className="vx-primary">
          Оформить заявку
        </button>

        <div style={{ height: 10 }} />
        <div className="vx-help">
          Если хоть что-то выбрано «Наличные» — надбавка за «Перевод/Банкомат» не применяется.
        </div>

        {/* Список курсов по парам (в том же порядке) */}
        <div className="vx-section">Курс по парам</div>
        <div className="vx-list">
          {PAIRS_ORDER.map(([a, b]) => {
            const r = calcPairRate(rates, a, b);
            return (
              <div className="vx-item" key={"list-" + pairId(a, b)}>
                <span>
                  {a} → {b}
                </span>
                <span>{r === null ? "—" : r >= 100 ? r.toFixed(2) : r.toFixed(6)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
