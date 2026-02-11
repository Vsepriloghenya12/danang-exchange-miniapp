import type { UserStatus } from "./store.js";

export type Currency = "RUB" | "USD" | "USDT" | "VND";
export type ReceiveMethod = "cash" | "transfer" | "atm";

export function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatAmount(currency: Currency, value: number) {
  if (!Number.isFinite(value)) return "—";
  if (currency === "VND") return Math.round(value).toLocaleString("ru-RU");
  if (currency === "USDT") return value.toLocaleString("ru-RU", { maximumFractionDigits: 4 });
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

export function payMethodByCurrency(currency: Currency): ReceiveMethod {
  if (currency === "USD") return "cash";
  if (currency === "RUB") return "transfer";
  if (currency === "USDT") return "transfer";
  return "cash"; // VND: по умолчанию
}

export function receiveMethodsByCurrency(currency: Currency): ReceiveMethod[] {
  if (currency === "USD") return ["cash"];
  if (currency === "RUB") return ["transfer"];
  if (currency === "USDT") return ["transfer"];
  return ["cash", "transfer", "atm"]; // VND
}

export function methodLabel(m: ReceiveMethod) {
  if (m === "cash") return "Наличка";
  if (m === "transfer") return "Перевод";
  return "Банкомат";
}

export function statusLabel(s: UserStatus) {
  if (s === "gold") return "GOLD";
  if (s === "silver") return "SILVER";
  if (s === "bronze") return "BRONZE";
  return "NONE";
}

export function formatRequestMessage(input: {
  user: { id: number; username?: string; first_name?: string; last_name?: string };
  status: UserStatus;
  sellCurrency: Currency;
  buyCurrency: Currency;
  sellAmount: number;
  buyAmount: number;
  receiveMethod: ReceiveMethod;
  note?: string;
  createdAtISO: string;
}) {
  const name = [input.user.first_name, input.user.last_name].filter(Boolean).join(" ").trim();
  const u = input.user.username ? `@${input.user.username}` : "(нет username)";
  const created = new Date(input.createdAtISO).toLocaleString("ru-RU", { timeZone: "Asia/Ho_Chi_Minh" });

  const payMethod = payMethodByCurrency(input.sellCurrency);

  return (
    `<b>Заявка на обмен</b>\n` +
    `Клиент: <b>${escapeHtml(name || "Без имени")}</b> (${escapeHtml(u)}, id: <code>${input.user.id}</code>)\n` +
    `Статус: <b>${statusLabel(input.status)}</b>\n\n` +
    `Продаёт: <b>${escapeHtml(formatAmount(input.sellCurrency, input.sellAmount))} ${input.sellCurrency}</b> (${methodLabel(payMethod)})\n` +
    `Покупает: <b>${escapeHtml(formatAmount(input.buyCurrency, input.buyAmount))} ${input.buyCurrency}</b> (${methodLabel(input.receiveMethod)})\n` +
    (input.note ? `\nКомментарий: ${escapeHtml(input.note)}\n` : "\n") +
    `Время: ${escapeHtml(created)} (Asia/Ho_Chi_Minh)`
  );
}
