import React from 'react';
import { faqParts } from '../lib/faqLinks';
import { getTg } from '../lib/telegram';

export default function FaqAnswer({ text, onOpenReferrals }: { text: string; onOpenReferrals?: () => void }) {
  return <>{faqParts(text).map((part, i) => !part.href ? <React.Fragment key={i}>{part.text}</React.Fragment>
    : part.href === '#referrals' ? <button key={i} type="button" className="cp-faqLink" onClick={onOpenReferrals}>{part.text}</button>
    : <a key={i} className="cp-faqLink" href={part.href} target="_blank" rel="noopener noreferrer" onClick={e => {
      const tg = getTg();
      if (tg?.openLink) { e.preventDefault(); tg.openLink(part.href!); }
    }}>{part.text}</a>)}</>;
}
