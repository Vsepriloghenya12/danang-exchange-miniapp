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

  const [view, setView] = useState<"list" | "detail" | "history">("list");

  // Keep the latest selection/view accessible inside the polling interval.
  const selectedIdRef = useRef<string>("");
  const viewRef = useRef<"list" | "detail" | "history">("list");
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const selectedReq = useMemo(() => requests.find((r) => String(r.id) === String(selectedId)) || null, [requests, selectedId]);

  const activeReqs = useMemo(
    () =>
      (requests || [])
        .filter((r) => String(r?.state) !== "done" && String(r?.state) !== "canceled")
        .map((r) => ({ ...r, state: String(r.state) === "new" ? "in_progress" : r.state }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    [requests]
  );

  const historyReqs = useMemo(
    // History = finished requests only
    () =>
      (requests || [])
        .filter((r) => {
          const s = String(r?.state || "");
          return s === "done" || s === "canceled";
        })
        .slice()
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
        const curSelectedId = selectedIdRef.current;
        if (pick && (!curSelectedId || !list.some((x: any) => String(x.id) === String(curSelectedId)))) {
          setSelectedId(String(pick.id));
        }

        // If we're in details screen but the request disappeared, go back to the list.
        const curView = viewRef.current;
        if (curView === "detail" && curSelectedId && !list.some((x: any) => String(x.id) === String(curSelectedId))) {
          setView("list");
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
    if (!initData) return;
    loadAll();
    const id = window.setInterval(loadAll, 7000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  async function changeState(next: string) {
    if (!selectedReq) return;
    const r = await apiStaffSetRequestState(initData, String(selectedReq.id), next);
    if (!r?.ok) {
      tg?.showAlert?.(r?.error || "Ошибка");
      return;
    }
    await loadAll();
    // If a request is finished, move it to History (as expected by UX)
    if (next === "done" || next === "canceled") {
      setView("history");
    }
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

  function openDetails(id: string) {
    setSelectedId(String(id));
    setView("detail");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }

  if (!initData) {
    return (
      <div>
        <div className="vx-head">
          <div className="h2 vx-m0">Админ</div>
        </div>
        <div className="small">Откройте вкладку админа внутри Telegram.</div>
      </div>
    );
  }

  const Header = (
    <>
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">Админ</div>
          <div className="vx-meta">Заявки • статус • карточка клиента</div>
        </div>
        <div className="row vx-rowWrap vx-gap6" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn vx-btnSm" onClick={loadAll}>
            Обновить
          </button>
        </div>
      </div>

      {loading ? <div className="vx-help">Загрузка…</div> : null}
      <div className="vx-sp12" />
    </>
  );

  return (
    <div>
      {Header}

      {view === "list" ? (
        <>
          <div className="row vx-between vx-center">
            <div className="h3 vx-m0">Активные заявки</div>
            <button type="button" className="btn vx-btnSm" onClick={() => setView("history")}
              disabled={historyReqs.length === 0}
            >
              История
            </button>
          </div>

          <div className="vx-sp10" />

          {activeReqs.length === 0 ? (
            <div className="vx-muted">Заявок пока нет.</div>
          ) : (
            <div className="vx-reqList">
              {activeReqs.slice(0, 40).map((r) => {
                const u = r.from || {};
                const who = u.username ? `@${u.username}` : `${u.first_name || ""} ${u.last_name || ""}`.trim() || `id ${u.id}`;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={"vx-reqRow " + (String(r.id) === String(selectedId) ? "is-active" : "")}
                    onClick={() => openDetails(String(r.id))}
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
        </>
      ) : null}

      {view === "history" ? (
        <>
          <div className="row vx-between vx-center">
            <div className="h3 vx-m0">История заявок</div>
            <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>Назад</button>
          </div>
          <div className="vx-sp10" />

          {historyReqs.length === 0 ? (
            <div className="vx-muted">Заявок пока нет.</div>
          ) : (
            <div className="vx-reqList">
              {historyReqs.slice(0, 120).map((r) => {
                const u = r.from || {};
                const who = u.username ? `@${u.username}` : `${u.first_name || ""} ${u.last_name || ""}`.trim() || `id ${u.id}`;
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={"vx-reqRow " + (String(r.id) === String(selectedId) ? "is-active" : "")}
                    onClick={() => openDetails(String(r.id))}
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
        </>
      ) : null}

      {view === "detail" ? (
        !selectedReq ? (
          <>
            <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>Назад</button>
            <div className="vx-sp10" />
            <div className="vx-muted">Заявка не найдена.</div>
          </>
        ) : (
          <>
            <div className="row vx-between vx-center">
              <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>← Назад</button>
              <div className="vx-muted">{fmtDateTime(selectedReq.created_at)}</div>
            </div>

            <div className="vx-sp10" />

            <div className="h3 vx-m0">Заявка #{shortId(selectedReq.id)}</div>
            <div className="vx-muted" style={{ marginTop: 4 }}>
              Клиент: {selectedReq.from?.username ? `@${selectedReq.from.username}` : ""} • id:{selectedReq.from?.id}
            </div>

            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "grid", gap: 6 }}>
              <div>🔁 <b>{selectedReq.sellCurrency} → {selectedReq.buyCurrency}</b></div>
              <div>💸 Отдаёт: <b>{selectedReq.sellAmount}</b></div>
              <div>🎯 Получит: <b>{selectedReq.buyAmount}</b></div>
              <div>💳 Оплата: <b>{methodLabel(String(selectedReq.payMethod || ""))}</b></div>
              <div>📦 Получение: <b>{methodLabel(String(selectedReq.receiveMethod || ""))}</b></div>
            </div>

            <div className="hr" />

            <div className="small">Статус</div>
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

            <div className="hr" />

            <div className="small">Контакт клиента</div>
            <div className="vx-sp8" />

            <input
              className="input vx-in"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="ФИО (например: Иванов Иван)"
            />

            <div className="vx-sp10" />

            {icons.length === 0 ? (
              <div className="vx-muted">Иконок банков нет (положи файлы в webapp/public/banks).</div>
            ) : (
              <>
                <div className="vx-muted">Банки клиента</div>
                <div className="vx-sp8" />
                <div className="vx-bankGrid">
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
              </>
            )}

            <div className="vx-sp10" />
            <button type="button" className="btn" onClick={saveContact}>
              Сохранить контакт
            </button>

            {selectedContact ? (
              <div className="vx-muted" style={{ marginTop: 8 }}>
                Сохранено ранее: {selectedContact.fullName || "—"}
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
