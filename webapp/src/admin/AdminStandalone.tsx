import React, { useEffect, useMemo, useState } from "react";
import Dashboard from "./Dashboard";

// Standalone admin dashboard for PC.
// Auth is done via ADMIN_WEB_KEY (server env) passed in header x-admin-key.
// This page is meant to be opened in a normal browser: https://<domain>/admin

const LS_KEY = "danang_admin_key";

export default function AdminStandalone() {
  const [adminKey, setAdminKey] = useState<string>(() => {
    try {
      return localStorage.getItem(LS_KEY) || "";
    } catch {
      return "";
    }
  });
  const [input, setInput] = useState(adminKey);

  const authed = useMemo(() => adminKey.trim().length > 0, [adminKey]);

  useEffect(() => {
    try {
      if (adminKey) localStorage.setItem(LS_KEY, adminKey);
      else localStorage.removeItem(LS_KEY);
    } catch {
      // ignore
    }
  }, [adminKey]);

  return (
    <div className="vx-page vx-adminStandalone">
      <div className="bg-danang" aria-hidden="true" />

      <div className="container vx-adminContainer">
        <div className="card vx-topCard">
          <div className="vx-topRow">
            <div className="vx-topText">
              <div className="vx-title">Админка — Обмен валют (Дананг)</div>
              <div className="vx-topSub">Открывается только у владельца. Работает на ПК.</div>
            </div>

            {authed ? (
              <button
                className="btn vx-btnSm"
                type="button"
                onClick={() => {
                  setAdminKey("");
                  setInput("");
                }}
              >
                Выйти
              </button>
            ) : null}
          </div>
        </div>

        {!authed ? (
          <div className="card">
            <div className="h2">Вход</div>
            <div className="small vx-mt6">Введи админ-ключ (переменная сервера <b>ADMIN_WEB_KEY</b>).</div>

            <div className="vx-mt10">
              <input
                className="input"
                type="password"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ADMIN_WEB_KEY"
                autoFocus
              />
            </div>

            <div className="vx-mt10 row vx-rowWrap vx-gap8">
              <button
                className="btn"
                type="button"
                onClick={() => setAdminKey(input.trim())}
                disabled={!input.trim()}
              >
                Войти
              </button>
              <a className="vx-btnGhost" href="/" target="_blank" rel="noreferrer">
                Открыть мини-апп
              </a>
            </div>

            <div className="vx-note vx-mt10">
              Совет: поставь длинный ключ (32+ символа) и храни его только у себя.
            </div>
          </div>
        ) : (
          <Dashboard token={`adminkey:${adminKey}`} />
        )}
      </div>
    </div>
  );
}
