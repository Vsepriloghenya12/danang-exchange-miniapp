import React, { useEffect, useMemo, useState } from "react";
import {
  apiGetBankIcons,
  apiStaffGetRequests,
  apiStaffSetRequestState,
  apiStaffUpsertContact,
} from "../lib/api";
import type { Contact } from "../lib/types";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

const STATE_OPTIONS = [
  { v: "new", l: "Принята" },
  { v: "in_progress", l: "В работе" },
  { v: "done", l: "Готово" },
  { v: "canceled", l: "Отклонена" },
] as const;

function shortId(id: string) {
  const s = String(id || "");
  return s.length > 6 ? s.slice(-6) : s;
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function StaffTab({ me }: any) {
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";

  const [loading, setLoading] = useState(true);
  const [icons, setIcons] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Record<string, Contact>>({});

  const [selectedId, setSelectedId] = useState<string>("");

  const selectedReq = useMemo(() => requests.find((r) => String(r.id) === String(selectedId)) || null, [requests, selectedId]);
  const selectedTgId = selectedReq?.from?.id ? Number(selectedReq.from.id) : undefined;

  const selectedContact: Contact | null = useMemo(() => {
    if (!selectedTgId) return null;
    return contactsMap[String(selectedTgId)] || null;
  }, [contactsMap, selectedTgId]);

  const [fullName, setFullName] = useState<string>("");
  const [banks, setBanks] = useState<string[]>([]);

  // sync editor when selection changes
  useEffect(() => {
    setFullName(selectedContact?.fullName || "");
    setBanks(Array.isArray(selectedContact?.banks) ? selectedContact!.banks! : []);
  }, [selectedContact?.id]);

  async function loadAll() {
    if (!initData) return;
    setLoading(true);
    try {
      const [ri, bi] = await Promise.allSettled([
        apiStaffGetRequests(initData),
        apiGetBankIcons(),
      ]);

      if (ri.status === "fulfilled" && ri.value?.ok) {
        setRequests(Array.isArray(ri.value.requests) ? ri.value.requests : []);
        setContactsMap((ri.value.contacts as any) || {});
        const first = (ri.value.requests || [])[0];
        if (first && !selectedId) setSelectedId(String(first.id));
      }

      if (bi.status === "fulfilled" && bi.value?.ok) {
        setIcons(Array.isArray(bi.value.icons) ? bi.value.icons : []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    tg?.expand?.();
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function changeState(next: string) {
    if (!selectedReq) return;
    const r = await apiStaffSetRequestState(initData, String(selectedReq.id), next);
    if (!r?.ok) {
      tg?.showAlert?.(r?.error || "Ошибка");
      return;
    }
    await loadAll();
    tg?.HapticFeedback?.notificationOccurred?.("success");
  }

  async function saveContact() {
    if (!selectedTgId && !selectedReq?.from?.username) return;

    const payload: any = {
      tg_id: selectedTgId,
      username: selectedReq?.from?.username,
      fullName: fullName,
      banks: banks,
    };

    const r = await apiStaffUpsertContact(initData, payload);
    if (!r?.ok) {
      tg?.showAlert?.(r?.error || "Ошибка");
      return;
    }

    await loadAll();
    tg?.HapticFeedback?.notificationOccurred?.("success");
  }

  function toggleBank(name: string) {
    setBanks((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      return [...prev, name];
    });
  }

  if (!initData) {
    return (
      <div className="card">
        <div className="h1">Админ</div>
        <div className="small">Откройте вкладку админа внутри Telegram.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="h1">Админ</div>
      <div className="small">Заявки • смена статуса • карточка клиента</div>

      {loading ? <div className="vx-help">Загрузка…</div> : null}

      <div className="vx-sp12" />

      <div className="vx-adminStack">
        {/* 1) Active request (always on top) */}
        <div className="vx-adminPanel">
          <div className="vx-adminPanelH">Активная заявка</div>

          {requests.length === 0 ? (
            <div className="vx-muted">Заявок пока нет.</div>
          ) : !selectedReq ? (
            <div className="vx-muted">Выбери заявку в «Истории заявок» ниже.</div>
          ) : (
            <>
              <div className="vx-adminReqTop">
                <div className="vx-adminReqId">#{shortId(selectedReq.id)}</div>
                <div className="vx-muted">{fmtDateTime(selectedReq.created_at)}</div>
              </div>

              <div className="vx-sp8" />

              <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATE_OPTIONS.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    className={"btn vx-btnSm " + (String(selectedReq.state) === s.v ? "vx-btnOn" : "")}
                    onClick={() => changeState(s.v)}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 2) Clients (collapsed by default) */}
        <details className="vx-acc">
          <summary>Клиенты</summary>

          {!selectedReq ? (
            <div className="vx-muted">Сначала выбери заявку в «Истории заявок».</div>
          ) : (
            <>
              <div className="vx-muted" style={{ marginTop: 6 }}>
                {selectedReq.from?.username ? `@${selectedReq.from.username}` : ""} • id:{selectedReq.from?.id}
              </div>

              {banks.length ? (
                <div className="vx-bankInline" style={{ marginTop: 10 }}>
                  {banks.slice(0, 8).map((ic) => (
                    <img key={ic} src={`/banks/${ic}`} alt="" className="vx-bankInlineImg" title={ic} />
                  ))}
                </div>
              ) : null}

              <div className="vx-sp10" />

              <div className="vx-accLbl">Имя (ФИО)</div>
              <input
                className="input vx-in"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Например: Иванов Иван"
              />

              <div className="vx-sp10" />

              {/* 2.1) Banks (collapsed by default) */}
              <details className="vx-acc vx-accInner">
                <summary>Банки</summary>
                {icons.length === 0 ? (
                  <div className="vx-muted">Иконок нет (положи файлы в webapp/public/banks).</div>
                ) : (
                  <div className="vx-bankGrid" style={{ marginTop: 10 }}>
                    {icons.map((ic) => {
                      const on = banks.includes(ic);
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
              </details>

              <div className="vx-sp10" />

              <button type="button" className="btn" onClick={saveContact}>
                Сохранить контакт
              </button>
            </>
          )}
        </details>

        {/* 3) Requests history (collapsed by default) */}
        <details className="vx-acc">
          <summary>История заявок</summary>
          {requests.length === 0 ? (
            <div className="vx-muted">Заявок пока нет.</div>
          ) : (
            <div className="vx-reqList" style={{ marginTop: 10 }}>
              {requests.slice(0, 80).map((r) => {
                const isActive = String(r.id) === String(selectedId);
                const u = r.from || {};
                const who = u.username ? `@${u.username}` : `${u.first_name || ""} ${u.last_name || ""}`.trim() || `id ${u.id}`;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={"vx-reqRow " + (isActive ? "is-active" : "")}
                    onClick={() => setSelectedId(String(r.id))}
                  >
                    <div className="vx-reqTop">
                      <b>#{shortId(r.id)}</b>
                      <span className="vx-muted">{fmtDateTime(r.created_at)}</span>
                    </div>
                    <div className="vx-muted">{who}</div>
                    <div>
                      <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                      <span className="vx-tag">{r.state}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
