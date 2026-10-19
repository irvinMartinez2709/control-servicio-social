/* =============================================================
   config.js — Configuración global de la app (sin secretos)
   apiBase apunta al API en línea (Express + MongoDB Atlas en
   Render) del que TODOS los dispositivos cargan y guardan los
   mismos datos. Las pruebas locales lo sobreescriben con
   window.__SS_API_BASE__ antes de cargar esta página.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});

  SS.config = {
    apiBase: String(window.__SS_API_BASE__ || "https://control-servicio-social-api.onrender.com")
      .replace(/\/+$/, ""),
    // Si el servidor define APP_KEY (variable de entorno de Render) se pone
    // aquí el mismo valor para firmar las escrituras. Vacío = sin clave.
    appKey: window.__SS_APP_KEY__ || "",
    timeout: 8000
  };
})();
