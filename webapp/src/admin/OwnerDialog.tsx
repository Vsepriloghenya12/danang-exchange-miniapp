import React, { useEffect, useId, useRef } from "react";

export default function OwnerDialog({ title, busy, onClose, children }: {
  title: string; busy?: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => {
      document.body.style.overflow = overflow;
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  return <dialog className="adx-clientDialog" ref={dialog} aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="adx-dialogBody">
      <header className="adx-dialogHeader"><h2 id={titleId}>{title}</h2><button className="btn" type="button" aria-label="Закрыть" disabled={busy} onClick={onClose}>×</button></header>
      {children}
    </div>
  </dialog>;
}
