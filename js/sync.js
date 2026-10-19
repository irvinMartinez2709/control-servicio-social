/* =============================================================
   sync.js — Sincronización en línea (API + MongoDB Atlas)
   -------------------------------------------------------------
   - Al abrir la página: baja los datos del API y los aplica al
     almacenamiento local (así TODOS los dispositivos ven lo mismo).
   - Cada cambio local se encola (outbox) y se sube al API.
   - Sin red: todo sigue funcionando en local y se sube al volver.
   - Primera sincronización: carga inicial = UNIÓN de lo local con
     lo remoto (upsert por id; nunca borra datos ajenenos).
   La sesión del dispositivo y la bandera de semilla NO se sincronizan.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});

  const OUTBOX_KEY = "ss.outbox.v1";
  const SYNCED_KEY = "ss.synced.v1";
  const OUTBOX_CAP = 8000;
  const BATCH = 2000;

  let chain = Promise.resolve(false);
  let timer = null;

  const enabled = () => Boolean(SS.config && SS.config.apiBase) && location.protocol !== "file:";
  const isSynced = () => {
    try { return localStorage.getItem(SYNCED_KEY) === "1"; } catch (e) { return false; }
  };

  /* ------------------------- Cola de subida ------------------------- */
  function readOutbox() {
    try {
      const v = JSON.parse(localStorage.getItem(OUTBOX_KEY));
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function writeOutbox(list) {
    try {
      if (list.length > OUTBOX_CAP) {
        // Demasiadas operaciones pendientes: se colapsa a una carga completa
        localStorage.removeItem(OUTBOX_KEY);
        localStorage.removeItem(SYNCED_KEY);
        return [];
      }
      localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
    } catch (e) { /* almacenamiento lleno o bloqueado */ }
    return list;
  }

  /**
   * Encola las diferencias de una colección.
   * Se llama desde store.persist() después de escribir en local.
   */
  function enqueue(coll, oldVal, newVal) {
    if (!enabled() || !isSynced()) return; // aún no sincronizado: lo llevará la carga inicial
    let list = readOutbox();
    if (coll === "settings") {
      if (JSON.stringify(oldVal || null) !== JSON.stringify(newVal || null)) {
        list.push({ coll: "settings", action: "put", id: "singleton", doc: newVal, at: Date.now() });
      }
    } else if (Array.isArray(newVal)) {
      const oldMap = new Map();
      (Array.isArray(oldVal) ? oldVal : []).forEach((d) => { if (d && d.id) oldMap.set(String(d.id), d); });
      newVal.forEach((d) => {
        if (!d || !d.id) return;
        const id = String(d.id);
        const old = oldMap.get(id);
        if (!old || JSON.stringify(old) !== JSON.stringify(d)) {
          list.push({ coll, action: "put", id, doc: d, at: Date.now() });
        }
      });
      const newIds = new Set(newVal.map((d) => d && String(d.id)));
      oldMap.forEach((d, id) => {
        if (!newIds.has(id)) list.push({ coll, action: "del", id, at: Date.now() });
      });
    }
    writeOutbox(list);
    schedule(2500);
  }

  /* ------------------------- Red ------------------------- */
  function fetchJSON(url, method, body) {
    const ctl = new AbortController();
    const timeout = (SS.config && SS.config.timeout) || 8000;
    const t = setTimeout(() => ctl.abort(), timeout);
    const headers = { "Accept": "application/json" };
    if (SS.config && SS.config.appKey) headers["x-app-key"] = SS.config.appKey;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(url, {
      method: method || "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
      cache: "no-store"
    })
      .then((r) => {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch((e) => { clearTimeout(t); throw e; });
  }

  async function sendOps(ops) {
    try {
      const res = await fetchJSON(SS.config.apiBase + "/api/sync", "POST", { ops });
      return Boolean(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  /** Sube la cola (o la carga inicial completa si es la primera vez). */
  async function pushOnce() {
    if (!isSynced()) {
      const ops = [];
      const at = Date.now();
      const SHARED = ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit", "settings"];
      SHARED.forEach((coll) => {
        const data = SS.store.state[coll];
        if (coll === "settings") {
          if (data) ops.push({ coll, action: "put", id: "singleton", doc: data, at });
        } else if (Array.isArray(data)) {
          data.forEach((d) => { if (d && d.id) ops.push({ coll, action: "put", id: String(d.id), doc: d, at }); });
        }
      });
      if (!ops.length) return false;
      const ok = await sendOps(ops);
      if (ok) {
        try { localStorage.setItem(SYNCED_KEY, "1"); } catch (e) { /* noop */ }
      }
      return ok;
    }

    let list = readOutbox();
    if (!list.length) return true;
    const key = (o) => o.coll + "|" + o.action + "|" + o.id + "|" + (o.at || 0);
    for (;;) {
      const pending = readOutbox();
      if (!pending.length) break;
      const batch = pending.slice(0, BATCH);
      const ok = await sendOps(batch);
      if (!ok) return false;
      // Se quitan SOLO las operaciones enviadas: lo que se encoló mientras
      // esperábamos la respuesta se conserva para el siguiente lote.
      const sent = new Set(batch.map(key));
      writeOutbox(readOutbox().filter((o) => !sent.has(key(o))));
    }
    return true;
  }

  /** Baja los datos del API y los aplica al almacenamiento local. */
  async function pullOnce() {
    const data = await fetchJSON(SS.config.apiBase + "/api/data", "GET");
    if (!data || typeof data !== "object") return false;
    const pending = readOutbox();
    const union = !isSynced(); // primera vez: unión (lo local no se pierde)
    const applied = SS.store.applyRemote(data, union, pending);
    return applied;
  }

  /** Ciclo completo: primero baja (para no pisar nada) y luego sube. */
  async function run() {
    if (!enabled()) return false;
    let pulled = false;
    let pushed = false;
    try { pulled = await pullOnce(); } catch (e) { /* API caído: sigue en local */ }
    try { pushed = await pushOnce(); } catch (e) { /* noop */ }
    return pulled || pushed;
  }

  function runSerial() {
    if (!enabled()) return chain;
    chain = chain.then(run, run);
    return chain;
  }

  function schedule(ms) {
    if (!enabled()) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; runSerial(); }, ms == null ? 2500 : ms);
  }

  /**
   * Datos en línea para la portada pública (la ven igual en todos
   * los dispositivos). null si no hay API o está vacío.
   */
  function publicData() {
    if (!enabled()) return Promise.resolve(null);
    return fetchJSON(SS.config.apiBase + "/api/data", "GET")
      .then((d) => {
        const users = d && Array.isArray(d.users) ? d.users : [];
        const attendance = d && Array.isArray(d.attendance) ? d.attendance : [];
        if (users.length || attendance.length) return d;
        return null;
      })
      .catch(() => null);
  }

  /* ------------------------- Disparadores ------------------------- */
  function bindTriggers() {
    window.addEventListener("online", () => runSerial());
    window.addEventListener("focus", () => runSerial());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") runSerial();
    });
    // Refresco periódico: mantener lo mismo en todos los dispositivos
    setInterval(() => {
      if (document.visibilityState === "visible") runSerial();
    }, 90000);
  }

  SS.sync = { enabled, isSynced, enqueue, run: runSerial, schedule, publicData, bindTriggers, OUTBOX_KEY, SYNCED_KEY };
})();
