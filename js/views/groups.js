/* =============================================================
   views/groups.js — Gestión de grupos (solo Líder Supremo)
   Solo el Líder Supremo crea, renombra o elimina grupos.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  /* ------------------------- Acciones ------------------------- */
  function createGroup(actor) {
    UI.formModal({
      title: "Crear grupo",
      icon: "fa-people-group",
      submitLabel: "Crear grupo",
      submitIcon: "fa-plus",
      fields: [
        { name: "name", label: "Nombre del grupo", icon: "fa-tag", required: true, placeholder: "Ej. Cuadro 7", hint: "Aparecerá en formularios, filtros y badges." }
      ],
      onSubmit: (data) => {
        if (!SS.auth.can(actor, "groups:manage")) throw new Error("Solo el Líder Supremo puede crear grupos");
        const group = SS.store.addGroup(data.name, actor);
        SS.audit.log("grupos", "Creó grupo", `${group.name} (id ${group.id})`);
        UI.toast("Grupo creado", "success", 3000, group.name);
        return true;
      }
    }).then((res) => { if (res !== null) render(U.$("#view")); });
  }

  function renameGroup(actor, group) {
    UI.formModal({
      title: "Renombrar grupo",
      icon: "fa-pen-to-square",
      submitLabel: "Guardar nombre",
      fields: [
        { name: "name", label: "Nombre del grupo", icon: "fa-tag", required: true, value: group.name, hint: "El identificador interno no cambia." }
      ],
      onSubmit: (data) => {
        const old = group.name;
        SS.store.updateGroup(group.id, { name: data.name }, actor);
        SS.audit.log("grupos", "Renombró grupo", `"${old}" → "${data.name}"`);
        UI.toast("Grupo actualizado", "success");
        return true;
      }
    }).then((res) => { if (res !== null) render(U.$("#view")); });
  }

  function deleteGroup(actor, group) {
    const usage = SS.store.groupUsage(group.id);
    const total = Object.values(usage).reduce((s, n) => s + n, 0);
    UI.confirm({
      heading: "Eliminar grupo",
      title: `¿Eliminar el grupo ${group.name}?`,
      message: total > 0
        ? `No se puede eliminar: tiene ${total} referencia(s) (usuarios, registros, jornadas, fotos o bitácoras). Reasígnalas antes.`
        : "El grupo está vacío y podrá eliminarse sin afectar datos. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      danger: true,
      disabled: total > 0
    }).then((ok) => {
      if (!ok) return;
      try {
        SS.store.removeGroup(group.id, actor);
        SS.audit.log("grupos", "Eliminó grupo", `${group.name} (id ${group.id})`);
        UI.toast("Grupo eliminado", "warn");
        render(U.$("#view"));
        SS.app.refreshChrome();
      } catch (err) {
        UI.toast(err.message, "error");
      }
    });
  }

  /* ------------------------- Vista ------------------------- */
  function render(root) {
    const actor = SS.auth.currentUser();
    if (!actor) return;
    if (!SS.auth.isSuper(actor)) {
      root.innerHTML = `
        <div class="page-head"><div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-lock"></i> Acceso restringido</span>
          <h1>Grupos</h1><p>Sección reservada al Líder Supremo.</p>
        </div></div>
        ${UI.emptyState("fa-people-group", "Sin permisos", "Solo el Líder Supremo puede gestionar los grupos de la plataforma.", `<a class="btn btn--primary" href="#/resumen"><i class="fa-solid fa-arrow-left"></i> Volver</a>`)}`;
      return;
    }

    const st = SS.store.state;
    const groups = SS.store.groupsList();
    const totalUsers = st.users.length;
    const totalMinutes = st.attendance.filter((r) => r.status === "aprobado").reduce((s, r) => s + (Number(r.minutes) || 0), 0);

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-people-group"></i> Configuración</span>
          <h1>Grupos</h1>
          <p>Crea y administra los grupos de la plataforma (Cuadro 3, Cuadro 6 y los tuyos).</p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--primary" id="btn-create"><i class="fa-solid fa-plus"></i> Crear grupo</button>
        </div>
      </div>

      <div class="grid grid-3 mb-4">
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-people-group"></i></span>
          <div class="stat__body"><div class="stat__label">Grupos</div><div class="stat__value">${groups.length}</div><div class="stat__sub">activos en la plataforma</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-users"></i></span>
          <div class="stat__body"><div class="stat__label">Usuarios</div><div class="stat__value">${totalUsers}</div><div class="stat__sub">asignados a grupos</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--accent"><i class="fa-solid fa-hourglass-half"></i></span>
          <div class="stat__body"><div class="stat__label">Horas totales</div><div class="stat__value">${U.fmtHM(totalMinutes)}</div><div class="stat__sub">aprobadas en todos los grupos</div></div>
        </div>
      </div>

      <div class="stack">
        ${groups.map((g) => {
          const usage = SS.store.groupUsage(g.id);
          const users = st.users.filter((u) => u.group === g.id);
          const mins = SS.store.groupMinutes(g.id);
          return `
          <article class="card group-card">
            <div class="card__head">
              <span class="card__icon"><i class="fa-solid fa-people-group"></i></span>
              <div>
                <h2>${esc(g.name)} ${g.builtin ? '<span class="badge badge--neutral">Base</span>' : ""}</h2>
                <div class="small muted">ID: <code class="kbd">${esc(g.id)}</code> · creado ${g.createdAt ? U.fmtStamp(g.createdAt) : "por el sistema"}</div>
              </div>
              <div class="card__actions">
                <button class="btn btn--sm btn--soft" data-act="rename" data-group="${esc(g.id)}"><i class="fa-solid fa-pen"></i> Renombrar</button>
                <button class="btn btn--sm btn--ghost" data-act="delete" data-group="${esc(g.id)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>
            <div class="group-card__body">
              <div class="group-card__stat"><i class="fa-solid fa-users"></i> <strong>${users.length}</strong> usuario(s)</div>
              <div class="group-card__stat"><i class="fa-solid fa-calendar-check"></i> <strong>${usage.attendance}</strong> registro(s)</div>
              <div class="group-card__stat"><i class="fa-solid fa-calendar-day"></i> <strong>${usage.jornadas}</strong> jornada(s)</div>
              <div class="group-card__stat"><i class="fa-solid fa-camera"></i> <strong>${usage.photos}</strong> foto(s)</div>
              <div class="group-card__stat"><i class="fa-solid fa-book-open"></i> <strong>${usage.bitacoras}</strong> bitácora(s)</div>
              <div class="group-card__stat group-card__stat--hours"><i class="fa-solid fa-hourglass-half"></i> <strong>${U.fmtHM(mins)}</strong> aprobadas</div>
            </div>
            ${users.length ? `
              <div class="group-card__users gap-row">
                ${users.slice(0, 8).map((u) => `<span class="chip chip--soft"><i class="fa-solid fa-user"></i> ${esc(u.displayName)}</span>`).join("")}
                ${users.length > 8 ? `<span class="chip chip--soft">+${users.length - 8} más</span>` : ""}
              </div>` : ""}
          </article>`;
        }).join("")}
      </div>`;

    const btnCreate = root.querySelector("#btn-create");
    if (btnCreate) btnCreate.addEventListener("click", () => createGroup(actor));

    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const g = SS.store.groupById(btn.dataset.group);
        if (!g) return;
        if (btn.dataset.act === "rename") renameGroup(actor, g);
        else if (btn.dataset.act === "delete") deleteGroup(actor, g);
      });
    });
  }

  SS.views.grupos = render;
})();
