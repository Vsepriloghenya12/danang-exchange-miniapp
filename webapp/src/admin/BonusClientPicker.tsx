import React, { useId, useState } from 'react';
import { cashcoin, matchesBonusAccount, type ReferralReport } from '../lib/referrals';

type Account = ReferralReport['accounts'][number];
const label = (a: Account) => [a.name, a.adminName || a.fullName, `ID ${a.tgId}`].filter(Boolean).join(' · ');

export default function BonusClientPicker({ accounts, value, onChange, disabled, loading }: {
  accounts: Account[]; value: string; onChange: (id: string) => void; disabled: boolean; loading: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = accounts.find(a => String(a.tgId) === value);
  const matches = accounts.filter(a => matchesBonusAccount(a, query));
  const choose = (account: Account) => { onChange(String(account.tgId)); setQuery(''); setOpen(false); setActive(-1); };
  return <div className="ra-clientPicker" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) { setOpen(false); setActive(-1); }
  }}>
    <label htmlFor={id}>Клиент</label>
    <input id={id} className="input vx-in" role="combobox" aria-label="Поиск клиента для бонусов" aria-autocomplete="list"
      aria-expanded={open} aria-controls={`${id}-matches`} aria-activedescendant={open && matches[active] ? `${id}-${matches[active].tgId}` : undefined}
      placeholder="Введите имя, ник Telegram или ID" autoComplete="off" disabled={disabled}
      value={selected ? label(selected) : query}
      onFocus={() => { setOpen(true); setActive(-1); }}
      onClick={() => setOpen(true)}
      onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); setActive(-1); }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setActive(-1); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); setOpen(true);
          const next = matches.length ? (e.key === 'ArrowDown' ? (active + 1) % matches.length : (active <= 0 ? matches.length : active) - 1) : -1;
          setActive(next);
          requestAnimationFrame(() => document.getElementById(`${id}-${matches[next]?.tgId}`)?.scrollIntoView({ block: 'nearest' }));
        }
        if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
      }} />
    {open && <div className="ra-clientDropdown">
      <div id={`${id}-matches`} role="listbox" aria-label="Совпадения клиентов">
        {matches.map((a, index) => <div id={`${id}-${a.tgId}`} key={a.tgId} role="option" aria-selected={String(a.tgId) === value}
          className={'ra-clientOption' + (index === active ? ' is-active' : '')}
          onMouseDown={e => e.preventDefault()} onClick={() => choose(a)}>
          <strong>{a.adminName || a.fullName || a.name}</strong>
          <span>{a.name} · ID {a.tgId}</span><small>{cashcoin(a.availableCents ?? a.balanceCents)}</small>
        </div>)}
      </div>
      {!matches.length && <p role="status">{loading ? 'Загрузка клиентов…' : 'Совпадений нет'}</p>}
    </div>}
  </div>;
}
