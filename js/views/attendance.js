/* =============================================================
   views/attendance.js — Control de asistencia y jornadas
   Los visitantes solo ven y registran en su propio grupo.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  const filters = { status: "todos", group: "todos", q: "" };

  /* ------------------------- Formulario: Nueva jornada ------------------------- */
  async function addJornada(user) {
    const res = await UI.formModal({
      title: "Añadir Asistencia (nueva jornada)",
      icon: "fa-calendar-plus",
      submitLabel: "Crear jornada",
      submitIcon: "fa-plus",
      fields: [
        { name: "date", label: "Fecha de la jornada", icon: "fa-calendar-day", type: "date", required: true, value: U.todayISO(), min: "2020-01-01" },
        {
          name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: SS.store.defaultGroupId(),
          options: SS.store.groupsOptions()
        },
        { name: "note", label: "Nota de apertura (opcional)", icon: "fa-comment-dots", type: "textarea", placeholder: "Ej. Jornada de limpieza en el parque central…" }
      ],
      onSubmit: (data) => {
        const exists = SS.store.state.jornadas.some((j) => j.date === data.date && j.group === data.group);
        if (exists) throw new Error("Esa jornada ya existe para ese grupo");
        SS.store.ensureJornada(data.date, data.group, user);
        if (data.note) SS.store.saveBitacora(data.date, data.note, user, data.group);
        SS.audit.log("asistencia", "Creó jornada", `${U.fmtDate(data.date)} · ${SS.store.groupName(data.group)}`);
        UI.toast("Jornada creada", "success", 3000, U.fmtDateLong(data.date));
        return true;
      }
    });
    if (res !== null) SS.views.asistencia(SS.util.$("#view"));
  }

  /* ------------------------- Formulario: Solicitud de visitante ------------------------- */
  async function requestAttendance(user) {
    const myGroup = user.group || SS.store.defaultGroupId();
    const jornadas = SS.store.state.jornadas
      .filter((j) => j.group === myGroup && (!j.date || j.date >= U.todayISO()))
      .sort((a, b) => (a.date > b.date ? -1 : 1));

    const res = await UI.formModal({
      title: "Registrar mi asistencia",
      icon: "fa-paper-plane",
      submitLabel: "Enviar solicitud",
      submitIcon: "fa-paper-plane",
      fields: [
        {
          name: "date", label: "Fecha", icon: "fa-calendar-day", type: "select",
          placeholder: jornadas.length ? "Selecciona una fecha habilitada" : "No hay jornadas abiertas",
          value: jornadas.length ? jornadas[0].date : "",
          options: jornadas.map((j) => ({ value: j.date, label: `${U.fmtDate(j.date)} · ${UI.groupLabel(j.group)}` })),
          hint: jornadas.length ? "Fechas habilitadas para tu grupo." : "Escribe la fecha en el campo siguiente."
        },
        { name: "dateCustom", label: "O escribe otra fecha", icon: "fa-calendar", type: "date", hint: "Se usa solo si no eliges una fecha habilitada." },
        { name: "group", label: "Grupo", icon: "fa-people-group", type: "hidden", value: myGroup, hint: "" },
        { name: "entry", label: "Hora de llegada", icon: "fa-arrow-right-to-bracket", type: "time", required: true, value: U.nowHM() },
        { name: "exit", label: "Hora de salida", icon: "fa-arrow-right-from-bracket", type: "time", required: true },
        { name: "detail", label: "Actividad realizada (opcional)", icon: "fa-list-check", type: "textarea", placeholder: "Ej. Archivado de documentos y apoyo en recepción." }
      ],
      onSubmit: (data) => {
        const date = (data.dateCustom && data.dateCustom.trim()) || (data.date && data.date.trim());
        if (!date) throw new Error("Indica la fecha de la jornada");
        const minutes = U.diffMinutes(data.entry, data.exit);
        if (minutes <= 0) throw new Error("La hora de salida debe ser posterior a la llegada");
        if (minutes > 12 * 60) throw new Error("Una jornada no puede exceder 12 horas");

        SS.store.ensureJornada(date, myGroup, user);
        SS.store.addRecord({
          id: U.uid("rec"),
          userId: user.id,
          username: user.username,
          displayName: user.displayName,
          date,
          group: myGroup,
          entry: data.entry,
          exit: data.exit,
          minutes,
          status: "pendiente",
          detail: data.detail || "",
          createdAt: Date.now(),
          createdBy: user.username,
          reviewedBy: null,
          reviewedAt: null
        });
        SS.audit.log("asistencia", "Envió solicitud", `${U.fmtDate(date)} · ${U.fmtHM(minutes)} · ${SS.store.groupName(myGroup)} · pendiente`);
        UI.toast("Solicitud enviada", "success", 3600, `Pendiente de aprobación · ${U.fmtHM(minutes)}`);
        return true;
      }
    });
    if (res !== null) SS.views.asistencia(U.$("#view"));
  }

  /* ------------------------- Formulario: Registro directo (Admin) ------------------------- */
  async function directRegister(user) {
    const targets = SS.store.state.users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
    const dates = Array.from(new Set(SS.store.state.jornadas.map((j) => j.date))).sort().reverse();

    await UI.formModal({
      title: "Registro directo de asistencia",
      icon: "fa-user-clock",
      size: "wide",
      submitLabel: "Registrar",
      submitIcon: "fa-check",
      fields: [
        {
          name: "targetId", label: "Usuario", icon: "fa-user", type: "select", required: true,
          placeholder: "Selecciona al participante",
          options: targets.map((u) => ({ value: u.id, label: `${u.displayName} (${u.username}) · ${UI.groupLabel(u.group)}` }))
        },
        {
          name: "date", label: "Fecha", icon: "fa-calendar-day", type: "select",
          placeholder: dates.length ? "Selecciona una jornada" : "No hay jornadas habilitadas",
          options: dates.map((d) => ({ value: d, label: U.fmtDate(d) })),
          hint: dates.length ? "Jornadas existentes." : "Escribe la fecha en el campo siguiente."
        },
        { name: "dateCustom", label: "O escribe otra fecha", icon: "fa-calendar", type: "date" },
        {
          name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: SS.store.defaultGroupId(),
          options: SS.store.groupsOptions()
        },
        { name: "entry", label: "Hora de llegada", icon: "fa-arrow-right-to-bracket", type: "time", required: true, value: "09:00" },
        { name: "exit", label: "Hora de salida", icon: "fa-arrow-right-from-bracket", type: "time", required: true, value: "13:00" },
        { name: "detail", label: "Detalle (opcional)", icon: "fa-comment-dots", type: "textarea", placeholder: "Actividad o incidencia del turno" }
      ],
      onSubmit: (data) => {
        const target = SS.store.getUser(data.targetId);
        if (!target) throw new Error("Selecciona un usuario válido");
        const date = (data.dateCustom && data.dateCustom.trim()) || data.date;
        if (!date) throw new Error("Indica la fecha de la jornada");
        const minutes = U.diffMinutes(data.entry, data.exit);
        if (minutes <= 0) throw new Error("La hora de salida debe ser posterior a la llegada");

        SS.store.ensureJornada(date, data.group, user);
        SS.store.addRecord({
          id: U.uid("rec"),
          userId: target.id,
          username: target.username,
          displayName: target.displayName,
          date,
          group: data.group,
          entry: data.entry,
          exit: data.exit,
          minutes,
          status: "aprobado",
          detail: data.detail || "",
          createdAt: Date.now(),
          createdBy: user.username,
          reviewedBy: user.username,
          reviewedAt: Date.now()
        });
        SS.audit.log("asistencia", "Registro directo", `${target.username} · ${U.fmtDate(date)} · ${U.fmtHM(minutes)} · ${SS.store.groupName(data.group)} · aprobado`);
        UI.toast("Asistencia registrada y aprobada", "success", 3400, `${target.displayName} · ${U.fmtHM(minutes)}`);
        return true;
      }
    });
    SS.views.asistencia(U.$("#view"));
  }

  /* ------------------------- Corrección de un registro ------------------------- */
  async function editRecord(user, rec) {
    const targets = SS.store.state.users.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
    await UI.formModal({
      title: "Corregir registro",
      icon: "fa-pen-to-square",
      size: "wide",
      submitLabel: "Guardar corrección",
      fields: [
        { name: "targetId", label: "Usuario", icon: "fa-user", type: "select", required: true, value: rec.userId, options: targets.map((u) => ({ value: u.id, label: `${u.displayName} (${u.username})` })) },
        { name: "date", label: "Fecha", icon: "fa-calendar-day", type: "date", required: true, value: rec.date },
        { name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: rec.group, options: SS.store.groupsOptions() },
        { name: "entry", label: "Hora de llegada", icon: "fa-arrow-right-to-bracket", type: "time", required: true, value: rec.entry },
        { name: "exit", label: "Hora de salida", icon: "fa-arrow-right-from-bracket", type: "time", required: true, value: rec.exit },
        {
          name: "status", label: "Estado", icon: "fa-stamp", type: "select", required: true, value: rec.status,
          options: [
            { value: "aprobado", label: "Aprobado" },
            { value: "pendiente", label: "Pendiente" },
            { value: "rechazado", label: "Rechazado" }
          ]
        },
        { name: "detail", label: "Detalle (opcional)", icon: "fa-comment-dots", type: "textarea", value: rec.detail || "" }
      ],
      onSubmit: (data) => {
        const target = SS.store.getUser(data.targetId);
        if (!target) throw new Error("Selecciona un usuario válido");
        const minutes = U.diffMinutes(data.entry, data.exit);
        if (minutes <= 0) throw new Error("La hora de salida debe ser posterior a la llegada");
        SS.store.ensureJornada(data.date, data.group, user);
        SS.store.updateRecord(rec.id, {
          userId: target.id,
          username: target.username,
          displayName: target.displayName,
          date: data.date,
          group: data.group,
          entry: data.entry,
          exit: data.exit,
          minutes,
          status: data.status,
          detail: data.detail || "",
          editedBy: user.username,
          editedAt: Date.now(),
          reviewedBy: user.username,
          reviewedAt: Date.now()
        });
        SS.audit.log("asistencia", "Corrigió registro", `${target.username} · ${U.fmtDate(data.date)} · ${U.fmtHM(minutes)} · estado ${data.status}`);
        UI.toast("Registro corregido", "success");
        return true;
      }
    });
    SS.views.asistencia(U.$("#view"));
  }

  /* ------------------------- Acciones de estado ------------------------- */
  function decide(user, rec, status) {
    const label = status === "aprobado" ? "aprobar" : "rechazar";
    UI.confirm({
      heading: status === "aprobado" ? "Aprobar solicitud" : "Rechazar solicitud",
      title: `¿${label.charAt(0).toUpperCase() + label.slice(1)} este registro?`,
      message: `${rec.displayName} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)} (${rec.entry} a ${rec.exit}).`,
      confirmLabel: status === "aprobado" ? "Aprobar" : "Rechazar",
      danger: status === "rechazado"
    }).then((ok) => {
      if (!ok) return;
      SS.store.updateRecord(rec.id, { status, reviewedBy: user.username, reviewedAt: Date.now() });
      SS.audit.log("asistencia", status === "aprobado" ? "Aprobó solicitud" : "Rechazó solicitud", `${rec.username} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)}`);
      UI.toast(status === "aprobado" ? "Solicitud aprobada" : "Solicitud rechazada", status === "aprobado" ? "success" : "warn");
      SS.views.asistencia(U.$("#view"));
      SS.app.refreshChrome();
    });
  }

  function removeRecord(user, rec) {
    UI.confirm({
      heading: "Eliminar registro",
      title: "¿Eliminar este registro de asistencia?",
      message: `${rec.displayName} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)}. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar",
      danger: true
    }).then((ok) => {
      if (!ok) return;
      SS.store.removeRecord(rec.id);
      SS.audit.log("asistencia", "Eliminó registro", `${rec.username} · ${U.fmtDate(rec.date)} · ${U.fmtHM(rec.minutes)}`);
      UI.toast("Registro eliminado", "warn");
      SS.views.asistencia(U.$("#view"));
      SS.app.refreshChrome();
    });
  }

  /* ------------------------- Tarjeta de registro ------------------------- */
  function recordCard(user, rec) {
    const canManage = SS.auth.can(user, "attendance:manage");
    const canApprove = SS.auth.can(user, "attendance:approve") && rec.status === "pendiente";
    const canEdit = canManage;
    const canDelete = canManage && (SS.auth.isSuper(user) || rec.status !== "aprobado" || SS.auth.can(user, "attendance:approve"));
    const who = SS.store.getUser(rec.userId);
    const name = rec.displayName || who?.displayName || rec.username || "Usuario";

    return `
      <div class="rec-card" data-rec="${esc(rec.id)}">
        <span class="rec-card__avatar">${UI.avatar(name, "avatar--sm")}</span>
        <div class="rec-card__who">
          <strong>${esc(name)}</strong>
          <span>${esc(rec.username || who?.username || "")} · ${esc(UI.groupLabel(rec.group))}</span>
        </div>
        <div class="rec-card__times">
          <span><i class="fa-solid fa-arrow-right-to-bracket"></i>${esc(rec.entry)}</span>
          <span><i class="fa-solid fa-arrow-right-from-bracket"></i>${esc(rec.exit)}</span>
          <span class="rec-card__hours"><i class="fa-solid fa-hourglass-half" style="color:var(--muted);margin-right:5px"></i>${U.fmtHM(rec.minutes)}</span>
        </div>
        <div class="gap-row" style="gap:6px">${UI.statusBadge(rec.status)}</div>
        ${canApprove || canEdit || canDelete ? `
        <div class="rec-card__actions">
          ${canApprove ? `
            <button class="btn btn--sm btn--success" data-act="approve" title="Aprobar"><i class="fa-solid fa-check"></i> Aprobar</button>
            <button class="btn btn--sm btn--danger" data-act="reject" title="Rechazar"><i class="fa-solid fa-xmark"></i> Rechazar</button>` : ""}
          ${canEdit ? `<button class="btn btn--sm btn--ghost" data-act="edit" title="Corregir"><i class="fa-solid fa-pen"></i></button>` : ""}
          ${canDelete ? `<button class="btn btn--sm btn--ghost" data-act="delete" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ""}
        </div>` : ""}
      </div>`;
  }

  /* ------------------------- Vista principal ------------------------- */
  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    const st = SS.store.state;
    const isAdmin = SS.auth.isAdmin(user);
    const vg = SS.auth.visibleGroup(user); // visitantes: su grupo
    if (vg) filters.group = vg;

    const base = vg ? st.attendance.filter((r) => r.group === vg) : st.attendance;
    const all = base.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    const filtered = all.filter((r) => {
      if (filters.status !== "todos" && r.status !== filters.status) return false;
      if (!vg && filters.group !== "todos" && r.group !== filters.group) return false;
      if (filters.q) {
        const who = SS.store.getUser(r.userId);
        const hay = `${r.displayName || ""} ${r.username || ""} ${who ? who.displayName : ""} ${r.date}`.toLowerCase();
        if (!hay.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    });

    // Agrupación por fecha (registros)
    const byDate = {};
    filtered.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });

    // Las jornadas habilitadas también deben listarse aunque no tengan registros
    if (filters.status === "todos") {
      st.jornadas.forEach((j) => {
        if (vg && j.group !== vg) return;
        const existing = byDate[j.date];
        if (existing && existing.some((r) => r.group === j.group)) return;
        if (!vg && filters.group !== "todos" && j.group !== filters.group) return;
        if (existing) { if (!existing.some((r) => r.group === j.group)) existing.push({ __jornadaOnly: true, group: j.group, date: j.date }); return; }
        if (filters.q) {
          const hay = `${j.date} ${U.fmtDateLong(j.date)} ${UI.groupLabel(j.group)}`.toLowerCase();
          if (!hay.includes(filters.q.toLowerCase())) return;
        }
        byDate[j.date] = [{ __jornadaOnly: true, group: j.group, date: j.date }];
      });
    }

    const dates = Object.keys(byDate).sort().reverse();

    const myPending = st.attendance.filter((r) => r.userId === user.id && r.status === "pendiente").length;
    const approvedCount = base.filter((r) => r.status === "aprobado").length;
    const pendingCount = isAdmin ? SS.store.pendingCount(vg || undefined) : myPending;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-calendar-check"></i> Control horario</span>
          <h1>Asistencia</h1>
          <p>${isAdmin
            ? (vg ? `Administras el grupo ${esc(UI.groupLabel(vg))}.` : "Administra jornadas, aprueba solicitudes y registra asistencia directa.")
            : "Envía tu solicitud de llegada y salida; el cómputo se aprueba por un Admin."}</p>
        </div>
        <div class="page-head__actions">
          ${isAdmin ? `
            <button class="btn btn--ghost" id="btn-direct"><i class="fa-solid fa-user-clock"></i> Registro directo</button>
            <button class="btn btn--primary" id="btn-add"><i class="fa-solid fa-calendar-plus"></i> Añadir Asistencia</button>
          ` : `
            <button class="btn btn--primary" id="btn-request"><i class="fa-solid fa-paper-plane"></i> Registrar mi asistencia</button>
          `}
        </div>
      </div>

      <div class="grid grid-3 mb-4">
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-circle-check"></i></span>
          <div class="stat__body"><div class="stat__label">Aprobados</div>
          <div class="stat__value">${approvedCount}</div>
          <div class="stat__sub">${vg ? `en ${esc(UI.groupLabel(vg))}` : "registros con horas validadas"}</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--warn"><i class="fa-solid fa-clock"></i></span>
          <div class="stat__body"><div class="stat__label">${isAdmin ? (vg ? "Pendientes del grupo" : "Pendientes globales") : "Mis pendientes"}</div>
          <div class="stat__value">${pendingCount}</div>
          <div class="stat__sub">esperan revisión</div></div>
        </div>
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-hourglass-half"></i></span>
          <div class="stat__body"><div class="stat__label">Mis horas aprobadas</div>
          <div class="stat__value">${U.fmtHM(SS.store.minutesOfUser(user.id))}</div>
          <div class="stat__sub">meta ${st.settings.hoursGoal} hrs</div></div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="filter-q" type="search" placeholder="Buscar por usuario o fecha…" value="${esc(filters.q)}">
        </div>
        <div class="tabs" role="tablist">
          ${["todos", "pendiente", "aprobado", "rechazado"].map((s) => `
            <button class="tab ${filters.status === s ? "is-active" : ""}" data-status="${s}">
              <i class="fa-solid ${s === "todos" ? "fa-list" : s === "pendiente" ? "fa-clock" : s === "aprobado" ? "fa-check" : "fa-xmark"}"></i>
              ${s === "todos" ? "Todos" : UI.STATUS_LABEL[s]}
            </button>`).join("")}
        </div>
        ${vg ? `
          <span class="chip chip--soft"><i class="fa-solid fa-people-group"></i> ${esc(UI.groupLabel(vg))}</span>
        ` : `
          <select class="select" id="filter-group" style="width:auto;min-width:150px">
            <option value="todos" ${filters.group === "todos" ? "selected" : ""}>Todos los grupos</option>
            ${SS.store.groupsOptions().map((g) => `<option value="${esc(g.value)}" ${filters.group === g.value ? "selected" : ""}>${esc(g.label)}</option>`).join("")}
          </select>`}
      </div>

      <div id="records">
        ${dates.length ? dates.map((date) => `
          <section class="jornada-group">
            <div class="jornada-group__head">
              <h2><i class="fa-solid fa-calendar-day" style="color:var(--primary);margin-right:8px"></i>${esc(U.fmtDateLong(date))}</h2>
              <span class="line"></span>
              <span class="chip chip--soft">${byDate[date].filter((r) => !r.__jornadaOnly).length} registro(s)</span>
            </div>
            <div class="rec-list">
              ${byDate[date].some((r) => !r.__jornadaOnly)
                ? byDate[date].map((r) => r.__jornadaOnly ? "" : recordCard(user, r)).join("") +
                  byDate[date].filter((r) => r.__jornadaOnly && !byDate[date].some((x) => !x.__jornadaOnly && x.group === r.group)).map((r) => jornadaEmptyCard(r, isAdmin)).join("")
                : byDate[date].map((r) => jornadaEmptyCard(r, isAdmin)).join("")}
            </div>
          </section>`).join("")
        : UI.emptyState("fa-calendar-xmark", "Sin registros", "No hay asistencias que coincidan con los filtros aplicados.")}
      </div>`;

    // --- Eventos ---
    const btnAdd = root.querySelector("#btn-add");
    if (btnAdd) btnAdd.addEventListener("click", () => addJornada(user));
    const btnDirect = root.querySelector("#btn-direct");
    if (btnDirect) btnDirect.addEventListener("click", () => directRegister(user));
    const btnRequest = root.querySelector("#btn-request");
    if (btnRequest) btnRequest.addEventListener("click", () => requestAttendance(user));

    root.querySelectorAll("[data-status]").forEach((tab) => {
      tab.addEventListener("click", () => { filters.status = tab.dataset.status; render(root); });
    });
    const sel = root.querySelector("#filter-group");
    if (sel) sel.addEventListener("change", () => { filters.group = sel.value; render(root); });
    const q = root.querySelector("#filter-q");
    if (q) q.addEventListener("input", U.debounce(() => { filters.q = q.value.trim(); render(root); const nq = root.querySelector("#filter-q"); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } }, 260));

    root.querySelectorAll(".rec-card [data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.closest("[data-rec]").dataset.rec;
        const rec = st.attendance.find((r) => r.id === id);
        if (!rec) return;
        const act = btn.dataset.act;
        if (act === "approve") decide(user, rec, "aprobado");
        else if (act === "reject") decide(user, rec, "rechazado");
        else if (act === "edit") editRecord(user, rec);
        else if (act === "delete") removeRecord(user, rec);
      });
    });
    root.querySelectorAll("[data-empty-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.emptyAct === "direct") directRegister(user);
        else requestAttendance(user);
      });
    });
  }

  /** Tarjeta de jornada sin registros */
  function jornadaEmptyCard(marker, isAdmin) {
    return `
      <div class="empty" style="padding:20px">
        <i class="fa-solid fa-calendar-day"></i>
        <strong>Jornada de ${esc(UI.groupLabel(marker.group))} sin registros</strong>
        <p>${isAdmin ? "Registra asistencia directa o espera las solicitudes de los visitantes para esta fecha." : "Aún no hay registros en esta jornada; puedes enviar tu solicitud."}</p>
        ${isAdmin
          ? `<button class="btn btn--sm btn--primary" data-empty-act="direct"><i class="fa-solid fa-user-clock"></i> Registro directo</button>`
          : `<button class="btn btn--sm btn--primary" data-empty-act="request"><i class="fa-solid fa-paper-plane"></i> Registrar mi asistencia</button>`}
      </div>`;
  }

  SS.views.asistencia = render;
})();
