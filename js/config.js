/* =============================================================
   config.js — Configuración global de la app (sin secretos)
   Base de datos principal: GitHub (data/*.json del repo). Opcional
   API HTTP propio (apiBase) o Firebase (bloque firebase). Las
   pruebas locales sobreescriben con window.__SS_API_BASE__ antes
   de cargar esta página. El token de GitHub NO vive aquí: cada
   administrador lo pega en Ajustes y se guarda en su navegador.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});

  SS.config = {
    // API HTTP propio (opcional): si está vacío se usa GitHub como
    // base de datos (data/*.json del repo). Las pruebas locales lo
    // sobreescriben con window.__SS_API_BASE__. Si el servidor define
    // APP_KEY se envía en el encabezado x-app-key. Vacío = sin clave.
    apiBase: String(window.__SS_API_BASE__ || "").replace(/\/+$/, ""),
    appKey: window.__SS_APP_KEY__ || "",
    // Firebase (Firestore): transporte principal en línea. La config de la web
    // de Firebase es PÚBLICA por diseño (no es un secreto). enabled solo si
    // hay proyecto creado y projectId presente.
    firebase: Object.assign({
      enabled: false,
      apiKey: "", authDomain: "", projectId: "",
      storageBucket: "", messagingSenderId: "", appId: ""
    }, window.__SS_FB_CONFIG__ || {}),
    timeout: 8000
  };
})();
