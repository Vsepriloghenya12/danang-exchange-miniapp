import React from "react";
import WhaleMark from "../components/WhaleMark";
import ClientIcon from "../components/ClientIcon";
export default function AboutTab({lang="ru"}:{lang?:"ru"|"en"}){
 const en=lang==="en";
 function contact(){const url="https://t.me/exchange_vn_dn",tg=(window as any).Telegram?.WebApp;if(tg?.openTelegramLink)tg.openTelegramLink(url);else if(tg?.openLink)tg.openLink(url);else window.open(url,"_blank","noopener,noreferrer");}
 return <div className="cp-page"><div className="cp-ocean cp-aboutBrand"><WhaleMark light/><h2>Cash a Lot<span>.</span></h2><p>{en?"Your companion in Da Nang":"Ваш помощник в Дананге"}</p></div><div className="cp-prose"><p>{en?"A helper app for tourists and locals in Da Nang. Here you can exchange currency, book and pay for hotels and tickets, and get help with e-visa services.":"Приложение-помощник для туристов и локалов Дананга. Здесь можно обменять валюту, забронировать и оплатить отели, билеты, оформить e-visa."}</p></div><button className="cp-primary" type="button" onClick={contact}><ClientIcon name="chat"/>{en?"Write to us":"Написать нам"}</button></div>;
}
