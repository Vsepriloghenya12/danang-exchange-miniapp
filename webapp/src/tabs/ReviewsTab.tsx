import React, { useEffect, useMemo, useState } from "react";

function getTg() {
  return (window as any).Telegram?.WebApp;
}

function StarPicker(props: { value: number; onChange: (v: number) => void }) {
  const { value, onChange } = props;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const v = i + 1;
        const active = v <= value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              fontSize: 26,
              lineHeight: "26px",
              cursor: "pointer",
              background: "transparent",
              border: "none",
              padding: 0,
              opacity: active ? 1 : 0.35
            }}
            aria-label={`Поставить ${v} звёзд`}
          >
            ★
          </button>
        );
      })}
      <div style={{ marginLeft: 8, opacity: 0.85 }}>{value}/5</div>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Отзывы</div>

      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10
        }}
      >
        <div style={{ fontWeight: 600 }}>Оставить отзыв</div>
        <StarPicker value={rating} onChange={setRating} />

        <textarea
          placeholder="Напиши отзыв (минимум 3 символа)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          style={{ padding: 10, borderRadius: 10 }}
        />

        <button
          onClick={sendReview}
          disabled={!canSend}
          style={{
            padding: 12,
            borderRadius: 12,
            cursor: canSend ? "pointer" : "not-allowed",
            opacity: canSend ? 1 : 0.5
          }}
        >
          Отправить
        </button>
      </div>

      <div style={{ fontWeight: 600 }}>Последние отзывы</div>
      {loading && <div>Загрузка…</div>}
      {!loading && reviews.length === 0 && <div style={{ opacity: 0.8 }}>Пока нет отзывов.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {reviews.map((r) => (
          <div
            key={r.id}
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: 12,
              padding: 12
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 700 }}>
                {r.username ? `@${r.username}` : `ID ${r.tg_id}`}
              </div>
              <div style={{ opacity: 0.85 }}>{Number(r.rating)}/5</div>
            </div>
            <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{r.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
