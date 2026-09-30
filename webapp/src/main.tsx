import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import "./client-design.css";
import App from "./App";
import { KeyboardState } from "./lib/keyboardState";

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

    const keyboardHeight = () => Math.min(
      window.innerHeight,
      window.visualViewport?.height || window.innerHeight,
      tg?.viewportHeight || window.innerHeight,
    );
    const isTextControl = (el: EventTarget | null) =>
      (el instanceof HTMLInputElement && !el.readOnly && !el.disabled &&
        !["button", "submit", "reset", "checkbox", "radio", "range", "file", "color", "hidden"].includes(el.type)) ||
      (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled);
    const keyboard = new KeyboardState(keyboardHeight());
    const renderKeyboard = () => document.documentElement.classList.toggle("vx-keyboard-open", keyboard.open);

    const resetViewportState = () => {
      keyboard.viewport(keyboardHeight(), isTextControl(document.activeElement));
      renderKeyboard();
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

    let restoreMenuTimer: number | undefined;
    const handleFocusIn = (ev: Event) => {
      if (!isTextControl(ev.target)) return;
      window.clearTimeout(restoreMenuTimer);
      keyboard.focus(keyboardHeight());
      renderKeyboard();
      lockViewport();
      window.setTimeout(resetViewportState, 24);
      window.setTimeout(resetViewportState, 180);
    };

    const handleFocusOut = () => {
      window.clearTimeout(restoreMenuTimer);
      restoreMenuTimer = window.setTimeout(() => {
        if (!isTextControl(document.activeElement)) {
          keyboard.viewport(keyboardHeight(), false);
          renderKeyboard();
        }
      }, 220);
      window.setTimeout(resetViewportState, 24);
      window.setTimeout(resetViewportState, 220);
      window.setTimeout(resetViewportState, 420);
    };

    document.addEventListener("focusin", handleFocusIn, true);
    // A dismissed keyboard can reopen on the already-focused input without focusin.
    document.addEventListener("pointerdown", (ev) => {
      if (ev.target === document.activeElement && !keyboard.open) handleFocusIn(ev);
    }, true);
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
