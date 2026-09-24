import React, { useState } from "react";
import { fmtAmount } from "../domain/amountInput";
import {
  DEFAULT_BONUSES,
  PRICING_CURRENCIES,
  allowedReceiveMethods,
  currencySymbol,
  effectiveRate,
  fmtUnitRate,
  markupFor,
  pairMarkup,
  pairShape,
  receiveMethodLabel,
  resolveQuote,
  tierValue,
  type PricingContext,
} from "../domain/pricing";
import { USER_STATUS_OPTIONS_RU } from "../domain/status";
import type { BonusesConfig, BonusesTier, Currency, GFormulas, UserStatus } from "../lib/types";

// Where a markup of this direction goes and in which units.
export function markupUnitHint(from: Currency, to: Currency, formulas: GFormulas): string {
  const shape = pairShape(from, to, formulas);
  if (!shape) return "Для этой пары нет курса.";
  const unit = `${currencySymbol(shape.quote)} за 1 ${shape.base}`;
  return `Поправка в ${unit}: положительное значение повышает курс, отрицательное — снижает.`;
}

export function DirectionPicker(props: {
  from: Currency;
  to: Currency;
  onChange: (from: Currency, to: Currency) => void;
}) {
  const pick = (from: Currency, to: Currency, changed: "from" | "to") => {
    if (from !== to) return props.onChange(from, to);
    // Same currency on both sides: move the other side to the first different currency.
    const other = PRICING_CURRENCIES.find((c) => c !== from)!;
    return changed === "from" ? props.onChange(from, other) : props.onChange(other, to);
  };

  return (
    <div className="adx-dirPicker">
      <label>
        <span className="small">Клиент отдаёт</span>
        <select className="input vx-in" value={props.from} onChange={(e) => pick(e.target.value as Currency, props.to, "from")}>
          {PRICING_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <span className="adx-dirArrow" aria-hidden="true">→</span>
      <label>
        <span className="small">получает</span>
        <select className="input vx-in" value={props.to} onChange={(e) => pick(props.from, e.target.value as Currency, "to")}>
          {PRICING_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function tierRangeLabel(cur: Currency, t: BonusesTier): string {
  const min = fmtAmount(cur, Number(t.min) || 0);
  const hasMax = t.max != null && (t.max as unknown) !== "" && Number.isFinite(Number(t.max));
  return hasMax ? `${min} – ${fmtAmount(cur, Number(t.max))}` : `от ${min}`;
}

function signed(n: number): string {
  if (!n) return "";
  return `${n > 0 ? "+" : "−"}${fmtUnitRate(Math.abs(n))}`;
}

// Final rate of one direction: rows are amount tiers, columns are receive methods.
export function EffectiveRatesTable(props: {
  from: Currency;
  to: Currency;
  bonuses: BonusesConfig | null;
  ctx: PricingContext;
}) {
  const { from, to, ctx } = props;
  const [status, setStatus] = useState<UserStatus>("standard");

  const cfg = props.bonuses ?? DEFAULT_BONUSES;
  const quote = resolveQuote(from, to, ctx);
  const methods = allowedReceiveMethods(to);
  const pm = pairMarkup(cfg, from, to);
  const tiersOn = cfg.enabled?.tiers !== false && pm.tiers.length > 0;
  const rows: Array<{ key: string; label: string; tier: BonusesTier | null }> = tiersOn
    ? pm.tiers.map((t, i) => ({ key: String(i), label: tierRangeLabel(from, t), tier: t }))
    : [{ key: "any", label: "Любая сумма", tier: null }];

  const baseSource = !quote ? "" : quote.quote === "VND" ? "" : quote.manual ? " · ручной" : " · G × множитель";

  return (
    <div className="adx-effRates">
      <div className="row vx-rowWrap vx-gap6 vx-center">
        {USER_STATUS_OPTIONS_RU.map((s) => (
          <button
            key={s.value}
            type="button"
            className={"btn vx-btnSm " + (status === s.value ? "vx-btnOn" : "")}
            onClick={() => setStatus(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="small vx-mt6">
        {quote ? (
          <>
            База: <b>1 {quote.base} = {fmtUnitRate(quote.rate)} {currencySymbol(quote.quote)}</b>
            {quote.side === "sell" ? " (курс продажи)" : " (курс покупки)"}
            {baseSource}
          </>
        ) : (
          "Курс для этой пары не задан — итоговый курс посчитать нельзя."
        )}
      </div>

      {quote ? (
        <div className="vx-tableWrap vx-mt10">
          <table className="adx-table adx-effTable">
            <thead>
              <tr>
                <th>Сумма, {from}</th>
                {methods.map((m) => (
                  <th key={m}>{receiveMethodLabel(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="adx-rowLbl">{row.label}</td>
                  {methods.map((m) => {
                    const tier = tiersOn ? tierValue(row.tier, status, from, to) : 0;
                    const method = markupFor(from, to, 0, status, m, cfg).method;
                    const rate = effectiveRate(quote, { tier, method });
                    const delta = tier + method;
                    return (
                      <td key={m} className="adx-effCell">
                        <span className="adx-effVal">{fmtUnitRate(rate)}</span>
                        {delta ? <span className="adx-effDelta">{signed(delta)}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
