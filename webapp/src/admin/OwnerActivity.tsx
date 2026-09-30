import React, { useEffect, useMemo, useRef, useState } from "react";
import { referralApi } from "../lib/referrals";
import "./owner-activity.css";

type Event = { id: string; ts: string; name: string; props?: Record<string, string | number> };
type Row = { tgId: number; name: string; botStarts: number; appOpens: number; ratesViews: number; amountEntries: number; submitClicks: number; requestCount: number; completedCount: number; allRequests: number; allCompleted: number; botWithoutRequest: boolean; botWithoutExchange: boolean; amountWithoutSubmit: boolean; clickedWithoutRequest: boolean; lastAt?: string; lastAmount?: Record<string, string | number>; timeline: Event[]; timelineCount: number };
type Report = { from: string; to: string; trackingSince?: string; truncated: boolean; totals: Record<string, number>; rows: Row[] };
type Segment = "all" | "botWithoutRequest" | "botWithoutExchange" | "amountWithoutSubmit" | "clickedWithoutRequest";
const day = (offset = 0) => new Date(Date.now() + offset * 86400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
const dateTime = (date?: string) => date ? new Date(date).toLocaleString("ru-RU", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }) : "—";
const amountText = (props?: Record<string, string | number>) => typeof props?.amount === "number" ? `${props.amount.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} ${props.currency || ""}` : "—";
const eventLabels: Record<string, string> = { bot_start: "Запустил бота", app_open: "Открыл приложение", screen_open: "Открыл раздел", click: "Нажал кнопку", rates_view: "Смотрел курсы", calculator_amount: "Ввёл сумму", request_submit_click: "Нажал «Отправить заявку»", request_created: "Заявка создана", exchange_completed: "Обмен завершён" };
const screens: Record<string, string> = { home: "Главная", calc: "Калькулятор", atm: "Банкоматы", reviews: "Отзывы", pay: "Оплаты", history: "История", other: "Ещё", faq: "FAQ", contacts: "Контакты", about: "О приложении", privacy: "Обработка данных", terms: "Условия" };
const clickLabels: Record<string, string> = { bottom_pay: "Оплаты", bottom_history: "История", bottom_other: "Ещё", bottom_about: "О приложении", home_calc_btn: "Калькулятор", nav_atm: "Банкоматы", nav_reviews: "Отзывы", other_faq: "FAQ", other_about: "О приложении", other_contacts: "Контакты", faq_back: "Назад из FAQ", contacts_back: "Назад из контактов", calc_privacy_link: "Обработка данных", calc_terms_link: "Условия" };
function eventDetail(e: Event) {
  const p = e.props || {};
  if (e.name === "calculator_amount") return `${p.field === "buy" ? "Получить" : "Отдать"}: ${amountText(p)}`;
  if (e.name === "rates_view") return p.surface === "all" ? "Все курсы" : "Краткий список";
  if (e.name === "screen_open") return screens[String(p.screen)] || "Раздел приложения";
  if (e.name === "click") return clickLabels[String(p.target)] || "Кнопка приложения";
  if (e.name === "request_created" || e.name === "exchange_completed") return `${amountText(p)} · #${String(p.requestId || "").slice(-6)}`;
  return "";
}

export default function OwnerActivity({ token }: { token: string }) {
  const [from, setFrom] = useState(() => day(-6));
  const [to, setTo] = useState(() => day());
  const [range, setRange] = useState({ from, to });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [updated, setUpdated] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [segment, setSegment] = useState<Segment>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    let running = false;
    const load = async () => {
      if (running) return;
      running = true; setLoading(true);
      try {
        const data = await referralApi<Report>(token, `/admin/activity?${new URLSearchParams(range)}`);
        if (generation.current === current) { setReport(data); setError(""); setUpdated(new Date().toISOString()); }
      } catch (e: any) { if (generation.current === current) setError(e.message === "bad_activity_range" ? "Выберите период до 90 дней. Дата начала должна быть не позже даты окончания." : "Не удалось загрузить действия. Проверьте соединение и доступ владельца."); }
      finally { running = false; if (generation.current === current) setLoading(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { generation.current++; window.clearInterval(timer); };
  }, [token, range, refresh]);
  useEffect(() => { setPage(0); }, [segment, search, range]);
  const rows = useMemo(() => (report?.rows || []).filter(r => (segment === "all" || r[segment]) && `${r.name} ${r.tgId}`.toLowerCase().includes(search.trim().toLowerCase())), [report, segment, search]);
  const stages = [["botStarts", "Запустили бота"], ["appOpens", "Открыли приложение"], ["ratesViews", "Посмотрели курсы"], ["amountEntries", "Ввели сумму"], ["submitClicks", "Нажали отправить"], ["requests", "Создали заявку"], ["completed", "Завершили обмен"]] as const;
  const segments: [Segment, string, string][] = [
    ["botWithoutRequest", "Бот без заявки", "Запустили бота за период; заявок ещё не было"],
    ["botWithoutExchange", "Бот без обмена", "Запустили бота за период; завершённых обменов ещё нет"],
    ["amountWithoutSubmit", "Ввели, не отправили", "Ввели сумму, но в этом посещении не нажали отправить и не создали заявку"],
    ["clickedWithoutRequest", "Нажали, заявка не создана", "Ввели сумму и нажали отправить, но заявка в этом посещении не сохранилась"],
  ];
  const pageCount = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pageCount - 1);
  return <section className="oa-section">
    <div className="card">
      <div className="oa-heading"><div><h2>Действия пользователей</h2><p className="vx-muted">От первого запуска до обмена. Количество людей, а не количество нажатий.</p></div><button className="btn" disabled={loading} onClick={() => setRefresh(v => v + 1)}>{loading ? "Обновляем…" : "Обновить"}</button></div>
      <form className="oa-filters" onSubmit={e => { e.preventDefault(); setRange({ from, to }); }}>
        <label>С<input className="input vx-in" type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>По<input className="input vx-in" type="date" required value={to} onChange={e => setTo(e.target.value)} /></label>
        <button className="btn" type="submit">Показать</button>
        <button className="btn" type="button" onClick={() => { const date = day(); setFrom(date); setTo(date); setRange({ from: date, to: date }); }}>Сегодня</button>
      </form>
      <p className="vx-muted">Время Дананга · Обновление каждые 30 секунд{updated ? ` · Обновлено ${dateTime(updated)}` : ""}. Сотрудники и владельцы исключены.</p>
      {error && <p role="alert" className="oa-error">{error}{report ? " Ниже остаются последние загруженные данные." : ""}</p>}
      {report?.truncated && <p role="alert" className="oa-error">За период слишком много событий: показана только доступная часть. Сократите период, чтобы получить полные числа.</p>}
      {report && <>
        <p className="vx-muted">Период: {report.from} — {report.to}. Новые события запуска бота, ввода суммы и просмотра курсов собираются {report.trackingSince ? `с ${dateTime(report.trackingSince)}` : "после обновления, с первого входа клиента"}. Прежние действия не восстанавливаются задним числом.</p>
        <div className="oa-stages">{stages.map(([key, title]) => <div key={key}><span>{title}</span><strong>{report.totals[key] || 0}</strong><div className="oa-bar"><i style={{ width: `${(report.totals[key] || 0) / Math.max(1, report.totals.active) * 100}%` }} /></div></div>)}</div>
        <p className="vx-muted">Каждый этап считает уникальных клиентов за выбранные даты. Этапы могут пересекаться: человек мог прийти напрямую или начать обмен раньше.</p>
      </>}
    </div>
    {report && <div className="card"><h3>Где остановились</h3><div className="oa-segments">{segments.map(([key, title, hint]) => <button key={key} type="button" className={segment === key ? "is-selected" : ""} aria-pressed={segment === key} onClick={() => setSegment(segment === key ? "all" : key)}><span>{title}</span><strong>{report.totals[key] || 0}</strong><small>{hint}</small></button>)}</div><p className="vx-muted">Это состояние на сейчас, а не окончательный отказ. Клиент может ещё заполнять заявку или вернуться позже. Посещение заканчивается при перезапуске приложения.</p></div>}
    <div className="card"><div className="oa-heading"><h3>Клиенты и история действий</h3><button className="btn" onClick={() => { setSegment("all"); setSearch(""); }}>Все клиенты</button></div>
      <input className="input vx-in" aria-label="Поиск действий клиента" placeholder="Имя, username или Telegram ID" value={search} onChange={e => setSearch(e.target.value)} />
      <p className="vx-muted">{segment === "all" ? "Все действия" : segments.find(s => s[0] === segment)?.[1]} · Найдено: {rows.length}</p>
      {!rows.length && <p>{loading ? "Загружаем действия…" : "За выбранный период подходящих клиентов пока нет."}</p>}
      <div className="oa-users">{rows.slice(currentPage * 50, currentPage * 50 + 50).map(r => <article key={r.tgId}>
        <button className="oa-user" aria-expanded={expanded === r.tgId} onClick={() => setExpanded(expanded === r.tgId ? null : r.tgId)}><div><b>{r.name}</b><small>ID {r.tgId} · {dateTime(r.lastAt)}</small></div><div><span>Последняя сумма: <b>{amountText(r.lastAmount)}</b></span><small>Заявок за период: {r.requestCount} · Обменов: {r.completedCount}</small></div><span aria-hidden="true">{expanded === r.tgId ? "−" : "+"}</span></button>
        {expanded === r.tgId && <div className="oa-detail"><p>За всё время: {r.allRequests} заявок, {r.allCompleted} завершённых обменов. За период: {r.ratesViews} просмотров курсов.</p><ol>{r.timeline.map(e => <li key={e.id}><time>{dateTime(e.ts)}</time><div><b>{eventLabels[e.name] || "Действие в приложении"}</b><small>{eventDetail(e)}</small></div></li>)}</ol>{r.timelineCount > r.timeline.length && <p className="vx-muted">Последние {r.timeline.length} из {r.timelineCount} действий. Для подробностей сократите период.</p>}</div>}
      </article>)}</div>
      {pageCount > 1 && <div className="oa-pages"><button className="btn" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage + 1} / {pageCount}</span><button className="btn" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></div>}
    </div>
  </section>;
}
