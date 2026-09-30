import React, { useEffect, useRef, useState } from "react";
import { referralApi, usd, type ReferralReport } from "../lib/referrals";
import "./referral-admin.css";

export default function ReferralAdmin({ token }: { token: string }) {
  const [data, setData] = useState<ReferralReport | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [tgId, setTgId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const pending = useRef<{ signature: string; id: string } | null>(null);
  async function load() {
    setLoading(true); setError("");
    try { setData(await referralApi<ReferralReport>(token, "/admin/referrals")); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token]);
  async function payout() {
    if (busy) return;
    const normalized = amount.trim().replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(normalized) || !note.trim() || !tgId || Number(normalized) <= 0) { setError("Выберите клиента, введите сумму USD (до двух знаков после запятой) и комментарий."); return; }
    const cents = Math.round(Number(normalized) * 100);
    const who = data?.accounts.find(a => String(a.tgId) === tgId);
    if (!who || cents > who.balanceCents) { setError("На бонусном счёте недостаточно средств."); return; }
    if (!window.confirm(`Записать фактическую выдачу ${usd(cents)} клиенту ${who.name}?\n${note.trim()}\nСумма будет списана с бонусного счёта.`)) return;
    const signature = JSON.stringify({ tgId, cents, note: note.trim() });
    if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try {
      await referralApi(token, "/admin/referrals/payout", { id: pending.current.id, tgId: Number(tgId), cents, note: note.trim() });
      pending.current = null; setAmount(""); setNote(""); setNotice("Выдача записана. Бонусный баланс обновлён.");
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  const selected = data?.accounts.find(a => String(a.tgId) === tgId);
  const query = search.toLowerCase().trim();
  const rows = data?.referrals.filter(r => (filter === "all" || r.status === filter) && (!query || `${r.inviter.name} ${r.inviter.tgId} ${r.friend.name} ${r.friend.tgId}`.toLowerCase().includes(query))) || [];
  const names = new Map(data?.accounts.map(a => [a.tgId, a.name]));
  return <div className="ra-section">
    <div className="card">
      <div className="row vx-between vx-center"><h2>Реферальная программа</h2><button className="btn" disabled={loading || busy} onClick={load}>{loading ? "Обновляем…" : "Обновить"}</button></div>
      <p className="vx-muted">Другу — эквивалент 50 000 VND, пригласившему — 0,5% первого обмена. Начисление в USD после подтверждения получения денег. Лимит — 20 новых приглашений в сутки (UTC).</p>
      <p className="vx-muted">Курс фиксируется в заявке: VND пересчитываются по продаже USD, другие валюты — по их покупке в VND и продаже USD. Сумма в USD учитывается напрямую. Итог округляется до цента.</p>
      {error && <p role="alert" className="ra-error">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {data && <div className="ra-totals"><div><span>Приглашено</span><strong>{data.referrals.length}</strong></div><div><span>Первый обмен завершён</span><strong>{data.referrals.filter(r => r.status === "credited").length}</strong></div><div><span>Начислено обоим</span><strong>{usd(data.accounts.reduce((s, a) => s + a.earnedCents, 0))}</strong></div><div><span>Остаток бонусов</span><strong>{usd(data.accounts.reduce((s, a) => s + a.balanceCents, 0))}</strong></div></div>}
      <div className="ra-filters"><input className="input vx-in" aria-label="Поиск приглашений" placeholder="Имя, username или Telegram ID" value={search} onChange={e => setSearch(e.target.value)} /><select className="input vx-in" aria-label="Статус приглашения" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Все приглашения</option><option value="invited">Ждут первого обмена</option><option value="credited">Бонусы начислены</option></select></div>
      <div className="ra-tableWrap"><table className="ra-table"><thead><tr><th>Кто пригласил</th><th>Друг</th><th>Приглашён / начислено</th><th>Статус</th><th>Обменял за всё время</th><th>Бонусы в USD</th></tr></thead><tbody>
        {rows.map(r => <tr key={r.friend.tgId}><td><b>{r.inviter.name}</b><small>ID {r.inviter.tgId}</small></td><td><b>{r.friend.name}</b><small>ID {r.friend.tgId}</small></td><td>{new Date(r.invitedAt).toLocaleDateString("ru-RU")}<small>{r.rewardedAt ? new Date(r.rewardedAt).toLocaleString("ru-RU") : "—"}</small></td><td>{r.status === "credited" ? "Бонусы начислены" : r.status === "completed" ? "Обмен завершён" : "Приглашён"}{r.firstRequestId && <small>Первая сделка #{r.firstRequestId.slice(-6)}</small>}</td><td>{Object.entries(r.volume).map(([cur, sum]) => <div key={cur}>{sum.toLocaleString("ru-RU")} {cur}</div>)}<small>Сделок: {r.completedCount}</small></td><td>Пригласившему: <b>{usd(r.inviterCents)}</b><small>Другу: {usd(r.friendCents)}</small></td></tr>)}
        {!rows.length && <tr><td colSpan={6}>{loading ? "Загрузка…" : "Приглашений пока нет или они не подходят под фильтр."}</td></tr>}
      </tbody></table></div>
    </div>
    <div className="card"><h3>Бонусные счета и выдача</h3><p className="vx-muted">После согласования валюты и фактической выдачи клиенту укажите списываемую сумму в USD. В комментарии запишите, сколько и в какой валюте выдали.</p>
      <div className="ra-filters"><label>Клиент<select className="input vx-in" value={tgId} disabled={busy} onChange={e => setTgId(e.target.value)}><option value="">Выберите клиента</option>{data?.accounts.filter(a => a.earnedCents > 0 || a.invitedCount > 0).map(a => <option key={a.tgId} value={a.tgId}>{a.name} · ID {a.tgId} · {usd(a.balanceCents)}</option>)}</select></label><label>Списать, USD<input className="input vx-in" inputMode="decimal" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></label></div>
      {selected && <p>Приглашено: <b>{selected.invitedCount}</b> · Доступно: <b>{usd(selected.balanceCents)}</b> · Выдано: <b>{usd(selected.paidCents)}</b></p>}
      <label>Комментарий к выдаче<input className="input vx-in" maxLength={300} value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="Например: выдано 125 000 VND наличными" /></label>
      <button className="btn" style={{ marginTop: 12 }} disabled={busy || !selected} onClick={payout}>{busy ? "Записываем…" : "Записать выдачу бонусов"}</button>
    </div>
    <div className="card"><h3>История начислений и выдач</h3><div className="ra-tableWrap"><table className="ra-table"><thead><tr><th>Дата</th><th>Клиент</th><th>Операция</th><th>Сумма</th><th>Заявка / комментарий</th></tr></thead><tbody>{data?.ledger.filter(e => !tgId || e.tg_id === Number(tgId)).map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString("ru-RU")}</td><td>{names.get(e.tg_id!)}<small>ID {e.tg_id}</small></td><td>{e.kind === "welcome" ? "Первый обмен" : e.kind === "referrer" ? "Приглашение друга" : "Бонусы выданы"}</td><td>{e.cents > 0 ? "+" : ""}{usd(e.cents)}</td><td>{e.note || (e.request_id ? `#${e.request_id.slice(-6)}` : "—")}</td></tr>)}{!data?.ledger.length && <tr><td colSpan={5}>Операций пока нет.</td></tr>}</tbody></table></div></div>
  </div>;
}
