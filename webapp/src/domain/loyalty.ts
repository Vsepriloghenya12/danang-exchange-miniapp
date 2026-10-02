import type { UserStatus } from "../lib/types";

// Existing loyalty thresholds, based on completed exchange volume in VND.
export const SILVER_AT_VND = 100_000_000;
export const GOLD_AT_VND = 300_000_000;

/* VND value of one exchange: prefer the VND side of the deal; for cross
   pairs fall back to today's buy rate of the received currency. */
export function vndEquivalent(r: any, rates: any): number | null {
  const buyCur = String(r?.buyCurrency || "");
  const sellCur = String(r?.sellCurrency || "");
  const buyAmt = Number(String(r?.buyAmount ?? "").toString().replace(/[^\d.]/g, ""));
  const sellAmt = Number(String(r?.sellAmount ?? "").toString().replace(/[^\d.]/g, ""));
  if (buyCur === "VND" && Number.isFinite(buyAmt) && buyAmt > 0) return buyAmt;
  if (sellCur === "VND" && Number.isFinite(sellAmt) && sellAmt > 0) return sellAmt;
  const buyRate = Number(rates?.[buyCur]?.buy_vnd);
  if (Number.isFinite(buyRate) && buyRate > 0 && Number.isFinite(buyAmt) && buyAmt > 0) return buyAmt * buyRate;
  const sellRate = Number(rates?.[sellCur]?.buy_vnd);
  if (Number.isFinite(sellRate) && sellRate > 0 && Number.isFinite(sellAmt) && sellAmt > 0) return sellAmt * sellRate;
  return null;
}


export function loyaltyProgress(totalVnd: number, status: UserStatus) {
  const nextStatus: UserStatus | null = status === "standard" ? "silver" : status === "silver" ? "gold" : null;
  const target = nextStatus === "silver" ? SILVER_AT_VND : nextStatus === "gold" ? GOLD_AT_VND : null;
  const start = status === "silver" ? SILVER_AT_VND : 0;
  const remaining = target == null ? 0 : Math.max(0, target - totalVnd);
  const progress = target == null ? 1 : Math.max(0, Math.min(1, (totalVnd - start) / (target - start)));
  return { nextStatus, target, remaining, progress };
}
