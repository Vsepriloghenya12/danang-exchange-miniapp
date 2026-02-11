import * as crypto from "node:crypto";

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

function parseInitData(initData: string): Record<string, string> {
  const params = new URLSearchParams(initData);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

export function validateTelegramInitData(initData: string, botToken: string): ValidatedInitData {
  if (!initData) throw new Error("initData is empty");
  if (!botToken) throw new Error("BOT_TOKEN is missing");

  const data = parseInitData(initData);
  const receivedHash = data.hash;
  if (!receivedHash) throw new Error("hash is missing in initData");

  const pairs: string[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort((a, b) => a.localeCompare(b));
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (computedHash !== receivedHash) throw new Error("initData hash mismatch");

  const authDate = Number(data.auth_date || 0);
  if (!authDate) throw new Error("auth_date is missing");

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > 48 * 3600) throw new Error("initData is too old");

  const userJson = data.user;
  if (!userJson) throw new Error("user is missing");
  const user = JSON.parse(userJson) as TelegramWebAppUser;

  return {
    user,
    auth_date: authDate,
    query_id: data.query_id,
    raw: data
  };
}
