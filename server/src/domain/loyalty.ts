export const SILVER_AT_VND = 100_000_000;
export const GOLD_AT_VND = 300_000_000;

// Count a completed deal once. Cross pairs use its saved quote or historical rates.
export function vndEquivalent(r: any, rates?: any): number | null {
  const buy = Number(r.buyAmount), sell = Number(r.sellAmount);
  const positive = (n: number) => Number.isFinite(n) && n > 0;
  if (r.buyCurrency === 'VND' && positive(buy)) return buy;
  if (r.sellCurrency === 'VND' && positive(sell)) return sell;
  for (const [currency, amount] of [[r.buyCurrency, buy], [r.sellCurrency, sell]] as const) {
    const rate = Number(r.cashcoin?.quote?.rates?.[`${currency}>VND`] ?? rates?.[currency]?.buy_vnd);
    if (positive(amount) && positive(rate) && positive(amount * rate)) return amount * rate;
  }
  return null;
}
