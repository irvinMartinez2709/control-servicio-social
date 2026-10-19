/* =============================================================
   util.js — Utilidades base: DOM, fechas, tiempo, descargas
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});

  /* ------------------------- DOM ------------------------- */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Crea un elemento desde HTML string */
  function html(str) {
    const t = document.createElement("template");
    t.innerHTML = str.trim();
    return t.content.firstElementChild;
  }

  /** Escapa texto para inserción segura en HTML */
  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ------------------------- IDENTIFICADORES ------------------------- */
  function uid(prefix) {
    const rand = Math.random().toString(36).slice(2, 8);
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + rand;
  }

  /* ------------------------- FECHAS ------------------------- */
  const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  /** Hoy en formato YYYY-MM-DD (hora local) */
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  /** YYYY-MM-DD -> objeto Date (mediodía, evita desfases de zona horaria) */
  function parseISO(iso) {
    if (!iso) return new Date();
    const [y, m, d] = String(iso).split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  }

  /** "2026-10-18" -> "18 oct 2026" */
  function fmtDate(iso, short) {
    const d = parseISO(iso);
    if (isNaN(d)) return "—";
    const mes = short ? MESES_CORTO[d.getMonth()] : MESES[d.getMonth()];
    return `${d.getDate()} ${mes} ${d.getFullYear()}`;
  }

  /** "2026-10-18" -> "Domingo, 18 de Octubre de 2026" */
  function fmtDateLong(iso) {
    const d = parseISO(iso);
    if (isNaN(d)) return "—";
    return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  }

  /** Día corto para timeline: {dia: "18", mes: "oct"} */
  function dateParts(iso) {
    const d = parseISO(iso);
    return { dia: String(d.getDate()).padStart(2, "0"), mes: MESES_CORTO[d.getMonth()].toLowerCase(), anio: d.getFullYear() };
  }

  /* ------------------------- TIEMPO (formato estricto) ------------------------- */
  /**
   * Convierte minutos a texto exacto sin decimales ilógicos.
   * 648 min -> "10 hrs 48 mins"
   */
  function fmtHM(minutes, opts) {
    const cfg = opts || {};
    const total = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (cfg.compact) {
      if (h === 0) return `${m}m`;
      return m === 0 ? `${h}h` : `${h}h ${m}m`;
    }
    if (h === 0 && m === 0) return "0 hrs 0 mins";
    if (h === 0) return `${m} ${m === 1 ? "min" : "mins"}`;
    const hs = `${h} ${h === 1 ? "hr" : "hrs"}`;
    const ms = `${m} ${m === 1 ? "min" : "mins"}`;
    return `${hs} ${ms}`;
  }

  /** "HH:MM" -> minutos totales */
  function timeToMinutes(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    return h * 60 + m;
  }

  /**
   * Calcula horas trabajadas entre entrada y salida.
   * Si la salida es menor que la entrada, se asume cruce de medianoche.
   */
  function diffMinutes(entry, exit) {
    let a = timeToMinutes(entry);
    let b = timeToMinutes(exit);
    if (!a && !b) return 0;
    if (b < a) b += 24 * 60;
    return Math.max(0, b - a);
  }

  /** Hora local actual "HH:MM" */
  function nowHM() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /** Timestamp legible */
  function fmtStamp(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d)) return "—";
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  /* ------------------------- VARIOS ------------------------- */
  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function pct(part, total) {
    if (!total) return 0;
    return clamp(Math.round((part / total) * 100), 0, 100);
  }

  function initials(name) {
    if (!name) return "?";
    const parts = String(name).trim().split(/[\s_.-]+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /** Descarga un objeto como archivo JSON */
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Lee un File como dataURL */
  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  /** Debounce simple */
  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 200);
    };
  }

  /** Ordena array de objetos por clave descendente */
  function sortBy(list, key, dir) {
    const sign = dir === "asc" ? 1 : -1;
    return list.slice().sort((a, b) => {
      const av = a[key], bv = b[key];
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * sign;
    });
  }

  /* ------------------------- MODO OSCURO DEL SISTEMA ------------------------- */
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  SS.util = {
    $, $$, html, esc, uid,
    MESES, MESES_CORTO, DIAS,
    todayISO, parseISO, fmtDate, fmtDateLong, dateParts,
    fmtHM, timeToMinutes, diffMinutes, nowHM, fmtStamp,
    clamp, pct, initials, sortBy,
    downloadJSON, downloadBlob, readFileAsDataURL, debounce,
    systemPrefersDark
  };
})();
