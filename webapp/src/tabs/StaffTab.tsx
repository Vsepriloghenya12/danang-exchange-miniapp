import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  apiGetBankIcons,
  bankIconUrl,
  apiAdminSetUserStatus,
  apiStaffGetRequests,
  apiStaffSetRequestState,
  apiStaffUpdateRequest,
  apiStaffUpsertContact,
  apiAdminMessageUser,
  apiAdminGetSupportDialog,
} from "../lib/api";
import type { Contact, UserStatus } from "../lib/types";

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


const STATUS_OPTIONS = [
  { v: "standard", l: "Стандарт" },
  { v: "silver", l: "Серебро" },
  { v: "gold", l: "Золото" },
] as const;

function userStatusLabel(v: string) {
  const hit = STATUS_OPTIONS.find((x) => x.v === String(v || "standard"));
  return hit?.l || "Стандарт";
}

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

function supportClientCount(r: any) {
  return Math.max(0, Number(r?.supportClientMessageCount || 0) || 0);
}

function supportUnreadCount(r: any) {
  return Math.max(0, Number(r?.supportUnreadCount || 0) || 0);
}

function supportBadgeLabel(r: any) {
  const unread = supportUnreadCount(r);
  if (unread > 0) return `Новых ${unread}`;
  const total = supportClientCount(r);
  return total > 0 ? `Сообщений ${total}` : "";
}


function openClientDialog(username?: string, tgId?: number) {
  const tg = getTg();
  const uname = String(username || "").trim().replace(/^@+/, "");
  if (uname) {
    const url = `https://t.me/${uname}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else if (tg?.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (tgId && Number.isFinite(tgId)) {
    const deep = `tg://user?id=${tgId}`;
    if (tg?.openLink) tg.openLink(deep);
    else window.location.href = deep;
  }
}

export default function StaffTab({ me }: any) {
  const tg = getTg();
  const initData = tg?.initData || me?.initData || "";

  const [loading, setLoading] = useState(true);
  const [icons, setIcons] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [contactsMap, setContactsMap] = useState<Record<string, Contact>>({});
  const [usersMap, setUsersMap] = useState<Record<string, { tg_id: number; username?: string; first_name?: string; last_name?: string; status?: UserStatus }>>({});

  const [selectedId, setSelectedId] = useState<string>("");

  const [view, setView] = useState<"list" | "detail" | "history">("list");
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogMessages, setDialogMessages] = useState<any[]>([]);
  const [dialogClientLabel, setDialogClientLabel] = useState("");
  const [dialogStats, setDialogStats] = useState<{ unreadCount?: number; clientMessageCount?: number } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

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

  async function saveRequestEdit() {
    if (!selectedReq || savingRequest) return;
    const state = String(selectedReq.state || "");
    if (state !== "in_progress" && state !== "new") {
      tg?.showAlert?.("Редактирование доступно только для заявки в работе.");
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
      tg?.showAlert?.("Проверь пару валют.");
      return;
    }
    if (!Number.isFinite(payload.sellAmount) || payload.sellAmount <= 0 || !Number.isFinite(payload.buyAmount) || payload.buyAmount <= 0) {
      tg?.showAlert?.("Проверь суммы заявки.");
      return;
    }

    setSavingRequest(true);
    try {
      const r = await apiStaffUpdateRequest(initData, String(selectedReq.id), payload);
      if (!r?.ok) {
        tg?.showAlert?.(r?.error || "Ошибка");
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
      tg?.showAlert?.(r?.error || "Ошибка");
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
      const sc = document.getElementById("root");
      if (sc && (sc as any).scrollTo) (sc as any).scrollTo({ top: 0, behavior: "smooth" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }

  async function loadSupportDialog(tgId: number, markRead = true) {
    setDialogLoading(true);
    try {
      const r = await apiAdminGetSupportDialog(initData, tgId, markRead);
      if (!r?.ok) {
        tg?.showAlert?.(r?.error || "Не удалось загрузить переписку");
        return;
      }
      const client = r?.client || {};
      const label = client?.username ? `@${client.username}` : (client?.fullName || `id:${tgId}`);
      setDialogClientLabel(label);
      setDialogMessages(Array.isArray(r?.dialog?.messages) ? r.dialog.messages : []);
      setDialogStats(r?.stats || null);
    } finally {
      setDialogLoading(false);
    }
  }

  function handleOpenClientMessage() {
    const uname = String(selectedReq?.from?.username || "").trim();
    const tgId = Number(selectedReq?.from?.id || 0);
    if (uname) {
      openClientDialog(uname, tgId);
      return;
    }
    if (!Number.isFinite(tgId) || tgId <= 0) {
      tg?.showAlert?.("Не удалось определить Telegram ID клиента.");
      return;
    }
    setMessageText("");
    setDialogMessages([]);
    setMessageOpen(true);
    void loadSupportDialog(tgId, true);
  }

  useEffect(() => {
    if (!messageOpen || !selectedTgId) return;
    const t = window.setInterval(() => { void loadSupportDialog(selectedTgId, false); }, 4000);
    return () => window.clearInterval(t);
  }, [messageOpen, selectedTgId]);

  async function sendDirectMessage() {
    const tgId = Number(selectedReq?.from?.id || 0);
    const text = messageText.trim();
    if (!Number.isFinite(tgId) || tgId <= 0) {
      tg?.showAlert?.("Не удалось определить Telegram ID клиента.");
      return;
    }
    if (!text) {
      tg?.showAlert?.("Введите текст сообщения.");
      return;
    }
    setSendingMessage(true);
    try {
      const r = await apiAdminMessageUser(initData, { tg_id: tgId, text, request_id: String(selectedReq?.id || "") || undefined });
      if (!r?.ok) {
        tg?.showAlert?.(r?.error || "Не удалось отправить сообщение");
        return;
      }
      tg?.HapticFeedback?.notificationOccurred?.("success");
      setMessageText("");
      await loadSupportDialog(tgId, true);
    } finally {
      setSendingMessage(false);
    }
  }


  useEffect(() => {
    const el = chatScrollRef.current;
    if (!el) return;
    try {
      el.scrollTop = el.scrollHeight;
    } catch {
      // ignore
    }
  }, [dialogMessages, messageOpen]);

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

      {messageOpen ? (
        <div className="vx-modalOverlay" onClick={() => !sendingMessage && setMessageOpen(false)}>
          <div className="vx-modalCard vx-chatModal" onClick={(e) => e.stopPropagation()}>
            <div className="row vx-between vx-center">
              <div>
                <div className="vx-modalTitle">Чат с клиентом</div>
                <div className="vx-modalSub">{dialogClientLabel || "Клиент"}</div>
              </div>
              <button type="button" className="btn vx-btnSm" onClick={() => setMessageOpen(false)} disabled={sendingMessage}>Закрыть</button>
            </div>
            <div className="vx-chatHint" style={{ marginTop: 6 }}>Сообщения идут через бота. Ответ клиента появится здесь и дополнительно придёт менеджеру в личный чат с ботом.</div>
            <div className="vx-sp10" />
            <div className="vx-chatBox" ref={chatScrollRef}>
              {dialogLoading ? <div className="vx-muted">Загрузка переписки…</div> : null}
              {!dialogLoading && dialogMessages.length === 0 ? <div className="vx-chatEmpty">Переписка пока пустая.</div> : null}
              {!dialogLoading ? dialogMessages.map((m:any) => (
                <div key={String(m?.id || Math.random())} className={"vx-chatMsg " + (m?.from === "manager" ? "is-manager" : "is-client")}>
                  <div className="vx-chatMeta">{m?.from === "manager" ? (m?.manager_name || "Менеджер") : "Клиент"} • {fmtDateTime(String(m?.created_at || ""))}</div>
                  <div className="vx-chatText">{String(m?.text || "")}</div>
                </div>
              )) : null}
            </div>
            <div className="vx-sp10" />
            <div className="vx-chatComposer">
            <div className="vx-chatToolbar">
              <div className="vx-chatStats">{dialogStats?.clientMessageCount ? `Сообщений от клиента: ${dialogStats.clientMessageCount}` : "Сообщений от клиента пока нет"}</div>
            </div>
            <textarea
              className="input vx-in vx-chatTextarea"
              rows={4}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value.slice(0, 4000))}
              placeholder="Введите сообщение клиенту"
            />
            <div className="vx-sp10" />
            <div className="row vx-gap8">
              <button type="button" className="btn" onClick={sendDirectMessage} disabled={sendingMessage || !messageText.trim()}>
                {sendingMessage ? "Отправка..." : "Отправить"}
              </button>
              <button type="button" className="btn vx-btnSm" onClick={() => selectedTgId && loadSupportDialog(selectedTgId, true)} disabled={dialogLoading || !selectedTgId}>
                Обновить чат
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}

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
                      {supportClientCount(r) > 0 ? <span className={"vx-tag vx-chatCountTag " + (supportUnreadCount(r) > 0 ? "is-unread" : "")}>{supportBadgeLabel(r)}</span> : null}
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
                      {supportClientCount(r) > 0 ? <span className={"vx-tag vx-chatCountTag " + (supportUnreadCount(r) > 0 ? "is-unread" : "")}>{supportBadgeLabel(r)}</span> : null}
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
            <div className="vx-sp8" />
            <div className="vx-inlineBtns">
              <button type="button" className="btn vx-btnSm" onClick={handleOpenClientMessage}>
                {selectedReq?.from?.username ? "Написать клиенту" : "Открыть чат"}
              </button>
              {supportClientCount(selectedReq) > 0 ? <span className={"vx-tag vx-chatCountTag " + (supportUnreadCount(selectedReq) > 0 ? "is-unread" : "")}>{supportBadgeLabel(selectedReq)}</span> : null}
            </div>

            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "grid", gap: 6 }}>
              <div>🔁 <b>{selectedReq.sellCurrency} → {selectedReq.buyCurrency}</b></div>
              <div>💸 Отдаёт: <b>{selectedReq.sellAmount}</b></div>
              <div>🎯 Получит: <b>{selectedReq.buyAmount}</b></div>
              <div>💳 Оплата: <b>{methodLabel(String(selectedReq.payMethod || ""))}</b></div>
              <div>📦 Получение: <b>{methodLabel(String(selectedReq.receiveMethod || ""))}</b></div>
              {selectedReq.comment ? <div>📝 Комментарий: <b>{selectedReq.comment}</b></div> : null}
            </div>

            {(String(selectedReq.state) === "in_progress" || String(selectedReq.state) === "new") ? (
              <>
                <div className="hr" />
                <div className="small">Редактирование заявки</div>
                <div className="vx-muted" style={{ marginTop: 4 }}>Пока заявка в работе, админ может скорректировать пару, суммы и способы.</div>
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
                    <input className="input vx-in" inputMode="decimal" value={editSellAmount} onChange={(e) => setEditSellAmount(e.target.value)} placeholder="Сумма, которую отдаёт клиент" />
                    <input className="input vx-in" inputMode="decimal" value={editBuyAmount} onChange={(e) => setEditBuyAmount(e.target.value)} placeholder="Сумма, которую получает клиент" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select className="input vx-in" value={editPayMethod} onChange={(e) => setEditPayMethod(e.target.value)}>
                      <option value="cash">Наличные</option>
                      <option value="transfer">Перевод</option>
                      <option value="atm">Банкомат</option>
                    </select>
                    <select className="input vx-in" value={editReceiveMethod} onChange={(e) => setEditReceiveMethod(e.target.value)}>
                      <option value="cash">Наличные</option>
                      <option value="transfer">Перевод</option>
                      <option value="atm">Банкомат</option>
                    </select>
                  </div>
                  <textarea
                    className="input vx-in"
                    rows={3}
                    value={editComment}
                    onChange={(e) => setEditComment(e.target.value.slice(0, 300))}
                    placeholder="Комментарий клиента"
                  />
                </div>

                <div className="vx-sp10" />
                <button type="button" className="btn" onClick={saveRequestEdit} disabled={savingRequest}>
                  {savingRequest ? "Сохраняю заявку…" : "Сохранить заявку"}
                </button>
              </>
            ) : null}

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

            <div className="small">Статус клиента</div>
            <div className="vx-muted" style={{ marginTop: 4 }}>
              Текущий статус: <b>{userStatusLabel(selectedClientStatus)}</b>
            </div>
            <div className="vx-sp8" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  className={"btn vx-btnSm " + (selectedClientStatus === s.v ? "vx-btnOn" : "")}
                  onClick={() => changeClientStatus(s.v)}
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
                        <img src={bankIconUrl(ic)} alt="" className="vx-bankImg" onError={(e) => { const p = (e.currentTarget as HTMLImageElement).parentElement as HTMLElement | null; if (p) p.style.display = "none"; }} />
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
