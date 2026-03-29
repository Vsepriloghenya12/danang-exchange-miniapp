import React, { useEffect, useMemo, useState } from "react";
import { apiGetFaq } from "../lib/api";
import type { FaqItem } from "../lib/types";

type Lang = "ru" | "en";

export default function FaqTab({ lang = "ru" }: { lang?: Lang }) {
  const isEn = lang === "en";
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [openId, setOpenId] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const r: any = await apiGetFaq();
        if (!mounted) return;
        if (r?.ok) {
          setItems(Array.isArray(r.items) ? r.items : []);
          setErr("");
        } else {
          setErr(String(r?.error || (isEn ? "Failed to load FAQ" : "Не удалось загрузить FAQ")));
          setItems([]);
        }
      } catch (e: any) {
        if (!mounted) return;
        setErr(String(e?.message || (isEn ? "Failed to load FAQ" : "Не удалось загрузить FAQ")));
        setItems([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [isEn]);

  const list = useMemo(() => {
    const a = Array.isArray(items) ? items : [];
    return a
      .map((x) => {
        const qRu = String(x?.q_ru || "").trim();
        const aRu = String(x?.a_ru || "").trim();
        const qEn = String(x?.q_en || "").trim();
        const aEn = String(x?.a_en || "").trim();
        const q = isEn ? qEn || qRu : qRu;
        const aText = isEn ? aEn || aRu : aRu;
        return { ...x, q, a: aText };
      })
      .filter((x) => x && String(x.q || "").trim());
  }, [items, isEn]);

  if (loading) return <div className="card" style={{ padding: 14 }}><div className="small">{isEn ? "Loading…" : "Загрузка…"}</div></div>;
  if (err) return <div className="card" style={{ padding: 14 }}><div className="h3" style={{ marginBottom: 6 }}>FAQ</div><div className="small">{err}</div></div>;
  if (!list.length) return <div className="card" style={{ padding: 14 }}><div className="h3" style={{ marginBottom: 6 }}>FAQ</div><div className="small">{isEn ? "No questions yet." : "Пока нет вопросов."}</div></div>;

  return <div className="mx-faq">{list.map((it) => { const open = openId === it.id; return <div key={it.id} className={open ? "mx-faqItem is-open" : "mx-faqItem"}><button type="button" className="mx-faqQ" onClick={() => setOpenId((x) => (x === it.id ? "" : it.id))}><span>{it.q}</span><span className="mx-faqChevron">{open ? "—" : "+"}</span></button>{open ? <div className="mx-faqA">{it.a}</div> : null}</div>; })}</div>;
}
