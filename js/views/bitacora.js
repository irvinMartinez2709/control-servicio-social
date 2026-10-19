/* =============================================================
   views/bitacora.js — Bitácora de actividades por jornada y grupo
   Cada entrada pertenece a una fecha + grupo; los visitantes solo
   ven las bitácoras de su grupo.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  let query = "";

  /** Pares fecha+grupo relevantes (opcionalmente acotados a un grupo) */
  function relevantPairs(scopeGroup) {
    const st = SS.store.state;
    const pairs = new Set();
    const add = (date, group) => {
      if (!date) return;
      const g = group || SS.store.defaultGroupId();
      if (scopeGroup && g !== scopeGroup) return;
      pairs.add(`${date}|${g}`);
    };
    st.jornadas.forEach((j) => add(j.date, j.group));
    st.attendance.forEach((r) => add(r.date, r.group));
    st.bitacoras.forEach((b) => { if (b.text && b.text.trim()) add(b.date, b.group); });
    st.photos.forEach((p) => add(p.date, p.group));
    return Array.from(pairs).map((k) => {
      const [date, group] = k.split("|");
      return { date, group };
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function dayMinutes(date, group) {
    return SS.store.state.attendance
      .filter((r) => r.date === date && r.group === group && r.status === "aprobado")
      .reduce((s, r) => s + (Number(r.minutes) || 0), 0);
  }

  function dayPeople(date, group) {
    const users = SS.store.state.attendance
      .filter((r) => r.date === date && r.group === group)
      .map((r) => r.userId);
    return new Set(users).size;
  }

  function editEntry(user, date, group) {
    const gid = group || user.group || SS.store.defaultGroupId();
    const current = SS.store.bitacoraOf(date, gid);
    UI.formModal({
      title: `Bitácora · ${U.fmtDate(date)}`,
      icon: "fa-pen-nib",
      size: "wide",
      submitLabel: "Guardar bitácora",
      submitIcon: "fa-floppy-disk",
      cancelLabel: "Cancelar",
      fields: [
        { name: "date", label: "Fecha", icon: "fa-calendar-day", type: "date", required: true, value: date },
        { name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: gid, options: SS.store.groupsOptions() },
        {
          name: "text",
          label: "Resumen de actividades realizadas",
          icon: "fa-list-check",
          type: "textarea",
          required: true,
          value: current ? current.text : "",
          hint: "Describe las actividades del día: objetivos, tareas, incidencias y resultados.",
          error: "Escribe el resumen de la jornada"
        }
      ],
      onSubmit: (data) => {
        SS.store.saveBitacora(data.date, data.text, user, data.group);
        SS.audit.log("contenido", current ? "Editó bitácora" : "Creó bitácora", `${U.fmtDate(data.date)} · ${SS.store.groupName(data.group)}`);
        UI.toast("Bitácora guardada", "success");
        return true;
      }
    }).then((res) => { if (res !== null) render(U.$("#view")); });
  }

  function removeEntry(user, date, group) {
    UI.confirm({
      heading: "Eliminar bitácora",
      title: "¿Eliminar la bitácora de esta fecha?",
      message: `${U.fmtDateLong(date)} · ${SS.store.groupName(group)}`,
      confirmLabel: "Eliminar",
      danger: true
    }).then((ok) => {
      if (!ok) return;
      SS.store.removeBitacora(date, group);
      SS.audit.log("contenido", "Eliminó bitácora", `${U.fmtDate(date)} · ${SS.store.groupName(group)}`);
      UI.toast("Bitácora eliminada", "warn");
      render(U.$("#view"));
    });
  }

  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    const st = SS.store.state;
    const canEdit = SS.auth.can(user, "bitacora:manage");
    const vg = SS.auth.visibleGroup(user);

    let pairs = relevantPairs(vg);
    if (query) {
      const q = query.toLowerCase();
      pairs = pairs.filter((p) => {
        const entry = SS.store.bitacoraOf(p.date, p.group);
        return U.fmtDateLong(p.date).toLowerCase().includes(q)
          || p.date.includes(q)
          || UI.groupLabel(p.group).toLowerCase().includes(q)
          || (entry && entry.text.toLowerCase().includes(q));
      });
    }

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-book-open"></i> Registro narrativo</span>
          <h1>Bitácora</h1>
          <p>${vg
            ? `Resumen de actividades de ${esc(UI.groupLabel(vg))}, vinculado a la asistencia y la evidencia fotográfica.`
            : "Resumen de actividades de cada jornada y grupo, vinculado a la asistencia y la evidencia fotográfica."}</p>
        </div>
        <div class="page-head__actions">
          ${canEdit ? `<button class="btn btn--primary" id="btn-new"><i class="fa-solid fa-plus"></i> Nueva entrada</button>` : ""}
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="q" type="search" placeholder="Buscar por fecha, grupo o contenido…" value="${esc(query)}">
        </div>
        ${vg ? `<span class="chip chip--soft"><i class="fa-solid fa-people-group"></i> ${esc(UI.groupLabel(vg))}</span>` : ""}
        <span class="chip chip--soft"><i class="fa-solid fa-layer-group"></i> ${pairs.length} entrada(s)</span>
      </div>

      <div class="stack">
        ${pairs.length ? pairs.map((pair) => {
          const { date, group } = pair;
          const entry = SS.store.bitacoraOf(date, group);
          const hasText = !!(entry && entry.text && entry.text.trim());
          const photos = SS.store.photosOfDate(date, group);
          const minutes = dayMinutes(date, group);
          const people = dayPeople(date, group);
          const d = U.dateParts(date);

          return `
          <article class="bitacora-entry">
            <header class="bitacora-entry__head">
              <span class="bitacora-entry__date">
                <i class="fa-solid fa-calendar-day"></i>
                ${esc(U.fmtDateLong(date))}
              </span>
              ${UI.groupBadge(group)}
              <span class="chip chip--soft">${d.dia} ${d.mes} ${d.anio}</span>
              <div class="bitacora-entry__acts">
                ${canEdit ? `
                  <button class="btn btn--sm btn--soft" data-act="edit" data-date="${esc(date)}" data-group="${esc(group)}"><i class="fa-solid fa-pen"></i> ${hasText ? "Editar" : "Redactar"}</button>
                  ${hasText ? `<button class="btn btn--sm btn--ghost" data-act="delete" data-date="${esc(date)}" data-group="${esc(group)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ""}
                ` : ""}
                <a class="btn btn--sm btn--ghost" href="#/fotos"><i class="fa-solid fa-images"></i> Fotos (${photos.length})</a>
              </div>
            </header>

            <div class="bitacora-entry__body">
              ${hasText
                ? `<p class="bitacora-entry__text">${esc(entry.text)}</p>`
                : UI.emptyState("fa-feather-pointed", "Sin bitácora redactada",
                    canEdit ? "Registra el resumen de actividades realizadas en esta jornada." : "La coordinación aún no publica el resumen de esta jornada.",
                    canEdit ? `<button class="btn btn--primary btn--sm" data-act="edit" data-date="${esc(date)}" data-group="${esc(group)}"><i class="fa-solid fa-pen"></i> Redactar ahora</button>` : "")}
            </div>

            <footer class="bitacora-entry__foot">
              <span><i class="fa-solid fa-hourglass-half"></i> ${U.fmtHM(minutes)} aprobadas</span>
              <span><i class="fa-solid fa-users"></i> ${people} participante(s)</span>
              <span><i class="fa-solid fa-camera"></i> ${photos.length} foto(s)</span>
              ${entry && entry.updatedBy ? `<span><i class="fa-solid fa-user-pen"></i> Actualizada por ${esc(entry.updatedBy)}</span>` : ""}
              ${entry ? `<span><i class="fa-solid fa-clock"></i> ${U.fmtStamp(entry.updatedAt || entry.createdAt)}</span>` : ""}
            </footer>
          </article>`;
        }).join("")
        : UI.emptyState("fa-book", "No hay jornadas registradas",
            canEdit ? "Crea una jornada desde Asistencia y luego redacta su bitácora." : "Aún no se han registrado jornadas en la plataforma.")}
      </div>`;

    const btnNew = root.querySelector("#btn-new");
    if (btnNew) btnNew.addEventListener("click", () => editEntry(user, U.todayISO(), vg || user.group));

    root.querySelectorAll('[data-act="edit"]').forEach((b) => {
      b.addEventListener("click", () => editEntry(user, b.dataset.date, b.dataset.group));
    });
    root.querySelectorAll('[data-act="delete"]').forEach((b) => {
      b.addEventListener("click", () => removeEntry(user, b.dataset.date, b.dataset.group));
    });

    const q = root.querySelector("#q");
    if (q) q.addEventListener("input", U.debounce(() => {
      query = q.value.trim();
      render(root);
      const nq = root.querySelector("#q");
      if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
    }, 260));
  }

  SS.views.bitacora = render;
})();
