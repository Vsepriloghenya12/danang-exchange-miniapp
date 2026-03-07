import type { UserStatus } from "./store.js";

type Currency = "RUB" | "USD" | "USDT" | "VND" | "EUR" | "THB";
type ReceiveMethod = "cash" | "transfer" | "atm";

export function formatRequestMessage(args: {
  user: {
    id: number;
    username?: string;
    first_name?: string;
    last_name?: string;
  };
  status: UserStatus;
  sellCurrency: Currency;
  buyCurrency: Currency;
  sellAmount: number;
  buyAmount: number;
  receiveMethod: ReceiveMethod | string;
  note?: string;
  createdAtISO?: string;
}) {
  const who = formatUser(args.user);
  // For THB↔RUB we intentionally ignore status markups (treat as standard)
  const effStatus: UserStatus =
    (args.sellCurrency === "THB" && args.buyCurrency === "RUB") || (args.sellCurrency === "RUB" && args.buyCurrency === "THB")
      ? "standard"
      : args.status;
  const statusText = statusLabel(effStatus);
  const methodText = methodLabel(args.receiveMethod);

  const sell = formatAmount(args.sellCurrency, args.sellAmount);
  const buy = formatAmount(args.buyCurrency, args.buyAmount);

  const dt = formatDaNangDateTime(args.createdAtISO);

  const note = (args.note || "").trim();

  // HTML-safe
  const lines: string[] = [
    `<b>💱 Заявка</b>`,
    `👤 ${escapeHtml(who)} • статус: <b>${escapeHtml(statusText)}</b>`,
    `🔁 <b>${escapeHtml(args.sellCurrency)}</b> → <b>${escapeHtml(args.buyCurrency)}</b>`,
    `💸 Отдаёт: <b>${escapeHtml(sell)}</b>`,
    `🎯 Получит: <b>${escapeHtml(buy)}</b>`,
    `📦 Способ: <b>${escapeHtml(methodText)}</b>`,
    `🕒 ${escapeHtml(dt)}`
  ];

  // Комментарии вы убрали — но если где-то ещё прилетит note, аккуратно покажем
  if (note) {
    lines.push(`📝 ${escapeHtml(note)}`);
  }

  return lines.join("\n");
}

function statusLabel(s: UserStatus): string {
  // только 3 статуса
  if (s === "silver") return "серебро";
  if (s === "gold") return "золото";
  return "стандарт";
}

function methodLabel(m: string): string {
  const v = String(m || "").toLowerCase();
  if (v === "cash") return "наличные";
  if (v === "transfer") return "перевод";
  if (v === "atm") return "банкомат";
  return v || "-";
}

function formatDaNangDateTime(createdAtISO?: string): string {
  const d = createdAtISO ? new Date(createdAtISO) : new Date();
  const s = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(d);

  // "14.02.2026, 04:07" -> "14.02.2026 04:07"
  return s.replace(",", "");
}

function formatUser(u: { id: number; username?: string; first_name?: string; last_name?: string }) {
  if (u.username) return `@${u.username}`;
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return name || `id ${u.id}`;
}

function formatAmount(cur: Currency, n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (cur === "USDT") {
    const v = Math.round(n * 10) / 10;
    const sign = v < 0 ? "-" : "";
    const abs = Math.abs(v);
    const intPart = Math.trunc(abs);
    const dec = Math.round((abs - intPart) * 10);
    const grouped = String(intPart).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec ? `${sign}${grouped}.${dec}` : `${sign}${grouped}`;
  }
  const v = cur === "VND" ? Math.round(n) : Math.round(n);
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function escapeHtml(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
