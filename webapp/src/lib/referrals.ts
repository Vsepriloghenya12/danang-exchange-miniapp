export type BonusEntry = { id: string; tg_id?: number; cents: number; kind: "welcome" | "referrer" | "payout"; created_at: string; request_id?: string; note?: string };
export type BonusSummary = { balanceCents: number; invitedCount: number; completedCount: number; earnedCents: number; paidCents: number };
export type MyReferrals = BonusSummary & { link: string | null; referred: boolean; rewarded: boolean; referralRejected?: string; history: BonusEntry[] };
export type ReferralReport = {
  accounts: (BonusSummary & { tgId: number; name: string })[];
  referrals: { inviter: { tgId: number; name: string }; friend: { tgId: number; name: string }; invitedAt: string; rewardedAt?: string; firstRequestId?: string; status: string; completedCount: number; volume: Record<string, number>; inviterCents: number; friendCents: number }[];
  ledger: BonusEntry[];
};
export const usd = (cents: number) => `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
const errors: Record<string, string> = {
  referral_rates_missing: "Для расчёта бонуса нужен курс USD и валюты обмена на дату заявки. Проверьте курсы и создайте новую заявку.",
  referral_completed_locked: "Деньги по этой заявке подтверждены. Завершённую сделку нельзя открыть повторно или отменить.",
  funds_received_required: "Подтвердите получение денег и завершение обмена.",
  referral_insufficient_balance: "На бонусном счёте недостаточно средств.",
  referral_bad_payout: "Укажите клиента, сумму с точностью до цента и комментарий к выдаче.",
  referral_payout_conflict: "Эта выдача уже записана с другими данными. Обновите историю.",
};
export function referralError(error: string) { return errors[error] || error || "Не удалось загрузить данные. Попробуйте ещё раз."; }
export async function referralApi<T>(token: string, path: string, body?: unknown): Promise<T> {
  const auth: Record<string, string> = token.startsWith("adminkey:") ? { "x-admin-key": token.slice(9) } : { "x-telegram-init-data": token };
  const response = await fetch(`/api${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { ...auth, "content-type": "application/json" } as Record<string, string>, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(referralError(data.error));
  return data as T;
}
