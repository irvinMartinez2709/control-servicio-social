/* =============================================================
   ui.js — Tema, splash, toasts, modales y helper de componentes
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const $ = U.$;

  /* ------------------------- SPLASH ------------------------- */
  const splash = {
    el: null,
    show(msg) {
      this.el = this.el || $("#splash");
      if (!this.el) return;
      const hint = this.el.querySelector(".splash__hint");
      if (hint && msg) hint.textContent = msg;
      this.el.classList.remove("is-hidden");
      this.el.style.display = "";
    },
    hide() {
      this.el = this.el || $("#splash");
      if (!this.el) return;
      this.el.classList.add("is-hidden");
      setTimeout(() => { this.el.style.display = "none"; }, 550);
    }
  };

  /* ------------------------- TEMA CLARO / OSCURO ------------------------- */
  const theme = {
    get current() {
      return document.documentElement.getAttribute("data-theme") || "light";
    },
    apply(mode) {
      const resolved = mode === "system" ? (U.systemPrefersDark() ? "dark" : "light") : mode;
      document.documentElement.setAttribute("data-theme", resolved);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", resolved === "dark" ? "#0a0f22" : "#4f46e5");
      const icon = $("#btn-theme i");
      if (icon) icon.className = resolved === "dark" ? "fa-solid fa-sun" : "fa-solid fa-moon";
    },
    init() {
      const stored = SS.store.state.settings.theme;
      this.apply(stored || "system");
      const btn = $("#btn-theme");
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", () => {
          const next = this.current === "dark" ? "light" : "dark";
          this.apply(next);
          SS.store.setSettings({ theme: next });
          toast(next === "dark" ? "Modo oscuro activado" : "Modo claro activado", "info", 1600);
        });
      }
      if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
          if ((SS.store.state.settings.theme || "system") === "system") this.apply("system");
        });
      }
    }
  };

  /* ------------------------- TOASTS ------------------------- */
  const ICONS = {
    success: "fa-circle-check",
    error: "fa-circle-xmark",
    warn: "fa-triangle-exclamation",
    info: "fa-circle-info"
  };

  function toast(message, type, duration, detail) {
    const host = $("#toast-host");
    if (!host) return;
    const kind = type || "info";
    const node = U.html(`
      <div class="toast toast--${kind}" role="alert">
        <i class="fa-solid ${ICONS[kind] || ICONS.info}"></i>
        <div class="toast__text">${U.esc(message)}${detail ? `<small>${U.esc(detail)}</small>` : ""}</div>
      </div>`);
    host.appendChild(node);
    const life = duration || 3600;
    setTimeout(() => {
      node.classList.add("is-out");
      setTimeout(() => node.remove(), 320);
    }, life);
    return node;
  }

  /* ------------------------- MODALES ------------------------- */
  const openModals = [];

  /**
   * Abre un modal reutilizable.
   * @param {object} cfg {title, icon, size, body (Node|html), actions:[{label,icon,class,id}], onAction(id, close), onClose}
   */
  function modal(cfg) {
    const host = $("#modal-host");
    const wrap = U.html(`
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="${U.esc(cfg.title || "Diálogo")}">
        <div class="modal ${cfg.size === "wide" ? "modal--wide" : ""}">
          <div class="modal__head">
            <span class="card__icon ${cfg.iconClass || ""}"><i class="fa-solid ${cfg.icon || "fa-pen"}"></i></span>
            <h3>${U.esc(cfg.title || "")}</h3>
            <button type="button" class="icon-btn modal__close" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>
          </div>
          <div class="modal__body"></div>
          <div class="modal__foot"></div>
        </div>
      </div>`);

    const bodyEl = wrap.querySelector(".modal__body");
    if (cfg.body instanceof Node) bodyEl.appendChild(cfg.body);
    else if (typeof cfg.body === "string") bodyEl.innerHTML = cfg.body;

    const foot = wrap.querySelector(".modal__foot");
    const close = () => {
      wrap.remove();
      const idx = openModals.indexOf(api);
      if (idx >= 0) openModals.splice(idx, 1);
      document.body.style.overflow = "";
      if (cfg.onClose) cfg.onClose();
    };

    (cfg.actions || [{ label: "Cerrar", class: "btn--ghost" }]).forEach((a) => {
      const btn = U.html(`<button type="button" class="btn ${a.class || ""}">${a.icon ? `<i class="fa-solid ${a.icon}"></i>` : ""}${U.esc(a.label)}</button>`);
      btn.addEventListener("click", () => {
        if (a.id && cfg.onAction) cfg.onAction(a.id, close, btn);
        else if (!a.id) close();
      });
      foot.appendChild(btn);
    });

    wrap.querySelector(".modal__close").addEventListener("click", close);
    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    host.appendChild(wrap);
    document.body.style.overflow = "hidden";
    const api = { el: wrap, close, body: bodyEl };
    openModals.push(api);
    const focusable = wrap.querySelector("input, textarea, select, button.btn");
    if (focusable) setTimeout(() => focusable.focus(), 60);
    return api;
  }

  function closeAllModals() {
    openModals.slice().forEach((m) => m.close());
  }

  /** Confirmación nativa reemplazada por diálogo propio */
  function confirm(cfg) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (value) => { if (!settled) { settled = true; resolve(value); } };
      const body = U.html(`
        <div class="gap-row" style="align-items:flex-start;gap:14px">
          <span class="card__icon ${cfg.danger ? "card__icon--danger" : "card__icon--warn"}">
            <i class="fa-solid ${cfg.danger ? "fa-trash-can" : "fa-triangle-exclamation"}"></i>
          </span>
          <div>
            <p class="strong mb-0">${U.esc(cfg.title || "¿Confirmar acción?")}</p>
            <p class="small muted mb-0 mt-1">${U.esc(cfg.message || "")}</p>
          </div>
        </div>`);
      const m = modal({
        title: cfg.heading || "Confirmación",
        icon: cfg.danger ? "fa-trash-can" : "fa-shield-halved",
        iconClass: cfg.danger ? "card__icon--danger" : "card__icon--warn",
        body,
        actions: [
          { label: cfg.cancelLabel || "Cancelar", class: "btn--ghost", id: "cancel" },
          { label: cfg.confirmLabel || "Aceptar", class: cfg.danger ? "btn--danger" : "btn--primary", id: "ok" }
        ],
        onAction: (id, close) => { if (id === "ok") done(true); close(); },
        onClose: () => done(false)
      });
      return m;
    });
  }

  /** Formulario en modal (devuelve promesa con datos o null) */
  function formModal(cfg) {
    return new Promise((resolve) => {
      let settled = false;
      const body = U.html(`<form class="stack" novalidate>${cfg.fields.map(fieldHTML).join("")}</form>`);
      const m = modal({
        title: cfg.title,
        icon: cfg.icon || "fa-pen-to-square",
        size: cfg.size,
        body,
        actions: [
          { label: cfg.cancelLabel || "Cancelar", class: "btn--ghost", id: "cancel" },
          { label: cfg.submitLabel || "Guardar", icon: cfg.submitIcon || "fa-floppy-disk", class: "btn--primary", id: "ok" }
        ],
        onAction: (id, close, btn) => {
          if (id === "cancel") { close(); return; }
          const form = body;
          const data = {};
          let valid = true;
          cfg.fields.forEach((f) => {
            if (f.type === "hidden") return;
            const ctrl = form.querySelector(`[name="${f.name}"]`);
            if (!ctrl) return;
            data[f.name] = ctrl.type === "checkbox" ? ctrl.checked : ctrl.value.trim();
            if (f.required && !data[f.name]) {
              valid = false;
              ctrl.closest(".field").classList.add("has-error");
            } else {
              const fld = ctrl.closest(".field");
              if (fld) fld.classList.remove("has-error");
            }
          });
          if (!valid) { toast("Completa los campos obligatorios", "warn"); return; }
          settled = true;
          btn.setAttribute("aria-disabled", "true");
          Promise.resolve(cfg.onSubmit ? cfg.onSubmit(data) : data)
            .then((res) => {
              if (res === false) { btn.removeAttribute("aria-disabled"); return; }
              close();
              if (res !== undefined && res !== true) resolve(res);
              else resolve(data);
            })
            .catch((err) => {
              btn.removeAttribute("aria-disabled");
              toast(err && err.message ? err.message : "No se pudo completar la operación", "error");
            });
        },
        onClose: () => { if (!settled) resolve(null); }
      });
      return m;
    });
  }

  function fieldHTML(f) {
    const req = f.required ? `<span class="field__error">${U.esc(f.error || "Campo obligatorio")}</span>` : `<span class="field__error">${U.esc(f.error || "")}</span>`;
    if (f.type === "hidden") return `<input type="hidden" name="${f.name}" value="${U.esc(f.value || "")}">`;
    if (f.type === "textarea") {
      return `
        <div class="field">
          <label class="field__label" for="f_${f.name}">${f.icon ? `<i class="fa-solid ${f.icon}"></i>` : ""}${U.esc(f.label)}${f.required ? " *" : ""}</label>
          <textarea class="textarea" id="f_${f.name}" name="${f.name}" placeholder="${U.esc(f.placeholder || "")}">${U.esc(f.value || "")}</textarea>
          ${f.hint ? `<span class="field__hint">${U.esc(f.hint)}</span>` : ""}
          ${req}
        </div>`;
    }
    if (f.type === "select") {
      const opts = (f.options || [])
        .map((o) => `<option value="${U.esc(o.value)}" ${String(o.value) === String(f.value) ? "selected" : ""}>${U.esc(o.label)}</option>`)
        .join("");
      return `
        <div class="field">
          <label class="field__label" for="f_${f.name}">${f.icon ? `<i class="fa-solid ${f.icon}"></i>` : ""}${U.esc(f.label)}${f.required ? " *" : ""}</label>
          <select class="select" id="f_${f.name}" name="${f.name}">${f.placeholder ? `<option value="">${U.esc(f.placeholder)}</option>` : ""}${opts}</select>
          ${f.hint ? `<span class="field__hint">${U.esc(f.hint)}</span>` : ""}
          ${req}
        </div>`;
    }
    const type = f.type || "text";
    return `
      <div class="field">
        <label class="field__label" for="f_${f.name}">${f.icon ? `<i class="fa-solid ${f.icon}"></i>` : ""}${U.esc(f.label)}${f.required ? " *" : ""}</label>
        <input class="input" id="f_${f.name}" name="${f.name}" type="${type}" value="${U.esc(f.value || "")}"
               placeholder="${U.esc(f.placeholder || "")}" ${f.min ? `min="${f.min}"` : ""} ${f.max ? `max="${f.max}"` : ""} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ""}>
        ${f.hint ? `<span class="field__hint">${U.esc(f.hint)}</span>` : ""}
        ${req}
      </div>`;
  }

  /* ------------------------- COMPONENTES DE SOLO LECTURA ------------------------- */
  const STATUS_LABEL = {
    pendiente: "Pendiente",
    aprobado: "Aprobado",
    rechazado: "Rechazado"
  };
  const STATUS_ICON = {
    pendiente: "fa-clock",
    aprobado: "fa-check",
    rechazado: "fa-xmark"
  };
  /** Nombre dinámico de un grupo (data/groups.json + LocalStorage) */
  function groupLabel(id) {
    return SS.store && SS.store.groupName ? SS.store.groupName(id) : (id || "—");
  }

  function statusBadge(status) {
    const s = STATUS_LABEL[status] ? status : "pendiente";
    return `<span class="badge badge--${s}"><i class="fa-solid ${STATUS_ICON[s]}"></i>${STATUS_LABEL[s]}</span>`;
  }
  function groupBadge(group) {
    const cls = group === "cuadro6" ? "badge--cuadro6" : group === "cuadro3" ? "badge--cuadro3" : "badge--group";
    return `<span class="badge ${cls}"><i class="fa-solid fa-people-group"></i>${U.esc(groupLabel(group))}</span>`;
  }
  function roleBadge(role) {
    if (role === "superadmin") return `<span class="badge badge--super"><i class="fa-solid fa-crown"></i>Líder Supremo</span>`;
    if (role === "admin") return `<span class="badge badge--cuadro3"><i class="fa-solid fa-user-shield"></i>Admin</span>`;
    return `<span class="badge badge--role"><i class="fa-solid fa-eye"></i>Visitante</span>`;
  }
  function avatar(name, extra) {
    return `<span class="avatar ${extra || ""}">${U.esc(U.initials(name))}</span>`;
  }
  function emptyState(icon, title, text, actionHTML) {
    return `
      <div class="empty">
        <i class="fa-solid ${icon}"></i>
        <strong>${U.esc(title)}</strong>
        <p>${U.esc(text || "")}</p>
        ${actionHTML || ""}
      </div>`;
  }

  /* ------------------------- FOTO EN MODAL (visor) ------------------------- */
  function viewPhoto(photo) {
    const src = photo.dataUrl || photo.path;
    const wrap = U.html(`
      <div class="viewer">
        <button type="button" class="icon-btn viewer__close" aria-label="Cerrar visor"><i class="fa-solid fa-xmark"></i></button>
        <div class="center">
          ${src ? `<img src="${U.esc(src)}" alt="${U.esc(photo.title || "Evidencia fotográfica")}">`
                : `<div class="empty" style="color:#fff"><i class="fa-solid fa-image-landscape"></i><strong>Sin imagen disponible</strong><p>El archivo debe existir en ${U.esc(photo.path || "assets/photos/")} dentro del repositorio.</p></div>`}
          <div class="viewer__caption">
            <strong>${U.esc(photo.title || "Evidencia")}</strong>
            ${photo.date ? ` · ${U.esc(U.fmtDate(photo.date))}` : ""}
            ${photo.description ? `<br>${U.esc(photo.description)}` : ""}
          </div>
        </div>
      </div>`);
    const close = () => { wrap.remove(); document.body.style.overflow = ""; };
    wrap.querySelector(".viewer__close").addEventListener("click", close);
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    document.addEventListener("keydown", function onEsc(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
    });
    document.body.appendChild(wrap);
    document.body.style.overflow = "hidden";
  }

  SS.ui = {
    splash, theme, toast, modal, closeAllModals, confirm, formModal,
    statusBadge, groupBadge, roleBadge, avatar, emptyState, viewPhoto,
    groupLabel, STATUS_LABEL
  };
})();
