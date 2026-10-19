/* =============================================================
   audit.js — Registro de auditoría (quién, qué, cuándo)
   Toda acción relevante de la plataforma queda trazada aquí.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});

  /** Categorías del registro (usadas también como filtro en la vista) */
  const TYPES = {
    sesion:    { label: "Sesión",     icon: "fa-right-to-bracket",  color: "var(--primary)" },
    cuentas:   { label: "Cuentas",    icon: "fa-users-gear",        color: "var(--accent-500, #0d9488)" },
    asistencia:{ label: "Asistencia", icon: "fa-calendar-check",    color: "var(--success)" },
    contenido: { label: "Contenido",  icon: "fa-book-open",         color: "var(--warn)" },
    grupos:    { label: "Grupos",     icon: "fa-people-group",      color: "var(--indigo-500, #4f46e5)" },
    sistema:   { label: "Sistema",    icon: "fa-gears",             color: "var(--muted)" }
  };

  /**
   * Escribe un evento de auditoría.
   * @param {string} type clave de TYPES (sesion|cuentas|asistencia|contenido|grupos|sistema)
   * @param {string} action acción corta (ej. "Aprobó solicitud")
   * @param {string} [detail] detalle legible del evento
   * @param {object} [opts] { actor, actorName, role } para eventos sin sesión (login fallido)
   */
  function log(type, action, detail, opts) {
    try {
      const s = SS.store.getSession();
      const cfg = opts || {};
      const actor = cfg.actor || (s && s.username) || "sistema";
      const entry = {
        id: SS.util.uid("aud"),
        ts: Date.now(),
        actor,
        actorName: cfg.actorName || (s && s.actorName) || actor,
        role: cfg.role || (s && s.role) || "",
        mode: cfg.mode || (s && s.mode) || "",
        type: TYPES[type] ? type : "sistema",
        action: String(action || ""),
        detail: String(detail || "")
      };
      SS.store.addAudit(entry);
      return entry;
    } catch (e) {
      console.warn("[audit] No se pudo registrar:", e);
      return null;
    }
  }

  /** Nombre visible para el actor guardado en la entrada */
  function actorName(username) {
    const u = SS.store.getUserByUsername(username);
    return u ? u.username : username;
  }

  SS.audit = { TYPES, log, actorName };
})();
