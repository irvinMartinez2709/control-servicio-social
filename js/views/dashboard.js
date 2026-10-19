/* =============================================================
   views/dashboard.js — Resumen principal (Dashboard)
   Los usuarios en modo visitante solo ven la información de su grupo.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  function groupBar(label, minutes, goalMinutes) {
    const p = U.pct(minutes, goalMinutes);
    return `
      <div class="group-bar">
        <div class="group-bar__head">
          <span>${esc(label)}</span>
          <span>${U.fmtHM(minutes)} <span class="muted small">/ ${U.fmtHM(goalMinutes)}</span></span>
        </div>
        <div class="progress progress--flat">
          <div class="progress__fill" style="width:${p}%"></div>
        </div>
      </div>`;
  }

  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    const st = SS.store.state;
    const goalHours = Number(st.settings.hoursGoal) || 60;
    const goalMin = goalHours * 60;

    const effRole = SS.auth.effectiveRole(user);
    const isAdmin = SS.auth.isAdmin(user);
    const vg = SS.auth.visibleGroup(user); // null = todos los grupos (administración)

    const myMinutes = SS.store.minutesOfUser(user.id);
    const myGroups = SS.store.minutesByGroup(user.id);
    const remaining = Math.max(0, goalMin - myMinutes);
    const percent = U.pct(myMinutes, goalMin);

    const myRecords = SS.store.recordsOfUser(user.id);
    const myCounts = { aprobado: 0, pendiente: 0, rechazado: 0 };
    myRecords.forEach((r) => { if (myCounts[r.status] !== undefined) myCounts[r.status]++; });

    const globalCounts = SS.store.statusCounts(vg);
    const groups = SS.store.groupsList();
    const scopedAttendance = vg ? st.attendance.filter((r) => r.group === vg) : st.attendance;
    const scopedJornadas = vg ? st.jornadas.filter((j) => j.group === vg) : st.jornadas;
    const pending = SS.store.pendingCount(vg);

    const today = U.todayISO();
    const todayBit = SS.store.bitacoraOf(today, vg || undefined);
    const todayPhotos = SS.store.photosOfDate(today, vg || undefined);

    // Últimos registros (propios; la administración ve también los últimos globales)
    const recentSource = (isAdmin ? scopedAttendance : myRecords)
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 6);

    const nextJornadas = scopedJornadas
      .filter((j) => j.date >= today)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .slice(0, 4);

    const roleLabel = isAdmin
      ? (effRole === "superadmin" ? "Líder Supremo" : "Administrador")
      : "Visitante";

    const groupBreakdown = isAdmin
      ? `
        <div class="group-bars">
          ${groups.map((g) => groupBar(g.name, SS.store.groupMinutes(g.id), goalMin)).join("")}
          <div class="gap-row mt-2">
            ${groups.map((g) => `<span class="badge badge--group"><i class="fa-solid fa-people-group"></i>${esc(g.name)} · ${U.fmtHM(SS.store.groupMinutes(g.id))}</span>`).join("")}
            <span class="badge badge--neutral"><i class="fa-solid fa-sigma"></i>Total · ${U.fmtHM(groups.reduce((s, g) => s + SS.store.groupMinutes(g.id), 0))}</span>
          </div>
        </div>`
      : `
        <div class="group-bars">
          ${groupBar(UI.groupLabel(user.group), myGroups[user.group] || 0, goalMin)}
          <div class="gap-row mt-2">
            ${UI.groupBadge(user.group)}
            <span class="badge badge--neutral"><i class="fa-solid fa-hourglass-half"></i>Mis horas · ${U.fmtHM(myMinutes)}</span>
          </div>
        </div>`;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-chart-pie"></i> Panel de control</span>
          <h1>Resumen</h1>
          <p>${isAdmin ? "Vista general de horas, solicitudes y actividades del proyecto." : "Tus horas, solicitudes y actividades de tu grupo."}</p>
        </div>
        <div class="page-head__actions">
          <a class="btn btn--soft" href="#/asistencia"><i class="fa-solid fa-calendar-check"></i> Asistencia</a>
          <a class="btn btn--primary" href="#/bitacora"><i class="fa-solid fa-pen-nib"></i> Bitácora</a>
        </div>
      </div>

      <!-- HERO: meta de horas -->
      <section class="hero mb-4">
        <div class="hero__top">
          <div class="hero__greet">
            <h1>Hola, ${esc(user.displayName)}</h1>
            <p>${esc(U.fmtDateLong(today))} · ${esc(roleLabel)} · ${esc(UI.groupLabel(user.group))}${SS.auth.sessionMode() === "visitante" ? " · Modo visitante" : ""}</p>
          </div>
          <div class="hero__hours">
            <strong>${U.fmtHM(myMinutes)}</strong>
            <span>de ${goalHours} hrs acumuladas</span>
          </div>
        </div>

        <div class="progress">
          <div class="progress__fill" style="width:${percent}%"></div>
        </div>

        <div class="hero__meta">
          <span><i class="fa-solid fa-flag-checkered"></i> Meta: ${goalHours} hrs (máximo)</span>
          <span><i class="fa-solid fa-hourglass-half"></i> Restante: ${U.fmtHM(remaining)}</span>
          <span><i class="fa-solid fa-percent"></i> Avance: ${percent}%</span>
        </div>
      </section>

      <!-- Estadísticas -->
      <section class="grid grid-4 mb-4">
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-circle-check"></i></span>
          <div class="stat__body">
            <div class="stat__label">Aprobadas</div>
            <div class="stat__value">${myCounts.aprobado}</div>
            <div class="stat__sub">solicitudes propias</div>
          </div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--warn"><i class="fa-solid fa-clock"></i></span>
          <div class="stat__body">
            <div class="stat__label">Pendientes</div>
            <div class="stat__value">${myCounts.pendiente}</div>
            <div class="stat__sub">${isAdmin ? `${pending} en ${vg ? esc(UI.groupLabel(vg)) : "la plataforma"}` : "en revisión"}</div>
          </div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--danger"><i class="fa-solid fa-circle-xmark"></i></span>
          <div class="stat__body">
            <div class="stat__label">Rechazadas</div>
            <div class="stat__value">${myCounts.rechazado}</div>
            <div class="stat__sub">solicitudes propias</div>
          </div>
        </div>
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-people-group"></i></span>
          <div class="stat__body">
            <div class="stat__label">Tu grupo</div>
            <div class="stat__value">${U.fmtHM(myGroups[user.group] || 0)}</div>
            <div class="stat__sub">${esc(UI.groupLabel(user.group))}</div>
          </div>
        </div>
      </section>

      <div class="grid grid-2 mb-4" style="align-items:start">
        <!-- Desglose por grupo -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon"><i class="fa-solid fa-chart-column"></i></span>
            <div>
              <h2>${isAdmin ? "Desglose por grupo" : "Horas de tu grupo"}</h2>
              <div class="small muted">${isAdmin ? "Horas aprobadas acumuladas en la plataforma" : `Solo ves la información de ${esc(UI.groupLabel(user.group))}`}</div>
            </div>
          </div>
          ${groupBreakdown}
        </section>

        <!-- Estado de solicitudes -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon card__icon--warn"><i class="fa-solid fa-stamp"></i></span>
            <div>
              <h2>Estado de solicitudes</h2>
              <div class="small muted">${isAdmin ? (vg ? `Recuento del grupo ${esc(UI.groupLabel(vg))}` : "Recuento global de la plataforma") : "Recuento de tus envíos"}</div>
            </div>
            ${isAdmin && !vg ? `<div class="card__actions"><a class="btn btn--sm btn--primary" href="#/solicitudes"><i class="fa-solid fa-gavel"></i> Revisar</a></div>` : ""}
          </div>
          <div class="stack">
            ${statusRow("Aprobadas", isAdmin ? globalCounts.aprobado : myCounts.aprobado, "aprobado")}
            ${statusRow("Pendientes", isAdmin ? globalCounts.pendiente : myCounts.pendiente, "pendiente")}
            ${statusRow("Rechazadas", isAdmin ? globalCounts.rechazado : myCounts.rechazado, "rechazado")}
          </div>
        </section>
      </div>

      <!-- Accesos directos -->
      <section class="mb-4">
        <div class="quick">
          <a class="quick__item" href="#/bitacora">
            <i class="fa-solid fa-book-open"></i>
            <span>Bitácora de hoy<small>${todayBit && todayBit.text ? "Con actividad registrada" : "Sin redactar todavía"}</small></span>
          </a>
          <a class="quick__item" href="#/fotos">
            <i class="fa-solid fa-images"></i>
            <span>Evidencia fotográfica<small>${todayPhotos.length} foto(s) en ${U.fmtDate(today, true)}</small></span>
          </a>
          <a class="quick__item" href="#/asistencia">
            <i class="fa-solid fa-calendar-plus"></i>
            <span>Registrar asistencia<small>${isAdmin ? "Añadir jornada o registrar directo" : "Enviar llegada y salida"}</small></span>
          </a>
          ${isAdmin ? `
          <a class="quick__item" href="#/solicitudes">
            <i class="fa-solid fa-stamp"></i>
            <span>Solicitudes pendientes<small>${pending} esperan revisión</small></span>
          </a>` : `
          <a class="quick__item" href="#/ajustes">
            <i class="fa-solid fa-user-gear"></i>
            <span>Mi perfil<small>Contraseña, 2FA y respaldos</small></span>
          </a>`}
        </div>
      </section>

      <div class="grid grid-2" style="align-items:start">
        <!-- Actividad reciente -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-timeline"></i></span>
            <div>
              <h2>Actividad reciente</h2>
              <div class="small muted">${isAdmin ? (vg ? `Registros del grupo ${esc(UI.groupLabel(vg))}` : "Últimos registros de la plataforma") : "Tus últimos registros"}</div>
            </div>
          </div>
          ${recentSource.length ? `
            <div class="timeline">
              ${recentSource.map((r) => {
                const who = SS.store.getUser(r.userId);
                const d = U.dateParts(r.date);
                return `
                <div class="timeline__item">
                  <div class="timeline__date"><strong>${d.dia}</strong><span>${d.mes}</span></div>
                  <div class="timeline__body">
                    <div class="gap-row">
                      <strong class="small">${esc(who ? who.displayName : r.username || "Usuario")}</strong>
                      ${UI.statusBadge(r.status)}
                      ${UI.groupBadge(r.group)}
                    </div>
                    <p>${esc(r.entry || "--:--")} a ${esc(r.exit || "--:--")} · <strong>${U.fmtHM(r.minutes)}</strong></p>
                  </div>
                </div>`;
              }).join("")}
            </div>` : UI.emptyState("fa-inbox", "Sin registros aún", "La actividad aparecerá aquí en cuanto existan asistencias registradas.")}
        </section>

        <!-- Próximas jornadas -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon"><i class="fa-solid fa-calendar-day"></i></span>
            <div>
              <h2>Próximas jornadas</h2>
              <div class="small muted">${vg ? `Jornadas de ${esc(UI.groupLabel(vg))}` : "Fechas habilitadas por la coordinación"}</div>
            </div>
            ${isAdmin ? `<div class="card__actions"><a class="btn btn--sm btn--soft" href="#/asistencia"><i class="fa-solid fa-plus"></i> Añadir</a></div>` : ""}
          </div>
          ${nextJornadas.length ? `
            <div class="stack">
              ${nextJornadas.map((j) => `
                <div class="rec-card">
                  <div class="timeline__date"><strong>${U.dateParts(j.date).dia}</strong><span>${U.dateParts(j.date).mes}</span></div>
                  <div class="rec-card__who">
                    <strong>${esc(U.fmtDateLong(j.date))}</strong>
                    <span>Habilitada por ${esc(j.createdBy || "—")}</span>
                  </div>
                  ${UI.groupBadge(j.group)}
                  <div class="rec-card__actions">
                    <a class="btn btn--sm btn--soft" href="#/asistencia"><i class="fa-solid fa-arrow-right"></i> Abrir</a>
                  </div>
                </div>`).join("")}
            </div>` : UI.emptyState("fa-calendar-xmark", "No hay jornadas programadas", isAdmin
              ? "Usa “Añadir Asistencia” para habilitar una nueva fecha."
              : "La coordinación habilitará nuevas fechas próximamente.")}
        </section>
      </div>`;
  }

  function statusRow(label, count, key) {
    const icons = { aprobado: "fa-check", pendiente: "fa-clock", rechazado: "fa-xmark" };
    const colors = { aprobado: "var(--success)", pendiente: "var(--warn)", rechazado: "var(--danger)" };
    return `
      <div class="setting-line">
        <span class="card__icon" style="background:color-mix(in srgb, ${colors[key]} 16%, transparent);color:${colors[key]}">
          <i class="fa-solid ${icons[key]}"></i>
        </span>
        <div class="setting-line__text">
          <strong>${label}</strong>
          <span>${key === "pendiente" ? "Requieren revisión de un Admin" : key === "aprobado" ? "Contabilizan en las horas" : "No contabilizan horas"}</span>
        </div>
        <strong style="font-size:1.15rem">${count}</strong>
      </div>`;
  }

  SS.views.resumen = render;
})();
