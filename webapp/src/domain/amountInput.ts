import type { Currency } from "../lib/types";

// ======= Number formatting/parsing for calculator amounts =======
// Canonical display: "," groups thousands, "." separates decimals (1,000.25).
// VND uses whole dong; the other currencies accept up to 2 decimal digits.

export function amountMaxDecimals(cur: Currency): number {
  return cur === "VND" ? 0 : 2;
}

export function fmtGroupedInt(intPart: string): string {
  const s = String(intPart ?? "").replace(/\D+/g, "");
  if (!s) return "";
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function cleanInput(value: string): string {
  return String(value ?? "").replace(/\s+/g, "").replace(/[^\d.,-]/g, "");
}

function digitsOf(value: string): string {
  return String(value ?? "").replace(/\D+/g, "");
}

function hasOtherDot(value: string, skipIndex: number): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "." && i !== skipIndex) return true;
  }
  return false;
}

function singleInsertion(prev: string, next: string): { index: number; char: string } | null {
  if (next.length !== prev.length + 1) return null;
  let i = 0;
  while (i < prev.length && prev[i] === next[i]) i++;
  return next.slice(i + 1) === prev.slice(i) ? { index: i, char: next[i] } : null;
}

type InputAnalysis = {
  // Text to normalize (a rejected separator is already removed).
  cleaned: string;
  // Index of the decimal separator in `cleaned`, or -1.
  decimalIndex: number;
  // The typed value as the caret sees it, and the separator index in it.
  caretCleaned: string;
  caretDecimalIndex: number;
};

// What the input event says about the edit: the inserted text and its position in the raw
// field value, or `pasted` when several characters arrived at once.
export type InputHint = { text: string; index: number; pasted?: boolean };

function typedInCleaned(raw: string, cleaned: string, hint: InputHint | null | undefined) {
  if (!hint || hint.pasted || hint.text.length !== 1 || hint.index < 0 || raw[hint.index] !== hint.text) return null;
  const index = cleanInput(raw.slice(0, hint.index)).length;
  return cleaned[index] === hint.text ? { index, char: hint.text } : null;
}

function analyzeCleaned(cleaned: string, maxDecimals: number, pasted: boolean): number {
  const lastComma = cleaned.lastIndexOf(",");
  if (maxDecimals > 0 && lastComma >= 0) {
    const integer = cleaned.slice(0, lastComma);
    const fraction = cleaned.slice(lastComma + 1);
    // Mobile keyboards can replace the whole value without reporting the inserted key.
    // Preserve a decimal comma after grouped thousands, including "1,000,".
    const groupedInteger = /^\d{1,3}(,\d{3})+$/.test(integer);
    const pastedEuropean = pasted && /^\d{1,3}(\.\d{3})+$/.test(integer);
    if (pasted && (groupedInteger || pastedEuropean) && /^\d{0,2}$/.test(fraction)) return lastComma;
  }
  const dot = cleaned.indexOf(".");
  if (dot >= 0) {
    if (maxDecimals > 0) return dot;
    // Integer currency: a single "." with up to 2 digits is our own decimal format (e.g. after
    // switching from USDT) and its fraction is dropped; any other dots only group thousands.
    const single = cleaned.indexOf(".", dot + 1) < 0;
    const fraction = digitsOf(cleaned.slice(dot + 1)).length;
    return single && fraction <= 2 ? dot : -1;
  }

  // Pasted text (or no previous value): "1234,56" uses a decimal comma.
  if (pasted && maxDecimals > 0) {
    const first = cleaned.indexOf(",");
    if (first >= 0 && cleaned.indexOf(",", first + 1) < 0) {
      const fraction = digitsOf(cleaned.slice(first + 1)).length;
      if (fraction >= 1 && fraction <= maxDecimals) return first;
    }
  }

  return -1;
}

// Decides which character (if any) is the decimal separator.
// The decision follows the kind of edit instead of guessing by digit counts, because
// "1,000" + "," must become "1,000." while deleting a zero from "1,000" must give "100".
// The input event is preferred over diffing with `prev`: when keys come fast, the field may
// still hold the unformatted text ("2000,") and `prev` may lag behind the field.
function analyzeInput(raw: string, maxDecimals: number, prev: string | null, hint?: InputHint | null): InputAnalysis {
  const cleaned = cleanInput(raw);
  const prevClean = prev == null ? null : cleanInput(prev);
  const inserted =
    typedInCleaned(raw, cleaned, hint) ??
    (prevClean != null && !hint?.pasted ? singleInsertion(prevClean, cleaned) : null);

  if (inserted && (inserted.char === "," || inserted.char === ".")) {
    if (maxDecimals > 0 && !hasOtherDot(cleaned, inserted.index)) {
      return { cleaned, decimalIndex: inserted.index, caretCleaned: cleaned, caretDecimalIndex: inserted.index };
    }
    // No decimals allowed here, or the number already has them: drop the typed separator.
    const without = cleaned.slice(0, inserted.index) + cleaned.slice(inserted.index + 1);
    const decimalIndex = analyzeCleaned(without, maxDecimals, false);
    const caretDecimalIndex = decimalIndex >= 0 && decimalIndex >= inserted.index ? decimalIndex + 1 : decimalIndex;
    return { cleaned: without, decimalIndex, caretCleaned: cleaned, caretDecimalIndex };
  }

  const pasted = !!hint?.pasted || prevClean == null || cleaned.length > prevClean.length + 1;
  if (maxDecimals > 0 && prevClean != null && cleaned.endsWith(",") &&
      !prevClean.includes(".") && !prevClean.endsWith(",") && digitsOf(cleaned) === digitsOf(prevClean)) {
    const index = cleaned.length - 1;
    return { cleaned, decimalIndex: index, caretCleaned: cleaned, caretDecimalIndex: index };
  }
  const decimalIndex = analyzeCleaned(cleaned, maxDecimals, pasted);
  return { cleaned, decimalIndex, caretCleaned: cleaned, caretDecimalIndex: decimalIndex };
}

function normalizeAnalyzed(a: InputAnalysis, maxDecimals: number) {
  const sign = a.cleaned.startsWith("-") ? "-" : "";
  const hasIndex = a.decimalIndex >= 0;
  const intPart = digitsOf(hasIndex ? a.cleaned.slice(0, a.decimalIndex) : a.cleaned);
  const hasSep = hasIndex && maxDecimals > 0;
  const decPart = hasSep ? digitsOf(a.cleaned.slice(a.decimalIndex + 1)).slice(0, maxDecimals) : "";
  const grouped = fmtGroupedInt(intPart);
  const text = sign + (hasSep ? `${grouped || "0"}.${decPart}` : grouped);
  return { intPart, decPart, hasSep, text };
}

export function parseAmount(cur: Currency, input: string): number {
  const maxDecimals = amountMaxDecimals(cur);
  const norm = normalizeAnalyzed(analyzeInput(input, maxDecimals, null), maxDecimals);
  if (!norm.intPart && !norm.decPart) return 0;
  const numText = norm.decPart ? `${norm.intPart || "0"}.${norm.decPart}` : norm.intPart || "0";
  const n = Number((norm.text.startsWith("-") ? "-" : "") + numText);
  return Number.isFinite(n) ? n : 0;
}

export function fmtAmount(cur: Currency, n: number): string {
  if (!Number.isFinite(n)) return "";
  const maxDecimals = amountMaxDecimals(cur);
  const sign = n < 0 ? "-" : "";
  const plain = Math.abs(n).toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: maxDecimals,
  });
  const [intPart, decPart = ""] = plain.split(".");
  const grouped = fmtGroupedInt(intPart);
  const dec = maxDecimals > 0 ? decPart.replace(/0+$/, "") : "";
  return sign + (dec ? `${grouped}.${dec}` : grouped);
}

function caretAfterDigits(value: string, digitsToKeep: number): number {
  if (digitsToKeep <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i++) {
    if (/\d/.test(value[i])) {
      seen += 1;
      if (seen >= digitsToKeep) return i + 1;
    }
  }
  return value.length;
}

export type AmountInputResult = {
  text: string;
  // Maps a caret position in the typed value to the same place in `text`.
  mapCaret: (caret: number | null) => number;
};

// Formats what the user typed. `prev` is the field's previous (formatted) value and
// `hint` what the input event reported, if anything.
export function formatAmountInput(cur: Currency, raw: string, prev: string | null, hint?: InputHint | null): AmountInputResult {
  const maxDecimals = amountMaxDecimals(cur);
  const a = analyzeInput(raw, maxDecimals, prev, hint);
  const norm = normalizeAnalyzed(a, maxDecimals);
  const text = !norm.intPart && !norm.decPart && !norm.hasSep ? "" : norm.text;

  const mapCaret = (caret: number | null) => {
    if (!text) return 0;
    const rawValue = String(raw ?? "");
    const safeCaret = Math.max(0, Math.min(caret ?? rawValue.length, rawValue.length));
    const before = cleanInput(rawValue.slice(0, safeCaret));
    const digitsBefore = digitsOf(before).length;
    const dotInText = text.indexOf(".");
    const sepIndex = a.caretDecimalIndex;

    if (sepIndex >= 0 && before.length > sepIndex && dotInText >= 0) {
      const intDigits = digitsOf(a.caretCleaned.slice(0, sepIndex)).length;
      const fractionLength = text.length - dotInText - 1;
      const fractionBefore = Math.max(0, Math.min(digitsBefore - intDigits, fractionLength));
      return dotInText + 1 + fractionBefore;
    }

    const intText = dotInText >= 0 ? text.slice(0, dotInText) : text;
    return Math.min(text.length, caretAfterDigits(intText, digitsBefore));
  };

  return { text, mapCaret };
}

export function fmtFromInput(cur: Currency, v: string): string {
  return formatAmountInput(cur, v, null).text;
}
