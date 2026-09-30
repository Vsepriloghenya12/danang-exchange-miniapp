import { apiEvent } from "./api";

let visitId = "";
export function activitySessionId() {
  if (!visitId) visitId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return visitId;
}

export function trackActivity(initData: string, name: string, props?: Record<string, string | number>) {
  if (!initData || initData === "demo" || initData.startsWith("adminkey:")) return;
  void apiEvent(initData, { name, sessionId: activitySessionId(), props }).catch(() => {});
}
