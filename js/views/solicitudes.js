/* =============================================================
   views/solicitudes.js — Cola de aprobación (Admin / Super Admin)
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  let tab = "pendiente";

  function decide(user, rec, status) {
    UI.confirm({
      heading: status === "aprobado" ? "Aprobar solicitud" : "Rechazar solicitud",
      title: `¿${status === "aprobado" ? "Aprobar" : "Rechazar"} esta solicitud?`,
      message: `${rec.displayName} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)} (${rec.entry} a ${rec.exit})`,
      confirmLabel: status === "aprobado" ? "Aprobar" : "Rechazar",
      danger: status === "rechazado"
    }).then((ok) => {
      if (!ok) return;
      SS.store.updateRecord(rec.id, { status, reviewedBy: user.username, reviewedAt: Date.now() });
      SS.audit.log("asistencia", status === "aprobado" ? "Aprobó solicitud" : "Rechazó solicitud", `${rec.username} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)}`);
      UI.toast(status === "aprobado" ? "Solicitud aprobada" : "Solicitud rechazada", status === "aprobado" ? "success" : "warn");
      render(U.$("#view"));
      SS.app.refreshChrome();
    });
  }

  function correct(user, rec) {
    const targets = SS.store.state.users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
    UI.formModal({
      title: "Corregir solicitud",
      icon: "fa-pen",
      size: "wide",
      submitLabel: "Guardar corrección",
      fields: [
        { name: "targetId", label: "Usuario", icon: "fa-user", type: "select", required: true, value: rec.userId, options: targets.map((u) => ({ value: u.id, label: `${u.displayName} (${u.username})` })) },
        { name: "date", label: "Fecha", icon: "fa-calendar-day", type: "date", required: true, value: rec.date },
        { name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: rec.group, options: SS.store.groupsOptions() },
        { name: "entry", label: "Llegada", icon: "fa-arrow-right-to-bracket", type: "time", required: true, value: rec.entry },
        { name: "exit", label: "Salida", icon: "fa-arrow-right-from-bracket", type: "time", required: true, value: rec.exit },
        { name: "status", label: "Estado resultante", icon: "fa-stamp", type: "select", required: true, value: "aprobado", options: [{ value: "aprobado", label: "Aprobado" }, { value: "pendiente", label: "Pendiente" }, { value: "rechazado", label: "Rechazado" }] },
        { name: "detail", label: "Observación (opcional)", icon: "fa-comment-dots", type: "textarea", value: rec.detail || "" }
      ],
      onSubmit: (data) => {
        const target = SS.store.getUser(data.targetId);
        if (!target) throw new Error("Selecciona un usuario válido");
        const minutes = U.diffMinutes(data.entry, data.exit);
        if (minutes <= 0) throw new Error("La hora de salida debe ser posterior a la llegada");
        SS.store.ensureJornada(data.date, data.group, user);
        SS.store.updateRecord(rec.id, {
          userId: target.id, username: target.username, displayName: target.displayName,
          date: data.date, group: data.group, entry: data.entry, exit: data.exit,
          minutes, status: data.status, detail: data.detail || "",
          reviewedBy: user.username, reviewedAt: Date.now(), editedAt: Date.now()
        });
        SS.audit.log("asistencia", "Corrigió solicitud", `${target.username} · ${U.fmtDate(data.date)} · ${U.fmtHM(minutes)} · estado ${data.status}`);
        UI.toast("Solicitud corregida", "success");
        return true;
      }
    }).then((res) => { if (res !== null) { render(U.$("#view")); SS.app.refreshChrome(); } });
  }

  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    if (!SS.auth.can(user, "attendance:approve")) {
      root.innerHTML = `
        <div class="page-head"><div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-lock"></i> Acceso restringido</span>
          <h1>Solicitudes</h1><p>Esta sección es exclusiva de administradores.</p>
        </div></div>
        ${UI.emptyState("fa-user-shield", "Sin permisos", "Tu rol no puede revisar solicitudes.", `<a class="btn btn--primary" href="#/resumen"><i class="fa-solid fa-arrow-left"></i> Volver al resumen</a>`)}`;
      return;
    }

    const st = SS.store.state;
    const list = st.attendance
      .filter((r) => r.status === tab)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const counts = SS.store.statusCounts();

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-stamp"></i> Revisión y aprobación</span>
          <h1>Solicitudes</h1>
          <p>Aprueba, deniega o corrige las solicitudes enviadas por los Visitantes.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--ghost" href="#/asistencia"><i class="fa-solid fa-calendar-check"></i> Ver toda la asistencia</a>
          <button class="btn btn--primary" id="btn-direct"><i class="fa-solid fa-user-clock"></i> Registro directo</button>
        </div>
      </div>

      <div class="tabs mb-4">
        ${["pendiente", "aprobado", "rechazado"].map((s) => `
          <button class="tab ${tab === s ? "is-active" : ""}" data-tab="${s}">
            <i class="fa-solid ${s === "pendiente" ? "fa-clock" : s === "aprobado" ? "fa-check" : "fa-xmark"}"></i>
            ${UI.STATUS_LABEL[s]} (${counts[s]})
          </button>`).join("")}
      </div>

      ${list.length ? `
        <div class="stack">
          ${list.map((rec) => {
            const who = SS.store.getUser(rec.userId);
            const name = rec.displayName || (who ? who.displayName : "Usuario");
            return `
            <div class="rec-card" data-rec="${esc(rec.id)}">
              <span class="rec-card__avatar">${UI.avatar(name)}</span>
              <div class="rec-card__who">
                <strong>${esc(name)}</strong>
                <span>${esc(U.fmtDate(rec.date))} · ${esc(rec.username || "")} · enviada ${U.fmtStamp(rec.createdAt)}</span>
              </div>
              <div class="rec-card__times">
                <span><i class="fa-solid fa-arrow-right-to-bracket"></i>${esc(rec.entry)}</span>
                <span><i class="fa-solid fa-arrow-right-from-bracket"></i>${esc(rec.exit)}</span>
                <span class="rec-card__hours">${U.fmtHM(rec.minutes)}</span>
              </div>
              <div class="gap-row" style="gap:6px">${UI.groupBadge(rec.group)} ${UI.statusBadge(rec.status)}</div>
              <div class="rec-card__actions">
                ${rec.status === "pendiente" ? `
                  <button class="btn btn--sm btn--success" data-act="approve"><i class="fa-solid fa-check"></i> Aprobar</button>
                  <button class="btn btn--sm btn--danger" data-act="reject"><i class="fa-solid fa-xmark"></i> Rechazar</button>` : ""}
                <button class="btn btn--sm btn--ghost" data-act="correct"><i class="fa-solid fa-pen"></i> Corregir</button>
              </div>
            </div>`;
          }).join("")}
        </div>`
      : UI.emptyState(
          tab === "pendiente" ? "fa-check-double" : "fa-inbox",
          tab === "pendiente" ? "No hay solicitudes pendientes" : `No hay solicitudes ${UI.STATUS_LABEL[tab].toLowerCase()}`,
          tab === "pendiente" ? "Todas las solicitudes han sido revisadas." : "Los registros aparecerán aquí."
        )}`;

    root.querySelectorAll("[data-tab]").forEach((b) => {
      b.addEventListener("click", () => { tab = b.dataset.tab; render(root); });
    });
    const bd = root.querySelector("#btn-direct");
    if (bd) bd.addEventListener("click", () => { location.hash = "#/asistencia"; });

    root.querySelectorAll(".rec-card [data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rec = st.attendance.find((r) => r.id === btn.closest("[data-rec]").dataset.rec);
        if (!rec) return;
        if (btn.dataset.act === "approve") decide(user, rec, "aprobado");
        else if (btn.dataset.act === "reject") decide(user, rec, "rechazado");
        else correct(user, rec);
      });
    });
  }

  SS.views.solicitudes = render;
})();
