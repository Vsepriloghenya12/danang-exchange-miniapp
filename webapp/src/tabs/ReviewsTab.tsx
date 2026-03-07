import React, { useEffect, useMemo, useState } from "react";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function StarPicker(props: { value: number; onChange: (v: number) => void }) {
  const { value, onChange } = props;
  return (
    <div className="vx-stars">
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        const active = v <= value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={"vx-starBtn " + (active ? "is-active" : "")}
            aria-label={`Поставить ${v} звёзд`}
          >
            ★
          </button>
        );
      })}
      <div className="vx-starScore">{value}/5</div>
    </div>
  );
}

export default function ReviewsTab() {
  const tg = getTg();

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<any[]>([]);

  const [rating, setRating] = useState<number>(5); // сразу 5
  const [text, setText] = useState<string>("");

  useEffect(() => {
    tg?.expand?.();
    (async () => {
      try {
        const res = await fetch("/api/reviews");
        const json = await res.json();
        setReviews(Array.isArray(json?.reviews) ? json.reviews : []);
      } catch {
        setReviews([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const canSend = useMemo(() => rating >= 1 && rating <= 5 && text.trim().length >= 3, [rating, text]);

  async function sendReview() {
    if (!canSend) return;

    const initData = tg?.initData || "";
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `tma ${initData}`
        },
        body: JSON.stringify({ rating, text: text.trim() })
      });

      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error || "fail");

      setText("");
      setRating(5);

      // перезагрузим список
      const r2 = await fetch("/api/reviews");
      const j2 = await r2.json();
      setReviews(Array.isArray(j2?.reviews) ? j2.reviews : []);

      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (e) {
      tg?.HapticFeedback?.notificationOccurred?.("error");
    }
  }

  return (
    <div className="vx-reviews">
      <div className="vx-reviewsTitle">Отзывы</div>

      <div className="vx-revCompose">
        <div className="vx-revH">Оставить отзыв</div>
        <StarPicker value={rating} onChange={setRating} />

        <textarea
          placeholder="Напиши отзыв (минимум 3 символа)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="vx-revText"
        />

        <button
          onClick={sendReview}
          disabled={!canSend}
          className="vx-primary"
        >
          Отправить
        </button>
      </div>

      <div className="vx-revH">Последние отзывы</div>
      {loading && <div>Загрузка…</div>}
      {!loading && reviews.length === 0 && <div className="vx-muted">Пока нет отзывов.</div>}

      <div className="vx-revList">
        {reviews.map((r) => (
          <div key={r.id} className="vx-revCard">
            <div className="vx-revTop">
              <div className="vx-revName">
                {r.username ? `@${r.username}` : `ID ${r.tg_id}`}
              </div>
              <div className="vx-revRating">{Number(r.rating)}/5</div>
            </div>
            <div className="vx-revTextOut">{r.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
