/* =============================================================
   firebase.js — Carga bajo demanda del SDK de Firebase (Firestore)
   -------------------------------------------------------------
   El SDK (app + firestore, modo compat) solo se descarga cuando
   hay un proyecto configurado (SS.config.firebase.enabled), así
   los entornos sin Firebase no cargan nada extra. La configuración
   de la web de Firebase es pública por diseño; las credenciales
   reales (si las hubiera) viven en las reglas de Firestore, no aquí.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const SDK = "https://www.gstatic.com/firebasejs/10.12.2";

  let dbPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("No se pudo cargar " + src));
      document.head.appendChild(s);
    });
  }

  SS.firebase = {
    /** ¿Firestore es el transporte en línea activo? */
    isEnabled() {
      const cfg = SS.config && SS.config.firebase;
      return Boolean(cfg && cfg.enabled && cfg.apiKey && cfg.projectId);
    },

    /** Instancia de Firestore (carga el SDK la primera vez). */
    db() {
      if (!dbPromise) {
        dbPromise = Promise.all([
          loadScript(SDK + "/firebase-app-compat.js"),
          loadScript(SDK + "/firebase-firestore-compat.js")
        ]).then(() => {
          const cfg = SS.config.firebase;
          if (!firebase.apps.length) {
            firebase.initializeApp({
              apiKey: cfg.apiKey,
              authDomain: cfg.authDomain,
              projectId: cfg.projectId,
              storageBucket: cfg.storageBucket,
              messagingSenderId: cfg.messagingSenderId,
              appId: cfg.appId
            });
          }
          return firebase.firestore();
        });
        dbPromise.catch(() => { dbPromise = null; }); // reintento limpio si falla
      }
      return dbPromise;
    }
  };
})();
