import React from "react";
import type { UserStatus } from "../lib/types";
import { getUserStatusLabel } from "../domain/status";
import Sheet from "./Sheet";
import WhaleMark from "./WhaleMark";

const levels: UserStatus[] = ["standard", "silver", "gold"];
export default function StatusSheet({ status, lang, onClose }: { status: UserStatus; lang: "ru" | "en"; onClose: () => void }) {
  const isEn = lang === "en";
  const description = (level: UserStatus) => level === "gold"
    ? (isEn ? "An even better exchange rate and free delivery" : "Ещё более выгодный курс и бесплатная доставка")
    : level === "silver" ? (isEn ? "An improved exchange rate" : "Улучшенный курс обмена")
    : (isEn ? "Standard exchange terms" : "Базовые условия обмена");
  return <Sheet title={isEn ? "Your status" : "Ваш статус"} closeLabel={isEn ? "Close" : "Закрыть"} onClose={onClose}>
    <div className={`cl-memberCard is-${status}`}>
      <div className="cl-memberBrand"><WhaleMark light={status === "standard"} /><span>Cash a Lot</span></div>
      <span className="cl-memberSeal" aria-hidden="true">✦</span>
      <div className="cl-memberLevel">{getUserStatusLabel(status, lang)}</div>
      <p>{description(status)}</p>
    </div>
    <p className="cl-statusIntro">{isEn ? "All app features are available at every level." : "Все функции приложения доступны на любом уровне."}</p>
    <div className="cl-statusLevels">
      {levels.map(level => <div className={`cl-statusLevel is-${level}`} key={level} aria-current={level === status ? "true" : undefined}>
        <span className="cl-statusMedal" aria-hidden="true">✦</span>
        <div><strong>{getUserStatusLabel(level, lang)}</strong><p>{description(level)}</p></div>
        {level === status && <span className="cl-statusCurrent">{isEn ? "Yours" : "Ваш"}</span>}
      </div>)}
    </div>
    <p className="cl-statusFootnote">{isEn ? "Ask your manager about status upgrades and their terms." : "Условия повышения статуса можно уточнить у менеджера."}</p>
  </Sheet>;
}
