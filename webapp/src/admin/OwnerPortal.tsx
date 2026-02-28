import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminTab from "../tabs/AdminTab";
import {
  apiAdminGetAdmins,
  apiAdminSetAdmins,
  apiAdminGetBlacklist,
  apiAdminSetBlacklist,
  apiAdminGetPublishTemplate,
  apiAdminSetPublishTemplate,
  apiAdminPublish,
  apiAdminUsers,
  apiAdminGetRequests,
  apiAdminSetUserStatus,
  apiAdminGetContacts,
  apiAdminUpsertContact,
  apiAdminGetReports,
  apiGetBankIcons,
} from "../lib/api";
import type { Contact, UserStatus } from "../lib/types";

const LS_KEY = "dx_admin_key";

const STATUS_OPTIONS: Array<{ v: UserStatus; l: string }> = [
  { v: "standard", l: "Стандарт" },
  { v: "silver", l: "Серебро" },
  { v: "gold", l: "Золото" },
];

function normU(u: string) {
  return String(u || "").trim().replace(/^@+/, "");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const DEFAULT_TEMPLATE = `Доброе утро!\n\nКурс на {{date}}:\n\n{{rates}}\n\n🛵    Бесплатная доставка\n             С 10:00 до 16:00.\n        при обмене от 20 000₽\n\n⏩БОЛЕЕ ВЫГОДНЫЙ КУРС  ⏪\n  при дистанционном обмене                        ⠀              от 20 000₽\n💳  Перевод на вьетнамский счёт;\n📥  Получение в банкоматах BIDV Vietcombank;`;

export default function OwnerPortal() {
  const [key, setKey] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) || "";
    } catch {
      return "";
    }
  });

  // keep a draft input so we don't treat partial/incorrect values as a "logged in" session
  const [draftKey, setDraftKey] = useState<string>(key);

  const token = useMemo(() => (key ? `adminkey:${key}` : ""), [key]);
  const me = useMemo(() => ({ initData: token }), [token]);

  type Tab = "rates" | "bonuses" | "reviews" | "clients" | "requests" | "reports";
  const [tab, setTab] = useState<Tab>("rates");

  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function humanizeErr(text: string) {
    const t = String(text || "").trim();
    if (t === "bad_admin_key") return "Неверный ключ";
    if (t === "admin_key_not_configured") return "На сервере не задан ADMIN_WEB_KEY";
    if (t === "group_not_set") return "Не задана группа (в группе сделай /setgroup)";
    if (t === "rates_missing") return "Сначала задай курс на сегодня";
    if (t === "not_owner") return "Только владелец";
    if (t === "tg_send_failed") return "Telegram: не удалось отправить";
    if (t === "bad_image") return "Неверная картинка";
    if (t === "No initData") return "Нет авторизации";
    return t || "Ошибка";
  }

  function showErr(text: string) {
    setBanner({ type: "err", text: humanizeErr(text) });
  }

  function showOk(text: string) {
    setBanner({ type: "ok", text });
    window.setTimeout(() => setBanner(null), 1800);
  }

  const [adminsText, setAdminsText] = useState<string>("");
  const [blacklistText, setBlacklistText] = useState<string>("");
  const [tpl, setTpl] = useState<string>(DEFAULT_TEMPLATE);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [bankIcons, setBankIcons] = useState<string[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState<boolean>(false);
  const [cUsername, setCUsername] = useState<string>("");
  const [cTgId, setCTgId] = useState<string>("");
  const [cFullName, setCFullName] = useState<string>("");
  const [cStatus, setCStatus] = useState<UserStatus>("standard");
  const [cBanks, setCBanks] = useState<string[]>([]);

  const [repFrom, setRepFrom] = useState<string>(() => shiftISO(-7));
  const [repTo, setRepTo] = useState<string>(() => todayISO());
  const [repOnlyDone, setRepOnlyDone] = useState<boolean>(true);
  const [repTgId, setRepTgId] = useState<string>("");
  const [report, setReport] = useState<any>(null);

  const saveTplTimer = useRef<number | null>(null);

  async function loadAll() {
    if (!token) return;
    setBanner(null);
    const [a, bl, t, c] = await Promise.allSettled([
      apiAdminGetAdmins(token),
      apiAdminGetBlacklist(token),
      apiAdminGetPublishTemplate(token),
      apiAdminGetContacts(token)
    ]);

    if (a.status === "fulfilled" && a.value?.ok) {
      setAdminsText((a.value.adminTgIds || []).join(","));
    } else if (a.status === "fulfilled" && !a.value?.ok) {
      showErr(a.value?.error || "Ошибка");
    } else if (a.status === "rejected") {
      showErr("Ошибка");
    }

    if (bl.status === "fulfilled" && bl.value?.ok) {
      setBlacklistText((bl.value.usernames || []).join("\n"));
    } else if (bl.status === "fulfilled" && !bl.value?.ok) {
      showErr(bl.value?.error || "Ошибка");
    }
    if (t.status === "fulfilled" && t.value?.ok) {
      const s = String(t.value.template || "").trim();
      setTpl(s || DEFAULT_TEMPLATE);
    } else if (t.status === "fulfilled" && !t.value?.ok) {
      showErr(t.value?.error || "Ошибка");
    }
    if (c.status === "fulfilled" && c.value?.ok) {
      setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
    } else if (c.status === "fulfilled" && !c.value?.ok) {
      showErr(c.value?.error || "Ошибка");
    }
  }

  async function loadClients() {
    if (!token || clientsLoading) return;
    setClientsLoading(true);
    try {
      const [u, r, bi, c] = await Promise.allSettled([
        apiAdminUsers(token),
        apiAdminGetRequests(token),
        apiGetBankIcons(),
        apiAdminGetContacts(token),
      ]);

      if (u.status === "fulfilled" && u.value?.ok) {
        setUsers(Array.isArray(u.value.users) ? u.value.users : []);
      }
      if (r.status === "fulfilled" && r.value?.ok) {
        setRequests(Array.isArray(r.value.requests) ? r.value.requests : []);
      }
      if (bi.status === "fulfilled" && bi.value?.ok) {
        setBankIcons(Array.isArray(bi.value.icons) ? bi.value.icons : []);
      }
      if (c.status === "fulfilled" && c.value?.ok) {
        setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
      }
    } finally {
      setClientsLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab === "clients") loadClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token]);

  // autosave template (no button)
  useEffect(() => {
    if (!token) return;
    if (saveTplTimer.current) window.clearTimeout(saveTplTimer.current);
    saveTplTimer.current = window.setTimeout(async () => {
      try {
        await apiAdminSetPublishTemplate(token, tpl);
      } catch {
        // ignore
      }
    }, 600);
    return () => {
      if (saveTplTimer.current) window.clearTimeout(saveTplTimer.current);
    };
  }, [tpl, token]);

  async function onLogin() {
    try {
      localStorage.setItem(LS_KEY, draftKey);
    } catch {
      // ignore
    }
    setKey(draftKey);
  }

  function logout() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
    setKey("");
    setDraftKey("");
    setBanner(null);
  }

  async function saveAdmins() {
    const list = adminsText
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    const r = await apiAdminSetAdmins(token, list);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    showOk("Сохранено ✅");
  }

  async function saveBlacklist() {
    const list = blacklistText
      .split(/[\n,;\s]+/)
      .map((x) => normU(x).toLowerCase())
      .filter(Boolean);

    // unique
    const unique = Array.from(new Set(list));

    const r = await apiAdminSetBlacklist(token, unique);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    setBlacklistText((r.usernames || []).join("\n"));
    showOk("Сохранено ✅");
  }

  async function setClientStatus(tgId: number, status: UserStatus) {
    const r = await apiAdminSetUserStatus(token, tgId, status);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    await loadClients();
    showOk("Статус обновлён ✅");
  }

  function toggleBank(name: string) {
    setCBanks((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      return [...prev, name];
    });
  }

  async function publishNow() {
    if (isPublishing) return;
    setBanner({ type: "ok", text: "Публикую…" });
    setIsPublishing(true);
    try {
      const r = await apiAdminPublish(token, { template: tpl, imageDataUrl });
      if (!r?.ok) {
        showErr(r?.error || "Ошибка публикации");
        return;
      }
      showOk(`Опубликовано ✅ (id ${r.message_id || "–"}, ${r.mode || ""}${r.warn ? ", " + String(r.warn).slice(0,80) : ""})`);
    } catch (e: any) {
      showErr(e?.message || "Ошибка запроса");
    } finally {
      setIsPublishing(false);
    }
  }

  async function upsertContact() {
    const username = normU(cUsername);
    const tgIdRaw = String(cTgId || "").trim();
    const tgIdNum = tgIdRaw ? Number(tgIdRaw) : undefined;
    const tg_id = Number.isFinite(tgIdNum as any) && Number(tgIdNum) > 0 ? Number(tgIdNum) : undefined;

    // if tg_id not specified, try to infer it from known users by username
    let inferredTgId: number | undefined = tg_id;
    if (!inferredTgId && username) {
      const u = (users || []).find((x: any) => String(x?.username || "").toLowerCase() === String(username).toLowerCase());
      const maybe = u?.tg_id ? Number(u.tg_id) : undefined;
      if (Number.isFinite(maybe) && Number(maybe) > 0) inferredTgId = Number(maybe);
    }

    if (!username && !inferredTgId) {
      showErr("Укажи username или tg_id");
      return;
    }

    const payload: any = {
      ...(username ? { username } : {}),
      ...(inferredTgId ? { tg_id: inferredTgId } : {}),
      fullName: cFullName,
      status: cStatus,
      banks: cBanks
    };

    const r = await apiAdminUpsertContact(token, payload);

    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }

    setCUsername("");
    setCTgId("");
    setCFullName("");
    setCStatus("standard");
    setCBanks([]);

    const c = await apiAdminGetContacts(token);
    if (c?.ok) setContacts(c.contacts);

    showOk("Сохранено ✅");
  }

  async function runReport() {
    const tgIdNum = repTgId.trim() ? Number(repTgId.trim()) : undefined;
    const r = await apiAdminGetReports(token, {
      from: repFrom,
      to: repTo,
      onlyDone: repOnlyDone,
      ...(tgIdNum ? { tgId: tgIdNum } : {}),
    });
    if (!r?.ok) {
      showErr(r?.error || "Ошибка отчёта");
      return;
    }
    setReport(r);
  }

  function fmtNum(n: any) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "–";
    return String(Math.trunc(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fmtDt(iso: any) {
    const d = new Date(String(iso || ""));
    const t = d.getTime();
    if (!Number.isFinite(t)) return String(iso || "");
    return d.toLocaleString("ru-RU");
  }

  function who(req: any) {
    const u = req?.from?.username ? "@" + req.from.username : "";
    const name = [req?.from?.first_name, req?.from?.last_name].filter(Boolean).join(" ");
    return u || name || (req?.from?.id ? "id " + req.from.id : "–");
  }

  function stateRu(s: any) {
    const v = String(s || "");
    if (v === "new") return "Принята";
    if (v === "in_progress") return "В работе";
    if (v === "done") return "Готово";
    if (v === "canceled") return "Отклонена";
    return v || "–";
  }

  function methodRu(m: any) {
    const v = String(m || "");
    if (v === "cash") return "Наличные";
    if (v === "transfer") return "Перевод";
    if (v === "atm") return "Банкомат";
    if (v === "other") return "Другое";
    return v || "–";
  }

  const contactsByTg = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts || []) {
      if (c?.tg_id) m[String(c.tg_id)] = c;
    }
    return m;
  }, [contacts]);

  const contactsByUsername = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts || []) {
      if (c?.username) m[String(c.username).toLowerCase()] = c;
    }
    return m;
  }, [contacts]);

  const reqAgg = useMemo(() => {
    const m: Record<string, { cnt: number; sell: Record<string, number>; buy: Record<string, number> }> = {};
    for (const r of requests || []) {
      const id = r?.from?.id;
      if (!id) continue;
      const k = String(id);
      if (!m[k]) m[k] = { cnt: 0, sell: {}, buy: {} };
      m[k].cnt += 1;

      const sc = String(r.sellCurrency || "");
      const sa = Number(r.sellAmount);
      if (sc && Number.isFinite(sa)) m[k].sell[sc] = (m[k].sell[sc] || 0) + sa;

      const bc = String(r.buyCurrency || "");
      const ba = Number(r.buyAmount);
      if (bc && Number.isFinite(ba)) m[k].buy[bc] = (m[k].buy[bc] || 0) + ba;
    }
    return m;
  }, [requests]);

  if (!token) {
    return (
      <div className="vx-adminPage">
        <div className="vx-adminCard">
          <div className="h1">Управление владельца</div>
          <div className="vx-sp12" />
          <input
            className="input vx-in"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="ADMIN_WEB_KEY"
            type="password"
          />
          <div className="vx-sp10" />
          <button className="btn" type="button" onClick={onLogin}>
            Войти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vx-adminPage">
      <div className="vx-adminTop">
        <div>
          <div className="h1">Управление</div>
          <div className="small">/admin</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn" type="button" onClick={loadAll}>
            Обновить
          </button>
          <button className="btn" type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </div>

      {banner ? (
        <div className={banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk"}>
          {banner.text}
        </div>
      ) : null}

      <div className="vx-adminSeg" style={{ marginTop: 0 }}>
        <button className={tab === "rates" ? "on" : ""} onClick={() => setTab("rates")}>Курс</button>
        <button className={tab === "bonuses" ? "on" : ""} onClick={() => setTab("bonuses")}>Надбавки</button>
        <button className={tab === "reviews" ? "on" : ""} onClick={() => setTab("reviews")}>Отзывы</button>
        <button className={tab === "clients" ? "on" : ""} onClick={() => setTab("clients")}>Клиенты</button>
        <button className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>Заявки</button>
        <button className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>Отчёты</button>
      </div>

      <div className="vx-mt10" />

      {tab === "rates" ? (
        <>
          <div className="card">
            <AdminTab me={me} forcedSection="rates" hideHeader hideSeg />
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Публикация в группу</b></div>
            <div className="vx-sp10" />
            <textarea className="vx-revText" rows={10} value={tpl} onChange={(e) => setTpl(e.target.value)} />

            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setImageDataUrl(String(r.result || "") || null);
                  r.readAsDataURL(f);
                }}
              />
              {imageDataUrl ? (
                <button className="btn vx-btnSm" type="button" onClick={() => setImageDataUrl(null)}>
                  Убрать картинку
                </button>
              ) : null}
              {imageDataUrl ? (
                <img className="vx-pubThumb" src={imageDataUrl} alt="" />
              ) : null}
            </div>


            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={publishNow} disabled={isPublishing}>
              {isPublishing ? "Публикую…" : "Опубликовать"}
            </button>

          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Админы (tg_id)</b></div>
            <div className="vx-sp10" />
            <input
              className="input vx-in"
              value={adminsText}
              onChange={(e) => setAdminsText(e.target.value)}
              placeholder="11111111,22222222"
            />
            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={saveAdmins}>
              Сохранить
            </button>
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Чёрный список (username)</b></div>
            <div className="vx-sp6" />
            <div className="small" style={{ opacity: 0.85 }}>
              Без @ • через запятую/пробел/новую строку. Пользователям из ЧС будет показана только картинка
              <code style={{ paddingLeft: 6 }}>/brand/blocked.png</code>.
            </div>
            <div className="vx-sp10" />
            <textarea
              className="vx-revText"
              rows={4}
              value={blacklistText}
              onChange={(e) => setBlacklistText(e.target.value)}
              placeholder="baduser\nspammer"
            />
            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={saveBlacklist}>
              Сохранить
            </button>
          </div>
        </>
      ) : null}

      {tab === "bonuses" ? (
        <div className="card">
          <AdminTab me={me} forcedSection="bonuses" hideHeader hideSeg />
        </div>
      ) : null}

      {tab === "reviews" ? (
        <div className="card">
          <AdminTab me={me} forcedSection="reviews" hideHeader hideSeg />
        </div>
      ) : null}

      {tab === "clients" ? (
        <>
          <div className="card">
            <div className="row vx-between vx-center">
              <div className="small"><b>Карточка клиента (username или tg_id)</b></div>
              <button className="btn vx-btnSm" type="button" onClick={loadClients} disabled={clientsLoading}>
                {clientsLoading ? "Обновляю…" : "Обновить"}
              </button>
            </div>
            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input vx-in"
                value={cUsername}
                onChange={(e) => setCUsername(e.target.value)}
                placeholder="username (без @)"
                style={{ flex: "1 1 220px" }}
              />
              <input
                className="input vx-in"
                value={cTgId}
                onChange={(e) => setCTgId(e.target.value)}
                placeholder="tg_id (опц.)"
                style={{ flex: "1 1 140px" }}
              />
              <select className="input vx-in" value={cStatus} onChange={(e) => setCStatus(e.target.value as any)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
            </div>

            <div className="vx-sp8" />
            <input
              className="input vx-in"
              value={cFullName}
              onChange={(e) => setCFullName(e.target.value)}
              placeholder="Имя клиента (как подписывает админ)"
            />

            <div className="vx-sp10" />

            <div className="small">Банки</div>
            {bankIcons.length === 0 ? (
              <div className="vx-muted">Иконок нет (файлы в webapp/public/banks).</div>
            ) : (
              <div className="vx-bankGrid">
                {bankIcons.map((ic) => {
                  const on = cBanks.includes(ic);
                  return (
                    <button
                      key={ic}
                      type="button"
                      className={"vx-bankBtn " + (on ? "is-on" : "")}
                      onClick={() => toggleBank(ic)}
                      title={ic}
                    >
                      <img src={`/banks/${ic}`} alt="" className="vx-bankImg" />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={upsertContact}>
              Сохранить
            </button>

            <div className="hr" />
            <div className="small"><b>Клиенты</b></div>
            {users.length === 0 ? (
              <div className="vx-muted">Пока нет клиентов (они появятся после входа в мини‑апп).</div>
            ) : (
              <div className="vx-contactList">
                {users
                  .slice()
                  .sort((a, b) => String(b.last_seen_at || "").localeCompare(String(a.last_seen_at || "")))
                  .slice(0, 120)
                  .map((u) => {
                    const tgId = Number(u.tg_id);
                    const uname = u.username ? String(u.username).toLowerCase() : "";
                    const c = contactsByTg[String(tgId)] || (uname ? contactsByUsername[uname] : undefined);
                    const agg = reqAgg[String(tgId)] || { cnt: 0, sell: {}, buy: {} };
                    const isNew = agg.cnt === 1;
                    const userTitle = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
                    const who = u.username ? "@" + u.username : userTitle || `id ${tgId}`;
                    const adminName = c?.fullName ? c.fullName : "—";
                    const banks = Array.isArray(c?.banks) ? c!.banks! : [];

                    const sumText = (() => {
                      const sell: Record<string, number> = (agg as any).sell || {};
                      const buy: Record<string, number> = (agg as any).buy || {};
                      if (Number(sell.RUB) > 0) return `${fmtNum(sell.RUB)} RUB`;
                      if (Number(buy.VND) > 0) return `${fmtNum(buy.VND)} VND`;
                      const s0 = Object.entries(sell)[0];
                      if (s0 && Number(s0[1]) > 0) return `${fmtNum(s0[1])} ${s0[0]}`;
                      const b0 = Object.entries(buy)[0];
                      if (b0 && Number(b0[1]) > 0) return `${fmtNum(b0[1])} ${b0[0]}`;
                      return "—";
                    })();

                    return (
                      <div key={String(tgId)} className="vx-contactRow">
                        <div className="row vx-between vx-center" style={{ gap: 8, flexWrap: "wrap" }}>
                          <div>
                            <div>
                              <b>{who}</b> <span className="vx-muted">• id:{tgId}</span>
                              {isNew ? <span className="vx-tag vx-tagNew">Новый</span> : null}
                            </div>
                            <div className="vx-muted" style={{ marginTop: 2 }}>
                              Имя (админ): <b>{adminName}</b>
                            </div>
                            {banks.length ? (
                              <div className="vx-bankInline" style={{ marginTop: 6 }}>
                                {banks.slice(0, 6).map((ic) => (
                                  <img key={ic} src={`/banks/${ic}`} alt="" className="vx-bankInlineImg" title={ic} />
                                ))}
                              </div>
                            ) : null}
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div className="vx-muted">Сумма сделок</div>
                            <div><b>{sumText}</b></div>
                            <div className="vx-muted" style={{ marginTop: 2 }}>Сделок: <b>{fmtNum(agg.cnt)}</b></div>
                          </div>
                        </div>

                        <div className="vx-sp8" />

                        <div className="row vx-rowWrap vx-gap6" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {STATUS_OPTIONS.map((s) => {
                            const isOn = String(u.status) === s.v;
                            const activeStyle = isOn
                              ? (s.v === "standard"
                                  ? { background: "rgba(9,23,33,.88)", color: "rgba(255,255,255,.96)", border: 0 }
                                  : s.v === "silver"
                                    ? { background: "rgba(190,198,210,.95)", color: "rgba(9,23,33,.92)", border: 0 }
                                    : { background: "rgba(255,179,87,.96)", color: "rgba(26,18,8,.92)", border: 0 })
                              : undefined;

                            return (
                              <button
                                key={s.v}
                                className={`btn vx-btnSm vx-statusBtn vx-status-${s.v}${isOn ? " vx-btnOn" : ""}`}
                                style={activeStyle as any}
                                onClick={() => setClientStatus(tgId, s.v)}
                              >
                                {s.l}
                              </button>
                            );
                          })}

                          <button
                            type="button"
                            className="btn vx-btnSm"
                            onClick={() => {
                              setCUsername(u.username || "");
                              setCTgId(String(tgId));
                              setCFullName(c?.fullName || "");
                              setCStatus((c?.status as any) || (u.status as any) || "standard");
                              setCBanks(Array.isArray(c?.banks) ? c!.banks! : []);
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            Изменить карточку
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === "requests" ? (
        <div className="card">
          <AdminTab me={me} forcedSection="requests" hideHeader hideSeg />
        </div>
      ) : null}

      {tab === "reports" ? (
        <div className="card">
          <div className="small"><b>Отчёты</b></div>
          <div className="vx-sp10" />

          <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">С</div>
              <input className="input vx-in" type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">По</div>
              <input className="input vx-in" type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">tg_id (опц.)</div>
              <input className="input vx-in" value={repTgId} onChange={(e) => setRepTgId(e.target.value)} placeholder="123456" />
            </div>
          </div>

          <label className="vx-checkRow">
            <input type="checkbox" checked={repOnlyDone} onChange={(e) => setRepOnlyDone(e.target.checked)} />
            <span>Только «Готово»</span>
          </label>

          <button className="btn" type="button" onClick={runReport}>
            Показать
          </button>

          {report?.ok ? (
            <div className="vx-sp10">
              <div className="small"><b>Метрики</b></div>
              <div className="vx-metricGrid">
                <div className="vx-metricCard">
                  <div className="vx-muted">Всего сделок</div>
                  <div className="vx-metricVal">{fmtNum(report.metrics?.total)}</div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Статусы</div>
                  <div className="vx-metricLine">Принята: <b>{fmtNum(report.metrics?.states?.new)}</b></div>
                  <div className="vx-metricLine">В работе: <b>{fmtNum(report.metrics?.states?.in_progress)}</b></div>
                  <div className="vx-metricLine">Готово: <b>{fmtNum(report.metrics?.states?.done)}</b></div>
                  <div className="vx-metricLine">Отклонена: <b>{fmtNum(report.metrics?.states?.canceled)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Оплата</div>
                  <div className="vx-metricLine">Наличные: <b>{fmtNum(report.metrics?.pay?.cash)}</b></div>
                  <div className="vx-metricLine">Перевод: <b>{fmtNum(report.metrics?.pay?.transfer)}</b></div>
                  <div className="vx-metricLine">Другое: <b>{fmtNum(report.metrics?.pay?.other)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Получение</div>
                  <div className="vx-metricLine">Наличные: <b>{fmtNum(report.metrics?.receive?.cash)}</b></div>
                  <div className="vx-metricLine">Перевод: <b>{fmtNum(report.metrics?.receive?.transfer)}</b></div>
                  <div className="vx-metricLine">Банкомат: <b>{fmtNum(report.metrics?.receive?.atm)}</b></div>
                  <div className="vx-metricLine">Другое: <b>{fmtNum(report.metrics?.receive?.other)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Отдаёт (валюта)</div>
                  <div className="vx-chipRow">
                    {Object.entries(report.metrics?.sellCurrency || {}).length ? (
                      Object.entries(report.metrics?.sellCurrency || {})
                        .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
                        .map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                    ) : (
                      <span className="vx-muted">–</span>
                    )}
                  </div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Получает (валюта)</div>
                  <div className="vx-chipRow">
                    {Object.entries(report.metrics?.buyCurrency || {}).length ? (
                      Object.entries(report.metrics?.buyCurrency || {})
                        .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
                        .map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                    ) : (
                      <span className="vx-muted">–</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="vx-sp12" />
              <div className="small"><b>Сделки</b></div>
              <div className="vx-muted">Показано: {report.requests?.length || 0}</div>

              {Array.isArray(report.requests) && report.requests.length ? (
                <div className="vx-tableWrap">
                  <table className="vx-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Клиент</th>
                        <th>Пара</th>
                        <th>Отдал</th>
                        <th>Получил</th>
                        <th>Оплата</th>
                        <th>Получение</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.requests.slice(0, 200).map((r: any) => (
                        <tr key={r.id}>
                          <td>{fmtDt(r.created_at)}</td>
                          <td>{who(r)}</td>
                          <td>{String(r.sellCurrency)} → {String(r.buyCurrency)}</td>
                          <td>{fmtNum(r.sellAmount)}</td>
                          <td>{fmtNum(r.buyAmount)}</td>
                          <td>{methodRu(r.payMethod)}</td>
                          <td>{methodRu(r.receiveMethod)}</td>
                          <td><b>{stateRu(r.state)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="vx-muted">Нет сделок за выбранный период.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
