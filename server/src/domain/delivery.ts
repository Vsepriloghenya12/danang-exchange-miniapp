// Pure rules shared by the server quote and the client calculator.
export const DELIVERY_FEE_VND = 70_000;
const FREE_DELIVERY_FROM: Record<string, number> = { RUB: 20_000, USD: 200, EUR: 200, USDT: 200, THB: 100_000 };
export type DeliveryInput = { sellCurrency: string; buyCurrency: string; sellAmount: number; buyAmount: number; payMethod?: string | null; receiveMethod?: string | null; status?: string };
export function cashDeliveryFee(input: DeliveryInput, vndToBuy: number) {
  const below = (currency: string, amount: number) => amount > 0 && amount < (FREE_DELIVERY_FROM[currency] ?? 0);
  const paid = input.status !== 'gold' && (input.payMethod === 'cash' || input.receiveMethod === 'cash') &&
    (below(input.sellCurrency, input.sellAmount) || below(input.buyCurrency, input.buyAmount));
  const feeVnd = paid ? DELIVERY_FEE_VND : 0;
  const conversion = input.buyCurrency === 'VND' ? 1 : vndToBuy;
  const available = !paid || Number.isFinite(conversion) && conversion > 0;
  const fee = !paid ? 0 : available ? Number((feeVnd * conversion).toFixed(input.buyCurrency === 'VND' ? 0 : 2)) : NaN;
  return { feeVnd, fee, available };
}

// Find the smallest gross payout that covers a requested net amount, including
// the jump when an exchange qualifies for free delivery.
export function grossForNetDelivery(net: number, bonusFraction: number, redeemed: number, feeForGross: (gross: number) => number): number {
  if (!(net > 0)) return 0;
  const base = Math.max(0, (net - redeemed) / (1 + bonusFraction));
  if (feeForGross(base) === 0) return base;
  let low = base, high = base + feeForGross(base) / (1 + bonusFraction);
  if (!Number.isFinite(high)) return NaN;
  for (let i = 0; i < 48; i++) {
    const mid = (low + high) / 2;
    if (mid * (1 + bonusFraction) + redeemed - feeForGross(mid) >= net) high = mid; else low = mid;
  }
  return high;
}
