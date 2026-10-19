/* =============================================================
   sw.js — Service Worker (PWA: caché de la aplicación)
   Estrategia:
     - Estáticos (CSS/JS/fuentes/iconos): caché primero.
     - Navegaciones y data/*.json: red primero, caché como respaldo.
   ============================================================= */

const CACHE = "control-servicio-social-v6";

const PRECACHE = [
  "./",
  "index.html",
  "manifest.json",
  "css/tokens.css",
  "css/base.css",
  "css/layout.css",
  "css/components.css",
  "css/views.css",
  "js/util.js",
  "js/crypto.js",
  "js/store.js",
  "js/audit.js",
  "js/ui.js",
  "js/auth.js",
  "js/app.js",
  "js/views/public.js",
  "js/views/login.js",
  "js/views/dashboard.js",
  "js/views/attendance.js",
  "js/views/solicitudes.js",
  "js/views/bitacora.js",
  "js/views/gallery.js",
  "js/views/users.js",
  "js/views/groups.js",
  "js/views/audit.js",
  "js/views/settings.js",
  "assets/logo.png",
  "assets/favicon.png",
  "data/users.json",
  "data/attendance.json",
  "data/jornadas.json",
  "data/bitacoras.json",
  "data/groups.json",
  "data/audit.json",
  "data/photos.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isData = sameOrigin && url.pathname.includes("/data/");
  const isNavigation = req.mode === "navigate";

  // Red primero: navegaciones y JSON del repositorio (datos frescos)
  if (isNavigation || isData) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // Caché primero: estáticos
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (sameOrigin || url.hostname.includes("googleapis") || url.hostname.includes("gstatic") || url.hostname.includes("cdnjs") || url.hostname.includes("jsdelivr"))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => hit);
    })
  );
});
