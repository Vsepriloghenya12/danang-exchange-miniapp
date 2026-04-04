import React, { useEffect, useMemo, useRef, useState } from "react";
import AdminTab from "../tabs/AdminTab";
import { createGFormulaDraft, DEFAULT_G_FORMULAS, G_FORMULA_KEYS } from "../domain/exchange";
import { getUserStatusLabelRu, USER_STATUS_OPTIONS_RU } from "../domain/status";
import {
  apiAdminGetAdmins,
  apiAdminSetAdmins,
  apiAdminGetBlacklist,
  apiAdminSetBlacklist,
  apiAdminGetPublishTemplate,
  apiAdminSetPublishTemplate,
  apiAdminPublish,
  apiAdminUsers,
  apiAdminGetRequests,
  apiAdminSetRequestState,
  apiAdminGetContacts,
  apiAdminUpsertContact,
  apiAdminGetReports,
  apiAdminGetAfisha,
  apiAdminCreateAfisha,
  apiAdminUpdateAfisha,
  apiAdminEventsSummary,
  apiGetBankIcons,
  bankIconUrl,
  apiAdminGetRatesRange,
  apiAdminSetRatesForDate,
  apiGetTodayRates,
  apiAdminGetGFormulas,
  apiAdminSetGFormulas,
  apiAdminGetFaq,
  apiAdminSetFaq,
} from "../lib/api";
import type { Contact, UserStatus } from "../lib/types";

const LS_KEY = "dx_admin_key";
const LS_CASH_DEFAULT_RATES = "dx_cash_default_rates_v1";
const LS_CASH_OVERRIDES = "dx_cash_overrides_v1";

function normU(u: string) {
  return String(u || "").trim().replace(/^@+/, "");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function shiftISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}



const DEFAULT_TEMPLATE = `Доброе утро!\n\nКурс на {{date}}:\n\n{{rates}}\n\n🛵    Бесплатная доставка\n             С 10:00 до 16:00.\n        при обмене от 20 000₽\n\n⏩БОЛЕЕ ВЫГОДНЫЙ КУРС  ⏪\n  при дистанционном обмене                        ⠀              от 20 000₽\n💳  Перевод на вьетнамский счёт;\n📥  Получение в банкоматах BIDV Vietcombank;`;

type DeferredInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

function fmtAfTime(value?: string) {
  const s = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : "";
}

function fmtAfDateTime(ev: any) {
  const date = String(ev?.date || "");
  const time = fmtAfTime(ev?.time);
  return time ? `${date} • ${time}` : date;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("file_read_failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function loadImageFromObjectUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = url;
  });
}

async function buildAfishaPreviewDataUrl(file: File, maxSide = 960, quality = 0.76): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageFromObjectUrl(objectUrl);
    const width = Number(img.naturalWidth || img.width || 0);
    const height = Number(img.naturalHeight || img.height || 0);
    if (!width || !height) return null;

    const scale = Math.min(1, maxSide / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function prepareAfishaUpload(file: File): Promise<{ imageDataUrl: string; previewImageDataUrl: string | null }> {
  const [imageDataUrl, previewImageDataUrl] = await Promise.all([
    readFileAsDataUrl(file),
    buildAfishaPreviewDataUrl(file),
  ]);

  return { imageDataUrl, previewImageDataUrl };
}

export default function OwnerPortal() {
  // Owner portal is opened in a regular browser; keep background consistent with the miniapp.
  useEffect(() => {
    try {
      document.body.classList.add("vx-body-client");
      return () => document.body.classList.remove("vx-body-client");
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const syncInstalled = () => {
      if (!mounted) return;
      try {
        setInstallDone(Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any)?.standalone === true));
      } catch {}
    };

    const onBeforeInstall = (event: Event) => {
      event.preventDefault?.();
      if (!mounted) return;
      setInstallPrompt(event as DeferredInstallPromptEvent);
      setInstallSupported(true);
    };

    const onInstalled = () => {
      if (!mounted) return;
      setInstallDone(true);
      setInstallPrompt(null);
      setInstallSupported(true);
    };

    syncInstalled();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/owner-sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
    window.addEventListener('appinstalled', onInstalled);
    window.matchMedia?.('(display-mode: standalone)')?.addEventListener?.('change', syncInstalled);

    return () => {
      mounted = false;
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
      window.matchMedia?.('(display-mode: standalone)')?.removeEventListener?.('change', syncInstalled);
    };
  }, []);

  async function installOwnerApp() {
    if (installDone) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice?.outcome === 'accepted') {
          setInstallDone(true);
          showOk('Страница владельца установлена');
        }
      } catch {}
      setInstallPrompt(null);
      return;
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    if (isIos) {
      showOk('На iPhone/iPad: Поделиться → На экран Домой');
      return;
    }

    showOk('Открой меню браузера и выбери «Установить приложение»');
  }

  const [key, setKey] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) || "";
    } catch {
      return "";
    }
  });

  // keep a draft input so we don't treat partial/incorrect values as a "logged in" session
  const [draftKey, setDraftKey] = useState<string>(key);

  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const [installSupported, setInstallSupported] = useState(false);
  const [installDone, setInstallDone] = useState<boolean>(() => {
    try {
      return window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any)?.standalone === true;
    } catch {
      return false;
    }
  });

  const token = useMemo(() => (key ? `adminkey:${key}` : ""), [key]);
  const me = useMemo(() => ({ initData: token }), [token]);

  type Tab = "rates" | "bonuses" | "reviews" | "clients" | "requests" | "afisha" | "faq" | "cashbox" | "reports" | "analytics";
  const [tab, setTab] = useState<Tab>("rates");

  const [banner, setBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function humanizeErr(text: string) {
    const t = String(text || "").trim();
    if (t === "bad_admin_key") return "Неверный ключ";
    if (t === "admin_key_not_configured") return "На сервере не задан ADMIN_WEB_KEY";
    if (t === "group_not_set") return "Не задана группа (в группе сделай /setgroup)";
    if (t === "rates_missing") return "Сначала задай курс на сегодня";
    if (t === "not_owner") return "Только владелец";
    if (t === "tg_send_failed") return "Telegram: не удалось отправить";
    if (t === "bad_image") return "Неверная картинка";
    if (t === "No initData") return "Нет авторизации";
    return t || "Ошибка";
  }

  function showErr(text: string) {
    setBanner({ type: "err", text: humanizeErr(text) });
  }

  function showOk(text: string) {
    setBanner({ type: "ok", text });
    window.setTimeout(() => setBanner(null), 1800);
  }

  const [adminsText, setAdminsText] = useState<string>("");
  const [blacklistText, setBlacklistText] = useState<string>("");
  const [tpl, setTpl] = useState<string>(DEFAULT_TEMPLATE);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [bankIcons, setBankIcons] = useState<string[]>([]);

// FAQ editor (owner)
  const [faqItems, setFaqItems] = useState<Array<{ id: string; q_ru: string; a_ru: string; q_en: string; a_en: string }>>([]);
const [faqLoading, setFaqLoading] = useState<boolean>(false);
const [faqSaving, setFaqSaving] = useState<boolean>(false);
const [faqLoaded, setFaqLoaded] = useState<boolean>(false);


  // G-formulas editor (owner)
  const [gFormulasDraft, setGFormulasDraft] = useState<Record<string, { buyMul: string; sellMul: string }>>(() => createGFormulaDraft());
  const [gFormulasLoaded, setGFormulasLoaded] = useState(false);
  const [gFormulasSaving, setGFormulasSaving] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState<boolean>(false);
  const [clientSearch, setClientSearch] = useState<string>("");
  const [cUsername, setCUsername] = useState<string>("");
  const [cTgId, setCTgId] = useState<string>("");
  const [cFullName, setCFullName] = useState<string>("");
  const [cStatus, setCStatus] = useState<UserStatus>("standard");
  const [cBanks, setCBanks] = useState<string[]>([]);

  const [repFrom, setRepFrom] = useState<string>(() => shiftISO(-7));
  const [repTo, setRepTo] = useState<string>(() => todayISO());
  const [repOnlyDone, setRepOnlyDone] = useState<boolean>(true);
  const [repTgId, setRepTgId] = useState<string>("");
  const [report, setReport] = useState<any>(null);

  // Cashbox / Profit calculator ("КАССА")
  const [cashFrom, setCashFrom] = useState<string>(() => shiftISO(-7));
  const [cashTo, setCashTo] = useState<string>(() => todayISO());
  const [cashOnlyDone, setCashOnlyDone] = useState<boolean>(true);
  const [cashUseHistoryRates, setCashUseHistoryRates] = useState<boolean>(true);
  const [cashLoading, setCashLoading] = useState<boolean>(false);
  const [cashReport, setCashReport] = useState<any>(null);
  const [cashRatesByDate, setCashRatesByDate] = useState<Record<string, any>>({});
  // Draft (editable) rates per day (strings). Saved to server via /admin/rates/date.
  const [cashDayDraft, setCashDayDraft] = useState<Record<string, any>>({});
  const [cashDaySaving, setCashDaySaving] = useState<Record<string, boolean>>({});
  const [cashDefaultRates, setCashDefaultRates] = useState<Record<string, { buy: string; sell: string }>>(() => {
    try {
      const raw = localStorage.getItem(LS_CASH_DEFAULT_RATES);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === "object") return j;
    } catch {
      // ignore
    }
    return {
      RUB: { buy: "", sell: "" },
      USD: { buy: "", sell: "" },
      USDT: { buy: "", sell: "" },
      EUR: { buy: "", sell: "" },
      THB: { buy: "", sell: "" },
    };
  });

  const [cashOverrides, setCashOverrides] = useState<Record<string, { in?: string; out?: string }>>(() => {
    try {
      const raw = localStorage.getItem(LS_CASH_OVERRIDES);
      const j = raw ? JSON.parse(raw) : null;
      if (j && typeof j === "object") return j;
    } catch {
      // ignore
    }
    return {};
  });

  // persist cashbox settings locally (owner can tune rates per deal)
  useEffect(() => {
    try {
      localStorage.setItem(LS_CASH_DEFAULT_RATES, JSON.stringify(cashDefaultRates || {}));
    } catch {
      // ignore
    }
  }, [cashDefaultRates]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_CASH_OVERRIDES, JSON.stringify(cashOverrides || {}));
    } catch {
      // ignore
    }
  }, [cashOverrides]);

  // Analytics (events)
  const [anFrom, setAnFrom] = useState<string>(() => shiftISO(-7));
  const [anTo, setAnTo] = useState<string>(() => todayISO());
  const [anLoading, setAnLoading] = useState<boolean>(false);
  const [anData, setAnData] = useState<any>(null);

  // Requests (owner portal): list -> details, like in the staff tab.
  type ReqView = "active" | "rejected" | "history" | "detail";
  const [reqView, setReqView] = useState<ReqView>("active");
  const [reqSelectedId, setReqSelectedId] = useState<string>("");
  const [reqHistFrom, setReqHistFrom] = useState<string>(() => shiftISO(-7));
  const [reqHistTo, setReqHistTo] = useState<string>(() => todayISO());
  const [reqFullName, setReqFullName] = useState<string>("");
  const [reqBanks, setReqBanks] = useState<string[]>([]);

  // Afisha (owner portal): active + history with date range + click counters
  const [afActive, setAfActive] = useState<any[]>([]);
  const [afHistory, setAfHistory] = useState<any[]>([]);
  const [afLoading, setAfLoading] = useState<boolean>(false);
  const [afCreateCats, setAfCreateCats] = useState<string[]>(["sport"]);
  const [afCreateDate, setAfCreateDate] = useState<string>(() => todayISO());
  const [afCreateTime, setAfCreateTime] = useState<string>("");
  const [afCreateTitle, setAfCreateTitle] = useState<string>("");
  const [afCreateComment, setAfCreateComment] = useState<string>("");
  const [afCreateDetailsUrl, setAfCreateDetailsUrl] = useState<string>("");
  const [afCreateLocationUrl, setAfCreateLocationUrl] = useState<string>("");
  const [afCreateImageDataUrl, setAfCreateImageDataUrl] = useState<string | null>(null);
  const [afCreatePreviewImageDataUrl, setAfCreatePreviewImageDataUrl] = useState<string | null>(null);

  const [afEditId, setAfEditId] = useState<string>("");
  const [afEditCats, setAfEditCats] = useState<string[]>(["sport"]);
  const [afEditDate, setAfEditDate] = useState<string>("");
  const [afEditTime, setAfEditTime] = useState<string>("");
  const [afEditTitle, setAfEditTitle] = useState<string>("");
  const [afEditComment, setAfEditComment] = useState<string>("");
  const [afEditDetailsUrl, setAfEditDetailsUrl] = useState<string>("");
  const [afEditLocationUrl, setAfEditLocationUrl] = useState<string>("");
  const [afEditImageUrl, setAfEditImageUrl] = useState<string>("");
  const [afEditImageDataUrl, setAfEditImageDataUrl] = useState<string | null>(null);
  const [afEditPreviewImageDataUrl, setAfEditPreviewImageDataUrl] = useState<string | null>(null);

  const [afHistFrom, setAfHistFrom] = useState<string>(() => shiftISO(-14));
  const [afHistTo, setAfHistTo] = useState<string>(() => todayISO());


  const saveTplTimer = useRef<number | null>(null);

  async function loadAll() {
    if (!token) return;
    setBanner(null);
    const [a, bl, t, c] = await Promise.allSettled([
      apiAdminGetAdmins(token),
      apiAdminGetBlacklist(token),
      apiAdminGetPublishTemplate(token),
      apiAdminGetContacts(token)
    ]);

    if (a.status === "fulfilled" && a.value?.ok) {
      setAdminsText((a.value.adminTgIds || []).join(","));
    } else if (a.status === "fulfilled" && !a.value?.ok) {
      showErr(a.value?.error || "Ошибка");
    } else if (a.status === "rejected") {
      showErr("Ошибка");
    }

    if (bl.status === "fulfilled" && bl.value?.ok) {
      setBlacklistText((bl.value.usernames || []).join("\n"));
    } else if (bl.status === "fulfilled" && !bl.value?.ok) {
      showErr(bl.value?.error || "Ошибка");
    }
    if (t.status === "fulfilled" && t.value?.ok) {
      const s = String(t.value.template || "").trim();
      setTpl(s || DEFAULT_TEMPLATE);
    } else if (t.status === "fulfilled" && !t.value?.ok) {
      showErr(t.value?.error || "Ошибка");
    }
    if (c.status === "fulfilled" && c.value?.ok) {
      setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
    } else if (c.status === "fulfilled" && !c.value?.ok) {
      showErr(c.value?.error || "Ошибка");
    }
  }


async function loadFaq() {
  if (!token || faqLoading) return;
  setFaqLoading(true);
  try {
    const r: any = await apiAdminGetFaq(token);
    if (r?.ok) {
      const arr = Array.isArray(r.items) ? r.items : [];
      setFaqItems(
        arr.map((x: any) => ({
          id: String(x.id || `faq_${Date.now()}_${Math.random().toString(16).slice(2)}`),
          q_ru: String(x.q_ru ?? x.q ?? "").trim(),
          a_ru: String(x.a_ru ?? x.a ?? "").trim(),
          q_en: String(x.q_en || "").trim(),
          a_en: String(x.a_en || "").trim()
        }))
      );
      setFaqLoaded(true);
    } else {
      showErr(r?.error || "Ошибка");
    }
  } catch (e: any) {
    showErr(e?.message || "Ошибка");
  } finally {
    setFaqLoading(false);
  }
}

async function saveFaq() {
  if (!token || faqSaving) return;
  setFaqSaving(true);
  try {
    const items = (faqItems || [])
      .map((x) => ({
        ...x,
        q_ru: String(x.q_ru || "").trim(),
        a_ru: String(x.a_ru || "").trim(),
        q_en: String(x.q_en || "").trim(),
        a_en: String(x.a_en || "").trim(),
      }))
      .filter((x) => x.q_ru && x.a_ru);
    const r: any = await apiAdminSetFaq(token, items);
    if (r?.ok) {
      showOk("Сохранено");
      const arr = Array.isArray(r.items) ? r.items : items;
      setFaqItems(
        arr.map((x: any) => ({
          id: String(x.id),
          q_ru: String(x.q_ru ?? x.q ?? ""),
          a_ru: String(x.a_ru ?? x.a ?? ""),
          q_en: String(x.q_en || ""),
          a_en: String(x.a_en || ""),
        }))
      );
    } else {
      showErr(r?.error || "Ошибка");
    }
  } catch (e: any) {
    showErr(e?.message || "Ошибка");
  } finally {
    setFaqSaving(false);
  }
}

function addFaqItem() {
  const id = `faq_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  setFaqItems((prev) => [...(prev || []), { id, q_ru: "", a_ru: "", q_en: "", a_en: "" }]);
}

function moveFaq(id: string, dir: -1 | 1) {
  setFaqItems((prev) => {
    const a = [...(prev || [])];
    const i = a.findIndex((x) => x.id === id);
    if (i < 0) return a;
    const j = i + dir;
    if (j < 0 || j >= a.length) return a;
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
    return a;
  });
}

  async function loadClients() {
    if (!token || clientsLoading) return;
    setClientsLoading(true);
    try {
      const [u, r, bi, c] = await Promise.allSettled([
        apiAdminUsers(token),
        apiAdminGetRequests(token),
        apiGetBankIcons(),
        apiAdminGetContacts(token),
      ]);

      if (u.status === "fulfilled" && u.value?.ok) {
        setUsers(Array.isArray(u.value.users) ? u.value.users : []);
      }
      if (r.status === "fulfilled" && r.value?.ok) {
        setRequests(Array.isArray(r.value.requests) ? r.value.requests : []);
      }
      if (bi.status === "fulfilled" && bi.value?.ok) {
        setBankIcons(Array.from(new Set(Array.isArray(bi.value.icons) ? bi.value.icons : [])));
      }
      if (c.status === "fulfilled" && c.value?.ok) {
        setContacts(Array.isArray(c.value.contacts) ? c.value.contacts : []);
      }
    } finally {
      setClientsLoading(false);
    }
  }

  const AF_CATS: Array<{ k: string; l: string }> = [
    { k: 'sport', l: 'Спорт' },
    { k: 'party', l: 'Вечеринки' },
    { k: 'culture', l: 'Культура и искусство' },
    { k: 'games', l: 'Игры' },
    { k: 'market', l: 'Ярмарки' },
    { k: 'food', l: 'Еда' },
    { k: 'music', l: 'Музыка' },
    { k: 'learning', l: 'Обучение' },
    { k: 'misc', l: 'Разное' },
  ];

  function afCatLabel(k: string) {
    const f = AF_CATS.find((x) => x.k === k);
    return f ? f.l : k;
  }

  function afCatsLabel(ev: any) {
    const raw = Array.isArray(ev?.categories) ? ev.categories : ev?.category ? [ev.category] : [];
    const cats = Array.from(new Set<string>(raw.map((x: any) => String(x || "")).filter(Boolean))).slice(0, 3);
    return cats.length ? cats.map((c) => afCatLabel(c)).join(", ") : "—";
  }


  async function loadAfishaLists() {
    if (!token || afLoading) return;
    setAfLoading(true);
    try {
      const a = await apiAdminGetAfisha(token, { scope: 'active' });
      if (a?.ok) setAfActive(Array.isArray((a as any).events) ? (a as any).events : []);
      const h = await apiAdminGetAfisha(token, { scope: 'history', from: afHistFrom, to: afHistTo });
      if (h?.ok) setAfHistory(Array.isArray((h as any).events) ? (h as any).events : []);
    } finally {
      setAfLoading(false);
    }
  }


  async function loadAnalytics() {
    if (!token || anLoading) return;
    setAnLoading(true);
    try {
      const r = await apiAdminEventsSummary(token, { from: anFrom, to: anTo });
      if (!r?.ok) {
        showErr(r?.error || "Ошибка");
        setAnData(null);
      } else {
        setAnData(r);
      }
    } finally {
      setAnLoading(false);
    }
  }

  const screenRu: Record<string, string> = {
    home: 'Главная',
		calc: 'Оставить заявку',
    afisha: 'Афиша',
    atm: 'Банкоматы',
    reviews: 'Отзывы',
    staff: 'Админ',
		pay: 'Оплаты и бронирование',
    history: 'Моя история',
    about: 'О приложении',
    support: 'Поддержка',
  };

  function screenLabel(s: any) {
    const k = String(s || '').trim();
    return screenRu[k] || k || '—';
  }

  const eventRu: Record<string, string> = {
    app_open: 'Запуск приложения',
    screen_open: 'Открытие вкладки',
    click: 'Клик',
    auth: 'Авторизация',
  };

  function eventLabel(s: any) {
    const k = String(s || '').trim();
    return eventRu[k] || k || '—';
  }

  // Click target labels (client UI buttons)
  const clickRu: Record<string, string> = {
    // Home
		home_calc_btn: 'Главная → Оставить заявку',
    // Main nav cards
    nav_afisha: 'Главная → Афиша',
    nav_atm: 'Главная → Банкоматы',
    nav_reviews: 'Главная → Отзывы',
    // Bottom menu
		bottom_pay: 'Нижнее меню → Оплаты и бронирование',
    bottom_history: 'Нижнее меню → Моя история',
    bottom_about: 'Нижнее меню → О приложении',
    bottom_other: 'Нижнее меню → Прочее',
    other_faq: 'Прочее → FAQ',
    other_about: 'Прочее → О приложении',
    other_contacts: 'Прочее → Контакты',
    faq_back: 'FAQ → Назад',
    contacts_back: 'Контакты → Назад',
  };

  function clickLabel(s: any) {
    const k = String(s || '').trim();
    return clickRu[k] || k || '—';
  }

  function startEditAfisha(ev: any) {
    if (!ev) return;
    setAfEditId(String(ev.id || ''));
    const cats = Array.isArray((ev as any).categories) ? (ev as any).categories : ev.category ? [ev.category] : ['sport'];
    setAfEditCats(cats.map((x: any) => String(x || '')).filter(Boolean).slice(0, 3));
    setAfEditDate(String(ev.date || ''));
    setAfEditTime(fmtAfTime((ev as any).time));
    setAfEditTitle(String(ev.title || ''));
    setAfEditComment(String(ev.comment || ''));
    setAfEditDetailsUrl(String(ev.detailsUrl || ''));
    setAfEditLocationUrl(String(ev.locationUrl || ''));
    setAfEditImageUrl(String(ev.imageUrl || ''));
    setAfEditImageDataUrl(null);
    setAfEditPreviewImageDataUrl(null);
  }

  function toggleEditAfisha(ev: any) {
    const id = String(ev?.id || "");
    if (!id) return;
    if (afEditId === id) {
      setAfEditId("");
      return;
    }
    startEditAfisha(ev);
  }

  async function createAfisha() {
    if (!token) return;
    const payload = {
      categories: afCreateCats,
      date: afCreateDate,
      time: fmtAfTime(afCreateTime) || undefined,
      title: afCreateTitle.trim(),
      comment: afCreateComment.trim(),
      detailsUrl: afCreateDetailsUrl.trim(),
      locationUrl: afCreateLocationUrl.trim(),
      imageDataUrl: afCreateImageDataUrl || undefined,
      previewImageDataUrl: afCreatePreviewImageDataUrl || undefined,
    };
    const r = await apiAdminCreateAfisha(token, payload as any);
    if (!r?.ok) return showErr(r?.error || 'Ошибка');
    showOk('Создано');
    setAfCreateTitle('');
    setAfCreateTime('');
    setAfCreateComment('');
    setAfCreateDetailsUrl('');
    setAfCreateLocationUrl('');
    setAfCreateImageDataUrl(null);
    setAfCreatePreviewImageDataUrl(null);
    await loadAfishaLists();
  }

  async function saveAfisha() {
    if (!token || !afEditId) return;
    try {
      const payload: any = {
        categories: afEditCats,
        date: afEditDate,
        time: fmtAfTime(afEditTime) || '',
        title: afEditTitle.trim(),
        comment: afEditComment.trim(),
        detailsUrl: afEditDetailsUrl.trim(),
        locationUrl: afEditLocationUrl.trim(),
      };
      if (afEditImageDataUrl) payload.imageDataUrl = afEditImageDataUrl;
      if (afEditPreviewImageDataUrl) payload.previewImageDataUrl = afEditPreviewImageDataUrl;
      const r = await apiAdminUpdateAfisha(token, afEditId, payload as any);
      if (!r?.ok) return showErr(r?.error || 'Ошибка');
      showOk('Сохранено');
      await loadAfishaLists();
    } catch (e: any) {
      showErr(e?.message || 'Ошибка сохранения');
    }
  }

  function renderAfishaEditForm() {
    if (!afEditId) return null;
    return (
      <>
        <div className="small"><b>Редактирование</b></div>
        <div className="vx-sp10" />

        <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: "1 1 260px", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {AF_CATS.map((c) => {
              const on = afEditCats.includes(c.k);
              const disabled = !on && afEditCats.length >= 3;
              return (
                <button
                  key={c.k}
                  type="button"
                  className={"btn vx-btnSm " + (on ? "vx-btnOn" : "")}
                  disabled={disabled}
                  onClick={() => {
                    setAfEditCats((prev) => {
                      const has = prev.includes(c.k);
                      if (has) return prev.length <= 1 ? prev : prev.filter((x) => x !== c.k);
                      if (prev.length >= 3) return prev;
                      return [...prev, c.k];
                    });
                  }}
                  title={disabled ? "Максимум 3 категории" : ""}
                >
                  {c.l}
                </button>
              );
            })}
          </div>
          <input className="input vx-in" type="date" value={afEditDate} onChange={(e) => setAfEditDate(e.target.value)} style={{ flex: "0 0 170px" }} />
          <input className="input vx-in" type="time" value={afEditTime} onChange={(e) => setAfEditTime(e.target.value)} style={{ flex: "0 0 130px" }} />
        </div>
        <div className="vx-muted" style={{ marginTop: 6 }}>Можно выбрать до 3 категорий</div>

        <div className="vx-sp8" />
        <input className="input vx-in" value={afEditTitle} onChange={(e) => setAfEditTitle(e.target.value)} placeholder="Название" />

        <div className="vx-sp8" />
        <textarea
          className="input vx-in"
          value={afEditComment}
          onChange={(e) => setAfEditComment(e.target.value)}
          placeholder="Комментарий (покажется у клиента под названием)"
          rows={3}
          style={{ resize: 'vertical' }}
        />

        <div className="vx-sp10" />
        <div className="vx-muted">Фото мероприятия</div>
        {afEditImageUrl ? <div className="vx-muted">Текущее: <a href={afEditImageUrl} target="_blank" rel="noreferrer">{afEditImageUrl}</a></div> : null}
        <div className="vx-sp6" />
        <div className="vx-rowWrap" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const prepared = await prepareAfishaUpload(f);
                setAfEditImageDataUrl(prepared.imageDataUrl || null);
                setAfEditPreviewImageDataUrl(prepared.previewImageDataUrl || prepared.imageDataUrl || null);
              } catch {
                showErr("Не удалось подготовить изображение");
              }
            }}
          />
          {afEditImageDataUrl ? <img className="vx-pubThumb" src={afEditImageDataUrl} alt="" /> : null}
        </div>

        <div className="vx-sp10" />
        <div className="vx-muted">Ссылка для кнопки «Подробнее»</div>
        <div className="vx-sp6" />
        <input className="input vx-in" value={afEditDetailsUrl} onChange={(e) => setAfEditDetailsUrl(e.target.value)} placeholder="https://..." />

        <div className="vx-sp10" />
        <div className="vx-muted">Ссылка для кнопки «Локация»</div>
        <div className="vx-sp6" />
        <input className="input vx-in" value={afEditLocationUrl} onChange={(e) => setAfEditLocationUrl(e.target.value)} placeholder="https://..." />

        <div className="vx-sp10" />
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={saveAfisha}>Сохранить</button>
          <button className="btn vx-btnSm" type="button" onClick={() => setAfEditId("")}>Свернуть</button>
        </div>
      </>
    );
  }


  useEffect(() => {
    if (!token) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (tab === "clients" || tab === "requests") loadClients();
    if (tab === "afisha") loadAfishaLists();
    if (tab === "analytics") loadAnalytics();
    if (tab === "rates" && !gFormulasLoaded) loadGFormulas();
    if (tab === "faq" && !faqLoaded) loadFaq();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, gFormulasLoaded]);

  // autosave template (no button)
  useEffect(() => {
    if (!token) return;
    if (saveTplTimer.current) window.clearTimeout(saveTplTimer.current);
    saveTplTimer.current = window.setTimeout(async () => {
      try {
        await apiAdminSetPublishTemplate(token, tpl);
      } catch {
        // ignore
      }
    }, 600);
    return () => {
      if (saveTplTimer.current) window.clearTimeout(saveTplTimer.current);
    };
  }, [tpl, token]);

  async function onLogin() {
    try {
      localStorage.setItem(LS_KEY, draftKey);
    } catch {
      // ignore
    }
    setKey(draftKey);
  }

  function logout() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
    setKey("");
    setDraftKey("");
    setBanner(null);
  }

  async function saveAdmins() {
    const list = adminsText
      .split(/[,\s]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    const r = await apiAdminSetAdmins(token, list);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    showOk("Сохранено ✅");
  }

  async function saveBlacklist() {
    const list = blacklistText
      .split(/[\n,;\s]+/)
      .map((x) => normU(x).toLowerCase())
      .filter(Boolean);

    // unique
    const unique = Array.from(new Set(list));

    const r = await apiAdminSetBlacklist(token, unique);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    setBlacklistText((r.usernames || []).join("\n"));
    showOk("Сохранено ✅");
  }

  function resetGFormulasToDefault() {
    setGFormulasDraft(createGFormulaDraft());
  }

  async function loadGFormulas() {
    try {
      const r = await apiAdminGetGFormulas(token);
      if (!r?.ok || !r?.formulas) return;
      setGFormulasDraft(createGFormulaDraft(r.formulas));
      setGFormulasLoaded(true);
    } catch {
      // ignore
    }
  }

  async function saveGFormulas() {
    if (gFormulasSaving) return;
    setGFormulasSaving(true);
    try {
      const next: any = {};
      for (const k of G_FORMULA_KEYS) {
        const v = gFormulasDraft[k] || ({} as any);
        const buy = Number(String(v.buyMul ?? "").replace(",", ".").trim());
        const sell = Number(String(v.sellMul ?? "").replace(",", ".").trim());
        next[k] = {
          buyMul: Number.isFinite(buy) && buy > 0 ? buy : DEFAULT_G_FORMULAS[k].buyMul,
          sellMul: Number.isFinite(sell) && sell > 0 ? sell : DEFAULT_G_FORMULAS[k].sellMul
        };
      }

      const r = await apiAdminSetGFormulas(token, next);
      if (!r?.ok) {
        showErr(r?.error || "Ошибка");
        return;
      }
      showOk("Сохранено ✅");
      // reload normalized values from server
      setGFormulasLoaded(false);
      await loadGFormulas();
    } finally {
      setGFormulasSaving(false);
    }
  }

  function openClientEditor(u: any, c: any, tgId: number) {
    setCUsername(u.username || "");
    setCTgId(String(tgId));
    setCFullName(c?.fullName || "");
    setCStatus((c?.status as any) || (u.status as any) || "standard");
    setCBanks(Array.isArray(c?.banks) ? c!.banks! : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openContactOnlyEditor(c: any) {
    setCUsername(String(c?.username || ""));
    setCTgId(c?.tg_id ? String(c.tg_id) : "");
    setCFullName(String(c?.fullName || ""));
    setCStatus((c?.status as any) || "standard");
    setCBanks(Array.isArray(c?.banks) ? c.banks : []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleBank(name: string) {
    setCBanks((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      return [...prev, name];
    });
  }

  async function publishNow() {
    if (isPublishing) return;
    setBanner({ type: "ok", text: "Публикую…" });
    setIsPublishing(true);
    try {
      const r = await apiAdminPublish(token, { template: tpl, imageDataUrl });
      if (!r?.ok) {
        showErr(r?.error || "Ошибка публикации");
        return;
      }
      showOk(`Опубликовано ✅ (id ${r.message_id || "–"}, ${r.mode || ""}${r.warn ? ", " + String(r.warn).slice(0,80) : ""})`);
    } catch (e: any) {
      showErr(e?.message || "Ошибка запроса");
    } finally {
      setIsPublishing(false);
    }
  }

  async function upsertContact() {
    const username = normU(cUsername);
    const tgIdRaw = String(cTgId || "").trim();
    const tgIdNum = tgIdRaw ? Number(tgIdRaw) : undefined;
    const tg_id = Number.isFinite(tgIdNum as any) && Number(tgIdNum) > 0 ? Number(tgIdNum) : undefined;

    // if tg_id not specified, try to infer it from known users by username
    let inferredTgId: number | undefined = tg_id;
    if (!inferredTgId && username) {
      const u = (users || []).find((x: any) => String(x?.username || "").toLowerCase() === String(username).toLowerCase());
      const maybe = u?.tg_id ? Number(u.tg_id) : undefined;
      if (Number.isFinite(maybe) && Number(maybe) > 0) inferredTgId = Number(maybe);
    }

    if (!username && !inferredTgId) {
      showErr("Укажи username или tg_id");
      return;
    }

    const payload: any = {
      ...(username ? { username } : {}),
      ...(inferredTgId ? { tg_id: inferredTgId } : {}),
      fullName: cFullName,
      status: cStatus,
      banks: cBanks
    };

    const r = await apiAdminUpsertContact(token, payload);

    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }

    setCUsername("");
    setCTgId("");
    setCFullName("");
    setCStatus("standard");
    setCBanks([]);

    const c = await apiAdminGetContacts(token);
    if (c?.ok) setContacts(c.contacts);

    showOk("Сохранено ✅");
  }

  async function runReport() {
    const tgIdNum = repTgId.trim() ? Number(repTgId.trim()) : undefined;
    const r = await apiAdminGetReports(token, {
      from: repFrom,
      to: repTo,
      onlyDone: repOnlyDone,
      ...(tgIdNum ? { tgId: tgIdNum } : {}),
    });
    if (!r?.ok) {
      showErr(r?.error || "Ошибка отчёта");
      return;
    }
    setReport(r);
  }

  function toNumLoose(s: any): number {
    const n = Number(String(s ?? "").replace(/\s+/g, "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : Number.NaN;
  }

  function fmtRate(n: any) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "";
    // show up to 4 decimals, but trim trailing zeros
    const s = x.toFixed(4).replace(/0+$/g, "").replace(/\.$/g, "");
    return s;
  }

  async function loadCashbox() {
    if (!token || cashLoading) return;
    setCashLoading(true);
    try {
      const [rep, rr, today] = await Promise.allSettled([
        apiAdminGetReports(token, { from: cashFrom, to: cashTo, onlyDone: cashOnlyDone }),
        apiAdminGetRatesRange(token, { from: cashFrom, to: cashTo }),
        apiGetTodayRates(),
      ]);

      if (rep.status === "fulfilled" && rep.value?.ok) {
        setCashReport(rep.value);
      } else if (rep.status === "fulfilled" && rep.value && !rep.value.ok) {
        showErr(rep.value?.error || "Ошибка");
      }

      if (rr.status === "fulfilled" && rr.value?.ok) {
        const map: Record<string, any> = {};
        for (const it of rr.value.items || []) {
          if (it?.date && it?.rates) map[String(it.date)] = it.rates;
        }
        setCashRatesByDate(map);
      }

      // auto-fill defaults from today's rates once (if empty)
      if (today.status === "fulfilled" && today.value?.ok) {
        const rates = (today.value as any)?.data?.rates;
        if (rates && typeof rates === "object") {
          setCashDefaultRates((prev) => {
            const next = { ...(prev || {}) } as any;
            for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
              const p = next[cur] || { buy: "", sell: "" };
              const r = (rates as any)?.[cur];
              const buy = toNumLoose(r?.buy_vnd);
              const sell = toNumLoose(r?.sell_vnd);
              // fill only when empty
              if ((!p.buy || !String(p.buy).trim()) && Number.isFinite(buy) && buy > 0) p.buy = fmtRate(buy);
              if ((!p.sell || !String(p.sell).trim()) && Number.isFinite(sell) && sell > 0) p.sell = fmtRate(sell);
              next[cur] = p;
            }
            return next;
          });
        }
      }
    } finally {
      setCashLoading(false);
    }
  }

  // Auto-load cashbox data when entering the tab / changing filters
  useEffect(() => {
    if (tab !== "cashbox") return;
    if (!token) return;
    loadCashbox();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, token, cashFrom, cashTo, cashOnlyDone]);

  async function saveCashDayRates(date: string) {
    if (!token) return;
    const day = String(date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      showErr("Неверная дата");
      return;
    }

    setCashDaySaving((prev) => ({ ...(prev || {}), [day]: true }));
    try {
      const draft = (cashDayDraft as any)?.[day] || {};
      const mk = (cur: string) => {
        const d = (draft as any)?.[cur] || {};
        const def = (cashDefaultRates as any)?.[cur] || {};
        const buy = toNumLoose(d.buy != null ? d.buy : def.buy);
        const sell = toNumLoose(d.sell != null ? d.sell : def.sell);
        return { buy, sell };
      };

      const USD = mk("USD");
      const RUB = mk("RUB");
      const USDT = mk("USDT");
      if (![USD, RUB, USDT].every((x) => Number.isFinite(x.buy) && Number.isFinite(x.sell) && x.buy > 0 && x.sell > 0)) {
        showErr("Заполни buy/sell для USD, RUB и USDT");
        return;
      }

      const payload: any = {
        USD: { buy_vnd: USD.buy, sell_vnd: USD.sell },
        RUB: { buy_vnd: RUB.buy, sell_vnd: RUB.sell },
        USDT: { buy_vnd: USDT.buy, sell_vnd: USDT.sell },
      };

      const EUR = mk("EUR");
      const THB = mk("THB");
      if (Number.isFinite(EUR.buy) && Number.isFinite(EUR.sell) && EUR.buy > 0 && EUR.sell > 0) {
        payload.EUR = { buy_vnd: EUR.buy, sell_vnd: EUR.sell };
      }
      if (Number.isFinite(THB.buy) && Number.isFinite(THB.sell) && THB.buy > 0 && THB.sell > 0) {
        payload.THB = { buy_vnd: THB.buy, sell_vnd: THB.sell };
      }

      const r = await apiAdminSetRatesForDate(token, day, payload);
      if (!r?.ok) {
        showErr(r?.error || "Ошибка сохранения курса");
        return;
      }

      setCashRatesByDate((prev) => ({ ...(prev || {}), [day]: payload }));
      showOk(`Курс сохранён за ${day}`);
    } finally {
      setCashDaySaving((prev) => ({ ...(prev || {}), [day]: false }));
    }
  }

  function fmtNum(n: any) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "–";
    return String(Math.trunc(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function fmtDt(iso: any) {
    const d = new Date(String(iso || ""));
    const t = d.getTime();
    if (!Number.isFinite(t)) return String(iso || "");
    return d.toLocaleString("ru-RU");
  }

  function who(req: any) {
    const u = req?.from?.username ? "@" + req.from.username : "";
    const name = [req?.from?.first_name, req?.from?.last_name].filter(Boolean).join(" ");
    return u || name || (req?.from?.id ? "id " + req.from.id : "–");
  }

  function stateRu(s: any) {
    const v = String(s || "");
    if (v === "new") return "Принята";
    if (v === "in_progress") return "В работе";
    if (v === "done") return "Готово";
    if (v === "canceled") return "Отклонена";
    return v || "–";
  }

  function methodRu(m: any) {
    const v = String(m || "");
    if (v === "cash") return "Наличные";
    if (v === "transfer") return "Перевод";
    if (v === "atm") return "Банкомат";
    if (v === "other") return "Другое";
    return v || "–";
  }

  const contactsByTg = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts || []) {
      if (c?.tg_id) m[String(c.tg_id)] = c;
    }
    return m;
  }, [contacts]);

  const contactsByUsername = useMemo(() => {
    const m: Record<string, Contact> = {};
    for (const c of contacts || []) {
      if (c?.username) m[String(c.username).toLowerCase()] = c;
    }
    return m;
  }, [contacts]);

  const manualClientRows = useMemo(() => {
    const rows: any[] = [];
    const seen = new Set<string>();

    for (const u of users || []) {
      const tgId = Number((u as any)?.tg_id);
      if (!Number.isFinite(tgId) || tgId <= 0) continue;
      const uname = u?.username ? String(u.username).toLowerCase() : "";
      const c = contactsByTg[String(tgId)] || (uname ? contactsByUsername[uname] : undefined);
      seen.add(`tg:${tgId}`);
      if (uname) seen.add(`u:${uname}`);
      rows.push({ kind: "user", u, c, tgId, sortDate: String((u as any)?.last_seen_at || c?.updated_at || c?.created_at || "") });
    }

    for (const c of contacts || []) {
      if (!c) continue;
      const tgIdNum = c?.tg_id ? Number(c.tg_id) : Number.NaN;
      const uname = c?.username ? String(c.username).toLowerCase() : "";
      if (Number.isFinite(tgIdNum) && seen.has(`tg:${tgIdNum}`)) continue;
      if (uname && seen.has(`u:${uname}`)) continue;
      if (Number.isFinite(tgIdNum)) seen.add(`tg:${tgIdNum}`);
      if (uname) seen.add(`u:${uname}`);
      rows.push({ kind: "contact", c, tgId: Number.isFinite(tgIdNum) ? tgIdNum : undefined, sortDate: String(c?.updated_at || c?.created_at || "") });
    }

    return rows
      .slice()
      .sort((a, b) => String(b.sortDate || "").localeCompare(String(a.sortDate || "")))
      .slice(0, 300);
  }, [users, contacts, contactsByTg, contactsByUsername]);

  const filteredClientRows = useMemo(() => {
    const q = String(clientSearch || "").trim().toLowerCase();
    if (!q) return manualClientRows;
    return manualClientRows.filter((row) => {
      const u = row.kind === "user" ? row.u : null;
      const c = row.c;
      const tgId = row.tgId;
      const username = String(u?.username || c?.username || "").toLowerCase();
      const fullName = String(c?.fullName || [u?.first_name, u?.last_name].filter(Boolean).join(" ") || "").toLowerCase();
      const status = String((c?.status as any) || (u?.status as any) || "standard").toLowerCase();
      const statusRu = getUserStatusLabelRu(status).toLowerCase();
      const banks = Array.isArray(c?.banks) ? c.banks.join(" ").toLowerCase() : "";
      const tgText = tgId ? String(tgId) : "";
      const hay = [username, fullName, status, statusRu, banks, tgText].join(" ");
      return hay.includes(q);
    });
  }, [manualClientRows, clientSearch]);

  // Cashbox computed rows (profit in VND)
  const cashComputed = useMemo(() => {
    const reqs = Array.isArray(cashReport?.requests) ? cashReport.requests : [];

    const draftToRates = (draft: any) => {
      if (!draft || typeof draft !== "object") return null;
      const out: any = {};
      for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
        const d = (draft as any)[cur];
        const buy = toNumLoose(d?.buy);
        const sell = toNumLoose(d?.sell);
        if (Number.isFinite(buy) && Number.isFinite(sell) && buy > 0 && sell > 0) {
          out[cur] = { buy_vnd: buy, sell_vnd: sell };
        }
      }
      return Object.keys(out).length ? out : null;
    };

    const getBaseRates = (dateKey: string): any => {
      if (!cashUseHistoryRates) return null;
      // Prefer draft (editable) rates for live preview; fall back to saved ratesByDate
      const dr = draftToRates((cashDayDraft as any)?.[dateKey]);
      if (dr) return dr;
      return cashRatesByDate?.[dateKey] || null;
    };

    const getAutoRate = (rates: any, cur: string, kind: "in" | "out") => {
      const c = String(cur || "").toUpperCase();
      if (!c || c === "VND") return 1;
      const key = kind === "in" ? "sell_vnd" : "buy_vnd";
      const n1 = toNumLoose(rates?.[c]?.[key]);
      if (Number.isFinite(n1) && n1 > 0) return n1;
      const def = cashDefaultRates?.[c];
      const n2 = toNumLoose(kind === "in" ? def?.sell : def?.buy);
      if (Number.isFinite(n2) && n2 > 0) return n2;
      return Number.NaN;
    };

    const getEffectiveRate = (id: string, rates: any, cur: string, kind: "in" | "out") => {
      const c = String(cur || "").toUpperCase();
      if (!c || c === "VND") return 1;
      const ov = cashOverrides?.[String(id)] || {};
      const ovText = kind === "in" ? ov.in : ov.out;
      const ovNum = toNumLoose(ovText);
      if (Number.isFinite(ovNum) && ovNum > 0) return ovNum;
      return getAutoRate(rates, c, kind);
    };

    const rows = reqs.map((r: any) => {
      const id = String(r?.id || "");
      const created = String(r?.created_at || "");
      const dateKey = /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : "";
      const sellCur = String(r?.sellCurrency || "").toUpperCase();
      const buyCur = String(r?.buyCurrency || "").toUpperCase();
      const sellAmount = Number(r?.sellAmount);
      const buyAmount = Number(r?.buyAmount);
      const baseRates = getBaseRates(dateKey);

      const inAuto = getAutoRate(baseRates, sellCur, "in");
      const outAuto = getAutoRate(baseRates, buyCur, "out");
      const inRate = getEffectiveRate(id, baseRates, sellCur, "in");
      const outRate = getEffectiveRate(id, baseRates, buyCur, "out");

      const inVnd = sellCur === "VND" ? sellAmount : sellAmount * inRate;
      const outVnd = buyCur === "VND" ? buyAmount : buyAmount * outRate;
      const profit = Number.isFinite(inVnd) && Number.isFinite(outVnd) ? inVnd - outVnd : Number.NaN;

      const ov = cashOverrides?.[id] || {};
      const inValue = sellCur === "VND" ? "" : (ov.in != null ? String(ov.in) : fmtRate(inAuto));
      const outValue = buyCur === "VND" ? "" : (ov.out != null ? String(ov.out) : fmtRate(outAuto));

      return {
        id,
        dateKey,
        created_at: created,
        who: who(r),
        state: String(r?.state || ""),
        payMethod: r?.payMethod,
        receiveMethod: r?.receiveMethod,
        sellCur,
        buyCur,
        sellAmount,
        buyAmount,
        inAuto,
        outAuto,
        inValue,
        outValue,
        profit,
        profitOk: Number.isFinite(profit),
        missingRates: (!Number.isFinite(inRate) && sellCur !== "VND") || (!Number.isFinite(outRate) && buyCur !== "VND"),
      };
    });

    const totalProfit = rows.reduce((acc: number, x: any) => (Number.isFinite(x.profit) ? acc + x.profit : acc), 0);
    const missing = rows.reduce((acc: number, x: any) => (x.missingRates ? acc + 1 : acc), 0);

    return { rows, totalProfit, missing, total: rows.length };
  }, [cashReport, cashRatesByDate, cashDayDraft, cashOverrides, cashDefaultRates, cashUseHistoryRates]);

  // Cashbox summary grouped by day (helps input per-day selling prices like in Excel)
  const cashByDay = useMemo(() => {
    const map: Record<string, any> = {};
    for (const x of cashComputed.rows || []) {
      const dk = String(x?.dateKey || "").trim();
      if (!dk) continue;
      if (!map[dk]) map[dk] = { date: dk, cnt: 0, profit: 0, sell: {}, buy: {} };
      map[dk].cnt++;
      if (Number.isFinite(x.profit)) map[dk].profit += x.profit;

      const sc = String(x.sellCur || "");
      const bc = String(x.buyCur || "");
      if (sc && Number.isFinite(Number(x.sellAmount))) {
        map[dk].sell[sc] = (map[dk].sell[sc] || 0) + Number(x.sellAmount);
      }
      if (bc && Number.isFinite(Number(x.buyAmount))) {
        map[dk].buy[bc] = (map[dk].buy[bc] || 0) + Number(x.buyAmount);
      }
    }
    return Object.keys(map)
      .sort((a, b) => b.localeCompare(a))
      .map((k) => map[k]);
  }, [cashComputed.rows]);

  // Seed day drafts from saved rates / defaults (do not overwrite existing drafts)
  useEffect(() => {
    if (!cashByDay.length) return;
    setCashDayDraft((prev) => {
      const next: any = { ...(prev || {}) };
      let changed = false;
      for (const d of cashByDay) {
        const date = String(d?.date || "");
        if (!date || next[date]) continue;
        const saved = cashRatesByDate?.[date] || null;
        const seeded: any = {};
        for (const cur of ["RUB", "USD", "USDT", "EUR", "THB"]) {
          const sBuy = toNumLoose(saved?.[cur]?.buy_vnd);
          const sSell = toNumLoose(saved?.[cur]?.sell_vnd);
          const def = (cashDefaultRates as any)?.[cur] || {};
          const buy = Number.isFinite(sBuy) && sBuy > 0 ? fmtRate(sBuy) : String(def.buy || "");
          const sell = Number.isFinite(sSell) && sSell > 0 ? fmtRate(sSell) : String(def.sell || "");
          seeded[cur] = { buy, sell };
        }
        next[date] = seeded;
        changed = true;
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cashByDay, cashRatesByDate, cashDefaultRates]);

  const reqSelected = useMemo(
    () => (requests || []).find((r) => String(r?.id) === String(reqSelectedId)) || null,
    [requests, reqSelectedId]
  );

  const selectedTgId = reqSelected?.from?.id ? Number(reqSelected.from.id) : undefined;
  const selectedUsername = reqSelected?.from?.username ? String(reqSelected.from.username) : "";

  const reqSelectedContact: Contact | null = useMemo(() => {
    if (!reqSelected) return null;
    if (selectedTgId && contactsByTg[String(selectedTgId)]) return contactsByTg[String(selectedTgId)];
    if (selectedUsername) return contactsByUsername[String(selectedUsername).toLowerCase()] || null;
    return null;
  }, [reqSelected, selectedTgId, selectedUsername, contactsByTg, contactsByUsername]);

  // Sync request contact editor on selection change
  useEffect(() => {
    setReqFullName(reqSelectedContact?.fullName || "");
    setReqBanks(Array.isArray(reqSelectedContact?.banks) ? reqSelectedContact.banks : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqSelectedContact?.id, reqSelectedId]);

  const reqActive = useMemo(
    () =>
      (requests || [])
        .filter((r) => {
          const s = String(r?.state || "");
          return s !== "done" && s !== "canceled";
        })
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [requests]
  );

  const reqRejected = useMemo(
    () =>
      (requests || [])
        .filter((r) => String(r?.state || "") === "canceled")
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [requests]
  );

  const reqHistoryAll = useMemo(
    () =>
      (requests || [])
        .filter((r) => String(r?.state || "") === "done")
        .slice()
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))),
    [requests]
  );

  const reqHistory = useMemo(() => {
    const from = reqHistFrom ? new Date(reqHistFrom + "T00:00:00").getTime() : NaN;
    const to = reqHistTo ? new Date(reqHistTo + "T23:59:59").getTime() : NaN;

    return reqHistoryAll.filter((r) => {
      const t = new Date(String(r?.created_at || "")).getTime();
      if (!Number.isFinite(t)) return true;
      if (Number.isFinite(from) && t < from) return false;
      if (Number.isFinite(to) && t > to) return false;
      return true;
    });
  }, [reqHistoryAll, reqHistFrom, reqHistTo]);

  function reqShortId(id: any) {
    const s = String(id || "");
    return s.length > 6 ? s.slice(-6) : s;
  }

  function openReqDetails(id: string) {
    setReqSelectedId(String(id));
    setReqView("detail");
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // ignore
    }
  }

  async function setReqState(next: "in_progress" | "done" | "canceled") {
    if (!reqSelected) return;
    const r = await apiAdminSetRequestState(token, String(reqSelected.id), next);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    await loadClients();
    if (next === "done") setReqView("history");
    if (next === "canceled") setReqView("rejected");
    showOk("Сохранено ✅");
  }

  async function saveReqContact() {
    if (!reqSelected) return;
    if (!selectedTgId && !selectedUsername) {
      showErr("Нет tg_id/username");
      return;
    }

    const payload: any = {
      ...(selectedTgId ? { tg_id: selectedTgId } : {}),
      ...(selectedUsername ? { username: selectedUsername } : {}),
      fullName: reqFullName,
      banks: reqBanks,
    };

    const r = await apiAdminUpsertContact(token, payload);
    if (!r?.ok) {
      showErr(r?.error || "Ошибка");
      return;
    }
    const c = await apiAdminGetContacts(token);
    if (c?.ok) setContacts(Array.isArray(c.contacts) ? c.contacts : []);
    showOk("Сохранено ✅");
  }

  function toggleReqBank(name: string) {
    setReqBanks((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      return [...prev, name];
    });
  }

  const reqAgg = useMemo(() => {
    const m: Record<string, { cnt: number; sell: Record<string, number>; buy: Record<string, number> }> = {};
    for (const r of requests || []) {
      const id = r?.from?.id;
      if (!id) continue;
      const k = String(id);
      if (!m[k]) m[k] = { cnt: 0, sell: {}, buy: {} };
      m[k].cnt += 1;

      const sc = String(r.sellCurrency || "");
      const sa = Number(r.sellAmount);
      if (sc && Number.isFinite(sa)) m[k].sell[sc] = (m[k].sell[sc] || 0) + sa;

      const bc = String(r.buyCurrency || "");
      const ba = Number(r.buyAmount);
      if (bc && Number.isFinite(ba)) m[k].buy[bc] = (m[k].buy[bc] || 0) + ba;
    }
    return m;
  }, [requests]);


  if (!token) {
    return (
      <div className="vx-page theme-owner">
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@500;600;700;800&display=swap');`}</style>
        {/* background removed (old Danang/beach style is no longer used) */}
        <div className="container">
          <div className="card">
            <div className="h1">Управление владельца</div>
            <div className="vx-sp12" />
            <input
              className="input vx-in"
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder="ADMIN_WEB_KEY"
              type="password"
            />
            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={onLogin}>
              Войти
            </button>
            <div className="vx-installRow">
              <button className="btn vx-btnSm" type="button" onClick={installOwnerApp} disabled={installDone}>
                {installDone ? "Установлено" : "Установить на устройство"}
              </button>
              <span className="vx-muted">{installPrompt || installSupported ? "Откроется установка owner-страницы" : "Можно установить через меню браузера"}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vx-page theme-owner">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@500;600;700;800&display=swap');`}</style>
      {/* background removed (old Danang/beach style is no longer used) */}
      <div className="container">
        <div className="card vx-topCard" style={{ paddingLeft: 14, paddingRight: 14 }}>
          <div className="row vx-between vx-center" style={{ gap: 12 }}>
            <div>
              <div className="vx-title">Управление</div>
              <div className="vx-topSub">/admin</div>
            </div>
            <div className="vx-chatActionRow">
              <button className="btn vx-btnSm" type="button" onClick={installOwnerApp} disabled={installDone}>
                {installDone ? "Установлено" : "Установить"}
              </button>
              <button className="btn vx-btnSm" type="button" onClick={loadAll}>
                Обновить
              </button>
              <button className="btn vx-btnSm" type="button" onClick={logout}>
                Выйти
              </button>
            </div>
          </div>
        </div>

        {banner ? (
          <div className={banner.type === "err" ? "vx-toast vx-toastErr" : "vx-toast vx-toastOk"}>
            {banner.text}
          </div>
        ) : null}

        <div className="vx-adminSeg" style={{ marginTop: 0 }}>
          <button className={tab === "rates" ? "on" : ""} onClick={() => setTab("rates")}>Курс</button>
          <button className={tab === "bonuses" ? "on" : ""} onClick={() => setTab("bonuses")}>Надбавки</button>
          <button className={tab === "reviews" ? "on" : ""} onClick={() => setTab("reviews")}>Отзывы</button>
          <button className={tab === "clients" ? "on" : ""} onClick={() => setTab("clients")}>Клиенты</button>
          <button className={tab === "requests" ? "on" : ""} onClick={() => setTab("requests")}>Заявки</button>
          <button className={tab === "afisha" ? "on" : ""} onClick={() => setTab("afisha")}>Афиша</button>
          <button className={tab === "faq" ? "on" : ""} onClick={() => setTab("faq")}>FAQ</button>
          <button className={tab === "cashbox" ? "on" : ""} onClick={() => setTab("cashbox")}>Касса</button>
          <button className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>Отчёты</button>
          <button className={tab === "analytics" ? "on" : ""} onClick={() => setTab("analytics")}>Статистика</button>
        </div>

        <div className="vx-mt10" />

      {tab === "rates" ? (
        <>
          <div className="card"><AdminTab me={me} forcedSection="rates" hideHeader hideSeg /></div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="row vx-between vx-center">
              <div className="small"><b>Формулы кросс‑курсов (G)</b></div>
              <button className="btn vx-btnSm" type="button" onClick={resetGFormulasToDefault}>
                Сбросить
              </button>
            </div>
            <div className="vx-sp6" />
            <div className="small" style={{ opacity: 0.85 }}>
              Эти формулы применяются к парам без VND. Курс считается так: <b>BUY = G × buyMul</b>, <b>SELL = G × sellMul</b>.
            </div>

            <div className="vx-sp10" />

            <div className="vx-rateRow" style={{ opacity: 0.9 }}>
              <div className="vx-code">Пара</div>
              <div className="vx-fields">
                <div className="vx-field"><div className="small"><b>buyMul</b></div></div>
                <div className="vx-field"><div className="small"><b>sellMul</b></div></div>
              </div>
            </div>

            {G_FORMULA_KEYS.map((k) => (
              <div key={k} className="vx-rateRow">
                <div className="vx-code">{k}</div>
                <div className="vx-fields">
                  <div className="vx-field">
                    <input
                      className="input vx-in"
                      inputMode="decimal"
                      value={gFormulasDraft[k]?.buyMul ?? ""}
                      onChange={(e) =>
                        setGFormulasDraft((prev) => ({
                          ...(prev || {}),
                          [k]: { ...(prev?.[k] || {}), buyMul: e.target.value }
                        }))
                      }
                      placeholder={String(DEFAULT_G_FORMULAS[k]?.buyMul ?? "")}
                    />
                  </div>
                  <div className="vx-field">
                    <input
                      className="input vx-in"
                      inputMode="decimal"
                      value={gFormulasDraft[k]?.sellMul ?? ""}
                      onChange={(e) =>
                        setGFormulasDraft((prev) => ({
                          ...(prev || {}),
                          [k]: { ...(prev?.[k] || {}), sellMul: e.target.value }
                        }))
                      }
                      placeholder={String(DEFAULT_G_FORMULAS[k]?.sellMul ?? "")}
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={saveGFormulas} disabled={gFormulasSaving}>
              {gFormulasSaving ? "Сохраняю…" : "Сохранить формулы"}
            </button>
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Публикация в группу</b></div>
            <div className="vx-sp10" />
            <textarea className="vx-revText" rows={10} value={tpl} onChange={(e) => setTpl(e.target.value)} />

            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const r = new FileReader();
                  r.onload = () => setImageDataUrl(String(r.result || "") || null);
                  r.readAsDataURL(f);
                }}
              />
              {imageDataUrl ? (
                <button className="btn vx-btnSm" type="button" onClick={() => setImageDataUrl(null)}>
                  Убрать картинку
                </button>
              ) : null}
              {imageDataUrl ? (
                <img className="vx-pubThumb" src={imageDataUrl} alt="" />
              ) : null}
            </div>


            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={publishNow} disabled={isPublishing}>
              {isPublishing ? "Публикую…" : "Опубликовать"}
            </button>

          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Админы (tg_id)</b></div>
            <div className="vx-sp10" />
            <input
              className="input vx-in"
              value={adminsText}
              onChange={(e) => setAdminsText(e.target.value)}
              placeholder="11111111,22222222"
            />
            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={saveAdmins}>
              Сохранить
            </button>
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="small"><b>Чёрный список (username)</b></div>
            <div className="vx-sp6" />
            <div className="small" style={{ opacity: 0.85 }}>
              Без @ • через запятую/пробел/новую строку. Пользователям из ЧС будет показана только картинка
              <code style={{ paddingLeft: 6 }}>/brand/blocked.png</code>.
            </div>
            <div className="vx-sp10" />
            <textarea
              className="vx-revText"
              rows={4}
              value={blacklistText}
              onChange={(e) => setBlacklistText(e.target.value)}
              placeholder="baduser\nspammer"
            />
            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={saveBlacklist}>
              Сохранить
            </button>
          </div>
        </>
      ) : null}

      {tab === "bonuses" ? <AdminTab me={me} forcedSection="bonuses" hideHeader hideSeg /> : null}

      {tab === "reviews" ? <AdminTab me={me} forcedSection="reviews" hideHeader hideSeg /> : null}

      {tab === "clients" ? (
        <>
          <div className="card">
            <div className="row vx-between vx-center">
              <div className="small"><b>Карточка клиента (username или tg_id)</b></div>
              <button className="btn vx-btnSm" type="button" onClick={loadClients} disabled={clientsLoading}>
                {clientsLoading ? "Обновляю…" : "Обновить"}
              </button>
            </div>
            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="input vx-in"
                value={cUsername}
                onChange={(e) => setCUsername(e.target.value)}
                placeholder="username (без @)"
                style={{ flex: "1 1 220px" }}
              />
              <input
                className="input vx-in"
                value={cTgId}
                onChange={(e) => setCTgId(e.target.value)}
                placeholder="tg_id (опц.)"
                style={{ flex: "1 1 140px" }}
              />
              <select className="input vx-in" value={cStatus} onChange={(e) => setCStatus(e.target.value as any)}>
                {USER_STATUS_OPTIONS_RU.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="vx-sp8" />
            <input
              className="input vx-in"
              value={cFullName}
              onChange={(e) => setCFullName(e.target.value)}
              placeholder="Имя клиента (как подписывает админ)"
            />

            <div className="vx-sp10" />

            <div className="small">Банки</div>
            {bankIcons.length === 0 ? (
              <div className="vx-muted">Иконок нет (файлы в webapp/public/banks).</div>
            ) : (
              <div className="vx-bankGrid">
                {bankIcons.map((ic) => {
                  const on = cBanks.includes(ic);
                  return (
                    <button
                      key={ic}
                      type="button"
                      className={"vx-bankBtn " + (on ? "is-on" : "")}
                      onClick={() => toggleBank(ic)}
                      title={ic}
                    >
                      <img src={bankIconUrl(ic)} alt="" className="vx-bankImg" onError={(e) => { const p = (e.currentTarget as HTMLImageElement).parentElement as HTMLElement | null; if (p) p.style.display = "none"; }} />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={upsertContact}>
              Сохранить
            </button>

            <div className="hr" />
            <div className="small"><b>Клиенты</b></div>
            <div className="vx-muted" style={{ marginTop: 4 }}>Нажмите на клиента, чтобы открыть его карточку для редактирования имени, статуса и банков.</div>
            <div className="vx-sp10" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="input vx-in"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Поиск: username, tg_id, имя, статус, банк"
                style={{ flex: "1 1 280px" }}
              />
              {clientSearch ? (
                <button className="btn vx-btnSm" type="button" onClick={() => setClientSearch("")}>
                  Сбросить
                </button>
              ) : null}
              <div className="vx-muted">Найдено: <b>{filteredClientRows.length}</b></div>
            </div>
            <div className="vx-sp10" />
            {manualClientRows.length === 0 ? (
              <div className="vx-muted">Пока нет клиентов. Можно добавить клиента вручную по username или tg_id — он сохранится даже без сделок.</div>
            ) : filteredClientRows.length === 0 ? (
              <div className="vx-muted">По вашему запросу клиенты не найдены.</div>
            ) : (
              <div className="vx-contactList">
                {filteredClientRows.map((row) => {
                  const u = row.kind === "user" ? row.u : null;
                  const c = row.c;
                  const tgId = row.tgId;
                  const uname = (u?.username || c?.username) ? String(u?.username || c?.username).toLowerCase() : "";
                  const agg = tgId ? (reqAgg[String(tgId)] || { cnt: 0, sell: {}, buy: {} }) : { cnt: 0, sell: {}, buy: {} };
                  const isNew = agg.cnt === 1;
                  const userTitle = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
                  const who = uname ? "@" + uname : (c?.fullName || userTitle || (tgId ? `id ${tgId}` : "Клиент без Telegram ID"));
                  const adminName = c?.fullName ? c.fullName : "—";
                  const banks = Array.isArray(c?.banks) ? c.banks : [];

                  const sumSellText = (() => {
                    const sell: Record<string, number> = (agg as any).sell || {};
                    const items = Object.entries(sell)
                      .filter(([, v]) => Number(v) > 0)
                      .sort((a: any, b: any) => String(a[0]).localeCompare(String(b[0])));
                    return items.length ? items.map(([k, v]: any) => `${k}: ${fmtNum(v)}`).join(' • ') : '—';
                  })();

                  const sumBuyText = (() => {
                    const buy: Record<string, number> = (agg as any).buy || {};
                    const items = Object.entries(buy)
                      .filter(([, v]) => Number(v) > 0)
                      .sort((a: any, b: any) => String(a[0]).localeCompare(String(b[0])));
                    return items.length ? items.map(([k, v]: any) => `${k}: ${fmtNum(v)}`).join(' • ') : '—';
                  })();

                  const isEditing = (tgId && String(cTgId || "") === String(tgId)) || (!tgId && uname && String(cUsername || "").toLowerCase() === uname);
                  const clickHandler = row.kind === "user"
                    ? () => openClientEditor(u, c, Number(tgId))
                    : () => openContactOnlyEditor(c);

                  return (
                    <div key={String(c?.id || tgId || uname)} className={"vx-contactRow is-clickable" + (isEditing ? " vx-cardSel" : "")} onClick={clickHandler}>
                      <div className="row vx-between vx-center" style={{ gap: 8, flexWrap: "wrap" }}>
                        <div>
                          <div>
                            <b>{who}</b>{tgId ? <span className="vx-muted"> • id:{tgId}</span> : null}
                            {isNew ? <span className="vx-tag vx-tagNew">Новый</span> : null}
                          </div>
                          <div className="vx-muted" style={{ marginTop: 2 }}>
                            Имя (админ): <b>{adminName}</b>
                          </div>
                          {row.kind !== "user" ? (
                            <div className="vx-muted" style={{ marginTop: 2 }}>Ещё не заходил в мини‑приложение</div>
                          ) : null}
                          {banks.length ? (
                            <div className="vx-bankInline" style={{ marginTop: 6 }}>
                              {banks.slice(0, 6).map((ic: string) => (
                                <img key={ic} src={bankIconUrl(ic)} alt="" className="vx-bankInlineImg" title={ic} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                              ))}
                            </div>
                          ) : null}
                        </div>

                        <div style={{ textAlign: "right", maxWidth: 420 }}>
                          <div className="vx-muted">Отдал</div>
                          <div><b>{sumSellText}</b></div>
                          <div className="vx-muted" style={{ marginTop: 4 }}>Получил</div>
                          <div><b>{sumBuyText}</b></div>
                          <div className="vx-muted" style={{ marginTop: 6 }}>Сделок: <b>{fmtNum(agg.cnt)}</b></div>
                        </div>
                      </div>

                      <div className="vx-sp8" />

                      <div className="row vx-rowWrap vx-gap6" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span className="vx-tag">Статус: <b>{getUserStatusLabelRu((c?.status as any) || (u?.status as any) || "standard")}</b></span>
                        <span className="vx-tag">Нажмите для редактирования</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === "requests" ? (
        <div className="card">
          <div className="row vx-between vx-center">
            <div className="h3 vx-m0">Заявки</div>
            <button className="btn vx-btnSm" type="button" onClick={loadClients} disabled={clientsLoading}>
              {clientsLoading ? "Обновляю…" : "Обновить"}
            </button>
          </div>

          <div className="vx-sp10" />

          {reqView !== "detail" ? (
            <div className="row vx-rowWrap vx-gap6">
              <button className={"btn vx-btnSm " + (reqView === "active" ? "vx-btnOn" : "")} onClick={() => setReqView("active")}>
                Активные ({reqActive.length})
              </button>
              <button className={"btn vx-btnSm " + (reqView === "rejected" ? "vx-btnOn" : "")} onClick={() => setReqView("rejected")}>
                Отклонённые ({reqRejected.length})
              </button>
              <button className={"btn vx-btnSm " + (reqView === "history" ? "vx-btnOn" : "")} onClick={() => setReqView("history")}>
                История ({reqHistoryAll.length})
              </button>
            </div>
          ) : null}

          <div className="vx-sp10" />

          {reqView === "active" ? (
            reqActive.length === 0 ? (
              <div className="vx-muted">Активных заявок нет.</div>
            ) : (
              <div className="vx-reqList">
                {reqActive.slice(0, 60).map((r) => {
                  const whoText = who(r);
                  const sid = reqShortId(r.id);
                  const st = String(r?.state) === "new" ? "in_progress" : String(r?.state);
                  return (
                    <button key={r.id} type="button" className="vx-reqRow" onClick={() => openReqDetails(String(r.id))}>
                      <div className="vx-reqTop">
                        <b>#{sid}</b>
                        <span className="vx-muted">{fmtDt(r.created_at)}</span>
                      </div>
                      <div className="vx-muted">{whoText}</div>
                      <div>
                        <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                        <span className="vx-tag">{stateRu(st)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}

          {reqView === "rejected" ? (
            reqRejected.length === 0 ? (
              <div className="vx-muted">Отклонённых заявок нет.</div>
            ) : (
              <div className="vx-reqList">
                {reqRejected.slice(0, 120).map((r) => {
                  const whoText = who(r);
                  const sid = reqShortId(r.id);
                  return (
                    <button key={r.id} type="button" className="vx-reqRow" onClick={() => openReqDetails(String(r.id))}>
                      <div className="vx-reqTop">
                        <b>#{sid}</b>
                        <span className="vx-muted">{fmtDt(r.created_at)}</span>
                      </div>
                      <div className="vx-muted">{whoText}</div>
                      <div>
                        <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                        <span className="vx-tag">{stateRu(r.state)}</span>
                        
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : null}

          {reqView === "history" ? (
            <>
              <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 160px" }}>
                  <div className="vx-muted">С</div>
                  <input className="input vx-in" type="date" value={reqHistFrom} onChange={(e) => setReqHistFrom(e.target.value)} />
                </div>
                <div style={{ flex: "1 1 160px" }}>
                  <div className="vx-muted">По</div>
                  <input className="input vx-in" type="date" value={reqHistTo} onChange={(e) => setReqHistTo(e.target.value)} />
                </div>
              </div>

              <div className="vx-sp10" />

              {reqHistory.length === 0 ? (
                <div className="vx-muted">В выбранном диапазоне нет заявок.</div>
              ) : (
                <div className="vx-reqList">
                  {reqHistory.slice(0, 200).map((r) => {
                    const whoText = who(r);
                    const sid = reqShortId(r.id);
                    return (
                      <button key={r.id} type="button" className="vx-reqRow" onClick={() => openReqDetails(String(r.id))}>
                        <div className="vx-reqTop">
                          <b>#{sid}</b>
                          <span className="vx-muted">{fmtDt(r.created_at)}</span>
                        </div>
                        <div className="vx-muted">{whoText}</div>
                        <div>
                          <span className="vx-tag">{r.sellCurrency}→{r.buyCurrency}</span>
                          <span className="vx-tag">{stateRu(r.state)}</span>
                          
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}

          {reqView === "detail" ? (
            !reqSelected ? (
              <>
                <button className="btn vx-btnSm" type="button" onClick={() => setReqView("active")}>← Назад</button>
                <div className="vx-sp10" />
                <div className="vx-muted">Заявка не найдена.</div>
              </>
            ) : (
              <>
                <div className="row vx-between vx-center">
                  <button className="btn vx-btnSm" type="button" onClick={() => setReqView("active")}>← Назад</button>
                  <div className="vx-muted">{fmtDt(reqSelected.created_at)}</div>
                </div>

                <div className="vx-sp10" />
                <div className="h3 vx-m0">Заявка #{reqShortId(reqSelected.id)}</div>
                <div className="vx-muted" style={{ marginTop: 4 }}>
                  Клиент: {selectedUsername ? "@" + selectedUsername : ""} {selectedTgId ? "• id:" + selectedTgId : ""}
                </div>
                <div className="vx-sp10" />
                <div style={{ display: "grid", gap: 6 }}>
                  <div>🔁 <b>{reqSelected.sellCurrency} → {reqSelected.buyCurrency}</b></div>
                  <div>💸 Отдаёт: <b>{reqSelected.sellAmount}</b></div>
                  <div>🎯 Получит: <b>{reqSelected.buyAmount}</b></div>
                  <div>💳 Оплата: <b>{methodRu(reqSelected.payMethod)}</b></div>
                  <div>📦 Получение: <b>{methodRu(reqSelected.receiveMethod)}</b></div>
                  {reqSelected.comment ? <div>📝 Комментарий: <b>{reqSelected.comment}</b></div> : null}
                  {reqSelected.attachmentImageUrl ? (
                    <div className="vx-requestAttachmentBlock">
                      <div className="vx-requestAttachmentLabel">📎 Прикреплённое фото</div>
                      <a
                        className="vx-requestAttachmentViewer"
                        href={String(reqSelected.attachmentImageUrl)}
                        target="_blank"
                        rel="noreferrer"
                        title="Открыть прикреплённое фото"
                      >
                        <img className="vx-requestAttachmentViewerImg" src={String(reqSelected.attachmentImageUrl)} alt="" />
                      </a>
                    </div>
                  ) : null}
                  {reqSelected.language ? <div>🌐 Язык: <b>{reqSelected.language === "en" ? "English" : "Русский"}</b></div> : null}
                  {reqSelected.clientContact ? <div>☎️ Контакт: <b>{reqSelected.clientContact}</b></div> : null}
                </div>

                <div className="hr" />

                <div className="small">Статус</div>
                <div className="vx-sp8" />
                <div className="row vx-rowWrap vx-gap6">
                  <button className={"btn vx-btnSm " + ((String(reqSelected.state) === "new" || String(reqSelected.state) === "in_progress") ? "vx-btnOn" : "")} onClick={() => setReqState("in_progress")}>В работе</button>
                  <button className={"btn vx-btnSm " + (String(reqSelected.state) === "done" ? "vx-btnOn" : "")} onClick={() => setReqState("done")}>Готово</button>
                  <button className={"btn vx-btnSm " + (String(reqSelected.state) === "canceled" ? "vx-btnOn" : "")} onClick={() => setReqState("canceled")}>Отклонена</button>
                </div>

                <div className="hr" />

                <div className="small">Контакт клиента</div>
                <div className="vx-sp8" />
                <input className="input vx-in" value={reqFullName} onChange={(e) => setReqFullName(e.target.value)} placeholder="Имя клиента (как подписывает админ)" />

                <div className="vx-sp10" />
                <div className="small">Банки</div>
                {bankIcons.length === 0 ? (
                  <div className="vx-muted">Иконок нет (файлы в webapp/public/banks).</div>
                ) : (
                  <div className="vx-bankGrid">
                    {bankIcons.map((ic) => {
                      const on = reqBanks.includes(ic);
                      return (
                        <button
                          key={ic}
                          type="button"
                          className={"vx-bankBtn " + (on ? "is-on" : "")}
                          onClick={() => toggleReqBank(ic)}
                          title={ic}
                        >
                          <img src={bankIconUrl(ic)} alt="" className="vx-bankImg" onError={(e) => { const p = (e.currentTarget as HTMLImageElement).parentElement as HTMLElement | null; if (p) p.style.display = "none"; }} />
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="vx-sp10" />
                <button className="btn" type="button" onClick={saveReqContact}>Сохранить контакт</button>
              </>
            )
          ) : null}
        </div>
      ) : null}


      {tab === "afisha" ? (
        <>
          <div className="card">
            <div className="row vx-between vx-center">
              <div className="h3 vx-m0">Афиша</div>
              <button className="btn vx-btnSm" type="button" onClick={loadAfishaLists} disabled={afLoading}>
                {afLoading ? "Обновляю…" : "Обновить"}
              </button>
            </div>

            <div className="vx-sp10" />
            <div className="small"><b>Новое мероприятие</b></div>

            <div className="vx-sp10" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: "1 1 260px", display: "flex", gap: 8, flexWrap: "wrap" }}>
                {AF_CATS.map((c) => {
                  const on = afCreateCats.includes(c.k);
                  const disabled = !on && afCreateCats.length >= 3;
                  return (
                    <button
                      key={c.k}
                      type="button"
                      className={"btn vx-btnSm " + (on ? "vx-btnOn" : "")}
                      disabled={disabled}
                      onClick={() => {
                        setAfCreateCats((prev) => {
                          const has = prev.includes(c.k);
                          if (has) return prev.length <= 1 ? prev : prev.filter((x) => x !== c.k);
                          if (prev.length >= 3) return prev;
                          return [...prev, c.k];
                        });
                      }}
                      title={disabled ? "Максимум 3 категории" : ""}
                    >
                      {c.l}
                    </button>
                  );
                })}
              </div>
              <input className="input vx-in" type="date" value={afCreateDate} onChange={(e) => setAfCreateDate(e.target.value)} style={{ flex: "0 0 170px" }} />
              <input className="input vx-in" type="time" value={afCreateTime} onChange={(e) => setAfCreateTime(e.target.value)} style={{ flex: "0 0 130px" }} />
            </div>
            <div className="vx-muted" style={{ marginTop: 6 }}>Можно выбрать до 3 категорий</div>

            <div className="vx-sp8" />
            <input className="input vx-in" value={afCreateTitle} onChange={(e) => setAfCreateTitle(e.target.value)} placeholder="Название мероприятия" />

            <div className="vx-sp8" />
            <textarea
              className="input vx-in"
              value={afCreateComment}
              onChange={(e) => setAfCreateComment(e.target.value)}
              placeholder="Комментарий (покажется у клиента под названием)"
              rows={3}
              style={{ resize: 'vertical' }}
            />

            <div className="vx-sp10" />
            <div className="vx-muted">Фото мероприятия (будет фоном карточки у клиента)</div>
            <div className="vx-sp6" />
            <div className="vx-rowWrap" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    const prepared = await prepareAfishaUpload(f);
                    setAfCreateImageDataUrl(prepared.imageDataUrl || null);
                    setAfCreatePreviewImageDataUrl(prepared.previewImageDataUrl || prepared.imageDataUrl || null);
                  } catch {
                    showErr("Не удалось подготовить изображение");
                  }
                }}
              />
              {afCreateImageDataUrl ? (
                <button
                  className="btn vx-btnSm"
                  type="button"
                  onClick={() => {
                    setAfCreateImageDataUrl(null);
                    setAfCreatePreviewImageDataUrl(null);
                  }}
                >
                  Убрать фото
                </button>
              ) : null}
              {afCreateImageDataUrl ? <img className="vx-pubThumb" src={afCreateImageDataUrl} alt="" /> : null}
            </div>

            <div className="vx-sp10" />
            <div className="vx-muted">Ссылка для кнопки «Подробнее» (страница/пост о мероприятии)</div>
            <div className="vx-sp6" />
            <input className="input vx-in" value={afCreateDetailsUrl} onChange={(e) => setAfCreateDetailsUrl(e.target.value)} placeholder="https://..." />

            <div className="vx-sp10" />
            <div className="vx-muted">Ссылка для кнопки «Локация» (Google Maps / 2GIS / etc.)</div>
            <div className="vx-sp6" />
            <input className="input vx-in" value={afCreateLocationUrl} onChange={(e) => setAfCreateLocationUrl(e.target.value)} placeholder="https://..." />

            <div className="vx-sp10" />
            <button className="btn" type="button" onClick={createAfisha}>Создать</button>
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="row vx-between vx-center">
              <div className="small"><b>Активные</b></div>
              <div className="vx-muted">{afActive.length}</div>
            </div>

            <div className="vx-sp10" />

            {afActive.length === 0 ? (
              <div className="vx-muted">Активных мероприятий нет.</div>
            ) : (
              <div className="vx-reqList">
                {afActive.map((ev) => {
                  const clicks = ev?.clicks || { details: 0, location: 0 };
                  const total = Number(clicks.details || 0) + Number(clicks.location || 0);
                  const isOn = afEditId === String(ev.id);
                  return (
                    <div key={ev.id}>
                      <button
                        type="button"
                        className={"vx-reqRow " + (isOn ? "is-active" : "")}
                        onClick={() => toggleEditAfisha(ev)}
                      >
                        <div className="vx-reqTop">
                          <b>{fmtAfDateTime(ev)}</b>
                          <span className="vx-muted">{afCatsLabel(ev)}</span>
                        </div>
                        <div><b>{String(ev.title || "")}</b></div>
                        <div className="vx-muted">Клики: {total} (Подробнее {Number(clicks.details || 0)}, Локация {Number(clicks.location || 0)})</div>
                      </button>

                      {isOn ? (
                        <div className="vx-reqExpand">
                          {renderAfishaEditForm()}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="vx-sp12" />

          <div className="card">
            <div className="row vx-between vx-center" style={{ gap: 10 }}>
              <div className="small"><b>История</b></div>
              <button className="btn vx-btnSm" type="button" onClick={loadAfishaLists} disabled={afLoading}>
                {afLoading ? "…" : "Обновить"}
              </button>
            </div>

            <div className="vx-sp10" />

            <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <div className="vx-muted">С</div>
                <input className="input vx-in" type="date" value={afHistFrom} onChange={(e) => setAfHistFrom(e.target.value)} />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <div className="vx-muted">По</div>
                <input className="input vx-in" type="date" value={afHistTo} onChange={(e) => setAfHistTo(e.target.value)} />
              </div>
            </div>

            <div className="vx-sp10" />

            {afHistory.length === 0 ? (
              <div className="vx-muted">В выбранном диапазоне нет мероприятий.</div>
            ) : (
              <div className="vx-reqList">
                {afHistory.map((ev) => {
                  const clicks = ev?.clicks || { details: 0, location: 0 };
                  const total = Number(clicks.details || 0) + Number(clicks.location || 0);
                  const isOn = afEditId === String(ev.id);
                  return (
                    <div key={ev.id}>
                      <button
                        type="button"
                        className={"vx-reqRow " + (isOn ? "is-active" : "")}
                        onClick={() => toggleEditAfisha(ev)}
                      >
                        <div className="vx-reqTop">
                          <b>{fmtAfDateTime(ev)}</b>
                          <span className="vx-muted">{afCatsLabel(ev)}</span>
                        </div>
                        <div><b>{String(ev.title || "")}</b></div>
                        <div className="vx-muted">Клики: {total} (Подробнее {Number(clicks.details || 0)}, Локация {Number(clicks.location || 0)})</div>
                      </button>

                      {isOn ? (
                        <div className="vx-reqExpand">
                          {renderAfishaEditForm()}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      
{tab === "faq" ? (
  <div className="card">
    <div className="row vx-between vx-center" style={{ gap: 10, flexWrap: "wrap" }}>
      <div>
        <div className="h2">FAQ</div>
        <div className="small" style={{ opacity: 0.85 }}>
          Клиент видит русский FAQ в русском приложении и английский FAQ при включённом EN.
        </div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="btn vx-btnSm" type="button" onClick={addFaqItem}>
          Добавить
        </button>
        <button className="btn" type="button" onClick={saveFaq} disabled={faqSaving}>
          {faqSaving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>

    <div className="vx-sp12" />

    {faqLoading ? <div className="small">Загрузка…</div> : null}

    {(!faqItems || faqItems.length === 0) && !faqLoading ? (
      <div className="small" style={{ opacity: 0.8 }}>
        Пока пусто. Нажми «Добавить».
      </div>
    ) : null}

    {(faqItems || []).map((it, i) => (
      <div key={it.id} className="vx-faqRow">
        <div className="row vx-between vx-center" style={{ gap: 10 }}>
          <div className="small" style={{ fontWeight: 900 }}>
            Вопрос #{i + 1}
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn vx-btnXs" type="button" onClick={() => moveFaq(it.id, -1)} disabled={i === 0}>
              ↑
            </button>
            <button
              className="btn vx-btnXs"
              type="button"
              onClick={() => moveFaq(it.id, 1)}
              disabled={i === faqItems.length - 1}
            >
              ↓
            </button>
            <button
              className="btn vx-btnXs"
              type="button"
              onClick={() => setFaqItems((prev) => (prev || []).filter((x) => x.id !== it.id))}
            >
              Удалить
            </button>
          </div>
        </div>

        <div className="vx-sp6" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <div>
            <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>Русский</div>
            <input
              className="input vx-in"
              value={it.q_ru}
              onChange={(e) =>
                setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, q_ru: e.target.value } : x)))
              }
              placeholder="Вопрос на русском…"
            />
            <div className="vx-sp6" />
            <textarea
              className="input vx-in"
              value={it.a_ru}
              onChange={(e) =>
                setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, a_ru: e.target.value } : x)))
              }
              placeholder="Ответ на русском…"
              rows={4}
            />
          </div>

          <div>
            <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>English</div>
            <input
              className="input vx-in"
              value={it.q_en}
              onChange={(e) =>
                setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, q_en: e.target.value } : x)))
              }
              placeholder="Question in English…"
            />
            <div className="vx-sp6" />
            <textarea
              className="input vx-in"
              value={it.a_en}
              onChange={(e) =>
                setFaqItems((prev) => (prev || []).map((x) => (x.id === it.id ? { ...x, a_en: e.target.value } : x)))
              }
              placeholder="Answer in English…"
              rows={4}
            />
          </div>
        </div>

        <div className="vx-sp12" />
      </div>
    ))}
  </div>
) : null}

{tab === "cashbox" ? (
        <div className="card">
          <div className="small"><b>Калькулятор прибыли (КАССА)</b></div>
          <div className="vx-muted" style={{ marginTop: 6 }}>
            Логика как в твоей таблице: <b>КАССА = (ценность того, что клиент отдал) − (ценность того, что клиент получил)</b>, в VND.
            Для оценки используем курсы <b>sell_vnd</b> (вход) и <b>buy_vnd</b> (выход).
            <b>Главное:</b> ты можешь поставить разные цены <b>по дням</b> (как в Excel) и/или поправить курс <b>по конкретной сделке</b>.
          </div>

          <div className="vx-sp10" />

          <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">С</div>
              <input className="input vx-in" type="date" value={cashFrom} onChange={(e) => setCashFrom(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">По</div>
              <input className="input vx-in" type="date" value={cashTo} onChange={(e) => setCashTo(e.target.value)} />
            </div>
          </div>

          <label className="vx-checkRow">
            <input type="checkbox" checked={cashOnlyDone} onChange={(e) => setCashOnlyDone(e.target.checked)} />
            <span>Только «Готово»</span>
          </label>

          <label className="vx-checkRow">
            <input type="checkbox" checked={cashUseHistoryRates} onChange={(e) => setCashUseHistoryRates(e.target.checked)} />
            <span>Подставлять курсы по датам (из вкладки «Курс»)</span>
          </label>

          <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button className="btn" type="button" onClick={loadCashbox} disabled={cashLoading}>
              {cashLoading ? "Загрузка..." : "Пересчитать"}
            </button>
            <button
              className="btn vx-btnSm"
              type="button"
              onClick={() => {
                setCashOverrides({});
                showOk("Сброшены ручные курсы по сделкам");
              }}
            >
              Сбросить ручные (сделки)
            </button>
          </div>

          <div className="vx-sp12" />

          <div className="small"><b>Курсы по умолчанию (VND за 1 единицу)</b></div>
          <div className="vx-muted" style={{ marginTop: 6 }}>
            <b>buy_vnd</b> — по этому курсу мы <u>покупаем</u> валюту у клиента (это себестоимость). <b>sell_vnd</b> — по этому курсу мы <u>продаём</u> валюту.
          </div>

          <div className="vx-sp10" />
          <div className="vx-tableWrap">
            <table className="vx-table">
              <thead>
                <tr>
                  <th>Валюта</th>
                  <th>buy_vnd</th>
                  <th>sell_vnd</th>
                </tr>
              </thead>
              <tbody>
                {(["RUB", "USD", "USDT", "EUR", "THB"] as const).map((cur) => (
                  <tr key={cur}>
                    <td><b>{cur}</b></td>
                    <td>
                      <input
                        className="input vx-in"
                        inputMode="decimal"
                        value={(cashDefaultRates as any)?.[cur]?.buy ?? ""}
                        onChange={(e) =>
                          setCashDefaultRates((prev) => ({
                            ...(prev || {}),
                            [cur]: { buy: e.target.value, sell: (prev as any)?.[cur]?.sell ?? "" },
                          }))
                        }
                        placeholder="0"
                      />
                    </td>
                    <td>
                      <input
                        className="input vx-in"
                        inputMode="decimal"
                        value={(cashDefaultRates as any)?.[cur]?.sell ?? ""}
                        onChange={(e) =>
                          setCashDefaultRates((prev) => ({
                            ...(prev || {}),
                            [cur]: { buy: (prev as any)?.[cur]?.buy ?? "", sell: e.target.value },
                          }))
                        }
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="vx-sp12" />

          <div className="small"><b>По дням: объём и курсы</b></div>
          <div className="vx-muted" style={{ marginTop: 6 }}>
            Здесь можно выбрать день и указать, <b>по какой цене</b> ты покупал/продавал валюту. Эти курсы автоматически подставятся во все сделки этого дня.
          </div>

          {cashByDay.length ? (
            <div style={{ marginTop: 10 }}>
              {cashByDay.slice(0, 31).map((d: any) => {
                const day = String(d.date || "");
                const draft = (cashDayDraft as any)?.[day] || {};
                const saving = !!(cashDaySaving as any)?.[day];
                const sellEntries = Object.entries(d.sell || {}).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));
                const buyEntries = Object.entries(d.buy || {}).sort((a: any, b: any) => Number(b[1]) - Number(a[1]));

                return (
                  <div key={day} className="vx-metricCard" style={{ marginBottom: 10 }}>
                    <div className="row vx-between vx-center" style={{ gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 950 }}>{day}</div>
                        <div className="vx-muted" style={{ marginTop: 2 }}>
                          Сделок: <b>{fmtNum(d.cnt)}</b> · Прибыль: <b>{fmtNum(d.profit)}</b> VND
                        </div>
                      </div>
                      <button className="btn vx-btnSm" type="button" onClick={() => saveCashDayRates(day)} disabled={saving}>
                        {saving ? "Сохраняю…" : "Сохранить курс"}
                      </button>
                    </div>

                    <div className="vx-sp10" />

                    <div className="vx-muted">Отдал:</div>
                    <div className="vx-chipRow">
                      {sellEntries.length ? (
                        sellEntries.slice(0, 12).map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                      ) : (
                        <span className="vx-muted">–</span>
                      )}
                    </div>

                    <div className="vx-sp10" />

                    <div className="vx-muted">Получил:</div>
                    <div className="vx-chipRow">
                      {buyEntries.length ? (
                        buyEntries.slice(0, 12).map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                      ) : (
                        <span className="vx-muted">–</span>
                      )}
                    </div>

                    <div className="vx-sp10" />

                    <div className="vx-tableWrap">
                      <table className="vx-table">
                        <thead>
                          <tr>
                            <th>Валюта</th>
                            <th>buy_vnd</th>
                            <th>sell_vnd</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["RUB", "USD", "USDT", "EUR", "THB"] as const).map((cur) => (
                            <tr key={cur}>
                              <td><b>{cur}</b></td>
                              <td>
                                <input
                                  className="input vx-in"
                                  inputMode="decimal"
                                  value={String((draft as any)?.[cur]?.buy ?? "")}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCashDayDraft((prev) => {
                                      const next: any = { ...(prev || {}) };
                                      const dayObj: any = { ...(next[day] || {}) };
                                      const curObj: any = { ...(dayObj[cur] || {}) };
                                      curObj.buy = v;
                                      dayObj[cur] = curObj;
                                      next[day] = dayObj;
                                      return next;
                                    });
                                  }}
                                  placeholder={String((cashDefaultRates as any)?.[cur]?.buy || "0")}
                                />
                              </td>
                              <td>
                                <input
                                  className="input vx-in"
                                  inputMode="decimal"
                                  value={String((draft as any)?.[cur]?.sell ?? "")}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCashDayDraft((prev) => {
                                      const next: any = { ...(prev || {}) };
                                      const dayObj: any = { ...(next[day] || {}) };
                                      const curObj: any = { ...(dayObj[cur] || {}) };
                                      curObj.sell = v;
                                      dayObj[cur] = curObj;
                                      next[day] = dayObj;
                                      return next;
                                    });
                                  }}
                                  placeholder={String((cashDefaultRates as any)?.[cur]?.sell || "0")}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="vx-muted" style={{ marginTop: 10 }}>Нет сделок за выбранный период.</div>
          )}

          <div className="vx-sp12" />

          <div className="small"><b>Итоги</b></div>
          <div className="vx-metricGrid">
            <div className="vx-metricCard">
              <div className="vx-muted">Сделок</div>
              <div className="vx-metricVal">{fmtNum(cashComputed.total)}</div>
            </div>
            <div className="vx-metricCard">
              <div className="vx-muted">Прибыль (VND)</div>
              <div className="vx-metricVal">{fmtNum(cashComputed.totalProfit)}</div>
            </div>
            <div className="vx-metricCard">
              <div className="vx-muted">Без курсов</div>
              <div className="vx-metricVal">{fmtNum(cashComputed.missing)}</div>
              <div className="vx-muted" style={{ marginTop: 4, fontSize: 12 }}>
                Если есть «Без курсов» — заполни курсы по умолчанию или поправь конкретные сделки.
              </div>
            </div>
          </div>

          <div className="vx-sp12" />
          <div className="small"><b>Сделки</b></div>
          <div className="vx-muted">Показано: {cashComputed.rows.length || 0}</div>

          {cashComputed.rows.length ? (
            <div className="vx-tableWrap">
              <table className="vx-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Клиент</th>
                    <th>Пара</th>
                    <th>Отдал</th>
                    <th>Получил</th>
                    <th>Курс входа (sell_vnd)</th>
                    <th>Курс выхода (buy_vnd)</th>
                    <th>КАССА (VND)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cashComputed.rows.slice(0, 300).map((x: any) => (
                    <tr key={x.id}>
                      <td>{x.dateKey ? x.dateKey : fmtDt(x.created_at)}</td>
                      <td>{x.who}</td>
                      <td>{x.sellCur} → {x.buyCur}</td>
                      <td>{fmtNum(x.sellAmount)} {x.sellCur}</td>
                      <td>{fmtNum(x.buyAmount)} {x.buyCur}</td>
                      <td>
                        {x.sellCur === "VND" ? (
                          <span className="vx-muted">–</span>
                        ) : (
                          <input
                            className="input vx-in"
                            inputMode="decimal"
                            value={x.inValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCashOverrides((prev) => {
                                const next = { ...(prev || {}) } as any;
                                const cur = { ...(next[x.id] || {}) };
                                if (!String(v || "").trim()) delete cur.in;
                                else cur.in = v;
                                if (!cur.in && !cur.out) delete next[x.id];
                                else next[x.id] = cur;
                                return next;
                              });
                            }}
                            placeholder={fmtRate(x.inAuto)}
                          />
                        )}
                      </td>
                      <td>
                        {x.buyCur === "VND" ? (
                          <span className="vx-muted">–</span>
                        ) : (
                          <input
                            className="input vx-in"
                            inputMode="decimal"
                            value={x.outValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              setCashOverrides((prev) => {
                                const next = { ...(prev || {}) } as any;
                                const cur = { ...(next[x.id] || {}) };
                                if (!String(v || "").trim()) delete cur.out;
                                else cur.out = v;
                                if (!cur.in && !cur.out) delete next[x.id];
                                else next[x.id] = cur;
                                return next;
                              });
                            }}
                            placeholder={fmtRate(x.outAuto)}
                          />
                        )}
                      </td>
                      <td>
                        {x.profitOk ? (
                          <b style={{ color: x.profit < 0 ? "#c0392b" : undefined }}>{fmtNum(x.profit)}</b>
                        ) : (
                          <span className="vx-muted">–</span>
                        )}
                      </td>
                      <td>
                        {cashOverrides?.[x.id] ? (
                          <button
                            className="btn vx-btnSm"
                            type="button"
                            onClick={() =>
                              setCashOverrides((prev) => {
                                const next = { ...(prev || {}) } as any;
                                delete next[x.id];
                                return next;
                              })
                            }
                          >
                            Сброс
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vx-muted">Нет сделок за выбранный период.</div>
          )}
        </div>
      ) : null}

      {tab === "reports" ? (
        <div className="card">
          <div className="small"><b>Отчёты</b></div>
          <div className="vx-sp10" />

          <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">С</div>
              <input className="input vx-in" type="date" value={repFrom} onChange={(e) => setRepFrom(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">По</div>
              <input className="input vx-in" type="date" value={repTo} onChange={(e) => setRepTo(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">tg_id (опц.)</div>
              <input className="input vx-in" value={repTgId} onChange={(e) => setRepTgId(e.target.value)} placeholder="123456" />
            </div>
          </div>

          <label className="vx-checkRow">
            <input type="checkbox" checked={repOnlyDone} onChange={(e) => setRepOnlyDone(e.target.checked)} />
            <span>Только «Готово»</span>
          </label>

          <button className="btn" type="button" onClick={runReport}>
            Показать
          </button>

          {report?.ok ? (
            <div className="vx-sp10">
              <div className="small"><b>Метрики</b></div>
              <div className="vx-metricGrid">
                <div className="vx-metricCard">
                  <div className="vx-muted">Всего сделок</div>
                  <div className="vx-metricVal">{fmtNum(report.metrics?.total)}</div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Статусы</div>
                  <div className="vx-metricLine">Принята: <b>{fmtNum(report.metrics?.states?.new)}</b></div>
                  <div className="vx-metricLine">В работе: <b>{fmtNum(report.metrics?.states?.in_progress)}</b></div>
                  <div className="vx-metricLine">Готово: <b>{fmtNum(report.metrics?.states?.done)}</b></div>
                  <div className="vx-metricLine">Отклонена: <b>{fmtNum(report.metrics?.states?.canceled)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Оплата</div>
                  <div className="vx-metricLine">Наличные: <b>{fmtNum(report.metrics?.pay?.cash)}</b></div>
                  <div className="vx-metricLine">Перевод: <b>{fmtNum(report.metrics?.pay?.transfer)}</b></div>
                  <div className="vx-metricLine">Другое: <b>{fmtNum(report.metrics?.pay?.other)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Получение</div>
                  <div className="vx-metricLine">Наличные: <b>{fmtNum(report.metrics?.receive?.cash)}</b></div>
                  <div className="vx-metricLine">Перевод: <b>{fmtNum(report.metrics?.receive?.transfer)}</b></div>
                  <div className="vx-metricLine">Банкомат: <b>{fmtNum(report.metrics?.receive?.atm)}</b></div>
                  <div className="vx-metricLine">Другое: <b>{fmtNum(report.metrics?.receive?.other)}</b></div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Отдаёт (валюта)</div>
                  <div className="vx-chipRow">
                    {Object.entries(report.metrics?.sellCurrency || {}).length ? (
                      Object.entries(report.metrics?.sellCurrency || {})
                        .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
                        .map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                    ) : (
                      <span className="vx-muted">–</span>
                    )}
                  </div>
                </div>

                <div className="vx-metricCard">
                  <div className="vx-muted">Получает (валюта)</div>
                  <div className="vx-chipRow">
                    {Object.entries(report.metrics?.buyCurrency || {}).length ? (
                      Object.entries(report.metrics?.buyCurrency || {})
                        .sort((a: any, b: any) => Number(b[1]) - Number(a[1]))
                        .map(([k, v]: any) => (
                          <span key={k} className="vx-chip">{k}: <b>{fmtNum(v)}</b></span>
                        ))
                    ) : (
                      <span className="vx-muted">–</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="vx-sp12" />
              <div className="small"><b>Сделки</b></div>
              <div className="vx-muted">Показано: {report.requests?.length || 0}</div>

              {Array.isArray(report.requests) && report.requests.length ? (
                <div className="vx-tableWrap">
                  <table className="vx-table">
                    <thead>
                      <tr>
                        <th>Дата</th>
                        <th>Клиент</th>
                        <th>Пара</th>
                        <th>Отдал</th>
                        <th>Получил</th>
                        <th>Оплата</th>
                        <th>Получение</th>
                        <th>Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.requests.slice(0, 200).map((r: any) => (
                        <tr key={r.id}>
                          <td>{fmtDt(r.created_at)}</td>
                          <td>{who(r)}</td>
                          <td>{String(r.sellCurrency)} → {String(r.buyCurrency)}</td>
                          <td>{fmtNum(r.sellAmount)}</td>
                          <td>{fmtNum(r.buyAmount)}</td>
                          <td>{methodRu(r.payMethod)}</td>
                          <td>{methodRu(r.receiveMethod)}</td>
                          <td><b>{stateRu(r.state)}</b></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="vx-muted">Нет сделок за выбранный период.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === "analytics" ? (
        <div className="card">
          <div className="small"><b>Статистика</b></div>
          <div className="vx-sp10" />

          <div className="vx-rowWrap" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">С</div>
              <input className="input vx-in" type="date" value={anFrom} onChange={(e) => setAnFrom(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <div className="vx-muted">По</div>
              <input className="input vx-in" type="date" value={anTo} onChange={(e) => setAnTo(e.target.value)} />
            </div>
          </div>

          <button className="btn" type="button" onClick={loadAnalytics} disabled={anLoading}>
            {anLoading ? "Загрузка..." : "Показать"}
          </button>

          {!anData ? (
            <div className="vx-muted">
              Данных пока нет. Открой клиентское приложение и покликай вкладки/кнопки — события появятся здесь.
            </div>
          ) : anData.db === false ? (
            <div className="vx-muted">База не подключена (DATABASE_URL).</div>
          ) : (
            <>
              <div className="vx-sp10" />
              <div className="small"><b>Итоги</b></div>

              <div className="vx-metricGrid">
                <div className="vx-metricCard">
                  <div className="vx-muted">Действия</div>
                  <div className="vx-metricVal">{fmtNum(anData?.totals?.events)}</div>
                  <div className="vx-muted" style={{ marginTop: 4, fontSize: 12 }}>Все зафиксированные события приложения за период.</div>
                </div>
                <div className="vx-metricCard">
                  <div className="vx-muted">Пользователей всего</div>
                  <div className="vx-metricVal">{fmtNum((anData as any)?.totals?.all_users)}</div>
                  <div className="vx-muted" style={{ marginTop: 4, fontSize: 12 }}>Все пользователи, которые когда-либо открывали приложение.</div>
                </div>
                <div className="vx-metricCard">
                  <div className="vx-muted">Уникальных за период</div>
                  <div className="vx-metricVal">{fmtNum(anData?.totals?.users)}</div>
                  <div className="vx-muted" style={{ marginTop: 4, fontSize: 12 }}>Сколько разных пользователей было активно в выбранные даты.</div>
                </div>
                <div className="vx-metricCard">
                  <div className="vx-muted">Запусков (сессий)</div>
                  <div className="vx-metricVal">{fmtNum(anData?.totals?.sessions)}</div>
                  <div className="vx-muted" style={{ marginTop: 4, fontSize: 12 }}>
                    Сессия = один запуск приложения (session_id). Один пользователь может запускать приложение много раз.
                  </div>
                </div>
              </div>

              <div className="vx-sp10" />
              <div className="small"><b>Переходы по вкладкам</b></div>
              <div className="vx-muted" style={{ marginTop: 4 }}>Показывает, какие экраны открывали пользователи чаще всего.</div>
              <div className="vx-chipRow">
                {Array.isArray(anData?.byScreen) && anData.byScreen.length ? (
                  anData.byScreen.slice(0, 30).map((x: any) => (
                    <span key={x.screen} className="vx-chip">{screenLabel(x.screen)}: <b>{fmtNum(x.cnt)}</b></span>
                  ))
                ) : (
                  <span className="vx-muted">–</span>
                )}
              </div>

              <div className="vx-sp10" />
              <div className="small"><b>Клики</b></div>
              <div className="vx-muted" style={{ marginTop: 4 }}>Показывает на какие кнопки и элементы внутри приложения нажимали пользователи.</div>
              <div className="vx-chipRow">
                {Array.isArray(anData?.byClick) && anData.byClick.length ? (
                  anData.byClick.slice(0, 50).map((x: any) => (
                    <span key={x.target} className="vx-chip">{clickLabel(x.target)}: <b>{fmtNum(x.cnt)}</b></span>
                  ))
                ) : (
                  <span className="vx-muted">–</span>
                )}
              </div>

              <div className="vx-sp10" />
              <div className="small"><b>События</b></div>
              <div className="vx-muted" style={{ marginTop: 4 }}>Системные события приложения: открытия, возвраты, отправки заявок и другие действия.</div>
              <div className="vx-chipRow">
                {Array.isArray(anData?.byEvent) && anData.byEvent.length ? (
                  anData.byEvent.slice(0, 50).map((x: any) => (
                    <span key={x.event_name} className="vx-chip">{eventLabel(x.event_name)}: <b>{fmtNum(x.cnt)}</b></span>
                  ))
                ) : (
                  <span className="vx-muted">–</span>
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      </div>
    </div>
  );
}
