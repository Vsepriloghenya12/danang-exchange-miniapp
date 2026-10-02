import React, { useEffect, useMemo, useState } from "react";
import { apiAddReview, apiGetReviewEligible, apiGetReviews } from "../lib/api";
import ClientIcon from "../components/ClientIcon";
type Lang="ru"|"en";
function fmtDate(iso:string,lang:Lang){const d=new Date(iso);return Number.isFinite(d.getTime())?d.toLocaleDateString(lang==="en"?"en-GB":"ru-RU",{day:"numeric",month:"short",year:"numeric"}):"";}
export default function ReviewsTab({lang="ru"}:{lang?:Lang}){
 const en=lang==="en",tg=(window as any).Telegram?.WebApp,initData=tg?.initData||"";
 const [loading,setLoading]=useState(true),[reviews,setReviews]=useState<any[]>([]);
 const [eligibleLoading,setEligibleLoading]=useState(false),[eligible,setEligible]=useState<any[]>([]);
 const [selectedRequestId,setSelectedRequestId]=useState(""),[anonymous,setAnonymous]=useState(false),[text,setText]=useState("");
 const [expanded,setExpanded]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(""),[loadError,setLoadError]=useState(""),[notice,setNotice]=useState("");
 async function loadPublic(){setLoading(true);setLoadError("");try{const r=await apiGetReviews();if(!r?.ok)throw Error();setReviews(Array.isArray(r.reviews)?r.reviews:[]);}catch{setLoadError(en?"Could not load reviews.":"Не удалось загрузить отзывы.");}finally{setLoading(false);}}
 async function loadEligible(){if(!initData)return;setEligibleLoading(true);try{const r=await apiGetReviewEligible(initData);const list=Array.isArray(r?.eligible)?r.eligible:[];setEligible(list);setSelectedRequestId(current=>list.some((x:any)=>String(x.id)===current)?current:String(list[0]?.id||""));}finally{setEligibleLoading(false);}}
 useEffect(()=>{void loadPublic();void loadEligible().catch(()=>setEligible([]));},[lang]);
 const canSend=useMemo(()=>!!initData&&!!selectedRequestId&&text.trim().length>=3&&!sending,[initData,selectedRequestId,text,sending]);
 async function sendReview(){if(!canSend)return;setSending(true);setError("");setNotice("");try{const r=await apiAddReview(initData,{requestId:selectedRequestId,text:text.trim(),anonymous});if(!r?.ok)throw Error();setText("");setAnonymous(false);setExpanded(false);setNotice(en?"Thank you! Your review was sent for moderation.":"Спасибо! Отзыв отправлен на модерацию.");await Promise.allSettled([loadEligible(),loadPublic()]);tg?.HapticFeedback?.notificationOccurred?.("success");}catch{setError(en?"Could not send your review. Please try again.":"Не удалось отправить отзыв. Попробуйте ещё раз.");}finally{setSending(false);}}
 return <div className="cp-page cp-reviews">
  <div className="cp-reviewIntro"><div><h2>{en?"Your exchange experience":"Ваш опыт обмена"}</h2><p>{en?"Reviews from our clients":"Отзывы наших клиентов"}</p></div><span className="cp-icon"><ClientIcon name="chat"/></span></div>
  <section className="cp-compose">
   <button type="button" className="cp-composeToggle" aria-expanded={expanded} aria-controls="review-form" onClick={()=>setExpanded(!expanded)}><ClientIcon name="chat"/><strong>{en?"Leave a review":"Оставить отзыв"}</strong><span aria-hidden="true">{expanded?"−":"+"}</span></button>
   <div id="review-form" hidden={!expanded} className="cp-composeBody">
    {!initData&&<p>{en?"Open the app inside Telegram to leave a review.":"Чтобы оставить отзыв, откройте приложение внутри Telegram."}</p>}
    {initData&&eligibleLoading&&<p role="status">{en?"Checking deals…":"Проверяем сделки…"}</p>}
    {initData&&!eligibleLoading&&!eligible.length&&<p>{en?"You can leave a review after a completed exchange.":"Отзыв можно оставить после завершённого обмена."}</p>}
    {initData&&!eligibleLoading&&eligible.length>0&&<>
     <label className="cp-field">{en?"Exchange":"Обмен"}<select value={selectedRequestId} onChange={e=>setSelectedRequestId(e.target.value)}>{eligible.map(r=><option key={r.id} value={r.id}>{r.sellCurrency} → {r.buyCurrency} · {fmtDate(r.created_at,lang)}</option>)}</select></label>
     <label className="cp-field">{en?"Your review":"Ваш отзыв"}<textarea value={text} onChange={e=>setText(e.target.value)} placeholder={en?"How was your exchange?":"Как прошёл обмен?"} rows={3}/></label>
     <label className="cp-check"><input type="checkbox" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/>{en?"Post anonymously":"Оставить анонимно"}</label>
     <button type="button" className="cp-primary" disabled={!canSend} onClick={sendReview}>{sending?(en?"Sending…":"Отправка…"):(en?"Send for moderation":"Отправить на модерацию")}</button>
    </>}
   </div>
   {error&&<p className="cp-formMessage" role="alert">{error}</p>}{notice&&<p className="cp-formMessage" role="status">{notice}</p>}
  </section>
  <div className="cp-sectionHeading"><h3>{en?"Published reviews":"Опубликованные отзывы"}</h3>{!loading&&!loadError&&<span>{reviews.length}</span>}</div>
  {loading&&<p role="status" className="cp-empty">{en?"Loading reviews…":"Загружаем отзывы…"}</p>}
  {loadError&&<div className="cp-empty" role="alert"><p>{loadError}</p><button type="button" className="cp-secondary" onClick={loadPublic}>{en?"Try again":"Повторить"}</button></div>}
  {!loading&&!loadError&&!reviews.length&&<div className="cp-empty"><ClientIcon name="chat"/><h3>{en?"The first review could be yours":"Первый отзыв может быть вашим"}</h3><p>{en?"Share your experience after a completed exchange.":"Поделитесь впечатлениями после завершённого обмена."}</p></div>}
  <div className="cp-reviewList">{reviews.map(r=><article key={r.id} className="cp-review"><header><span className="cp-avatar" aria-hidden="true">{String(r.displayName||"?").replace(/^@/,"").slice(0,1).toUpperCase()}</span><div><h3>{r.displayName||(en?"Client":"Клиент")}</h3><time dateTime={r.created_at}>{fmtDate(r.created_at,lang)}</time></div></header><p>{r.text}</p>{r.company_reply?.text&&<div className="cp-reviewReply"><strong>Cash a Lot</strong><p>{r.company_reply.text}</p></div>}</article>)}</div>
 </div>;
}
