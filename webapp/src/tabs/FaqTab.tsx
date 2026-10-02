import React, { useEffect, useMemo, useState } from "react";
import { apiGetFaq } from "../lib/api";
import ClientIcon from "../components/ClientIcon";
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
        const r: any = await apiGetFaq(lang);
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
  }, [lang, isEn]);

  const list = useMemo(() => {
    const a = Array.isArray(items) ? items : [];
    return a
      .map((x) => {
        const qRu = String(x?.q_ru || "").trim();
        const aRu = String(x?.a_ru || "").trim();
        const qEn = String(x?.q_en || "").trim();
        const aEn = String(x?.a_en || "").trim();
        const qResolved = String(x?.q || "").trim();
        const aResolved = String(x?.a || "").trim();
        const q = isEn ? qEn : (qResolved || qRu);
        const aText = isEn ? aEn : (aResolved || aRu);
        return { ...x, q, a: aText };
      })
      .filter((x) => x && String(x.q || "").trim());
  }, [items, isEn]);

  return <div className="cp-page cp-faq">
    <div className="cp-pageIntro"><span className="cp-icon"><ClientIcon name="help"/></span><p>{isEn ? "Answers to common questions about your exchange." : "Ответы на частые вопросы об обмене."}</p></div>
    {loading && <p className="cp-empty" role="status">{isEn ? "Loading questions…" : "Загружаем вопросы…"}</p>}
    {err && <p className="cp-empty" role="alert">{err}</p>}
    {!loading && !err && !list.length && <div className="cp-empty"><ClientIcon name="help"/><h2>{isEn ? "No questions yet" : "Вопросов пока нет"}</h2><p>{isEn ? "You can contact the manager from the Contacts page." : "Задать вопрос менеджеру можно в разделе «Контакты»."}</p></div>}
    <div className="cp-faqList">{list.map(it => {
      const open = openId === it.id;
      return <section key={it.id} className={"cp-faqItem"+(open?" is-open":"")}>
        <button type="button" className="cp-faqQuestion" aria-expanded={open} aria-controls={"faq-answer-"+it.id} onClick={()=>setOpenId(open?"":it.id)}><span>{it.q}</span><span className="cp-faqPlus" aria-hidden="true">+</span></button>
        <div className="cp-faqAnswer" id={"faq-answer-"+it.id} aria-hidden={!open}><div><p>{it.a}</p></div></div>
      </section>;
    })}</div>
  </div>;
}
