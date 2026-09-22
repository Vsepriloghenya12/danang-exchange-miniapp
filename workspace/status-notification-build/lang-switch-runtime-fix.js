(() => {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith("/admin")) return;

  const mq = typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 380px)") : null;
  let applying = false;

  function currentLang() {
    try {
      const raw = String(document.documentElement.getAttribute("lang") || localStorage.getItem("mx_lang") || "ru").toLowerCase();
      return raw === "en" ? "en" : "ru";
    } catch {
      return "ru";
    }
  }

  function nextLang(lang) {
    return lang === "en" ? "ru" : "en";
  }

  function size() {
    return mq && mq.matches
      ? { side: "52px", short: "24px", gap: "8px", columns: "52px minmax(0,1fr) 52px", rows: "24px 52px", font: "10px" }
      : { side: "56px", short: "26px", gap: "8px", columns: "56px minmax(0,1fr) 56px", rows: "26px 56px", font: "11px" };
  }

  function applyStyles(el, styles) {
    Object.assign(el.style, styles);
  }

  function ensureLangButton(stack) {
    const existing = stack.querySelector(".mx-langSwitchBtn");
    if (existing instanceof HTMLElement) {
      existing.style.display = "none";
      existing.style.visibility = "hidden";
      existing.style.opacity = "0";
      existing.setAttribute("aria-hidden", "true");
      existing.tabIndex = -1;
    }

    let btn = stack.querySelector(".mx-runtimeLangFixBtn");
    if (!(btn instanceof HTMLButtonElement)) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mx-runtimeLangFixBtn";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const next = nextLang(currentLang());
        try {
          localStorage.setItem("mx_lang", next);
          document.documentElement.setAttribute("lang", next);
        } catch {
          // ignore
        }
        window.location.reload();
      });
      stack.insertBefore(btn, stack.firstChild);
    }

    const lang = currentLang();
    const next = nextLang(lang);
    const label = next === "en" ? "EN" : "RU";
    const title = next === "en" ? "Switch to English" : "Switch to Russian";
    const s = size();

    btn.textContent = label;
    btn.setAttribute("aria-label", title);
    btn.title = title;

    applyStyles(btn, {
      gridRow: "1",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: s.side,
      minWidth: s.side,
      maxWidth: s.side,
      height: s.short,
      margin: "0",
      padding: "0",
      border: "none",
      borderRadius: "999px",
      background: "linear-gradient(180deg, rgba(255,255,255,.99) 0%, rgba(246,248,252,.96) 100%)",
      boxShadow: "0 8px 18px rgba(15,23,42,.14), inset 0 1px rgba(255,255,255,.92)",
      color: "rgba(9,23,33,.88)",
      fontSize: s.font,
      fontWeight: "900",
      letterSpacing: ".08em",
      lineHeight: "1",
      cursor: "pointer",
      visibility: "visible",
      opacity: "1",
      position: "relative",
      zIndex: "25"
    });

    if (document.documentElement.getAttribute("data-theme") === "dark") {
      btn.style.background = "linear-gradient(180deg, rgba(31,43,56,.99) 0%, rgba(22,31,41,.98) 100%)";
      btn.style.boxShadow = "0 0 0 1px rgba(246,198,0,.12) inset, 0 0 16px rgba(246,198,0,.08), 0 10px 22px rgba(0,0,0,.34)";
      btn.style.color = "rgba(246,198,0,.98)";
    }

    return btn;
  }

  function apply() {
    if (applying) return;
    applying = true;

    try {
      const row = document.querySelector(".mx-topRow.mx-topRowHome");
      if (!(row instanceof HTMLElement)) return;

      const stack = row.querySelector(".mx-topLeftStack");
      const themeBtn = row.querySelector(".mx-themeBtn");
      const center = row.querySelector(".mx-topCenter");
      const statusBtn = row.querySelector(".mx-statusBtn");
      if (!(stack instanceof HTMLElement) || !(themeBtn instanceof HTMLElement) || !(center instanceof HTMLElement) || !(statusBtn instanceof HTMLElement)) {
        return;
      }

      const s = size();

      applyStyles(row, {
        display: "grid",
        gridTemplateColumns: s.columns,
        gridTemplateRows: s.rows,
        alignItems: "stretch",
        columnGap: "10px",
        rowGap: s.gap,
        paddingLeft: "0",
        overflow: "visible"
      });

      applyStyles(stack, {
        gridColumn: "1",
        gridRow: "1 / span 2",
        display: "grid",
        gridTemplateRows: s.rows.split(" ").join(" "),
        width: s.side,
        minWidth: s.side,
        height: "auto",
        gap: s.gap,
        alignItems: "stretch",
        justifyItems: "stretch",
        alignSelf: "start",
        overflow: "visible",
        position: "relative",
        zIndex: "20"
      });

      applyStyles(themeBtn, {
        gridRow: "2",
        width: s.side,
        minWidth: s.side,
        height: s.side,
        margin: "0"
      });

      applyStyles(center, {
        gridColumn: "2",
        gridRow: "1 / span 2",
        minWidth: "0",
        width: "100%",
        alignSelf: "center",
        justifySelf: "stretch"
      });

      applyStyles(statusBtn, {
        gridColumn: "3",
        gridRow: "2",
        width: s.side,
        minWidth: s.side,
        height: s.side,
        margin: "0",
        alignSelf: "start",
        justifySelf: "end"
      });

      ensureLangButton(stack);
    } finally {
      applying = false;
    }
  }

  const observer = new MutationObserver(() => apply());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (mq && typeof mq.addEventListener === "function") {
    mq.addEventListener("change", apply);
  }

  window.addEventListener("load", apply, { passive: true });
  window.addEventListener("resize", apply, { passive: true });
  window.setInterval(apply, 1200);
  apply();
})();
