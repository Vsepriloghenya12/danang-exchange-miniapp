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
    const viewportContent =
      "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

    const lockViewport = () => {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) meta.setAttribute("content", viewportContent);
    };

    const setVh = () => {
      const h =
        (tg && (tg.viewportStableHeight || tg.viewportHeight)) ||
        window.innerHeight ||
        document.documentElement.clientHeight ||
        0;
      const vh = Math.max(1, h) * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    const resetViewportState = () => {
      lockViewport();
      setVh();
      try {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
      } catch {
        window.scrollTo(0, 0);
      }
    };

    lockViewport();
    setVh();

    window.addEventListener("resize", resetViewportState, { passive: true } as any);
    window.addEventListener("orientationchange", resetViewportState, { passive: true } as any);
    window.visualViewport?.addEventListener("resize", resetViewportState, { passive: true } as any);

    const preventGestureZoom = (ev: Event) => {
      ev.preventDefault();
      lockViewport();
    };

    document.addEventListener("gesturestart", preventGestureZoom as EventListener, { passive: false, capture: true } as any);
    document.addEventListener("gesturechange", preventGestureZoom as EventListener, { passive: false, capture: true } as any);
    document.addEventListener("gestureend", preventGestureZoom as EventListener, { passive: false, capture: true } as any);

    window.addEventListener(
      "wheel",
      (ev) => {
        if (!(ev instanceof WheelEvent) || !ev.ctrlKey) return;
        ev.preventDefault();
      },
      { passive: false } as any,
    );

    const isTextControl = (el: EventTarget | null) =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

    const handleFocusIn = (ev: Event) => {
      if (!isTextControl(ev.target)) return;
      document.documentElement.classList.add("vx-keyboard-open");
      lockViewport();
      window.setTimeout(resetViewportState, 24);
      window.setTimeout(resetViewportState, 180);
    };

    const handleFocusOut = () => {
      document.documentElement.classList.remove("vx-keyboard-open");
      window.setTimeout(resetViewportState, 24);
      window.setTimeout(resetViewportState, 220);
      window.setTimeout(resetViewportState, 420);
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    // Telegram-specific viewport updates
    if (tg && typeof tg.onEvent === "function") {
      tg.onEvent("viewportChanged", resetViewportState);
      tg.onEvent("safeAreaChanged", resetViewportState);
      tg.onEvent("contentSafeAreaChanged", resetViewportState);
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
