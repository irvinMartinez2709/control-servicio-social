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
  let hintedNoToken = false;

  const enabled = () => location.protocol !== "file:" && (fbOn() || httpOn() || ghOn());
  const httpOn = () => Boolean(SS.config && SS.config.apiBase);
  const fbOn = () => Boolean(SS.firebase && SS.firebase.isEnabled && SS.firebase.isEnabled());
  const ghOn = () => Boolean(SS.github && SS.github.rawText);
  /** Transporte activo: Firebase > API HTTP > GitHub (repo). */
  const transport = () => (fbOn() ? "fb" : httpOn() ? "http" : ghOn() ? "gh" : null);
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
    if (!enabled()) return;
    // Sin token de GitHub los cambios solo quedan en este navegador:
    // se avisa una vez para que el administrador lo configure.
    if (transport() === "gh" && SS.github && !SS.github.token() && !hintedNoToken) {
      hintedNoToken = true;
      if (SS.ui && SS.ui.toast) {
        SS.ui.toast("Cambios guardados en este navegador", "warn", 6000,
          "Configura el token de GitHub en Ajustes → Datos en línea para subirlos al repositorio");
      }
    }
    if (!isSynced()) return; // aún no sincronizado: lo llevará la carga inicial
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

  /* ------------------------- Transporte ------------------------- */
  async function sendOps(ops) {
    if (fbOn()) return sendOpsFb(ops);
    try {
      const res = await fetchJSON(SS.config.apiBase + "/api/sync", "POST", { ops });
      return Boolean(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  /** Sube operaciones a Firestore (lotes de 400; upsert/borrado por id). */
  async function sendOpsFb(ops) {
    try {
      const db = await SS.firebase.db();
      // Firestore limita cada documento a 1 MB: un registro con foto en base64
      // muy grande se omite (se queda local) para no romper el lote entero.
      const MAX_DOC = 700000;
      const safe = ops.filter((op) => {
        if (!op || op.action === "del" || !op.doc) return true;
        try {
          if (JSON.stringify(op.doc).length > MAX_DOC) {
            console.warn("[sync] Documento demasiado grande para Firestore, se omite:", op.coll, op.id);
            return false;
          }
        } catch (e) { /* doc no serializable: mejor omitirlo */ return false; }
        return true;
      });
      for (let i = 0; i < safe.length; i += 400) {
        const chunk = safe.slice(i, i + 400);
        const b = db.batch();
        chunk.forEach((op) => {
          if (!op || !op.coll) return;
          const id = op.coll === "settings" ? "singleton" : (op.id ? String(op.id) : "");
          if (!id) return;
          const ref = db.collection("state").doc(op.coll + ":" + id);
          if (op.action === "del") b.delete(ref);
          else if (op.doc && typeof op.doc === "object") {
            b.set(ref, { coll: op.coll, id, data: op.doc, updatedAt: op.at || Date.now() });
          }
        });
        await b.commit();
      }
      // Higiene: una cuenta eliminada no deja asistencias en línea
      const delUsers = ops
        .filter((o) => o && o.coll === "users" && o.action === "del")
        .map((o) => String(o.id));
      if (delUsers.length) {
        const snap = await db.collection("state").where("coll", "==", "attendance").get();
        const b2 = db.batch();
        let n = 0;
        snap.forEach((d) => {
          const v = d.data() || {};
          if (v.data && delUsers.indexOf(String(v.data.userId)) !== -1) { b2.delete(d.ref); n++; }
        });
        if (n) await b2.commit();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Sube la cola (o la carga inicial completa si es la primera vez). */
  async function pushOnce() {
    if (transport() === "gh") return pushOnceGh();
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

  const ghColls = () => (SS.github && SS.github.FILES ? Object.keys(SS.github.FILES) : []);

  /**
   * Subida a GitHub: cada colección con operaciones pendientes se
   * convierte en un commit del JSON correspondiente (escritura a
   * archivo completo; el contenido sale del estado local, que ya
   * refleja todas las ediciones). Sin token la cola queda pendiente.
   */
  async function pushOnceGh() {
    const key = (o) => o.coll + "|" + o.action + "|" + o.id + "|" + (o.at || 0);
    const colls = isSynced()
      ? Array.from(new Set(readOutbox().map((o) => o && o.coll).filter((c) => c && ghColls().indexOf(c) !== -1)))
      : ghColls(); // carga inicial: todo lo local (tras el pull, ya es la unión)
    if (!colls.length) return isSynced();

    const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
    let ok = true;
    for (const coll of colls) {
      const docs = SS.store.state[coll];
      if (!Array.isArray(docs)) continue;
      const sent = new Set(readOutbox().filter((o) => o && o.coll === coll).map(key));
      try {
        await SS.github.pushFile(coll, docs, `app: ${coll} (${docs.length} registros) · ${stamp}`);
        // Se quitan SOLO las operaciones de esta colección enviadas
        writeOutbox(readOutbox().filter((o) => !(o && o.coll === coll && sent.has(key(o)))));
      } catch (e) {
        console.warn("[sync] No se pudo subir", coll, ":", e && e.message);
        ok = false;
        break; // sin token o sin permisos: se reintenta más tarde
      }
    }
    if (ok && !isSynced()) {
      try { localStorage.setItem(SYNCED_KEY, "1"); } catch (e) { /* noop */ }
    }
    return ok;
  }

  /** Baja los datos en línea y los aplica al almacenamiento local. */
  async function pullOnce() {
    if (transport() === "fb") return pullOnceFb();
    if (transport() === "gh") return pullOnceGh();
    const data = await fetchJSON(SS.config.apiBase + "/api/data", "GET");
    if (!data || typeof data !== "object") return false;
    const pending = readOutbox();
    const union = !isSynced(); // primera vez: unión (lo local no se pierde)
    const applied = SS.store.applyRemote(data, union, pending);
    return applied;
  }

  /**
   * Baja desde los JSON del repositorio (GitHub como base de datos):
   * la web siempre muestra lo que está guardado en data/*.json.
   */
  async function pullOnceGh() {
    const payload = {};
    await Promise.all(ghColls().map(async (coll) => {
      try {
        const text = await SS.github.rawText(SS.github.FILES[coll]);
        payload[coll] = SS.github.parseItems(text).items;
      } catch (e) { /* sin red o archivo ausente: no toca esa colección */ }
    }));
    if (!Object.keys(payload).length) return false; // repo inaccesible
    return SS.store.applyRemote(payload, !isSynced(), readOutbox());
  }

  /** Baja todo el estado desde la colección "state" de Firestore. */
  async function pullOnceFb() {
    const db = await SS.firebase.db();
    const snap = await db.collection("state").get();
    const payload = {};
    ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit"]
      .forEach((c) => { payload[c] = []; });
    snap.forEach((d) => {
      const v = d.data() || {};
      if (v.coll === "settings" && v.data) payload.settings = v.data;
      else if (Array.isArray(payload[v.coll]) && v.data) payload[v.coll].push(v.data);
    });
    return SS.store.applyRemote(payload, !isSynced(), readOutbox());
  }

  function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  /** Ciclo completo: primero baja (para no pisar nada) y luego sube. */
  async function run() {
    if (!enabled()) return false;
    let pulled = false;
    let pushed = false;
    try { pulled = await withTimeout(pullOnce(), 12000); } catch (e) { /* API caído: sigue en local */ }
    try { pushed = await withTimeout(pushOnce(), 20000); } catch (e) { /* noop */ }
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
   * los dispositivos). null si no hay nada en línea.
   */
  function publicData() {
    if (!enabled()) return Promise.resolve(null);
    const pick = (d) => {
      const users = d && Array.isArray(d.users) ? d.users : [];
      const attendance = d && Array.isArray(d.attendance) ? d.attendance : [];
      if (users.length || attendance.length) return d;
      return null;
    };
    if (transport() === "fb") {
      return publicDataFb().then(pick).catch(() => null);
    }
    if (transport() === "gh") {
      // La portada se construye SIEMPRE con lo que está en el repo
      const [uText, aText] = [
        SS.github.rawText(SS.github.FILES.users),
        SS.github.rawText(SS.github.FILES.attendance)
      ];
      return Promise.all([uText, aText])
        .then(([ut, at]) => ({
          users: SS.github.parseItems(ut).items,
          attendance: SS.github.parseItems(at).items
        }))
        .then(pick)
        .catch(() => null);
    }
    return fetchJSON(SS.config.apiBase + "/api/data", "GET").then(pick).catch(() => null);
  }

  /** users + attendance desde Firestore (para la portada pública). */
  async function publicDataFb() {
    const db = await SS.firebase.db();
    const [uSnap, aSnap] = await Promise.all([
      db.collection("state").where("coll", "==", "users").get(),
      db.collection("state").where("coll", "==", "attendance").get()
    ]);
    const users = [];
    const attendance = [];
    uSnap.forEach((d) => { const v = d.data() || {}; if (v.data) users.push(v.data); });
    aSnap.forEach((d) => { const v = d.data() || {}; if (v.data) attendance.push(v.data); });
    return { users, attendance };
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
