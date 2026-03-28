import type { UserStatus } from "../lib/types";

export const USER_STATUS_OPTIONS_RU: Array<{ value: UserStatus; label: string }> = [
  { value: "standard", label: "Стандарт" },
  { value: "silver", label: "Серебро" },
  { value: "gold", label: "Золото" },
];

export function normalizeUserStatus(value: unknown): UserStatus {
  const normalized = String(value ?? "").toLowerCase().trim();

  if (["gold", "голд", "золото"].includes(normalized)) return "gold";
  if (["silver", "силвер", "сильвер", "серебро"].includes(normalized)) {
    return "silver";
  }

  return "standard";
}

export function getUserStatusLabel(status: UserStatus, lang: "ru" | "en" = "ru"): string {
  if (lang === "en") {
    if (status === "gold") return "Gold";
    if (status === "silver") return "Silver";
    return "Standard";
  }

  const hit = USER_STATUS_OPTIONS_RU.find((option) => option.value === status);
  return hit?.label || "Стандарт";
}

export function getUserStatusLabelRu(value: unknown): string {
  return getUserStatusLabel(normalizeUserStatus(value), "ru");
}
