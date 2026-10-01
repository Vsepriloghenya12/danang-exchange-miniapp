import type { MyReferrals } from "./referrals";

export type CashCoinBonus = {
  version: 1; baseBuyAmount: number; welcomeSell: number; welcomeBuy: number;
  redeemMinor: number; redeemBuy: number; totalBuy: number; availableMinor: number; key: string;
};
const roundDown = (currency: string, amount: number) => {
  const scale = currency === "VND" ? 1 : 100;
  return Math.floor((amount + Number.EPSILON * Math.max(1, amount)) * scale) / scale;
};

// A local preview only. The server checks the balance and the quote again under a lock.
export function cashCoinPreview(wallet: MyReferrals | null, redeem: boolean, sellCurrency: string, buyCurrency: string, sellAmount: number, buyAmount: number) {
  const available = wallet?.availableCents ?? wallet?.balanceCents ?? 0;
  const coinRate = wallet?.walletQuote?.rates[`RUB>${buyCurrency}`];
  const redeemMinor = redeem && Number.isFinite(coinRate) && coinRate! > 0 ? available : 0;
  const welcomeSell = wallet?.welcomeAvailable && sellAmount > 0 ? roundDown(sellCurrency, sellAmount * .005) : 0;
  const welcomeBuy = welcomeSell && buyAmount > 0 ? roundDown(buyCurrency, buyAmount * welcomeSell / sellAmount) : 0;
  const redeemBuy = redeemMinor ? roundDown(buyCurrency, redeemMinor / 100 * coinRate!) : 0;
  return { welcomeSell, welcomeBuy, redeemMinor, redeemBuy,
    totalBuy: Number((buyAmount + welcomeBuy + redeemBuy).toFixed(buyCurrency === "VND" ? 0 : 2)),
    canRedeem: available > 0 && Number.isFinite(coinRate) && coinRate! > 0,
  };
}
