import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminTab from "../tabs/AdminTab";
import {
  apiAdminGetAdmins,
  apiAdminSetAdmins,
  apiAdminGetPublishTemplate,
  apiAdminSetPublishTemplate,
  apiAdminPublish,
  apiAdminGetContacts,
  apiAdminUpsertContact,
  apiAdminGetReports,
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
  const [tpl, setTpl] = useState<string>(DEFAULT_TEMPLATE);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cUsername, setCUsername] = useState<string>("");
  const [cFullName, setCFullName] = useState<string>("");
  const [cStatus, setCStatus] = useState<UserStatus>("standard");

  const [repFrom, setRepFrom] = useState<string>(() => shiftISO(-7));
  const [repTo, setRepTo] = useState<string>(() => todayISO());
  const [repOnlyDone, setRepOnlyDone] = useState<boolean>(true);
  const [repTgId, setRepTgId] = useState<string>("");
  const [report, setReport] = useState<any>(null);

  const saveTplTimer = useRef<number | null>(null);

  async function loadAll() {
    if (!token) return;
    setBanner(null);
    const [a, t, c] = await Promise.allSettled([
      apiAdminGetAdmins(token),
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

  useEffect(() => {
    if (!token) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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

  async function publishNow() {
    const r = await apiAdminPublish(token, { template: tpl, imageDataUrl });
    if (!r?.ok) {
      showErr(r?.error || "Ошибка публикации");
      return;
    }
    showOk("Опубликовано ✅");
  }

  async function upsertContact() {
    const username = normU(cUsername);
    if (!username) {
      showErr("Укажи username");
      return;
    }

    const r = await apiAdminUpsertContact(token, {
      username,
      fullName: cFullName,
      status: cStatus,
    } as any);

    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }

    setCUsername("");
    setCFullName("");
    setCStatus("standard");

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
            </div>

            {imageDataUrl ? (
              <div className="vx-sp10">
                <img src={imageDataUrl} alt="" style={{ width: "100%", borderRadius: 12 }} />
              </div>
            ) : null}

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={publishNow}>
              Опубликовать
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
            <div className="small"><b>Контакт по username</b></div>
            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input vx-in"
                value={cUsername}
                onChange={(e) => setCUsername(e.target.value)}
                placeholder="username (без @)"
                style={{ flex: "1 1 220px" }}
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
              placeholder="ФИО (опционально)"
            />

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={upsertContact}>
              Сохранить
            </button>

            <div className="hr" />
            <div className="small"><b>Список</b></div>
            {contacts.length === 0 ? (
              <div className="vx-muted">Пока пусто.</div>
            ) : (
              <div className="vx-contactList">
                {contacts
                  .slice()
                  .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
                  .slice(0, 50)
                  .map((c) => (
                    <div key={c.id} className="vx-contactRow">
                      <div><b>{c.username ? "@" + c.username : c.tg_id ? "id " + c.tg_id : c.id}</b></div>
                      <div className="vx-muted">{c.fullName || ""}{c.status ? ` • ${c.status}` : ""}</div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <AdminTab me={me} forcedSection="users" hideHeader hideSeg />
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
            <span>Только выполненные (done)</span>
          </label>

          <button className="btn" type="button" onClick={runReport}>
            Показать
          </button>

          {report?.ok ? (
            <div className="vx-sp10">
              <div className="small"><b>Метрики</b></div>
              <pre className="vx-pre">{JSON.stringify(report.metrics, null, 2)}</pre>
              <div className="small"><b>Сделки</b></div>
              <div className="vx-muted">Показано: {report.requests?.length || 0}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
