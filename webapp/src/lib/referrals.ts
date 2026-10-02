export type BonusEntry = { id: string; tg_id?: number; cents: number; currency?: "CashCoin" | "USD"; kind: "welcome" | "referrer" | "payout" | "redemption" | "test_credit"; created_at: string; request_id?: string; note?: string };
export type BonusSummary = { legacyUsdCents?: number; balanceCents: number; availableCents?: number; reservedCents?: number; invitedCount: number; completedCount: number; earnedCents: number; paidCents: number };
export type MyReferrals = BonusSummary & { welcomeAvailable?: boolean; walletQuote?: { ratesDate: string; rates: Record<string, number>; key: string }; link: string | null; referred: boolean; rewarded: boolean; referralRejected?: string; history: BonusEntry[] };
export type ReferralReport = {
  testCreditsEnabled?: boolean;
  accounts: (BonusSummary & { tgId: number; name: string })[];
  referrals: { inviter: { tgId: number; name: string }; friend: { tgId: number; name: string }; invitedAt: string; rewardedAt?: string; firstRequestId?: string; status: string; completedCount: number; volume: Record<string, number>; inviterCents: number; friendCents: number; friendBonus?: { amount: number; currency: string; received: number; receiveCurrency: string } }[];
  ledger: BonusEntry[];
};
export function cashcoin(cents: number, isEn = false) {
  const amount = cents / 100;
  const category = new Intl.PluralRules(isEn ? "en" : "ru").select(amount);
  const unit = isEn ? (category === "one" ? "bonus" : "bonuses") : category === "one" ? "бонус" : (category === "few" || category === "other") ? "бонуса" : "бонусов";
  return `${amount.toLocaleString(isEn ? "en-US" : "ru-RU", { maximumFractionDigits: 2 })} ${unit}`;
}
const errors: Record<string, string> = {
  referral_currency_changed: "Бонусный счёт обновлён. Обновите страницу перед списанием.",
  referral_base_amount_required: "Обновите страницу. В редакторе указываются суммы без бонусов; бонусы пересчитываются отдельно.",
  referral_test_only: "Тестовые начисления доступны только владельцу в тестовом сервисе.",
  referral_quote_changed: "Курс или бонусы изменились. Проверьте обновлённые суммы и отправьте заявку ещё раз.",
  referral_first_pending: "Бонус первого обмена уже использован или закреплён за другой заявкой. Обновите список заявок.",
  referral_bonus_too_small: "Этого количества бонусов пока недостаточно для выбранной валюты.",
  referral_bad_amount: "Проверьте сумму обмена.",
  referral_rates_missing: "Для пересчёта бонусов нужны курсы обменника на сегодня. Обратитесь к менеджеру.",
  referral_completed_locked: "Деньги по этой заявке подтверждены. Завершённую сделку нельзя открыть повторно или отменить.",
  funds_received_required: "Подтвердите получение денег и завершение обмена.",
  referral_insufficient_balance: "На бонусном счёте недостаточно средств.",
  referral_bad_payout: "Укажите клиента, сумму с точностью до 0,01 бонуса и комментарий к выдаче.",
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

export const bonusEntryAmount = (entry: BonusEntry, isEn = false) => entry.currency === "CashCoin" ? cashcoin(entry.cents, isEn) : `${(entry.cents / 100).toFixed(2)} USD`;
