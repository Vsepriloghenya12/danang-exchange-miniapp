import React from "react";

type Lang = "ru" | "en";
export type DocKind = "privacy" | "terms";

type DocSection = { h: string; p: string[] };

const UPDATED = { ru: "Обновлено: 17 июля 2026", en: "Last updated: July 17, 2026" };

const PRIVACY_RU: DocSection[] = [
  {
    h: "1. Какие данные мы обрабатываем",
    p: [
      "Данные профиля Telegram, которые Telegram передаёт мини-приложению: числовой ID, имя, юзернейм и язык интерфейса.",
      "Данные заявок на обмен: валюты, суммы, способы оплаты и получения, комментарий и приложенное фото (если вы его прикрепили).",
      "Контакт для связи (номер телефона), если вы сами сохранили его в приложении.",
      "Технические события работы приложения (открытие экранов, нажатия), связанные с вашим Telegram-профилем — для статистики и улучшения сервиса.",
    ],
  },
  {
    h: "2. Зачем мы их используем",
    p: [
      "Чтобы принять и обработать вашу заявку на обмен и связаться с вами через менеджера в Telegram.",
      "Чтобы применять условия программы лояльности (статусы Стандарт / Серебро / Золото).",
      "Чтобы приложение работало корректно и становилось удобнее.",
    ],
  },
  {
    h: "3. Где хранятся данные и кто имеет доступ",
    p: [
      "Данные хранятся на сервере приложения. Доступ к ним есть только у владельца сервиса и менеджеров, обрабатывающих заявки.",
      "Мы не продаём и не передаём ваши данные третьим лицам. Исключение — случаи, когда передача обязательна по закону.",
    ],
  },
  {
    h: "4. Сроки хранения",
    p: [
      "Данные хранятся, пока вы пользуетесь сервисом. По вашему запросу мы удалим ваши данные — напишите менеджеру (раздел «Ещё» → «Контакты»).",
    ],
  },
  {
    h: "5. Ваши права",
    p: [
      "Вы можете запросить копию своих данных, их исправление или удаление. Для этого свяжитесь с менеджером через раздел «Контакты».",
    ],
  },
  {
    h: "6. Данные на вашем устройстве",
    p: [
      "Выбранные тема оформления и язык сохраняются локально на вашем устройстве (localStorage) и никуда не передаются.",
    ],
  },
  {
    h: "7. Согласие",
    p: [
      "Отправляя заявку в приложении, вы даёте согласие на обработку перечисленных данных для целей, указанных в этой политике.",
    ],
  },
  {
    h: "8. Изменения политики",
    p: [
      "Мы можем обновлять эту политику. Актуальная версия всегда доступна в приложении; дата последнего обновления указана вверху.",
    ],
  },
];

const PRIVACY_EN: DocSection[] = [
  {
    h: "1. What data we process",
    p: [
      "Telegram profile data passed to the mini app by Telegram: numeric ID, name, username and interface language.",
      "Exchange request data: currencies, amounts, payment and receive methods, your comment and an attached photo (if you attach one).",
      "A contact phone number, if you save it in the app yourself.",
      "Technical usage events (screen opens, taps) linked to your Telegram profile — for statistics and service improvement.",
    ],
  },
  {
    h: "2. Why we use it",
    p: [
      "To accept and process your exchange request and contact you via a manager on Telegram.",
      "To apply loyalty program terms (Standard / Silver / Gold statuses).",
      "To keep the app working correctly and make it better.",
    ],
  },
  {
    h: "3. Where data is stored and who can access it",
    p: [
      "Data is stored on the app server. Only the service owner and managers processing requests can access it.",
      "We do not sell or share your data with third parties, except where disclosure is required by law.",
    ],
  },
  {
    h: "4. Retention",
    p: [
      "Data is kept while you use the service. We will delete your data on request — message the manager (More → Contacts).",
    ],
  },
  {
    h: "5. Your rights",
    p: [
      "You may request a copy of your data, its correction or deletion. Contact the manager via the Contacts screen.",
    ],
  },
  {
    h: "6. Data on your device",
    p: [
      "Your chosen theme and language are stored locally on your device (localStorage) and are not transmitted anywhere.",
    ],
  },
  {
    h: "7. Consent",
    p: [
      "By sending a request in the app you consent to the processing of the data listed above for the purposes described in this policy.",
    ],
  },
  {
    h: "8. Changes to this policy",
    p: [
      "We may update this policy. The current version is always available in the app; the last-updated date is shown above.",
    ],
  },
];

const TERMS_RU: DocSection[] = [
  {
    h: "1. О сервисе",
    p: [
      "«Cash a Lot» — сервис обмена валют в Дананге (Вьетнам). Мини-приложение помогает рассчитать сумму обмена по текущему курсу и оставить заявку менеджеру.",
    ],
  },
  {
    h: "2. Курсы и заявки",
    p: [
      "Курсы в приложении носят информационный характер и могут меняться в течение дня. Окончательный курс и условия обмена подтверждает менеджер при обработке заявки.",
      "Отправка заявки не является публичной офертой и не обязывает стороны совершить обмен: и вы, и сервис можете отказаться от сделки до её подтверждения.",
      "Менеджер связывается с вами в рабочее время сервиса: ежедневно с 10:00 до 22:00 (после 20:00 доступен только дистанционный обмен).",
    ],
  },
  {
    h: "3. Ограничения",
    p: [
      "Минимальные суммы обмена, требования к купюрам и правила по способам оплаты и получения указаны в «Условиях обмена» (кнопка «i» на главном экране).",
      "Сервис вправе отказать в обмене без объяснения причин, в том числе при подозрении на мошеннические операции.",
    ],
  },
  {
    h: "4. Допустимое использование",
    p: [
      "Запрещается использовать сервис для незаконных операций, легализации (отмывания) доходов и обхода требований законодательства.",
      "Пользуясь сервисом, вы подтверждаете, что вам исполнилось 18 лет и вы действуете от собственного имени.",
    ],
  },
  {
    h: "5. Программа лояльности",
    p: [
      "Статусы (Стандарт / Серебро / Золото) и связанные с ними условия присваиваются по решению сервиса и могут быть изменены или отменены в любой момент.",
    ],
  },
  {
    h: "6. Ответственность",
    p: [
      "Приложение предоставляется «как есть». Сервис не несёт ответственности за сбои Telegram, недоступность сети и иные обстоятельства вне его контроля.",
    ],
  },
  {
    h: "7. Изменения условий",
    p: [
      "Сервис может обновлять настоящие условия. Продолжая пользоваться приложением после обновления, вы соглашаетесь с новой редакцией.",
    ],
  },
  {
    h: "8. Контакты",
    p: [
      "По всем вопросам свяжитесь с менеджером: раздел «Ещё» → «Контакты».",
    ],
  },
];

const TERMS_EN: DocSection[] = [
  {
    h: "1. About the service",
    p: [
      "“Cash a Lot” is a currency exchange service in Da Nang (Vietnam). The mini app helps you calculate an exchange amount at the current rate and send a request to a manager.",
    ],
  },
  {
    h: "2. Rates and requests",
    p: [
      "Rates shown in the app are for information only and may change during the day. The final rate and terms are confirmed by the manager while processing your request.",
      "Sending a request is not a public offer and does not oblige either party to complete the exchange: both you and the service may cancel before confirmation.",
      "The manager contacts you during service hours: daily from 10:00 to 22:00 (after 20:00 only remote exchange is available).",
    ],
  },
  {
    h: "3. Limitations",
    p: [
      "Minimum amounts, banknote requirements and payment/receive rules are listed in “Exchange conditions” (the “i” button on the home screen).",
      "The service may decline an exchange without explanation, including on suspicion of fraudulent activity.",
    ],
  },
  {
    h: "4. Acceptable use",
    p: [
      "Using the service for illegal transactions, money laundering or circumventing legal requirements is prohibited.",
      "By using the service you confirm that you are at least 18 years old and acting on your own behalf.",
    ],
  },
  {
    h: "5. Loyalty program",
    p: [
      "Statuses (Standard / Silver / Gold) and their benefits are granted at the service's discretion and may be changed or withdrawn at any time.",
    ],
  },
  {
    h: "6. Liability",
    p: [
      "The app is provided “as is”. The service is not liable for Telegram outages, network unavailability or other circumstances beyond its control.",
    ],
  },
  {
    h: "7. Changes to these terms",
    p: [
      "The service may update these terms. By continuing to use the app after an update you accept the new version.",
    ],
  },
  {
    h: "8. Contacts",
    p: [
      "For any questions contact the manager: More → Contacts.",
    ],
  },
];

export default function DocsTab({ kind, lang = "ru" }: { kind: DocKind; lang?: Lang }) {
  const isEn = lang === "en";
  const sections = kind === "privacy" ? (isEn ? PRIVACY_EN : PRIVACY_RU) : (isEn ? TERMS_EN : TERMS_RU);

  return (
    <div className="cx-doc">
      <div className="cx-docUpdated">{isEn ? UPDATED.en : UPDATED.ru}</div>
      {sections.map((s) => (
        <div key={s.h} className="cx-card cx-docCard">
          <div className="cx-docH">{s.h}</div>
          {s.p.map((text) => (
            <p key={text} className="cx-docP">{text}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
