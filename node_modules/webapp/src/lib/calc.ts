import type { Currency, Rates } from "./types";

export function formatAmount(currency: Currency, value: number) {
  if (!Number.isFinite(value)) return "—";
  if (currency === "VND") return Math.round(value).toLocaleString("ru-RU");
  if (currency === "USDT") return value.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function payMethodByCurrency(currency: Currency) {
  if (currency === "USD") return "cash";
  if (currency === "RUB") return "transfer";
  if (currency === "USDT") return "transfer";
  return "cash";
}

export function receiveMethodsByCurrency(currency: Currency) {
  if (currency === "USD") return ["cash"] as const;
  if (currency === "RUB") return ["transfer"] as const;
  if (currency === "USDT") return ["transfer"] as const;
  return ["cash", "transfer", "atm"] as const;
}

export function convertSellAmountToBuyAmount(args: {
  sellCurrency: Currency;
  buyCurrency: Currency;
  sellAmount: number;
  rates: Rates;
}) {
  const { sellCurrency, buyCurrency, sellAmount, rates } = args;

  const toVnd = (cur: Currency, amount: number) => {
    if (cur === "VND") return amount;
    if (cur === "USD") return amount * rates.USD.buy_vnd;
    if (cur === "RUB") return amount * rates.RUB.buy_vnd;
    return amount * rates.USDT.buy_vnd;
  };

  const fromVnd = (cur: Currency, vnd: number) => {
    if (cur === "VND") return vnd;
    if (cur === "USD") return vnd / rates.USD.sell_vnd;
    if (cur === "RUB") return vnd / rates.RUB.sell_vnd;
    return vnd / rates.USDT.sell_vnd;
  };

  const vnd = toVnd(sellCurrency, sellAmount);
  const buyAmount = fromVnd(buyCurrency, vnd);

  return { vnd, buyAmount };
}

export function convertDesiredBuyAmountToSellAmount(args: {
  sellCurrency: Currency;
  buyCurrency: Currency;
  desiredBuyAmount: number;
  rates: Rates;
}) {
  const { sellCurrency, buyCurrency, desiredBuyAmount, rates } = args;

  const buyToVndNeed = (cur: Currency, amount: number) => {
    if (cur === "VND") return amount;
    if (cur === "USD") return amount * rates.USD.sell_vnd;
    if (cur === "RUB") return amount * rates.RUB.sell_vnd;
    return amount * rates.USDT.sell_vnd;
  };

  const vndNeed = buyToVndNeed(buyCurrency, desiredBuyAmount);

  const vndToSell = (cur: Currency, vnd: number) => {
    if (cur === "VND") return vnd;
    if (cur === "USD") return vnd / rates.USD.buy_vnd;
    if (cur === "RUB") return vnd / rates.RUB.buy_vnd;
    return vnd / rates.USDT.buy_vnd;
  };

  const sellAmount = vndToSell(sellCurrency, vndNeed);
  return { vndNeed, sellAmount };
}
