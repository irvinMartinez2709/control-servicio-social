/* =============================================================
   store.js — Abstracción de almacenamiento
   - Capa de ejecución: localStorage (prefijo "ss." + versión)
   - Fuente de repositorio: data/*.json (fetch en GitHub Pages)
   - Utilidades de exportación / importación para commit
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;

  const VERSION = 2;
  const KEYS = {
    users: "ss.users.v1",
    attendance: "ss.attendance.v1",
    photos: "ss.photos.v1",
    bitacoras: "ss.bitacoras.v1",
    jornadas: "ss.jornadas.v1",
    groups: "ss.groups.v1",
    audit: "ss.audit.v1",
    settings: "ss.settings.v1",
    session: "ss.session.v1",
    seeded: "ss.seeded.v2"
  };

  const DEFAULT_SETTINGS = {
    version: VERSION,
    hoursGoal: 60,           // meta de labor social (horas)
    theme: null,             // null = seguir sistema
    repo: "assets/photos/"
  };

  const DEFAULT_GROUPS = () => ([
    { id: "cuadro3", name: "Cuadro 3", builtin: true, createdAt: 0, createdBy: "sistema" },
    { id: "cuadro6", name: "Cuadro 6", builtin: true, createdAt: 0, createdBy: "sistema" }
  ]);

  const AUDIT_CAP = 5000;

  /* ------------------------- Núcleo de lectura/escritura ------------------------- */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn("[store] Error leyendo", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("[store] Error escribiendo", key, e);
      return false;
    }
  }

  /** Marca que los datos locales fueron modificados (protege contra sobreescritura) */
  function markDirty() {
    try { localStorage.setItem("ss.dirty.v1", "1"); } catch (e) { /* noop */ }
  }
  function isDirty() {
    try { return localStorage.getItem("ss.dirty.v1") === "1"; } catch (e) { return false; }
  }

  function reset() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
    try { localStorage.removeItem("ss.dirty.v1"); } catch (e) { /* noop */ }
  }

  /* ------------------------- Estado ------------------------- */
  const state = {
    users: [],
    attendance: [],
    photos: [],
    bitacoras: [],
    jornadas: [],
    groups: [],
    audit: [],
    settings: Object.assign({}, DEFAULT_SETTINGS)
  };

  function loadAll() {
    state.users = read(KEYS.users, []);
    state.attendance = read(KEYS.attendance, []);
    state.photos = read(KEYS.photos, []);
    state.bitacoras = read(KEYS.bitacoras, []);
    state.jornadas = read(KEYS.jornadas, []);
    state.groups = read(KEYS.groups, []);
    state.audit = read(KEYS.audit, []);
    state.settings = Object.assign({}, DEFAULT_SETTINGS, read(KEYS.settings, {}));

    // Higiene de datos: una cuenta eliminada no debe dejar asistencias
    // huérfanas en ninguna vista (horas, calendario, portada, colas).
    // La auditoría es historia y nunca se toca.
    if (state.users.length && state.attendance.length) {
      const ids = new Set(state.users.map((u) => u.id));
      const before = state.attendance.length;
      state.attendance = state.attendance.filter((r) => r.userId && ids.has(r.userId));
      if (state.attendance.length !== before) write(KEYS.attendance, state.attendance);
    }
  }

  function persist(collection) {
    const map = {
      users: () => write(KEYS.users, state.users),
      attendance: () => write(KEYS.attendance, state.attendance),
      photos: () => write(KEYS.photos, state.photos),
      bitacoras: () => write(KEYS.bitacoras, state.bitacoras),
      jornadas: () => write(KEYS.jornadas, state.jornadas),
      groups: () => write(KEYS.groups, state.groups),
      audit: () => write(KEYS.audit, state.audit),
      settings: () => write(KEYS.settings, state.settings),
      all: () => {
        write(KEYS.users, state.users);
        write(KEYS.attendance, state.attendance);
        write(KEYS.photos, state.photos);
        write(KEYS.bitacoras, state.bitacoras);
        write(KEYS.jornadas, state.jornadas);
        write(KEYS.groups, state.groups);
        write(KEYS.audit, state.audit);
        write(KEYS.settings, state.settings);
      }
    };
    const ALL_KEYS = ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit", "settings"];
    const keys = map[collection] && collection !== "all" ? [collection] : ALL_KEYS;

    // Valor previo (para calcular qué cambió hacia el API en línea)
    const before = {};
    keys.forEach((k) => { before[k] = read(KEYS[k], null); });

    // Identificadores estables para la sincronización (docs heredados sin id)
    keys.forEach((k) => {
      if (Array.isArray(state[k])) {
        state[k].forEach((d) => { if (d && !d.id) d.id = SS.util.uid(String(k).slice(0, 3)); });
      }
    });

    const fn = map[collection] || map.all;
    const ok = fn();
    markDirty();

    // Encola los cambios para subirlos al API en línea (si ya se sincronizó)
    if (SS.sync && SS.sync.enqueue) {
      keys.forEach((k) => {
        if (state[k] !== undefined) SS.sync.enqueue(k, before[k], state[k]);
      });
    }
    return ok;
  }

  /* ------------------------- GRUPOS ------------------------- */
  function groupsList() {
    if (!state.groups.length) state.groups = DEFAULT_GROUPS();
    return state.groups;
  }
  function groupById(id) { return groupsList().find((g) => g.id === id) || null; }
  function groupName(id) { const g = groupById(id); return g ? g.name : (id || "—"); }
  function groupsOptions() { return groupsList().map((g) => ({ value: g.id, label: g.name })); }
  function defaultGroupId() { const g = groupsList()[0]; return g ? g.id : "cuadro3"; }

  function slugify(text) {
    return String(text || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
      .slice(0, 32) || "grupo";
  }

  function addGroup(name, user) {
    loadAll();
    const clean = String(name || "").trim();
    if (clean.length < 2) throw new Error("El nombre del grupo debe tener al menos 2 caracteres");
    const list = groupsList();
    if (list.some((g) => g.name.toLowerCase() === clean.toLowerCase())) throw new Error("Ya existe un grupo con ese nombre");
    let id = slugify(clean);
    if (list.some((g) => g.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`;
    const group = { id, name: clean, builtin: false, createdAt: Date.now(), createdBy: user ? user.username : "sistema" };
    list.push(group);
    persist("groups");
    return group;
  }

  function updateGroup(id, patch, user) {
    loadAll();
    const g = groupById(id);
    if (!g) throw new Error("Grupo no encontrado");
    if (patch.name !== undefined) {
      const clean = String(patch.name || "").trim();
      if (clean.length < 2) throw new Error("El nombre del grupo debe tener al menos 2 caracteres");
      if (groupsList().some((x) => x.id !== id && x.name.toLowerCase() === clean.toLowerCase())) throw new Error("Ya existe un grupo con ese nombre");
      g.name = clean;
    }
    g.updatedAt = Date.now();
    g.updatedBy = user ? user.username : "";
    persist("groups");
    return g;
  }

  /** Referencias al grupo en otros datos (usuarios, jornadas, registros, fotos, bitácoras) */
  function groupUsage(id) {
    return {
      users: state.users.filter((u) => u.group === id).length,
      attendance: state.attendance.filter((r) => r.group === id).length,
      jornadas: state.jornadas.filter((j) => j.group === id).length,
      photos: state.photos.filter((p) => p.group === id).length,
      bitacoras: state.bitacoras.filter((b) => (b.group || "cuadro3") === id).length
    };
  }

  function removeGroup(id, user) {
    loadAll();
    const list = groupsList();
    const idx = list.findIndex((g) => g.id === id);
    if (idx < 0) throw new Error("Grupo no encontrado");
    if (list.length <= 1) throw new Error("Debe existir al menos un grupo");
    const usage = groupUsage(id);
    const total = Object.values(usage).reduce((s, n) => s + n, 0);
    if (total > 0) {
      throw new Error(`No se puede eliminar: el grupo tiene ${total} referencia(s) (usuarios, registros, jornadas, fotos o bitácoras). Reasígnalos primero.`);
    }
    const removed = list.splice(idx, 1)[0];
    persist("groups");
    return removed;
  }

  /* ------------------------- AUDITORÍA ------------------------- */
  function addAudit(entry) {
    loadAll();
    state.audit.push(entry);
    if (state.audit.length > AUDIT_CAP) state.audit = state.audit.slice(-AUDIT_CAP);
    persist("audit");
    return entry;
  }
  function auditList() { return state.audit; }

  /* ------------------------- Semilla inicial ------------------------- */
  async function seedDefaults() {
    // Cuenta preconfigurada: Líder Supremo
    const superHash = await SS.crypto.hashPassword("sarsamora.0927.love");
    state.users = [
      {
        id: "usr_super",
        username: "irvin_martinez",
        displayName: "Irvin Martínez",
        role: "superadmin",
        group: "cuadro3",
        email: "",
        phone: "",
        cedula: "",
        carrera: "",
        passwordHash: superHash,
        twoFactor: { method: null, pinHash: null, secret: null, enabled: false },
        mustChangePassword: false,
        createdAt: Date.now(),
        createdBy: "sistema"
      }
    ];
    state.groups = DEFAULT_GROUPS();
    state.audit = [];
    state.settings = Object.assign({}, DEFAULT_SETTINGS);
    persist("all");
    localStorage.setItem(KEYS.seeded, "1");
    try { localStorage.setItem("ss.dirty.v1", "0"); } catch (e) { /* noop */ }
  }

  /** Migraciones para instalaciones previas (v1 -> v2) */
  function migrate() {
    let changed = false;
    if (!Array.isArray(state.groups) || state.groups.length === 0) {
      state.groups = DEFAULT_GROUPS();
      changed = true;
    }
    if (!Array.isArray(state.audit)) { state.audit = []; changed = true; }
    // Bitácoras heredadas sin grupo: se asignan al primer grupo
    state.bitacoras.forEach((b) => {
      if (!b.group) { b.group = defaultGroupId(); changed = true; }
    });
    // Usuarios heredados sin datos de contacto
    state.users.forEach((u) => {
      if (u.email === undefined) { u.email = ""; u.phone = ""; u.cedula = ""; u.carrera = ""; changed = true; }
    });
    if (changed) persist("all");
  }

  /**
   * Intenta traer los JSON del repositorio (GitHub Pages / servidor local).
   * Solo se sincroniza automáticamente si los datos locales no han sido
   * modificados; para forzar la sincronización se pasa force = true.
   */
  async function pullFromRepo(force) {
    if (location.protocol === "file:") return false;
    if (!force && isDirty()) return false;
    const sources = {
      users: "data/users.json",
      attendance: "data/attendance.json",
      photos: "data/photos.json",
      bitacoras: "data/bitacoras.json",
      jornadas: "data/jornadas.json",
      groups: "data/groups.json"
    };
    let pulled = false;
    for (const [name, path] of Object.entries(sources)) {
      try {
        const res = await fetch(path, { cache: "no-cache" });
        if (!res.ok) continue;
        const json = await res.json();
        const rows = Array.isArray(json) ? json : (json.items || json.data || null);
        if (!Array.isArray(rows)) continue;
        if (rows.length === 0 && state[name].length > 0) continue; // no pisar datos locales
        if (rows.length >= state[name].length) {
          state[name] = rows;
          pulled = true;
        }
      } catch (e) {
        /* 404 o sin red: se ignora silenciosamente */
      }
    }
    if (pulled) persist("all");
    return pulled;
  }

  /* ------------------------- Sincronización en línea ------------------------- */
  /**
   * Aplica en local los datos recibidos del API en línea.
   * @param {object} payload estado completo del servidor
   * @param {boolean} union  primera sincronización: unión de local y remoto
   *                         (en choque de id gana el servidor)
   * @param {Array} pending  operaciones locales aún no subidas (se aplican encima)
   * @returns {boolean} si se aplicó algo
   */
  function applyRemote(payload, union, pending) {
    if (!payload || typeof payload !== "object") return false;
    const pend = Array.isArray(pending) ? pending : [];
    const ARRAY_KEYS = ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit"];

    ARRAY_KEYS.forEach((coll) => {
      const srv = payload[coll];
      if (!Array.isArray(srv)) return; // el servidor no trae esta colección
      const map = new Map();
      if (union) {
        state[coll].forEach((d) => { if (d && d.id) map.set(String(d.id), d); });
      } else if (srv.length === 0 && state[coll].length > 0) {
        return; // un servidor vacío no borra lo local (todavía no se ha subido)
      }
      srv.forEach((d) => { if (d && d.id) map.set(String(d.id), d); });
      pend.forEach((op) => {                    // cambios locales aún sin subir
        if (!op || op.coll !== coll || !op.id) return;
        if (op.action === "del") map.delete(String(op.id));
        else if (op.doc) map.set(String(op.id), op.doc);
      });
      let arr = Array.from(map.values());
      if (coll === "audit") arr = arr.slice(-AUDIT_CAP);
      state[coll] = arr;
      write(KEYS[coll], arr);
    });

    if (payload.settings && typeof payload.settings === "object") {
      const pendSet = pend.find((op) => op && op.coll === "settings");
      const chosen = pendSet && pendSet.doc ? pendSet.doc : payload.settings;
      state.settings = Object.assign({}, DEFAULT_SETTINGS, chosen);
      write(KEYS.settings, state.settings);
    }

    if (state.users.length) localStorage.setItem(KEYS.seeded, "1");
    return true;
  }

  /* ------------------------- Inicialización ------------------------- */
  async function init() {
    loadAll();

    // 1) Al abrir la página se cargan los datos del API en línea
    //    (todos los dispositivos terminan con lo mismo).
    let apiOk = false;
    if (SS.sync && SS.sync.run) {
      try { apiOk = await SS.sync.run(); } catch (e) { apiOk = false; }
    }

    if (apiOk) {
      // El API respondió: es la fuente de verdad
      if (localStorage.getItem(KEYS.seeded) !== "1" || state.users.length === 0) {
        await seedDefaults(); // API recién creado (vacío): cuenta inicial
        loadAll();
      }
    } else {
      // Sin API: semilla local + JSON del repositorio (comportamiento previo)
      const seeded = localStorage.getItem(KEYS.seeded);
      if (!seeded || state.users.length === 0) {
        await seedDefaults();
        loadAll();
      }
      await pullFromRepo();
      loadAll();
    }

    migrate();
    loadAll();

    // 2) Sube lo local pendiente (p. ej. la semilla recién creada)
    if (SS.sync && SS.sync.run) SS.sync.run();
    return state;
  }

  /* ------------------------- Consultas ------------------------- */
  function getUser(id) { return state.users.find((u) => u.id === id) || null; }
  function getUserByUsername(username) {
    const key = String(username || "").trim().toLowerCase();
    return state.users.find((u) => String(u.username).toLowerCase() === key) || null;
  }
  /** Dueño del "usuario de versión visitante" propio de un administrador */
  function getUserByVisitorUsername(username) {
    const key = String(username || "").trim().toLowerCase();
    if (!key) return null;
    return state.users.find((u) => u.visitorUsername && String(u.visitorUsername).toLowerCase() === key) || null;
  }
  /** ¿El nombre ya se usa como usuario principal o como usuario visitante de alguien? */
  function usernameTaken(username, exceptUserId) {
    const key = String(username || "").trim().toLowerCase();
    if (!key) return false;
    return state.users.some((u) =>
      u.id !== exceptUserId &&
      (String(u.username).toLowerCase() === key ||
        (u.visitorUsername && String(u.visitorUsername).toLowerCase() === key))
    );
  }
  /**
   * Resuelve un intento de acceso.
   * @returns {{user: object, flavor: "principal"|"visitante"}|null}
   *  - "principal": credenciales de administración (o de un visitante normal)
   *  - "visitante": credenciales de versión visitante de un administrador
   */
  function resolveLoginUser(username) {
    const main = getUserByUsername(username);
    if (main) return { user: main, flavor: "principal" };
    const vis = getUserByVisitorUsername(username);
    if (vis && vis.visitorPasswordHash) return { user: vis, flavor: "visitante" };
    return null;
  }
  function getUsersByRole(role) { return state.users.filter((u) => u.role === role); }

  function recordsOfUser(userId) {
    return state.attendance.filter((r) => r.userId === userId);
  }
  function approvedOfUser(userId) {
    return state.attendance.filter((r) => r.userId === userId && r.status === "aprobado");
  }
  function minutesOfUser(userId) {
    return approvedOfUser(userId).reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
  }
  function minutesByGroup(userId) {
    const res = {};
    groupsList().forEach((g) => { res[g.id] = 0; });
    approvedOfUser(userId).forEach((r) => {
      if (res[r.group] !== undefined) res[r.group] += Number(r.minutes) || 0;
    });
    return res;
  }
  function groupMinutes(group) {
    return state.attendance
      .filter((r) => r.status === "aprobado" && r.group === group)
      .reduce((s, r) => s + (Number(r.minutes) || 0), 0);
  }
  function pendingCount(scopeGroup) {
    return state.attendance.filter((r) => r.status === "pendiente" && (!scopeGroup || r.group === scopeGroup)).length;
  }
  function statusCounts(scopeGroup) {
    const c = { aprobado: 0, pendiente: 0, rechazado: 0 };
    state.attendance.forEach((r) => {
      if (scopeGroup && r.group !== scopeGroup) return;
      if (c[r.status] !== undefined) c[r.status]++;
    });
    return c;
  }

  function jornadaOf(date, group) {
    return state.jornadas.find((j) => j.date === date && (group ? j.group === group : true)) || null;
  }
  function ensureJornada(date, group, user) {
    loadAll();
    const gid = group || defaultGroupId();
    let j = jornadaOf(date, gid);
    if (!j) {
      j = {
        id: U.uid("jor"),
        date,
        group: gid,
        createdAt: Date.now(),
        createdBy: user ? user.username : "sistema"
      };
      state.jornadas.push(j);
      persist("jornadas");
    }
    return j;
  }

  function bitacoraOf(date, group) {
    const gid = group || defaultGroupId();
    return state.bitacoras.find((b) => b.date === date && (b.group || defaultGroupId()) === gid) || null;
  }

  function photosOfDate(date, group) {
    return state.photos.filter((p) => p.date === date && (!group || p.group === group));
  }

  /* ------------------------- Mutaciones (CRUD) -------------------------
     Cada mutación vuelve a leer localStorage antes de operar: así varias
     pestañas/dispositivos no pisan los cambios entre sí al navegar.       */
  function addUser(user) {
    loadAll();
    state.users.push(user);
    persist("users");
    return user;
  }
  function updateUser(id, patch) {
    loadAll();
    const u = getUser(id);
    if (!u) return null;
    Object.assign(u, patch);
    persist("users");
    return u;
  }
  function removeUser(id) {
    loadAll();
    const before = state.users.length;
    state.users = state.users.filter((u) => u.id !== id);
    persist("users");
    // La cuenta eliminada desaparece también de asistencias y solicitudes;
    // la auditoría conserva el evento de eliminación.
    const n = state.attendance.length;
    state.attendance = state.attendance.filter((r) => r.userId !== id);
    if (state.attendance.length !== n) persist("attendance");
    return state.users.length < before;
  }

  function addRecord(rec) {
    loadAll();
    state.attendance.push(rec);
    persist("attendance");
    return rec;
  }
  function updateRecord(id, patch) {
    loadAll();
    const r = state.attendance.find((x) => x.id === id);
    if (!r) return null;
    Object.assign(r, patch);
    persist("attendance");
    return r;
  }
  function removeRecord(id) {
    loadAll();
    const before = state.attendance.length;
    state.attendance = state.attendance.filter((r) => r.id !== id);
    persist("attendance");
    return state.attendance.length < before;
  }

  function saveBitacora(date, text, user, group) {
    loadAll();
    const gid = group || defaultGroupId();
    let b = bitacoraOf(date, gid);
    if (!b) {
      b = { id: U.uid("bit"), date, group: gid, text: "", createdAt: Date.now(), createdBy: user ? user.username : "" };
      state.bitacoras.push(b);
    }
    b.text = text;
    b.updatedAt = Date.now();
    b.updatedBy = user ? user.username : "";
    persist("bitacoras");
    return b;
  }
  function removeBitacora(date, group) {
    loadAll();
    const gid = group || defaultGroupId();
    const before = state.bitacoras.length;
    state.bitacoras = state.bitacoras.filter((b) => !(b.date === date && (b.group || defaultGroupId()) === gid));
    persist("bitacoras");
    return state.bitacoras.length < before;
  }

  function addPhoto(photo) {
    loadAll();
    state.photos.push(photo);
    persist("photos");
    return photo;
  }
  function removePhoto(id) {
    loadAll();
    const before = state.photos.length;
    state.photos = state.photos.filter((p) => p.id !== id);
    persist("photos");
    return state.photos.length < before;
  }
  function updatePhoto(id, patch) {
    loadAll();
    const p = state.photos.find((x) => x.id === id);
    if (!p) return null;
    Object.assign(p, patch);
    persist("photos");
    return p;
  }

  function setSettings(patch) {
    loadAll();
    Object.assign(state.settings, patch);
    persist("settings");
    return state.settings;
  }

  /* ------------------------- Sesión ------------------------- */
  function getSession() { return read(KEYS.session, null); }
  function setSession(obj) {
    if (!obj) localStorage.removeItem(KEYS.session);
    else write(KEYS.session, obj);
  }

  /* ------------------------- Export / Import (commit al repositorio) ------------------------- */
  /**
   * Estructura idéntica a los archivos del repositorio.
   * @param {object} opts { includeImages: boolean }
   */
  function exportBundle(opts) {
    const includeImages = !!(opts && opts.includeImages);
    const photos = state.photos.map((p) => {
      const copy = Object.assign({}, p);
      if (!includeImages) delete copy.dataUrl;
      return copy;
    });
    return {
      _info: {
        app: "Control Servicio Social",
        version: VERSION,
        exportedAt: new Date().toISOString(),
        hint: "Sube estos archivos a la carpeta data/ del repositorio y ejecuta git commit."
      },
      users: state.users,
      attendance: state.attendance,
      jornadas: state.jornadas,
      bitacoras: state.bitacoras,
      groups: state.groups,
      audit: state.audit,
      photos
    };
  }

  /** Descarga cada archivo JSON listo para la carpeta data/ */
  function downloadRepoFiles(opts) {
    const bundle = exportBundle(opts);
    U.downloadJSON({ _info: bundle._info, items: bundle.users }, "users.json");
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.attendance }, "attendance.json"), 250);
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.jornadas }, "jornadas.json"), 500);
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.bitacoras }, "bitacoras.json"), 750);
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.groups }, "groups.json"), 1000);
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.audit }, "audit.json"), 1250);
    setTimeout(() => U.downloadJSON({ _info: bundle._info, items: bundle.photos }, "photos.json"), 1500);
  }

  function downloadFullBackup() {
    U.downloadJSON(exportBundle({ includeImages: true }), `servicio-social_backup_${U.todayISO()}.json`);
  }

  /** Importa un respaldo completo (reemplaza los datos locales) */
  async function importBundle(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Archivo no válido");
    const collections = ["users", "attendance", "photos", "bitacoras", "jornadas", "groups", "audit"];
    const found = collections.filter((k) => Array.isArray(obj[k]));
    if (!found.includes("users")) {
      throw new Error("El archivo no contiene la colección de usuarios (data/users.json)");
    }
    if (!obj.users.some((u) => u && u.role === "superadmin")) {
      throw new Error("El respaldo debe conservar al menos una cuenta Super Admin");
    }
    state.users = obj.users;
    if (found.includes("attendance")) state.attendance = obj.attendance;
    if (found.includes("photos")) state.photos = obj.photos;
    if (found.includes("bitacoras")) state.bitacoras = obj.bitacoras;
    if (found.includes("jornadas")) state.jornadas = obj.jornadas;
    if (found.includes("groups")) state.groups = obj.groups;
    if (found.includes("audit")) state.audit = obj.audit;
    if (obj.settings) state.settings = Object.assign({}, DEFAULT_SETTINGS, obj.settings);
    persist("all");
    localStorage.setItem(KEYS.seeded, "1");
    return true;
  }

  /* ------------------------- Utilidades de fotos ------------------------- */
  function downloadPhoto(photo) {
    if (photo.dataUrl) {
      const a = document.createElement("a");
      a.href = photo.dataUrl;
      a.download = photo.fileName || `${photo.id}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return true;
    }
    return false;
  }

  SS.store = {
    VERSION, KEYS, DEFAULT_SETTINGS, AUDIT_CAP,
    init, loadAll, persist, reset, seedDefaults, pullFromRepo, applyRemote,
    get state() { return state; },
    read, write,
    getUser, getUserByUsername, getUserByVisitorUsername, usernameTaken, resolveLoginUser, getUsersByRole,
    recordsOfUser, approvedOfUser, minutesOfUser, minutesByGroup, groupMinutes,
    pendingCount, statusCounts,
    jornadaOf, ensureJornada, bitacoraOf, photosOfDate,
    groupsList, groupById, groupName, groupsOptions, defaultGroupId,
    addGroup, updateGroup, removeGroup, groupUsage,
    addAudit, auditList,
    addUser, updateUser, removeUser,
    addRecord, updateRecord, removeRecord,
    saveBitacora, removeBitacora, addPhoto, removePhoto, updatePhoto,
    setSettings,
    getSession, setSession,
    exportBundle, downloadRepoFiles, downloadFullBackup, importBundle,
    downloadPhoto
  };
})();
