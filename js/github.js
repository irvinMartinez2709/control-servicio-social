/* =============================================================
   github.js — GitHub como base de datos (data/*.json del repo)
   -------------------------------------------------------------
   - Lectura: raw.githubusercontent.com (repo público, sin token).
   - Escritura: API de Contents con un token PERSONAL que cada
     administrador pega una vez en Ajustes → Datos en línea (GitHub).
     El token se guarda SOLO en este navegador; nunca en el código
     ni en el repositorio.
   - Cada subida = un commit por archivo JSON modificado, y solo si
     el contenido cambió realmente (sin commits vacíos).
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const TOKEN_KEY = "ss.github.token";

  /* Propietario/repo derivados de la URL de Pages (funciona en forks). */
  const OWNER = (function () {
    const m = /^([^.]+)\.github\.io$/.exec(location.hostname);
    return m ? m[1] : "irvinMartinez2709";
  })();
  const REPO = (function () {
    if (!/\.github\.io$/.test(location.hostname)) return "control-servicio-social";
    const seg = location.pathname.split("/").filter(Boolean)[0];
    return seg || "control-servicio-social";
  })();

  /* Colecciones sincronizadas con el repo (los ajustes del tema
     quedan en cada dispositivo; no son contenido compartido). */
  const FILES = {
    users: "data/users.json",
    attendance: "data/attendance.json",
    photos: "data/photos.json",
    bitacoras: "data/bitacoras.json",
    jornadas: "data/jornadas.json",
    groups: "data/groups.json",
    audit: "data/audit.json"
  };

  const rawBase = () => `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/`;
  const apiBase = () => `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* almacenamiento bloqueado */ }
  }

  function headers(json) {
    const h = { "Accept": "application/vnd.github+json" };
    const t = token();
    if (t) h["Authorization"] = "Bearer " + t;
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  /** Lee un archivo tal como está en la rama main (sin token, con anti-caché). */
  function rawText(path) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 8000);
    return fetch(rawBase() + path + "?_=" + Date.now(), { cache: "no-store", signal: ctl.signal })
      .then((r) => { clearTimeout(to); if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
      .catch((e) => { clearTimeout(to); throw e; });
  }

  /** Acepta lista plana u objeto con _info + items (formato del repo). */
  function parseItems(text) {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return { items: json, info: null };
    if (json && Array.isArray(json.items)) return { items: json.items, info: json._info || null };
    return { items: [], info: null };
  }

  /**
   * Construye el contenido JSON de un archivo del repo.
   * Conserva el bloque _info documental del archivo existente.
   */
  function buildFileContent(coll, docs, prevText) {
    let info = null;
    if (prevText) {
      try {
        const prev = JSON.parse(prevText);
        if (prev && !Array.isArray(prev) && prev._info) info = prev._info;
      } catch (e) { /* archivo ilegible: se reescribe limpio */ }
    }
    const obj = info ? { _info: info, items: docs } : { items: docs };
    return JSON.stringify(obj, null, 2) + "\n";
  }

  /** UTF-8 → base64 (la API de Contents recibe base64). */
  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /**
   * Sube un archivo JSON al repo como commit.
   * @returns {"created"|"updated"|"unchanged"}
   */
  async function pushFile(coll, docs, message) {
    const path = FILES[coll];
    if (!path) throw new Error("Colección desconocida: " + coll);
    if (!token()) throw new Error("Falta el token de GitHub (Ajustes → Datos en línea)");

    for (let attempt = 0; attempt < 3; attempt++) {
      // object+json entrega el sha (necesario para actualizar); los
      // archivos mayores a 1 MB no traen contenido en el objeto.
      const res = await fetch(apiBase() + path + "?ref=main", {
        headers: Object.assign(headers(false), { "Accept": "application/vnd.github.object+json" }),
        cache: "no-store"
      });

      if (res.status === 401 || res.status === 403) {
        throw new Error("Token inválido o sin permisos de escritura (Contents: Read and write)");
      }

      let prevText = null;
      let sha = null;
      if (res.status === 404) {
        sha = null; // archivo nuevo: se crea
      } else if (res.ok) {
        const meta = await res.json();
        sha = meta.sha || null;
        if (meta.content && meta.encoding === "base64") {
          prevText = fromBase64(meta.content);
        } else if (sha) {
          // Archivo grande (>1 MB): se baja en crudo solo para
          // conservar el bloque _info y detectar cambios reales.
          const raw = await fetch(apiBase() + path + "?ref=main", {
            headers: Object.assign(headers(false), { "Accept": "application/vnd.github.v3.raw" }),
            cache: "no-store"
          });
          if (raw.ok) prevText = await raw.text();
        }
      } else {
        continue; // error transitorio: se reintenta
      }

      const content = buildFileContent(coll, docs, prevText);
      if (prevText !== null) {
        try {
          if (JSON.stringify(JSON.parse(prevText)) === JSON.stringify(JSON.parse(content))) {
            return "unchanged"; // nada que committing: evita commits vacíos
          }
        } catch (e) { /* contenido ilegible: se reescribe */ }
      }

      const body = { message, content: toBase64(content), branch: "main" };
      if (sha) body.sha = sha;
      const put = await fetch(apiBase() + path, {
        method: "PUT", headers: headers(true), body: JSON.stringify(body)
      });
      if (put.ok) return sha ? "updated" : "created";
      if (put.status === 401 || put.status === 403) {
        throw new Error("Token sin permisos de escritura (Contents: Read and write)");
      }
      if (put.status === 409 || put.status === 422) continue; // sha caducado: se relee
    }
    throw new Error("No se pudo subir " + path + " tras varios intentos");
  }

  /** Identidad del token (para el estado en Ajustes). */
  async function whoAmI() {
    if (!token()) return null;
    const res = await fetch("https://api.github.com/user", { headers: headers(false), cache: "no-store" });
    if (!res.ok) return null;
    const u = await res.json().catch(() => null);
    return u && u.login ? u.login : null;
  }

  SS.github = { OWNER, REPO, FILES, token, setToken, rawText, parseItems, buildFileContent, pushFile, whoAmI };
})();
