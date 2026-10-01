import React from "react";
import type { CashCoinBonus } from "../lib/cashcoin";
import { cashcoin } from "../lib/referrals";

export default function RequestBonusDetails({ bonus, sellCurrency, buyCurrency, isEn = false }: { bonus?: CashCoinBonus; sellCurrency: string; buyCurrency: string; isEn?: boolean }) {
  if (!bonus || (!bonus.welcomeSell && !bonus.redeemMinor)) return null;
  const amount = (n: number) => n.toLocaleString(isEn ? "en-US" : "ru-RU", { maximumFractionDigits: 2 });
  return <div className="vx-muted" style={{ fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere", margin: "6px 0" }}>
    {bonus.welcomeSell > 0 && <div>{isEn ? "First exchange gift" : "Подарок к первому обмену"}: +{amount(bonus.welcomeSell)} {sellCurrency} → +{amount(bonus.welcomeBuy)} {buyCurrency}</div>}
    {bonus.redeemMinor > 0 && <div>CashCoin: {cashcoin(bonus.redeemMinor)} → +{amount(bonus.redeemBuy)} {buyCurrency}</div>}
    <div>{isEn ? "Payout" : "Получение"}: {amount(bonus.baseBuyAmount)} + {amount(bonus.welcomeBuy + bonus.redeemBuy)} {isEn ? "bonus" : "б"} = {amount(bonus.totalBuy)} {buyCurrency}</div>
  </div>;
}
