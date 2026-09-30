import { useLayoutEffect, type RefObject } from "react";

/** Fit the text itself: scaling an overflowing input still clips its value. */
export default function useFitAmount(ref: RefObject<HTMLInputElement>, value: string, enabled: boolean) {
  useLayoutEffect(() => {
    const input = ref.current;
    if (!enabled || !input) return;
    const measure = document.createElement("span");
    measure.style.cssText = "position:fixed;visibility:hidden;white-space:pre;pointer-events:none;";
    measure.setAttribute("aria-hidden", "true");
    document.body.append(measure);
    const fit = () => {
      const style = getComputedStyle(input);
      Object.assign(measure.style, {
        fontFamily: style.fontFamily, fontWeight: style.fontWeight,
        fontVariantNumeric: style.fontVariantNumeric, fontSize: "36px", letterSpacing: "-.025em",
      });
      measure.textContent = value || input.placeholder;
      const available = Math.max(1, input.clientWidth - 5);
      const size = Math.min(36, 36 * available / Math.max(1, measure.getBoundingClientRect().width));
      input.style.setProperty("--amount-font", `${size}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(input);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
      measure.remove();
      input.style.removeProperty("--amount-font");
    };
  }, [ref, value, enabled]);
}
