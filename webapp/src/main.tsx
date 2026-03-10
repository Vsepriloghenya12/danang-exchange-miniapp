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

    const isTextControl = (el: EventTarget | null) =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

    const handleFocusIn = (ev: Event) => {
      if (!isTextControl(ev.target)) return;
      document.documentElement.classList.add("vx-keyboard-open");
      window.setTimeout(setVh, 24);
      window.setTimeout(setVh, 180);
    };

    const handleFocusOut = () => {
      document.documentElement.classList.remove("vx-keyboard-open");
      window.setTimeout(() => {
        setVh();
        try {
          window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
        } catch {
          window.scrollTo(0, 0);
        }
      }, 24);
      window.setTimeout(setVh, 220);
      window.setTimeout(setVh, 420);
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

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
