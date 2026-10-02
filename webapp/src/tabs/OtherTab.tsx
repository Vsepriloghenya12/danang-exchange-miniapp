import React from "react";
import ClientIcon, {type ClientIconName} from "../components/ClientIcon";
type Lang="ru"|"en";
function Row({icon,title,subtitle,onClick}:{icon:ClientIconName;title:string;subtitle?:string;onClick:()=>void}){
 return <button type="button" className="cp-menuRow" onClick={onClick}><span className="cp-icon"><ClientIcon name={icon}/></span><span className="cp-rowText"><strong>{title}</strong>{subtitle&&<small>{subtitle}</small>}</span><ClientIcon name="chevron" className="cp-chevron"/></button>;
}
export default function OtherTab({onFaq,onAbout,onContacts,onOrderApp,onPrivacy,onTerms,lang="ru"}:{onFaq:()=>void;onAbout:()=>void;onContacts:()=>void;onOrderApp:()=>void;onPrivacy:()=>void;onTerms:()=>void;lang?:Lang}){
 const en=lang==="en";
 return <div className="cp-page">
  <button className="cp-support" type="button" onClick={onContacts}><span className="cp-icon"><ClientIcon name="chat"/></span><span className="cp-rowText"><strong>{en?"We’re here to help":"Мы на связи"}</strong><small>{en?"Exchange and app support":"Поможем с обменом и приложением"}</small></span><ClientIcon name="chevron" className="cp-chevron"/></button>
  <section className="cp-menuGroup" aria-label={en?"About the service":"О сервисе"}>
   <Row icon="help" title="FAQ" subtitle={en?"Answers to your questions":"Ответы на частые вопросы"} onClick={onFaq}/>
   <Row icon="info" title={en?"About app":"О приложении"} subtitle="Cash a Lot · Da Nang" onClick={onAbout}/>
   <Row icon="chat" title={en?"Contacts":"Контакты"} subtitle={en?"Admin and manager":"Админ и менеджер"} onClick={onContacts}/>
  </section>
  <section className="cp-menuGroup" aria-label={en?"Documents":"Документы"}>
   <Row icon="shield" title={en?"Privacy policy":"Политика конфиденциальности"} subtitle={en?"Personal data processing":"Обработка персональных данных"} onClick={onPrivacy}/>
   <Row icon="document" title={en?"Terms of service":"Пользовательское соглашение"} subtitle={en?"Rules of the service":"Правила работы сервиса"} onClick={onTerms}/>
  </section>
  <div className="cp-menuGroup cp-developer"><Row icon="code" title={en?"Order an app":"Заказать приложение"} subtitle={en?"Contact the developer":"Связаться с разработчиком"} onClick={onOrderApp}/></div>
 </div>;
}
