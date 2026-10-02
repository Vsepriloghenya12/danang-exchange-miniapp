import React from "react";
import ClientIcon, { type ClientIconName } from "../components/ClientIcon";
import WhaleMark from "../components/WhaleMark";

function openLink(url: string) {
  const tg = (window as any).Telegram?.WebApp;
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

export default function PaymentsTab({ lang = "ru" }: { lang?: "ru" | "en" }) {
  const en = lang === "en";
  const services: { icon: ClientIconName; title: string; text: string }[] = en ? [
    { icon: "visa", title: "Vietnam e-visa", text: "Help with your application and payment" },
    { icon: "hotel", title: "Your place to stay", text: "Hotel booking and payment worldwide" },
    { icon: "plane", title: "Flights for your plans", text: "Help with booking your tickets" },
  ] : [
    { icon: "visa", title: "Виза во Вьетнам", text: "Поможем оформить и оплатить e-visa" },
    { icon: "hotel", title: "Отель для вашей поездки", text: "Бронирование и оплата по всему миру" },
    { icon: "plane", title: "Билеты под ваши планы", text: "Поможем с бронированием авиабилетов" },
  ];

  return (
    <div className="cp-page cp-payments">
      <section className="cp-journey" aria-labelledby="payments-title">
        <h2 id="payments-title">{en ? "Go explore." : "Путешествуйте."}<br />
          <span>{en ? "We help you pay." : "С оплатой поможем."}</span>
        </h2>
        <p>{en ? "Visas, hotels, flights. Your manager is a message away." : "Визы, отели, билеты. Ваш менеджер — на расстоянии сообщения."}</p>
        <div className="cp-travelTicket" aria-hidden="true">
          <div className="cp-ticketBrand"><WhaleMark /><span>Cash a Lot</span></div>
          <div className="cp-ticketRoute"><span>GO</span><ClientIcon name="plane" /><span>VN</span></div>
          <div className="cp-ticketStub"><span>{en ? "Next stop: your trip" : "Навстречу поездке"}</span><i /></div>
        </div>
        <svg className="cp-journeyRoute" viewBox="0 0 360 200" fill="none" aria-hidden="true"><path d="M-40 170C45 95 78 216 195 147S311 50 395 97" stroke="currentColor" strokeDasharray="3 6" /><circle cx="303" cy="94" r="5" /></svg>
      </section>

      <section className="cp-tripServices" aria-label={en ? "How we can help" : "С чем поможем"}>
        {services.map(service => (
          <div className="cp-tripService" key={service.icon}>
            <span className="cp-tripIcon"><ClientIcon name={service.icon} /></span>
            <div><h3>{service.title}</h3><p>{service.text}</p></div>
          </div>
        ))}
      </section>

      <div className="cp-tripAction">
        <button type="button" className="cp-primary cp-tripButton" onClick={() => openLink("https://t.me/love_2604")}>
          <ClientIcon name="chat" /><span>{en ? "Send a request" : "Оставить заявку"}</span>
        </button>
        <p>{en ? "Tell us your plans. We’ll discuss the details in Telegram." : "Расскажите о планах. Обсудим детали в Telegram."}</p>
      </div>
    </div>
  );
}
