import React, { useState } from "react";
import type { Currency } from "../lib/types";
import { currencySymbol } from "../domain/pricing";
import Sheet from "./Sheet";

const currencies: { code: Currency; ru: string; en: string }[] = [
  { code: "RUB", ru: "Российский рубль", en: "Russian ruble" },
  { code: "USDT", ru: "Tether", en: "Tether" },
  { code: "USD", ru: "Доллар США", en: "US dollar" },
  { code: "EUR", ru: "Евро", en: "Euro" },
  { code: "THB", ru: "Тайский бат", en: "Thai baht" },
  { code: "KZT", ru: "Казахстанский тенге", en: "Kazakhstani tenge" },
  { code: "VND", ru: "Вьетнамский донг", en: "Vietnamese dong" },
];

export default function CurrencyPicker({ value, onChange, side, lang }: {
  value: Currency; onChange: (currency: Currency) => void; side: "sell" | "buy"; lang: "ru" | "en";
}) {
  const [open, setOpen] = useState(false);
  const isEn = lang === "en";
  const label = side === "sell"
    ? (isEn ? "Currency you give" : "Валюта, которую отдаёте")
    : (isEn ? "Currency you get" : "Валюта, которую получаете");
  return <>
    <button type="button" className="cx-curChip cl-currencyTrigger" aria-label={`${label}: ${value}`}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
      <span className="cx-curCircle" data-cur={value} aria-hidden="true">{currencySymbol(value)}</span>
      <span className="cx-curCode">{value}</span>
      <svg className="cx-curChevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open && <Sheet title={label} closeLabel={isEn ? "Close" : "Закрыть"} onClose={() => setOpen(false)}>
      <div className="cl-currencyList">
        {currencies.map(currency => <button type="button" key={currency.code}
          className="cl-currencyOption" aria-pressed={currency.code === value}
          onClick={() => { onChange(currency.code); setOpen(false); }}>
          <span className="cl-currencySeal" data-cur={currency.code} aria-hidden="true">{currencySymbol(currency.code)}</span>
          <span className="cl-currencyName"><strong>{currency.code}</strong><span>{isEn ? currency.en : currency.ru}</span></span>
          {currency.code === value && <svg className="cl-currencyCheck" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m5 10 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </button>)}
      </div>
    </Sheet>}
  </>;
}
