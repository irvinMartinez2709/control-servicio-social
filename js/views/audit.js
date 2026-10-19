/* =============================================================
   views/audit.js — Registro de auditoría (todos los admins)
   Muestra cada acción con usuario, fecha y hora; incluye búsqueda
   y filtro por tipo de acción.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  const filters = { q: "", type: "todos" };
  let limit = 60;

  const TYPES = () => SS.audit.TYPES;

  /** "YYYY-MM-DD" local de un timestamp */
  function isoOf(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  /** "HH:MM:SS" local de un timestamp */
  function fmtClock(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
  }

  function render(root) {
    const actor = SS.auth.currentUser();
    if (!actor) return;
    if (!SS.auth.can(actor, "audit:view")) {
      root.innerHTML = `
        <div class="page-head"><div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-lock"></i> Acceso restringido</span>
          <h1>Auditoría</h1><p>Sección reservada a administradores.</p>
        </div></div>
        ${UI.emptyState("fa-clipboard-list", "Sin permisos", "Tu rol no tiene acceso al registro de auditoría.", `<a class="btn btn--primary" href="#/resumen"><i class="fa-solid fa-arrow-left"></i> Volver</a>`)}`;
      return;
    }

    const entries = SS.store.state.audit.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));

    const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const filtered = entries.filter((e) => {
      if (filters.type !== "todos" && e.type !== filters.type) return false;
      if (filters.q) {
        const hay = norm(`${e.actor || ""} ${e.actorName || ""} ${e.action || ""} ${e.detail || ""}`);
        if (!hay.includes(norm(filters.q))) return false;
      }
      return true;
    });

    const visible = filtered.slice(0, limit);
    const today = U.todayISO();
    const todayCount = entries.filter((e) => isoOf(e.ts) === today).length;
    const actors = new Set(entries.map((e) => e.actor)).size;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-clipboard-list"></i> Trazabilidad</span>
          <h1>Auditoría</h1>
          <p>Registro completo de inicios de sesión, cuentas, cambios, solicitudes y acciones de la plataforma.</p>
        </div>
        <div class="page-head__actions">
          ${SS.auth.can(actor, "data:export") ? `<button class="btn btn--soft" id="btn-export"><i class="fa-solid fa-file-export"></i> Exportar auditoría</button>` : ""}
        </div>
      </div>

      <div class="grid grid-3 mb-4">
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-list-ol"></i></span>
          <div class="stat__body"><div class="stat__label">Eventos registrados</div><div class="stat__value">${entries.length}</div><div class="stat__sub">máximo ${SS.store.AUDIT_CAP} retenidos</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--accent"><i class="fa-solid fa-calendar-day"></i></span>
          <div class="stat__body"><div class="stat__label">Eventos de hoy</div><div class="stat__value">${todayCount}</div><div class="stat__sub">${esc(U.fmtDate(today))}</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-users"></i></span>
          <div class="stat__body"><div class="stat__label">Usuarios con actividad</div><div class="stat__value">${actors}</div><div class="stat__sub">distintos</div></div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="q" type="search" placeholder="Buscar por usuario, acción o detalle…" value="${esc(filters.q)}">
        </div>
        <div class="tabs" role="tablist">
          <button class="tab ${filters.type === "todos" ? "is-active" : ""}" data-type="todos"><i class="fa-solid fa-list"></i> Todas</button>
          ${Object.entries(TYPES()).map(([key, t]) => `
            <button class="tab ${filters.type === key ? "is-active" : ""}" data-type="${key}"><i class="fa-solid ${t.icon}"></i> ${esc(t.label)}</button>`).join("")}
        </div>
        <span class="chip chip--soft"><i class="fa-solid fa-filter"></i> ${filtered.length} resultado(s)</span>
      </div>

      <div class="card">
        <div class="card__head">
          <span class="card__icon card__icon--warn"><i class="fa-solid fa-timeline"></i></span>
          <div>
            <h2>Registro de actividades</h2>
            <div class="small muted">Más recientes primero</div>
          </div>
        </div>
        ${visible.length ? `
          <div class="audit-list">
            ${visible.map((e) => {
              const t = TYPES()[e.type] || TYPES().sistema;
              return `
              <div class="audit-item">
                <span class="audit-item__icon" style="color:${t.color}"><i class="fa-solid ${t.icon}"></i></span>
                <div class="audit-item__body">
                  <div class="audit-item__head">
                    <strong>${esc(e.action || "Acción")}</strong>
                    <span class="badge badge--neutral">${esc(t.label)}</span>
                  </div>
                  ${e.detail ? `<p class="audit-item__detail">${esc(e.detail)}</p>` : ""}
                  <div class="audit-item__meta">
                    <span><i class="fa-solid fa-user"></i> ${esc(e.actorName || e.actor || "sistema")}${e.role ? ` · ${esc(e.role)}${e.mode ? ` (${esc(e.mode)})` : ""}` : ""}</span>
                  </div>
                </div>
                <time class="audit-item__time" title="${esc(U.fmtStamp(e.ts))}">
                  <strong>${esc(U.fmtDate(isoOf(e.ts), true))}</strong>
                  <span>${esc(fmtClock(e.ts))}</span>
                </time>
              </div>`;
            }).join("")}
          </div>
          ${filtered.length > visible.length ? `
            <div class="center mt-3">
              <button class="btn btn--soft" id="btn-more"><i class="fa-solid fa-rotate-down"></i> Cargar más (${filtered.length - visible.length} restantes)</button>
            </div>` : ""}`
        : UI.emptyState("fa-clipboard-list", "Sin eventos", "Aún no hay actividades registradas con los filtros aplicados.")}
      </div>`;

    const btnExport = root.querySelector("#btn-export");
    if (btnExport) btnExport.addEventListener("click", () => {
      U.downloadJSON({ _info: { app: "Control Servicio Social", exportedAt: new Date().toISOString() }, items: SS.store.state.audit }, "audit.json");
      SS.audit.log("sistema", "Exportó auditoría", "Descarga de audit.json");
      UI.toast("audit.json generado", "success", 3000, "Colócalo en data/ y haz commit");
    });

    const btnMore = root.querySelector("#btn-more");
    if (btnMore) btnMore.addEventListener("click", () => { limit += 60; render(root); });

    root.querySelectorAll("[data-type]").forEach((tab) => {
      tab.addEventListener("click", () => { filters.type = tab.dataset.type; limit = 60; render(root); });
    });

    const q = root.querySelector("#q");
    if (q) q.addEventListener("input", U.debounce(() => {
      filters.q = q.value.trim();
      limit = 60;
      render(root);
      const nq = root.querySelector("#q");
      if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
    }, 240));
  }

  /** Entrada desde el menú: filtros limpios; las re-render internas los conservan */
  SS.views.auditoria = function (root) {
    filters.q = "";
    filters.type = "todos";
    limit = 60;
    render(root);
  };
})();
