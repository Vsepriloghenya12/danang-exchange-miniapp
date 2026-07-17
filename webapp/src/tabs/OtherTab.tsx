import React from "react";

type Lang = "ru" | "en";

function IconChevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function RowBtn({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button type="button" className="mx-navCard" onClick={onClick}>
      <div className="mx-navText" style={{ paddingLeft: 2 }}>
        <div className="mx-navTitle">{title}</div>
        {subtitle ? <div className="mx-navSub">{subtitle}</div> : null}
      </div>
      <IconChevron className="mx-i mx-chev" />
    </button>
  );
}

export default function OtherTab({ onFaq, onAbout, onContacts, onOrderApp, onPrivacy, onTerms, lang = "ru" }: { onFaq: () => void; onAbout: () => void; onContacts: () => void; onOrderApp: () => void; onPrivacy: () => void; onTerms: () => void; lang?: Lang; }) {
  const isEn = lang === "en";
  return (
    <div>
      <RowBtn title="FAQ" subtitle={isEn ? "Frequently asked questions" : "Часто задаваемые вопросы"} onClick={onFaq} />
      <div className="mx-sp10" />
      <RowBtn title={isEn ? "About app" : "О приложении"} onClick={onAbout} />
      <div className="mx-sp10" />
      <RowBtn title={isEn ? "Contacts" : "Контакты"} onClick={onContacts} />
      <div className="mx-sp10" />
      <RowBtn title={isEn ? "Privacy policy" : "Политика конфиденциальности"} subtitle={isEn ? "Personal data processing" : "Обработка персональных данных"} onClick={onPrivacy} />
      <div className="mx-sp10" />
      <RowBtn title={isEn ? "Terms of service" : "Пользовательское соглашение"} subtitle={isEn ? "Rules of the service" : "Правила работы сервиса"} onClick={onTerms} />
      <div className="mx-sp10" />
      <RowBtn title={isEn ? "Order an app" : "Заказать приложение"} subtitle={isEn ? "Contact the developer" : "Связаться с разработчиком"} onClick={onOrderApp} />
    </div>
  );
}
