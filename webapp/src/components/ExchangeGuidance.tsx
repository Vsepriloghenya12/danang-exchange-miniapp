import React, { useLayoutEffect, useRef } from "react";

export type ExchangeNotice = { key: string; text: string; warning: boolean };

export default function ExchangeGuidance({ notices, id }: { notices: ExchangeNotice[]; id: string }) {
  const content = useRef<HTMLParagraphElement>(null);
  const signature = notices.map(note => `${note.key}:${note.text}:${note.warning}`).join("|");
  useLayoutEffect(() => {
    const text = content.current;
    const card = text?.closest<HTMLElement>(".cl-compactReceive");
    if (!text || !card) return;
    const fit = () => {
      const row = card.querySelector<HTMLElement>(".cx-amtRow");
      const input = card.querySelector<HTMLInputElement>(".cx-amtInput");
      if (!row || !input) return;
      // Keep all conditions visible, with a readable lower bound for both sizes.
      let font = 11;
      card.style.setProperty("--guidance-font", `${font}px`);
      const availableTextHeight = card.clientHeight - 44;
      while (text.scrollHeight > availableTextHeight && font > 10) {
        font -= .25;
        card.style.setProperty("--guidance-font", `${font}px`);
      }
      const remaining = card.clientHeight - text.scrollHeight - 20;
      const baseSize = 36;
      const numberSize = Math.max(16, Math.min(baseSize * .86, remaining / 1.4));
      const scale = numberSize / baseSize;
      const headerHeight = Math.max(32, input.offsetHeight * scale);
      const top = Math.max(6, (card.clientHeight - text.scrollHeight - headerHeight - 6) / 2);
      card.style.setProperty("--guidance-number-scale", String(scale));
      card.style.setProperty("--guidance-row-lift", `${top - row.offsetTop}px`);
      card.style.setProperty("--guidance-text-top", `${top + headerHeight + 6}px`);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(card);
    observer.observe(text);
    return () => observer.disconnect();
  }, [signature]);
  return <div className="cl-guidancePreview" id={id} role="status" aria-live="polite" aria-atomic="true">
    <p ref={content}>{notices.map((note, index) => <React.Fragment key={note.key}>
      {index > 0 && " "}<span className={note.warning ? "is-warning" : undefined}>{note.text}</span>
    </React.Fragment>)}</p>
  </div>;
}
