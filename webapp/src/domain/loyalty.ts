import type { UserStatus } from "../lib/types";

import { SILVER_AT_VND, GOLD_AT_VND } from '../../../server/src/domain/loyalty';
export { SILVER_AT_VND, GOLD_AT_VND, vndEquivalent } from '../../../server/src/domain/loyalty';


export function loyaltyProgress(totalVnd: number, status: UserStatus) {
  const nextStatus: UserStatus | null = status === "standard" ? "silver" : status === "silver" ? "gold" : null;
  const target = nextStatus === "silver" ? SILVER_AT_VND : nextStatus === "gold" ? GOLD_AT_VND : null;
  const start = status === "silver" ? SILVER_AT_VND : 0;
  const remaining = target == null ? 0 : Math.max(0, target - totalVnd);
  const progress = target == null ? 1 : Math.max(0, Math.min(1, (totalVnd - start) / (target - start)));
  return { nextStatus, target, remaining, progress };
}
