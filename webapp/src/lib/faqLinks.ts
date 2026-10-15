export type FaqPart = { text: string; href?: string };
export function safeFaqHref(value: string): string | undefined {
  if (value === '#referrals') return value;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}

// Render plain text, named links and URLs without interpreting HTML.
export function faqParts(text: string): FaqPart[] {
  const pattern = /\[([^\]\n]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>"«»]+|Друзья и бонусы|Friends (?:and|&) bonuses/gi;
  const parts: FaqPart[] = [];
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > offset) parts.push({ text: text.slice(offset, match.index) });
    const raw = match[0];
    if (match[1]) {
      const href = safeFaqHref(match[2]);
      parts.push(href ? { text: match[1], href } : { text: raw });
    } else if (/^https?:/i.test(raw)) {
      const url = raw.replace(/[.,!?:;)\]]+$/, '');
      parts.push({ text: url, href: safeFaqHref(url) });
      if (raw.length > url.length) parts.push({ text: raw.slice(url.length) });
    } else parts.push({ text: raw, href: '#referrals' });
    offset = match.index! + raw.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
