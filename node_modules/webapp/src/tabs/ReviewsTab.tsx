import React, { useEffect, useState } from "react";
import { apiAddReview, apiGetReviews } from "../lib/api";
import { getTg } from "../lib/telegram";

export default function ReviewsTab({ me }: any) {
  const tg = getTg();
  const [reviews, setReviews] = useState<any[]>([]);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  const load = async () => {
    const r = await apiGetReviews();
    if (r.ok) setReviews(r.reviews);
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!me?.ok || !tg) return;
    const r = await apiAddReview(me.initData, rating, text.trim());
    if (r.ok) {
      setText("");
      await load();
    } else {
      alert(r.error || "Ошибка");
    }
  };

  return (
    <div className="card">
      <div className="h1">Отзывы</div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="small">Оставить отзыв</div>
        <div className="row" style={{ marginTop: 6 }}>
          <select className="input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5,4,3,2,1].map(n => <option key={n} value={n}>{n}★</option>)}
          </select>
          <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Текст отзыва" />
          <button className="btn" onClick={add} disabled={!tg || !me?.ok}>Отправить</button>
        </div>
        {!tg && <div className="small" style={{ marginTop: 6 }}>Откройте из Telegram.</div>}
      </div>

      {reviews.length === 0 ? (
        <div className="small">Пока нет отзывов.</div>
      ) : (
        reviews.map((r, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <div><b>{r.rating}★</b> <span className="small">{r.username ? "@" + r.username : ""}</span></div>
            <div>{r.text}</div>
            <div className="small">{new Date(r.created_at).toLocaleString("ru-RU")}</div>
            <div className="hr" />
          </div>
        ))
      )}
    </div>
  );
}
