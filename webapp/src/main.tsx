import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import App from "./App";

// Apply black background class immediately (prevents any "blue bleed" before React mounts)
try {
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/admin")) {
    document.body.classList.add("vx-body-client");
  }
} catch {
  // ignore
}

// Telegram/Android WebView can change the effective viewport height (browser bars show/hide),
// which may create a visible "gap" at the bottom when the user overscrolls.
// Keep a stable CSS --vh and prefer Telegram's stable viewport height when available.
try {
  if (typeof window !== "undefined") {
    const tg = (window as any)?.Telegram?.WebApp;

    const setVh = () => {
      const h =
        (tg && (tg.viewportStableHeight || tg.viewportHeight)) ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0;
      const vh = Math.max(1, h) * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    setVh();

    window.addEventListener("resize", setVh, { passive: true } as any);
    window.addEventListener("orientationchange", setVh, { passive: true } as any);

    // Telegram-specific viewport updates
    if (tg && typeof tg.onEvent === "function") {
      tg.onEvent("viewportChanged", setVh);
      tg.onEvent("safeAreaChanged", setVh);
      tg.onEvent("contentSafeAreaChanged", setVh);
    }
  }
} catch {
  // ignore
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
