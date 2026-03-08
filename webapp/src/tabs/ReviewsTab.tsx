import React, { useEffect, useMemo, useState } from "react";
import { apiAddReview, apiGetReviewEligible, apiGetReviews } from "../lib/api";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

export default function ReviewsTab() {
  const tg = getTg();
  const initData = tg?.initData || "";

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);

  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [eligible, setEligible] = useState<any[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");

  const [anonymous, setAnonymous] = useState(false);
  const [text, setText] = useState<string>("");

  async function loadPublic() {
    setLoading(true);
    try {
      const json = await apiGetReviews();
      setReviews(Array.isArray(json?.reviews) ? json.reviews : []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEligible() {
    if (!initData) return;
    setEligibleLoading(true);
    try {
      const json = await apiGetReviewEligible(initData);
      const list = Array.isArray(json?.eligible) ? json.eligible : [];
      setEligible(list);
      if (!selectedRequestId && list.length > 0) setSelectedRequestId(String(list[0].id));
    } catch {
      setEligible([]);
    } finally {
      setEligibleLoading(false);
    }
  }

  useEffect(() => {
    tg?.expand?.();
    loadPublic();
    loadEligible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend = useMemo(() => {
    return initData && selectedRequestId && text.trim().length >= 3;
  }, [initData, selectedRequestId, text]);

  async function sendReview() {
    if (!canSend) return;
    try {
      const r = await apiAddReview(initData, {
        requestId: selectedRequestId,
        text: text.trim(),
        anonymous
      });
      if (!r?.ok) throw new Error(r?.error || "fail");

      setText("");
      setAnonymous(false);
      await loadEligible();
      await loadPublic();

      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch {
      tg?.HapticFeedback?.notificationOccurred?.("error");
    }
  }

  return (
    <div className="vx-reviews">
      <div className="vx-reviewsTitle">Отзивы</div>

      <div className="vx-revCompose">
        <div className="vx-revH">Оставить отзыв</div>

        {!initData && (
          <div className="vx-muted">
            Чтобы оставить отзыв, откройте приложение внутри Telegram.
          </div>
        )}

        {initData && eligibleLoading && <div className="vx-muted">Проверяем сделки…</div>}

        {initData && !eligibleLoading && eligible.length === 0 && (
          <div className="vx-muted">
            Отзыв можно оставить только после совершения сделки.
          </div>
        )}

        {initData && !eligibleLoading && eligible.length > 0 && (
          <>
            <div className="vx-gap8 vx-center" style={{ display: "flex", flexWrap: "wrap" }}>
              <select
                className="input vx-in"
                value={selectedRequestId}
                onChange={(e) => setSelectedRequestId(e.target.value)}
                style={{ flex: "1 1 220px" }}
              >
                {eligible.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.sellCurrency}→{r.buyCurrency} • {fmtDate(r.created_at)}
                  </option>
                ))}
              </select>
            </div>

            <label className="vx-checkRow">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(e) => setAnonymous(e.target.checked)}
              />
              <span>Оставить анонимно</span>
            </label>

            <textarea
              placeholder="Напиши отзыв (минимум 3 символа)"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="vx-revText"
            />

            <button onClick={sendReview} disabled={!canSend} className="vx-primary">
              Отправить на модерацию
            </button>
          </>
        )}
      </div>

      <div className="vx-revH">Опубликованные отзывы</div>
      {loading && <div>Загрузка…</div>}
      {!loading && reviews.length === 0 && <div className="vx-muted">Пока нет отзывов.</div>}

      <div className="vx-revList">
        {reviews.map((r) => (
          <div key={r.id} className="vx-revCard">
            <div className="vx-revTop">
              <div className="vx-revName">{r.displayName || ""}</div>
              <div className="vx-muted">{fmtDate(r.created_at)}</div>
            </div>
            <div className="vx-revTextOut">{r.text}</div>

            {r.company_reply?.text && (
              <div className="vx-revReply">
                <div className="vx-revReplyH">Ответ компании</div>
                <div className="vx-revTextOut">{r.company_reply.text}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
