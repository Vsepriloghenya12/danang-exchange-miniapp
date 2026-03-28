export type UserStatus = "standard" | "silver" | "gold";

export type RequestState = "new" | "in_progress" | "done" | "canceled";

export const USER_STATUS_LABELS_RU: Record<UserStatus, string> = {
  standard: "стандарт",
  silver: "серебро",
  gold: "золото",
};

export function parseStatusInput(value: unknown): UserStatus | null {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (!normalized || normalized === "none") return null;

  if (["standard", "standart", "стандарт", "bronze"].includes(normalized)) {
    return "standard";
  }

  if (["silver", "серебро", "сильвер", "силвер"].includes(normalized)) {
    return "silver";
  }

  if (["gold", "золото", "голд"].includes(normalized)) {
    return "gold";
  }

  return null;
}

export function normalizeStatus(value: unknown): UserStatus {
  const normalized = String(value ?? "").toLowerCase().trim();
  if (normalized === "" || normalized === "none") return "standard";
  return parseStatusInput(normalized) ?? "standard";
}
