import React, { useEffect, useMemo, useRef, useState } from "react";
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

// В админке оставляем только 3 статуса: в работе (ставится автоматически), готова, отклонена
const STATE_OPTIONS = [
  { v: "in_progress", l: "В работе" },
  { v: "done", l: "Готова" },
  { v: "canceled", l: "Отклонена" },
] as const;

const stateLabel: Record<string, string> = {
  in_progress: "В работе",
  done: "Готова",
  canceled: "Отклонена",
  new: "В работе",
};

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

function methodLabel(m: string) {
  const v = String(m || "").toLowerCase();
  if (v === "cash") return "Наличные";
  if (v === "transfer") return "Перевод";
  if (v === "atm") return "Банкомат";
  if (v === "other") return "Другое";
  return m || "—";
}

export default function StaffTab({ me }: any) {
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";

  const [loading, setLoading] = useState(true);
  const [icons, setIcons] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Record<string, Contact>>({});

  const [selectedId, setSelectedId] = useState<string>("");

  const clientsRef = useRef<HTMLDetailsElement | null>(null);
  const banksRef = useRef<HTMLDetailsElement | null>(null);

  const selectedReq = useMemo(() => requests.find((r) => String(r.id) === String(selectedId)) || null, [requests, selectedId]);

  const activeReqs = useMemo(
    () =>
      (requests || [])
        .filter((r) => String(r?.state) !== "done" && String(r?.state) !== "canceled")
        .map((r) => ({ ...r, state: String(r.state) === "new" ? "in_progress" : r.state }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [requests]
  );
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
        // Prefer the newest active request as the default selection
        const list = Array.isArray(ri.value.requests) ? ri.value.requests : [];
        const active = list.filter((r: any) => String(r?.state) !== "done" && String(r?.state) !== "canceled");
        const firstActive = active.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        const firstAny = list.sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
        const pick = firstActive || firstAny;
        if (pick && (!selectedId || !list.some((x: any) => String(x.id) === String(selectedId)))) {
          setSelectedId(String(pick.id));
        }
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
    const id = window.setInterval(loadAll, 7000);
    return () => window.clearInterval(id);
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

  function openClientsEditor() {
    try {
      clientsRef.current && (clientsRef.current.open = true);
      banksRef.current && (banksRef.current.open = true);
      clientsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      // ignore
    }
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
          <div className="vx-adminPanelH">Активные заявки</div>

          {activeReqs.length === 0 ? (
            <div className="vx-muted">Заявок пока нет.</div>
          ) : (
            <>
              <div className="vx-reqList" style={{ marginTop: 6 }}>
                {activeReqs.slice(0, 20).map((r) => {
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
                        <span className="vx-tag">
                          {r.sellCurrency}→{r.buyCurrency}
                        </span>
                        <span className="vx-tag">{stateLabel[String(r.state)] || String(r.state)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedReq ? (
                <>
                  <div className="vx-sp10" />

                  <div className="vx-adminReqTop">
                    <div className="vx-adminReqId">Заявка #{shortId(selectedReq.id)}</div>
                    <div className="vx-muted">{fmtDateTime(selectedReq.created_at)}</div>
                  </div>

                  <div className="vx-sp8" />

                  <div className="vx-muted" style={{ marginTop: 2 }}>
                    Клиент: {selectedReq.from?.username ? `@${selectedReq.from.username}` : ""} • id:{selectedReq.from?.id}
                  </div>

                  <div className="vx-sp8" />

                  <div className="vx-rowWrap" style={{ display: "grid", gap: 6 }}>
                    <div>
                      🔁 <b>{selectedReq.sellCurrency} → {selectedReq.buyCurrency}</b>
                    </div>
                    <div>
                      💸 Отдаёт: <b>{selectedReq.sellAmount}</b>
                    </div>
                    <div>
                      🎯 Получит: <b>{selectedReq.buyAmount}</b>
                    </div>
                    <div>
                      💳 Оплата: <b>{methodLabel(String(selectedReq.payMethod || ""))}</b>
                    </div>
                    <div>
                      📦 Получение: <b>{methodLabel(String(selectedReq.receiveMethod || ""))}</b>
                    </div>
                  </div>

                  <div className="vx-sp10" />

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

                  <div className="vx-sp10" />
                  <button type="button" className="btn" onClick={openClientsEditor}>
                    Создать / обновить контакт клиента
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>

        {/* 2) Clients (collapsed by default) */}
        <details className="vx-acc" ref={clientsRef as any}>
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
              <details className="vx-acc vx-accInner" ref={banksRef as any}>
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
                      <span className="vx-tag">{stateLabel[String(r.state)] || String(r.state)}</span>
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
