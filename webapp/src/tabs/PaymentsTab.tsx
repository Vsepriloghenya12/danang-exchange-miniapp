import React from "react";
import ClientIcon,{type ClientIconName} from "../components/ClientIcon";
import WhaleMark from "../components/WhaleMark";
function openLink(url:string){const tg=(window as any).Telegram?.WebApp;if(tg?.openTelegramLink)tg.openTelegramLink(url);else if(tg?.openLink)tg.openLink(url);else window.open(url,"_blank","noopener,noreferrer");}
export default function PaymentsTab({lang="ru"}:{lang?:"ru"|"en"}){
 const en=lang==="en";
 const services:{icon:ClientIconName;title:string;text:string}[]=en?[
  {icon:"visa",title:"Vietnam e-visa",text:"Help with your application and payment"},
  {icon:"hotel",title:"Hotels",text:"Booking and payment worldwide"},
  {icon:"plane",title:"Flights",text:"Help with booking your tickets"}
 ]:[
  {icon:"visa",title:"Виза во Вьетнам",text:"Помощь с оформлением и оплатой e-visa"},
  {icon:"hotel",title:"Отели",text:"Бронирование и оплата по всему миру"},
  {icon:"plane",title:"Авиабилеты",text:"Помощь с бронированием билетов"}
 ];
 return <div className="cp-page cp-payments">
  <div className="cp-ocean cp-travelIntro"><WhaleMark light/><h2>{en?"Your trip, made easier":"Всё для вашей поездки"}</h2><p>{en?"Visas, hotels and flights — with help from your manager.":"Визы, отели и билеты — с помощью вашего менеджера."}</p></div>
  <div className="cp-serviceList">{services.map(s=><div className="cp-service" key={s.icon}><span className="cp-icon"><ClientIcon name={s.icon}/></span><div><h3>{s.title}</h3><p>{s.text}</p></div></div>)}</div>
  <button type="button" className="cp-primary" onClick={()=>openLink("https://t.me/love_2604")}><ClientIcon name="chat"/>{en?"Send a request":"Оставить заявку"}</button>
  <p className="cp-footnote">{en?"Tell your manager what you need in Telegram.":"Расскажите менеджеру в Telegram, какая помощь нужна."}</p>
 </div>;
}
