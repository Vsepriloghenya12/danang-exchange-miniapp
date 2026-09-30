import React, { useLayoutEffect, useRef } from "react";

/** Measure the original wordmark; animate that same DOM node in both directions. */
export default function AnimatedHeader({ children }: { children: React.ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = stage.current;
    const brand = root?.querySelector<HTMLElement>(".cl-brand");
    const header = root?.querySelector<HTMLElement>(".cx-header");
    const content = root?.querySelector<HTMLElement>(".cl-headerContent");
    if (!root || !brand || !header || !content) return;
    let measuredWidth = 0;
    const measure = () => {
      // Keyboard height changes must not retarget an animation already in flight.
      if (document.documentElement.classList.contains("vx-keyboard-open") || !brand.offsetWidth || !root.clientWidth) return;
      measuredWidth = root.clientWidth;
      const scale = Math.min(1.45, (root.clientWidth - 24) / brand.offsetWidth);
      root.style.setProperty("--header-rest-height", `${content.offsetHeight}px`);
      root.style.setProperty("--header-row-height", `${header.offsetHeight}px`);
      root.style.setProperty("--brand-forward-scale", String(scale));
      root.style.setProperty("--brand-forward-x", `${(root.clientWidth - brand.offsetWidth * scale) / 2}px`);
      root.style.setProperty("--brand-forward-y", `${32 - header.offsetHeight / 2}px`);
    };
    measure();
    const observer = new ResizeObserver(() => { if (root.clientWidth !== measuredWidth) measure(); });
    observer.observe(root);
    observer.observe(brand);
    document.fonts.addEventListener("loadingdone", measure);
    window.addEventListener("cashalot:keyboard-closed", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); window.removeEventListener("cashalot:keyboard-closed", measure); };
  }, []);
  return <div className="cl-headerStage" ref={stage}><div className="cl-headerContent">{children}</div></div>;
}
