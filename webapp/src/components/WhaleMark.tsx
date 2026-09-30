import React, { useId } from "react";

/** Display the whale from the original brand artwork, without the wordmark. */
export default function WhaleMark({ light = false, className = "" }: { light?: boolean; className?: string }) {
  const clip = useId();
  return <svg className={`cl-whale ${className}`} viewBox="550 0 430 422" aria-hidden="true" focusable="false">
    <defs><clipPath id={clip}><path d="M550 0H980V397H940V422H575V397H550Z" /></clipPath></defs>
    <image href={light ? "/brand/main-logo-dark.png" : "/brand/main-logo-light.png"} width="1407" height="625" clipPath={`url(#${clip})`} />
  </svg>;
}
