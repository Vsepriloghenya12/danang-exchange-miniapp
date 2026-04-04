import React, { useEffect, useMemo, useRef, useState } from "react";
import { getUserStatusLabel, USER_STATUS_OPTIONS_RU } from "../domain/status";
import {
  apiGetBankIcons,
  bankIconUrl,
  apiAdminSetUserStatus,
  apiStaffGetRequests,
  apiStaffSetRequestState,
  apiStaffUpdateRequest,
  apiStaffUpsertContact,
} from "../lib/api";
import type { Contact, UserStatus } from "../lib/types";

type Lang = "ru" | "en";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function getStateOptions(lang: Lang) {
  if (lang === "en") {
    return [
      { v: "in_progress", l: "In progress" },
      { v: "done", l: "Done" },
      { v: "canceled", l: "Canceled" },
    ] as const;
  }

  return [
    { v: "in_progress", l: "В работе" },
    { v: "done", l: "Готова" },
    { v: "canceled", l: "Отклонена" },
  ] as const;
}

function getStateLabel(value: string, lang: Lang) {
  const normalized = String(value || "").toLowerCase();
  if (lang === "en") {
    if (normalized === "done") return "Done";
    if (normalized === "canceled") return "Canceled";
    return "In progress";
  }
  if (normalized === "done") return "Готова";
  if (normalized === "canceled") return "Отклонена";
  return "В работе";
}
function shortId(id: string) {
  const s = String(id || "");
  return s.length > 6 ? s.slice(-6) : s;
}

function fmtDateTime(iso: string, lang: Lang) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString(lang === "en" ? "en-GB" : "ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function methodLabel(m: string, lang: Lang) {
  const v = String(m || "").toLowerCase();
  if (v === "cash") return lang === "en" ? "Cash" : "Наличные";
  if (v === "transfer") return lang === "en" ? "Transfer" : "Перевод";
  if (v === "atm") return lang === "en" ? "ATM" : "Банкомат";
  if (v === "other") return lang === "en" ? "Other" : "Другое";
  return m || "—";
}

function openExternalUrl(url: string) {
  const raw = String(url || "").trim();
  if (!raw) return;
  const next = /^https?:\/\//i.test(raw) ? raw : new URL(raw, window.location.href).toString();
  if (!next) return;
  const tg = getTg();
  if (tg?.openLink) tg.openLink(next);
  else window.open(next, "_blank", "noopener,noreferrer");
}


export default function StaffTab({ me, lang = "ru" }: { me: any; lang?: Lang }) {
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";
  const isEn = lang === "en";
  const stateOptions = useMemo(() => getStateOptions(lang), [lang]);
  const userStatusOptions = useMemo(
    () =>
      lang === "en"
        ? USER_STATUS_OPTIONS_RU.map((s) => ({ value: s.value, label: getUserStatusLabel(s.value, "en") }))
        : USER_STATUS_OPTIONS_RU,
    [lang]
  );

  const [loading, setLoading] = useState(true);
  const [icons, setIcons] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Record<string, Contact>>({});
  const [usersMap, setUsersMap] = useState<Record<string, { tg_id: number; username?: string; first_name?: string; last_name?: string; status?: UserStatus }>>({});

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

  const selectedUser = useMemo(() => {
    if (!selectedTgId) return null;
    return usersMap[String(selectedTgId)] || null;
  }, [usersMap, selectedTgId]);

  const selectedClientStatus: UserStatus = useMemo(() => {
    const raw =
      selectedUser?.status ||
      selectedContact?.status ||
      (selectedReq?.status as UserStatus | undefined) ||
      "standard";
    return raw === "gold" || raw === "silver" ? raw : "standard";
  }, [selectedUser?.status, selectedContact?.status, selectedReq?.status]);

  const [fullName, setFullName] = useState<string>("");
  const [banks, setBanks] = useState<string[]>([]);
  const [editSellCurrency, setEditSellCurrency] = useState<string>("");
  const [editBuyCurrency, setEditBuyCurrency] = useState<string>("");
  const [editSellAmount, setEditSellAmount] = useState<string>("");
  const [editBuyAmount, setEditBuyAmount] = useState<string>("");
  const [editPayMethod, setEditPayMethod] = useState<string>("transfer");
  const [editReceiveMethod, setEditReceiveMethod] = useState<string>("cash");
  const [editComment, setEditComment] = useState<string>("");
  const [savingRequest, setSavingRequest] = useState(false);

  // sync editor when selection changes
  useEffect(() => {
    setFullName(selectedContact?.fullName || "");
    setBanks(Array.isArray(selectedContact?.banks) ? selectedContact!.banks! : []);
  }, [selectedContact?.id]);

  useEffect(() => {
    if (!selectedReq) {
      setEditSellCurrency("");
      setEditBuyCurrency("");
      setEditSellAmount("");
      setEditBuyAmount("");
      setEditPayMethod("transfer");
      setEditReceiveMethod("cash");
      setEditComment("");
      return;
    }
    setEditSellCurrency(String(selectedReq.sellCurrency || ""));
    setEditBuyCurrency(String(selectedReq.buyCurrency || ""));
    setEditSellAmount(String(selectedReq.sellAmount ?? ""));
    setEditBuyAmount(String(selectedReq.buyAmount ?? ""));
    setEditPayMethod(String(selectedReq.payMethod || "transfer"));
    setEditReceiveMethod(String(selectedReq.receiveMethod || "cash"));
    setEditComment(String(selectedReq.comment || ""));
  }, [selectedReq?.id]);

  async function loadAll(opts?: { silent?: boolean }) {
    if (!initData) return;
    if (!opts?.silent) setLoading(true);
    try {
      const [ri, bi] = await Promise.allSettled([
        apiStaffGetRequests(initData),
        apiGetBankIcons(),
      ]);

      if (ri.status === "fulfilled" && ri.value?.ok) {
        setRequests(Array.isArray(ri.value.requests) ? ri.value.requests : []);
        setContactsMap((ri.value.contacts as any) || {});
        setUsersMap((ri.value.users as any) || {});
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
        setIcons(Array.from(new Set(Array.isArray(bi.value.icons) ? bi.value.icons : [])));
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    tg?.expand?.();
    if (!initData) return;
    void loadAll();
    const id = window.setInterval(() => {
      void loadAll({ silent: true });
    }, 7000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initData]);

  async function changeState(next: string) {
    if (!selectedReq) return;
    const r = await apiStaffSetRequestState(initData, String(selectedReq.id), next);
    if (!r?.ok) {
      tg?.showAlert?.(r?.error || (isEn ? "Error" : "Ошибка"));
      return;
    }
    await loadAll();
    // If a request is finished, move it to History (as expected by UX)
    if (next === "done" || next === "canceled") {
      setView("history");
    }
    tg?.HapticFeedback?.notificationOccurred?.("success");
  }

  async function saveRequestEdit() {
    if (!selectedReq || savingRequest) return;
    const state = String(selectedReq.state || "");
    if (state !== "in_progress" && state !== "new") {
      tg?.showAlert?.(isEn ? "Editing is available only for a request in progress." : "Редактирование доступно только для заявки в работе.");
      return;
    }

    const payload = {
      sellCurrency: String(editSellCurrency || "").trim().toUpperCase(),
      buyCurrency: String(editBuyCurrency || "").trim().toUpperCase(),
      sellAmount: Number(String(editSellAmount || "").replace(",", ".")),
      buyAmount: Number(String(editBuyAmount || "").replace(",", ".")),
      payMethod: String(editPayMethod || "").trim().toLowerCase(),
      receiveMethod: String(editReceiveMethod || "").trim().toLowerCase(),
      comment: String(editComment || "").trim(),
    };

    if (!payload.sellCurrency || !payload.buyCurrency || (payload.sellCurrency === payload.buyCurrency && payload.sellCurrency !== "VND")) {
      tg?.showAlert?.(isEn ? "Check the currency pair." : "Проверь пару валют.");
      return;
    }
    if (!Number.isFinite(payload.sellAmount) || payload.sellAmount <= 0 || !Number.isFinite(payload.buyAmount) || payload.buyAmount <= 0) {
      tg?.showAlert?.(isEn ? "Check the request amounts." : "Проверь суммы заявки.");
      return;
    }

    setSavingRequest(true);
    try {
      const r = await apiStaffUpdateRequest(initData, String(selectedReq.id), payload);
      if (!r?.ok) {
        tg?.showAlert?.(r?.error || (isEn ? "Error" : "Ошибка"));
        return;
      }
      await loadAll();
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } finally {
      setSavingRequest(false);
    }
  }

  async function changeClientStatus(next: UserStatus) {
    if (!selectedTgId) return;
    const r = await apiAdminSetUserStatus(initData, selectedTgId, next);
    if (!r?.ok) {
      tg?.showAlert?.(r?.error || (isEn ? "Error" : "Ошибка"));
      return;
    }

    setUsersMap((prev) => ({
      ...prev,
      [String(selectedTgId)]: {
        ...(prev[String(selectedTgId)] || { tg_id: selectedTgId }),
        status: next,
      },
    }));
    setContactsMap((prev) => {
      const cur = prev[String(selectedTgId)];
      if (!cur) return prev;
      return {
        ...prev,
        [String(selectedTgId)]: {
          ...cur,
          status: next,
        },
      };
    });

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
      tg?.showAlert?.(r?.error || (isEn ? "Error" : "Ошибка"));
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
      const sc = document.getElementById("root");
      if (sc && (sc as any).scrollTo) (sc as any).scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }


  if (!initData) {
    return (
      <div>
        <div className="vx-head">
          <div className="h2 vx-m0">{isEn ? "Admin" : "Админ"}</div>
        </div>
        <div className="small">{isEn ? "Open the admin tab inside Telegram." : "Откройте вкладку админа внутри Telegram."}</div>
      </div>
    );
  }

  const Header = (
    <>
      <div className="vx-head">
        <div>
          <div className="h2 vx-m0">{isEn ? "Admin" : "Админ"}</div>
          <div className="vx-meta">{isEn ? "Requests • status • client card" : "Заявки • статус • карточка клиента"}</div>
        </div>
        <div className="row vx-rowWrap vx-gap6" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn vx-btnSm" onClick={loadAll}>
            {isEn ? "Refresh" : "Обновить"}
          </button>
        </div>
      </div>

      {loading ? <div className="vx-help">{isEn ? "Loading…" : "Загрузка…"}</div> : null}
      <div className="vx-sp12" />
    </>
  );

  return (
    <div>
      {Header}

      {view === "list" ? (
        <>
          <div className="row vx-between vx-center">
            <div className="h3 vx-m0">{isEn ? "Active requests" : "Активные заявки"}</div>
            <button type="button" className="btn vx-btnSm" onClick={() => setView("history")}
              disabled={historyReqs.length === 0}
            >
              {isEn ? "History" : "История"}
            </button>
          </div>

          <div className="vx-sp10" />

          {activeReqs.length === 0 ? (
            <div className="vx-muted">{isEn ? "No requests yet." : "Заявок пока нет."}</div>
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
                      <span className="vx-muted">{fmtDateTime(r.created_at, lang)}</span>
                    </div>
                    <div className="vx-muted">{who}</div>
                    <div>
                      <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                      <span className="vx-tag">{getStateLabel(String(r.state), lang)}</span>
                      
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
            <div className="h3 vx-m0">{isEn ? "Request history" : "История заявок"}</div>
            <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>{isEn ? "Back" : "Назад"}</button>
          </div>
          <div className="vx-sp10" />

          {historyReqs.length === 0 ? (
            <div className="vx-muted">{isEn ? "No requests yet." : "Заявок пока нет."}</div>
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
                      <span className="vx-muted">{fmtDateTime(r.created_at, lang)}</span>
                    </div>
                    <div className="vx-muted">{who}</div>
                    <div>
                      <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                      <span className="vx-tag">{getStateLabel(String(r.state), lang)}</span>
                      
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
            <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>{isEn ? "Back" : "Назад"}</button>
            <div className="vx-sp10" />
            <div className="vx-muted">{isEn ? "Request not found." : "Заявка не найдена."}</div>
          </>
        ) : (
          <>
            <div className="row vx-between vx-center">
              <button type="button" className="btn vx-btnSm" onClick={() => setView("list")}>{isEn ? "← Back" : "← Назад"}</button>
              <div className="vx-muted">{fmtDateTime(selectedReq.created_at, lang)}</div>
            </div>

            <div className="vx-sp10" />

            <div className="h3 vx-m0">{isEn ? "Request" : "Заявка"} #{shortId(selectedReq.id)}</div>
            <div className="vx-muted" style={{ marginTop: 4 }}>
              {isEn ? "Client" : "Клиент"}: {selectedReq.from?.username ? `@${selectedReq.from.username}` : ""} • id:{selectedReq.from?.id}
            </div>
            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "grid", gap: 6 }}>
              <div>🔁 <b>{selectedReq.sellCurrency} → {selectedReq.buyCurrency}</b></div>
              <div>💸 {isEn ? "Pays" : "Отдаёт"}: <b>{selectedReq.sellAmount}</b></div>
              <div>🎯 {isEn ? "Gets" : "Получит"}: <b>{selectedReq.buyAmount}</b></div>
              <div>💳 {isEn ? "Payment" : "Оплата"}: <b>{methodLabel(String(selectedReq.payMethod || ""), lang)}</b></div>
              <div>📦 {isEn ? "Receiving" : "Получение"}: <b>{methodLabel(String(selectedReq.receiveMethod || ""), lang)}</b></div>
              {selectedReq.comment ? <div>📝 {isEn ? "Comment" : "Комментарий"}: <b>{selectedReq.comment}</b></div> : null}
              {selectedReq.attachmentImageUrl ? (
                <div className="vx-requestAttachmentBlock">
                  <div className="vx-requestAttachmentLabel">📎 {isEn ? "Attached photo" : "Прикреплённое фото"}</div>
                  <button
                    type="button"
                    className="vx-requestAttachmentViewer"
                    onClick={() => openExternalUrl(String(selectedReq.attachmentImageUrl))}
                    title={isEn ? "Open attached photo" : "Открыть прикреплённое фото"}
                  >
                    <img className="vx-requestAttachmentViewerImg" src={String(selectedReq.attachmentImageUrl)} alt="" />
                  </button>
                </div>
              ) : null}
              {selectedReq.clientContact ? <div>☎️ {isEn ? "Contact" : "Контакт"}: <b>{selectedReq.clientContact}</b></div> : null}
            </div>

            {(String(selectedReq.state) === "in_progress" || String(selectedReq.state) === "new") ? (
              <>
                <div className="hr" />
                <div className="small">{isEn ? "Request editing" : "Редактирование заявки"}</div>
                <div className="vx-muted" style={{ marginTop: 4 }}>
                  {isEn ? "While the request is in progress, the admin can adjust the pair, amounts, and methods." : "Пока заявка в работе, админ может скорректировать пару, суммы и способы."}
                </div>
                <div className="vx-sp8" />

                <div className="vx-rowWrap" style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select className="input vx-in" value={editSellCurrency} onChange={(e) => setEditSellCurrency(e.target.value)}>
                      {["RUB", "USDT", "USD", "EUR", "THB", "VND"].map((c) => <option key={"sell-" + c} value={c}>{c}</option>)}
                    </select>
                    <select className="input vx-in" value={editBuyCurrency} onChange={(e) => setEditBuyCurrency(e.target.value)}>
                      {["RUB", "USDT", "USD", "EUR", "THB", "VND"].map((c) => <option key={"buy-" + c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input className="input vx-in" inputMode="decimal" value={editSellAmount} onChange={(e) => setEditSellAmount(e.target.value)} placeholder={isEn ? "Amount the client pays" : "Сумма, которую отдаёт клиент"} />
                    <input className="input vx-in" inputMode="decimal" value={editBuyAmount} onChange={(e) => setEditBuyAmount(e.target.value)} placeholder={isEn ? "Amount the client receives" : "Сумма, которую получает клиент"} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select className="input vx-in" value={editPayMethod} onChange={(e) => setEditPayMethod(e.target.value)}>
                      <option value="cash">{isEn ? "Cash" : "Наличные"}</option>
                      <option value="transfer">{isEn ? "Transfer" : "Перевод"}</option>
                      <option value="atm">{isEn ? "ATM" : "Банкомат"}</option>
                    </select>
                    <select className="input vx-in" value={editReceiveMethod} onChange={(e) => setEditReceiveMethod(e.target.value)}>
                      <option value="cash">{isEn ? "Cash" : "Наличные"}</option>
                      <option value="transfer">{isEn ? "Transfer" : "Перевод"}</option>
                      <option value="atm">{isEn ? "ATM" : "Банкомат"}</option>
                    </select>
                  </div>
                  <textarea
                    className="input vx-in"
                    rows={3}
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value.slice(0, 300))}
                    placeholder={isEn ? "Client comment" : "Комментарий клиента"}
                  />
                </div>

                <div className="vx-sp10" />
                <button type="button" className="btn" onClick={saveRequestEdit} disabled={savingRequest}>
                  {savingRequest ? (isEn ? "Saving request…" : "Сохраняю заявку…") : (isEn ? "Save request" : "Сохранить заявку")}
                </button>
              </>
            ) : null}

            <div className="hr" />

            <div className="small">{isEn ? "Status" : "Статус"}</div>
            <div className="vx-sp8" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {stateOptions.map((s) => (
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

            <div className="small">{isEn ? "Client status" : "Статус клиента"}</div>
            <div className="vx-muted" style={{ marginTop: 4 }}>
              {isEn ? "Current status" : "Текущий статус"}: <b>{getUserStatusLabel(selectedClientStatus, lang)}</b>
            </div>
            <div className="vx-sp8" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {userStatusOptions.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={"btn vx-btnSm " + (selectedClientStatus === s.value ? "vx-btnOn" : "")}
                  onClick={() => changeClientStatus(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="hr" />

            <div className="small">{isEn ? "Client contact" : "Контакт клиента"}</div>
            <div className="vx-sp8" />

            <input
              className="input vx-in"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={isEn ? "Full name (for example: Ivan Ivanov)" : "ФИО (например: Иванов Иван)"}
            />

            <div className="vx-sp10" />

            {icons.length === 0 ? (
              <div className="vx-muted">{isEn ? "No bank icons found (put files into webapp/public/banks)." : "Иконок банков нет (положи файлы в webapp/public/banks)."}</div>
            ) : (
              <>
                <div className="vx-muted">{isEn ? "Client banks" : "Банки клиента"}</div>
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
                        <img src={bankIconUrl(ic)} alt="" className="vx-bankImg" onError={(e) => { const p = (e.currentTarget as HTMLImageElement).parentElement as HTMLElement | null; if (p) p.style.display = "none"; }} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="vx-sp10" />
            <button type="button" className="btn" onClick={saveContact}>
              {isEn ? "Save contact" : "Сохранить контакт"}
            </button>

            {selectedContact ? (
              <div className="vx-muted" style={{ marginTop: 8 }}>
                {isEn ? "Saved earlier" : "Сохранено ранее"}: {selectedContact.fullName || "—"}
              </div>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
