// Navigation hints only. Referral attribution is validated on the server using signed initData.
export function launchSection(search: string, telegramStart?: unknown): 'rates' | 'bonus' | null {
  const params = new URLSearchParams(search);
  const raw = typeof telegramStart === 'string' && telegramStart ? telegramStart : params.get('tgWebAppStartParam') || params.get('startapp') || params.get('section');
  return raw === 'rates' ? 'rates' : raw === 'bonus' || raw === 'bonuses' ? 'bonus' : null;
}
