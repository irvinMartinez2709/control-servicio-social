/* =============================================================
   app.js — Router con Auth Guard, armazón de la app e inicio
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const $ = U.$;

  const PUBLIC_ROUTES = ["login", "registro"];
  const DEFAULT_ROUTE = "resumen";

  const app = (SS.app = {});

  /* ------------------------- Navegación ------------------------- */
  function parseHash() {
    const raw = (location.hash || "").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    return { route: parts[0] || "", param: parts.slice(1).join("/") };
  }

  function navigate(route) {
    location.hash = `#/${route}`;
  }

  /* ------------------------- Auth Guard ------------------------- */
  function route() {
    const { route: name } = parseHash();
    SS.store.loadAll();          // siempre leer la última versión persistida
    const authed = SS.auth.isAuthed();
    const view = $("#view");
    const shell = $("#app");

    // Portada pública: resumen de horas/asistencias y calendario sin sesión.
    // Siempre a pantalla completa, con o sin sesión iniciada.
    if (name === "resumen-publico" || (!authed && !name)) {
      if (name !== "resumen-publico") history.replaceState(null, "", "#/resumen-publico");
      shell.classList.add("app--auth");
      renderView("resumen-publico", view);
      markActive("resumen-publico");
      closeDrawer();
      document.title = "Resumen público · Control Servicio Social";
      return;
    }

    // Sin sesión: sólo login/registro; todo lo demás redirige al login
    if (!authed) {
      shell.classList.add("app--auth");
      const target = PUBLIC_ROUTES.includes(name) ? name : "login";
      if (name && name !== target) {
        UI.toast("Inicia sesión para continuar", "warn", 2600);
        history.replaceState(null, "", `#/${target}`);
      }
      renderView(target, view);
      markActive(target);
      closeDrawer();
      return;
    }

    shell.classList.remove("app--auth");

    // Con sesión: login/registro se redirigen al panel
    if (PUBLIC_ROUTES.includes(name) || !name) {
      history.replaceState(null, "", `#/${DEFAULT_ROUTE}`);
      renderView(DEFAULT_ROUTE, view);
      markActive(DEFAULT_ROUTE);
      return;
    }

    const fn = SS.views[name];
    if (!fn) {
      UI.toast("Sección no disponible", "warn");
      history.replaceState(null, "", `#/${DEFAULT_ROUTE}`);
      renderView(DEFAULT_ROUTE, view);
      markActive(DEFAULT_ROUTE);
      return;
    }

    renderView(name, view);
    markActive(name);
    closeDrawer();
    refreshChrome();
    document.title = `${titleFor(name)} · Control Servicio Social`;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    view.focus({ preventScroll: true });
  }

  function titleFor(name) {
    const map = {
      resumen: "Resumen", asistencia: "Asistencia", solicitudes: "Solicitudes",
      bitacora: "Bitácora", fotos: "Galería", usuarios: "Usuarios",
      auditoria: "Auditoría", grupos: "Grupos", ajustes: "Ajustes"
    };
    return map[name] || "Panel";
  }

  function renderView(name, view) {
    try {
      const fn = SS.views[name];
      if (typeof fn === "function") fn(view);
      else view.innerHTML = UI.emptyState("fa-triangle-exclamation", "Sección no encontrada", "Regresa al panel principal.");
    } catch (err) {
      console.error("[app] Error renderizando", name, err);
      view.innerHTML = `
        <div class="page-head"><div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-bug"></i> Error</span>
          <h1>No se pudo cargar la sección</h1>
          <p>${U.esc(err.message || "Error inesperado")}</p>
        </div></div>
        <a class="btn btn--primary" href="#/${DEFAULT_ROUTE}"><i class="fa-solid fa-arrow-left"></i> Volver al resumen</a>`;
    }
  }

  function markActive(name) {
    document.querySelectorAll(".navitem").forEach((a) => {
      a.classList.toggle("is-active", a.dataset.route === name);
    });
  }

  /* ------------------------- Armazón (chrome) ------------------------- */
  function refreshChrome() {
    const user = SS.auth.currentUser();
    if (!user) return;

    const effRole = SS.auth.effectiveRole(user);
    const isVisitorMode = SS.auth.sessionMode() === "visitante";

    const uname = $("#uname");
    const urole = $("#urole");
    const avatarEl = $("#avatar");
    if (uname) uname.textContent = user.displayName;
    if (urole) {
      urole.textContent = isVisitorMode
        ? "Visitante (modo visitante)"
        : effRole === "superadmin" ? "Líder Supremo" : effRole === "admin" ? "Admin" : "Visitante";
    }
    if (avatarEl) avatarEl.innerHTML = U.esc(U.initials(user.displayName));

    const groupChip = $("#topbar-group");
    if (groupChip) {
      groupChip.hidden = false;
      groupChip.innerHTML = `<i class="fa-solid fa-people-group"></i> ${U.esc(UI.groupLabel(user.group))}`;
    }

    const navAdmin = $("#nav-admin");
    if (navAdmin) navAdmin.hidden = !SS.auth.isAdmin(user);

    const navSuper = $("#nav-super");
    if (navSuper) navSuper.hidden = !SS.auth.isSuper(user);

    const btnSave = $("#btn-save");
    if (btnSave) btnSave.hidden = !SS.auth.isAdmin(user);

    const switchMode = $("#mi-switch-mode");
    if (switchMode) switchMode.hidden = !SS.auth.isAdmin(user) && user.role === "visitante";

    const badge = $("#badge-pending");
    if (badge) {
      const n = SS.store.pendingCount();
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? "99+" : String(n);
    }

    const minutes = SS.store.minutesOfUser(user.id);
    const goal = (Number(SS.store.state.settings.hoursGoal) || 60) * 60;
    const pct = U.pct(minutes, goal);
    const sideFill = $("#side-progress");
    const sideHours = $("#side-hours");
    const sidePct = $("#side-pct");
    if (sideFill) sideFill.style.width = `${pct}%`;
    if (sideHours) sideHours.textContent = U.fmtHM(minutes);
    if (sidePct) sidePct.textContent = `${pct}%`;
  }
  app.refreshChrome = refreshChrome;

  /* ------------------------- Cajón lateral (móvil) ------------------------- */
  function openDrawer() {
    $("#sidebar").classList.add("is-open");
    $("#backdrop").hidden = false;
  }
  function closeDrawer() {
    const sb = $("#sidebar");
    if (sb) sb.classList.remove("is-open");
    const bd = $("#backdrop");
    if (bd) bd.hidden = true;
  }

  /* ------------------------- Menú de usuario ------------------------- */
  function bindUserMenu() {
    const trigger = $("#btn-usermenu");
    const drop = $("#usermenu-drop");
    if (!trigger || !drop) return;

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = drop.hidden;
      drop.hidden = !open;
      trigger.setAttribute("aria-expanded", String(open));
    });

    document.addEventListener("click", (e) => {
      if (!drop.hidden && !drop.contains(e.target) && e.target !== trigger) {
        drop.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });

    drop.querySelectorAll("[data-action]").forEach((item) => {
      item.addEventListener("click", () => {
        drop.hidden = true;
        const action = item.dataset.action;
        if (action === "logout") doLogout();
        else if (action === "switch-mode") switchMode();
        else if (action === "export") {
          SS.store.downloadFullBackup();
          SS.audit.log("sistema", "Exportó respaldo completo", "Descarga desde el menú de usuario");
          UI.toast("Respaldo descargado", "success");
        }
      });
    });
  }

  /** Cambia entre modo visitante y modo administración (vuelve al login) */
  function switchMode() {
    const user = SS.auth.currentUser();
    if (!user) return;
    const toAdmin = SS.auth.sessionMode() === "visitante";
    UI.confirm({
      heading: "Cambiar de modo",
      title: toAdmin ? "¿Cambiar a modo administración?" : "¿Cambiar a modo visitante?",
      message: toAdmin
        ? "Validarás tu segundo factor (2FA) para ingresar al panel de administración."
        : "Verás la plataforma como un Visitante: solo la información de tu grupo, sin acciones administrativas.",
      confirmLabel: toAdmin ? "Modo administración" : "Modo visitante"
    }).then((ok) => {
      if (!ok) return;
      SS.audit.log("sesion", "Cambió de modo", `@${user.username} → modo ${toAdmin ? "administración" : "visitante"}`);
      SS.store.setSession(null);
      location.hash = "#/login";
      route();
    });
  }

  function doLogout() {
    UI.confirm({
      heading: "Cerrar sesión",
      title: "¿Deseas salir de la plataforma?",
      message: "Tus datos permanecen guardados en este dispositivo.",
      confirmLabel: "Cerrar sesión"
    }).then((ok) => {
      if (!ok) return;
      SS.auth.logout();
      UI.toast("Sesión cerrada", "info");
      location.hash = "#/login";
      route();
    });
  }

  /* ------------------------- Callbacks globales ------------------------- */
  app.onAuthenticated = function () {
    refreshChrome();
    navigate(DEFAULT_ROUTE);
    route();
  };

  /* ------------------------- Service Worker (PWA) ------------------------- */
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol === "file:") return;
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("[app] SW no registrado:", err));
  }

  /* ------------------------- Arranque ------------------------- */
  async function boot() {
    UI.splash.show("Inicializando datos…");
    const startedAt = Date.now();

    // Revela la aplicación (el splash la mantiene cubierta visualmente)
    const appEl = $("#app");
    if (appEl) appEl.hidden = false;

    // Tema lo antes posible (evita destello)
    await SS.store.init();
    UI.theme.init();

    bindUserMenu();

    const btnSave = $("#btn-save");
    if (btnSave) btnSave.addEventListener("click", () => {
      if (!SS.auth.isAdmin(SS.auth.currentUser())) return;
      SS.store.persist("all");
      SS.audit.log("sistema", "Guardó datos manualmente", "Persistencia forzada en el navegador");
      UI.toast("Datos guardados", "success", 2200, "Todo queda persistido en este dispositivo");
    });

    $("#btn-menu").addEventListener("click", () => {
      const open = $("#sidebar").classList.contains("is-open");
      if (open) closeDrawer(); else openDrawer();
    });
    $("#backdrop").addEventListener("click", closeDrawer);

    window.addEventListener("hashchange", route);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeDrawer(); $("#usermenu-drop").hidden = true; }
    });

    // Sincronización entre pestañas: otro contexto modificó los datos
    window.addEventListener("storage", (e) => {
      if (!e.key || !e.key.startsWith("ss.")) return;
      if (e.key === "ss.session.v1") { route(); return; }
      SS.store.loadAll();
      refreshChrome();
      const active = document.activeElement;
      const typing = active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      const { route: current } = parseHash();
      if (!typing && !PUBLIC_ROUTES.includes(current)) route();
    });

    registerSW();

    route();

    // El splash se muestra siempre un breve instante (identidad de la app)
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(0, 950 - elapsed);
    setTimeout(() => {
      UI.splash.hide();
      if (SS.auth.isAuthed()) refreshChrome();
    }, wait);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
