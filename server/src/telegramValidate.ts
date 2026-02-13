import { validate } from "@tma.js/init-data-node";

export type TelegramWebAppUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export type ValidatedInitData = {
  user: TelegramWebAppUser;
  auth_date: number;
  query_id?: string;
  raw: Record<string, string>;
};

export function validateTelegramInitData(initDataRaw: string, botToken: string): ValidatedInitData {
  let initData = initDataRaw || "";

  // Если кто-то случайно прислал encodeURIComponent(initData) — аккуратно декодируем один раз
  // (признак: нет '&', но есть '%3D'/'%26')
  if (!initData.includes("&") && (initData.includes("%3D") || initData.includes("%26"))) {
    initData = decodeURIComponent(initData);
  }

  // Проверка подписи (по умолчанию ещё проверяет срок жизни ~1 день)
  // Можно отключить expires check: { expiresIn: 0 } — но лучше оставить.
  validate(initData, botToken);

  const params = new URLSearchParams(initData);
  const raw = Object.fromEntries(params.entries());

  const auth_date = Number(params.get("auth_date") || 0);
  const query_id = params.get("query_id") || undefined;

  const userStr = params.get("user");
  if (!userStr) throw new Error("user is missing");
  const user = JSON.parse(userStr) as TelegramWebAppUser;

  return { user, auth_date, query_id, raw };
}
