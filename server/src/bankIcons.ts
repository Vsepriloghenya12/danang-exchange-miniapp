import * as fs from 'node:fs';
import * as path from 'node:path';

export const BANK_ICON_ORDER = [
  'akbars.png',
  'alfa.png',
  'bybit.png',
  'vtb.png',
  'zenit.png',
  'kub.png',
  'mts.png',
  'ozon.png',
  'otp.png',
  'pochta.png',
  'psb.png',
  'raif.png',
  'rshb.png',
  'sber.png',
  'sbp.png',
  'sovcom.png',
  'tbank.png',
  'tether.png',
  'uralsib.png',
  'yandex.png',
] as const;

const LEGACY_TO_SAFE: Record<string, string> = {
  '#u0430#u043a#u0431#u0430#u0440#u0441.png': 'akbars.png',
  '#u0430#u043b#u044c#u0444#u0430.png': 'alfa.png',
  '#u0431#u0430#u0439#u0431#u0438#u0442.png': 'bybit.png',
  '#u0432#u0442#u0431.png': 'vtb.png',
  '#u0437#u0435#u043d#u0438#u0442.png': 'zenit.png',
  '#u043a#u0443#u0431.png': 'kub.png',
  '#u043c#u0442#u0441.png': 'mts.png',
  '#u043e#u0437#u043e#u043d.png': 'ozon.png',
  '#u043e#u0442#u043f.png': 'otp.png',
  '#u043f#u043e#u0447#u0442#u0430.png': 'pochta.png',
  '#u043f#u0441#u0431.png': 'psb.png',
  '#u0440#u0430#u0439#u0444.png': 'raif.png',
  '#u0440#u0441#u0445#u0431.png': 'rshb.png',
  '#u0441#u0431#u0435#u0440.png': 'sber.png',
  '#u0441#u0431#u043f.png': 'sbp.png',
  '#u0441#u043e#u0432#u043a#u043e#u043c.png': 'sovcom.png',
  '#u0442#u0431#u0430#u043d#u043a.png': 'tbank.png',
  '#u0442#u0435#u0437#u0435#u0440.png': 'tether.png',
  '#u0443#u0440#u0430#u043b#u0441#u0438#u0431.png': 'uralsib.png',
  '#u044f#u043d#u0434#u0435#u043a#u0441.png': 'yandex.png',

  'акбарс.png': 'akbars.png',
  'альфа.png': 'alfa.png',
  'байбит.png': 'bybit.png',
  'втб.png': 'vtb.png',
  'зенит.png': 'zenit.png',
  'куб.png': 'kub.png',
  'мтс.png': 'mts.png',
  'озон.png': 'ozon.png',
  'отп.png': 'otp.png',
  'почта.png': 'pochta.png',
  'псб.png': 'psb.png',
  'райф.png': 'raif.png',
  'рсхб.png': 'rshb.png',
  'сбер.png': 'sber.png',
  'сбп.png': 'sbp.png',
  'совком.png': 'sovcom.png',
  'тбанк.png': 'tbank.png',
  'тезер.png': 'tether.png',
  'уралсиб.png': 'uralsib.png',
  'яндекс.png': 'yandex.png',

  'акбарс': 'akbars.png',
  'альфа': 'alfa.png',
  'байбит': 'bybit.png',
  'втб': 'vtb.png',
  'зенит': 'zenit.png',
  'куб': 'kub.png',
  'мтс': 'mts.png',
  'озон': 'ozon.png',
  'отп': 'otp.png',
  'почта': 'pochta.png',
  'псб': 'psb.png',
  'райф': 'raif.png',
  'рсхб': 'rshb.png',
  'сбер': 'sber.png',
  'сбп': 'sbp.png',
  'совком': 'sovcom.png',
  'тбанк': 'tbank.png',
  'тезер': 'tether.png',
  'уралсиб': 'uralsib.png',
  'яндекс': 'yandex.png',
};

const SAFE_SET = new Set<string>(BANK_ICON_ORDER as readonly string[]);

export function normalizeBankIconName(input: unknown): string | null {
  let v = String(input ?? '').trim();
  if (!v) return null;
  try {
    v = decodeURIComponent(v);
  } catch {}
  v = v.replace(/^\/?banks\//i, '').trim();
  const lower = v.toLowerCase();
  if (SAFE_SET.has(lower)) return lower;
  return LEGACY_TO_SAFE[lower] || null;
}

export function normalizeBankIcons(input: unknown): string[] {
  const list = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const normalized = normalizeBankIconName(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  out.sort((a, b) => {
    const ai = BANK_ICON_ORDER.indexOf(a as any);
    const bi = BANK_ICON_ORDER.indexOf(b as any);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  return out;
}

export function normalizeContactBanks<T extends { banks?: string[] } | undefined | null>(contact: T): T {
  if (!contact || typeof contact !== 'object') return contact;
  const banks = normalizeBankIcons((contact as any).banks);
  return { ...(contact as any), banks } as T;
}

export function listCanonicalBankIcons(dirs: string[]): string[] {
  return BANK_ICON_ORDER.filter((file) => dirs.some((dir) => fs.existsSync(path.join(dir, file))));
}
