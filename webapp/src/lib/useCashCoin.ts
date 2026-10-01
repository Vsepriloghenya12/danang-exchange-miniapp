import { useCallback, useEffect, useState } from "react";
import { referralApi, type MyReferrals } from "./referrals";

export default function useCashCoin(token: string, enabled: boolean) {
  const [wallet, setWallet] = useState<MyReferrals | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled || !token || token === "demo") return;
    const data = await referralApi<MyReferrals>(token, "/referrals");
    setWallet(data);
    return data;
  }, [token, enabled]);
  useEffect(() => {
    let live = true;
    setWallet(null);
    const load = () => {
      if (!enabled || !token || token === "demo" || document.visibilityState === "hidden") return;
      referralApi<MyReferrals>(token, "/referrals").then(data => { if (live) setWallet(data); }).catch(() => {});
    };
    load();
    document.addEventListener("visibilitychange", load);
    window.addEventListener("focus", load);
    return () => { live = false; document.removeEventListener("visibilitychange", load); window.removeEventListener("focus", load); };
  }, [token, enabled]);
  return { wallet, refresh };
}
