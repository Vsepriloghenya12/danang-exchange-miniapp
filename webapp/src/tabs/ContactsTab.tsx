import React from "react";
import ClientIcon from "../components/ClientIcon";
function openLink(url:string){const tg=(window as any).Telegram?.WebApp;if(tg?.openTelegramLink)tg.openTelegramLink(url);else if(tg?.openLink)tg.openLink(url);else window.open(url,"_blank","noopener,noreferrer");}
export default function ContactsTab({lang="ru"}:{lang?:"ru"|"en"}){
 const en=lang==="en";
 return <div className="cp-page">
  <div className="cp-ocean cp-contactIntro"><ClientIcon name="chat"/><h2>{en?"Let’s talk":"Напишите нам"}</h2><p>{en?"For exchange and app support questions, message us directly in Telegram.":"По вопросам обмена и работы приложения пишите нам напрямую в Telegram."}</p></div>
  <div className="cp-menuGroup">{[{role:en?"Admin":"Админ",handle:"@exchange_vn"},{role:en?"Manager":"Менеджер",handle:"@manager_exchange_vn"}].map(c=><button key={c.handle} type="button" className="cp-menuRow cp-contactRow" onClick={()=>openLink("https://t.me/"+c.handle.slice(1))}><span className="cp-icon"><ClientIcon name="chat"/></span><span className="cp-rowText"><strong>{c.role}</strong><small>{c.handle}</small></span><ClientIcon name="chevron" className="cp-chevron"/></button>)}</div>
 </div>;
}
