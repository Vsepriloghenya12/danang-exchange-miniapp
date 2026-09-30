import React, { useLayoutEffect, useRef } from "react";

/** Measure the original wordmark; animate that same DOM node in both directions. */
export default function AnimatedHeader({ children }: { children: React.ReactNode }) {
  const stage = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = stage.current;
    const brand = root?.querySelector<HTMLElement>(".cl-brand");
    const header = root?.querySelector<HTMLElement>(".cx-header");
    if (!root || !brand || !header) return;
    const measure = () => {
      if (!brand.offsetWidth || !root.clientWidth) return;
      const scale = Math.min(1.8, (root.clientWidth - 16) / brand.offsetWidth);
      root.style.setProperty("--brand-forward-scale", String(scale));
      root.style.setProperty("--brand-forward-x", `${(root.clientWidth - brand.offsetWidth * scale) / 2}px`);
      root.style.setProperty("--brand-forward-y", `${root.clientHeight / 2 - header.offsetHeight / 2 - 4}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(brand);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, []);
  return <div className="cl-headerStage" ref={stage}>{children}</div>;
}
