/* =============================================================
   views/public.js — Portada pública (sin sesión)
   Resumen con las horas totales de cada persona, todas las
   asistencias y un calendario mensual navegable.

   Los datos se sirven desde los JSON publicados del repositorio
   (data/*.json) para que TODOS los dispositivos vean exactamente
   lo mismo; si no hay red se usa la copia local como respaldo.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  function recName(r) {
    const u = SS.store.getUser(r.userId);
    return r.displayName || (u && u.displayName) || r.username || (u && u.username) || "Usuario";
  }

  /* JSON publicado del repositorio (null si no hay red o no existe). */
  function fetchRepo(path) {
    return fetch(path, { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (Array.isArray(json)) return json;
        if (json && Array.isArray(json.items)) return json.items;
        return null;
      });
  }

  SS.views["resumen-publico"] = function renderPublic(root) {
    SS.store.loadAll();

    const initial = {
      users: SS.store.state.users.slice(),
      records: SS.store.state.attendance.slice()
    };

    // Vista inmediata con lo local (hay contenido aunque falle la red).
    buildView(initial.users.slice(), initial.records.slice());

    // Sincronización: todos los dispositivos ven lo mismo. Primero el API
    // en línea (MongoDB); si no responde, los JSON del repositorio; si no, lo local.
    (async () => {
      let src = null;
      if (SS.sync && SS.sync.publicData) {
        const apiData = await SS.sync.publicData();
        if (apiData) {
          src = {
            users: apiData.users,
            records: (Array.isArray(apiData.attendance) && apiData.attendance.length)
              ? apiData.attendance
              : initial.records
          };
        }
      }
      if (!src) {
        const [ru, rr] = await Promise.all([fetchRepo("data/users.json"), fetchRepo("data/attendance.json")]);
        if (ru || rr) src = { users: ru, records: rr };
      }
      if (!src || !root.isConnected || !root.querySelector("#pub")) return;
      const nextUsers = src.users && src.users.length ? src.users : initial.users;
      const nextRecords = src.records && src.records.length ? src.records : initial.records;
      const same =
        JSON.stringify(nextUsers) === JSON.stringify(initial.users) &&
        JSON.stringify(nextRecords) === JSON.stringify(initial.records);
      if (same) return; // ya sincronizado: evita el parpadeo de re-render
      buildView(nextUsers.slice(), nextRecords.slice());
    })().catch(() => { /* sin red: se queda la vista local */ });

    function buildView(users, records) {
      const goalHours = Number(SS.store.state.settings.hoursGoal) || 60;
      const goalMin = goalHours * 60;
      const authed = SS.auth.isAuthed();

      const approved = records.filter((r) => r.status === "aprobado");
      const pending = records.filter((r) => r.status === "pendiente").length;
      const totalMin = approved.reduce((s, r) => s + (Number(r.minutes) || 0), 0);

      // Horas por persona calculadas sobre los mismos registros mostrados.
      const minByUser = Object.create(null);
      approved.forEach((r) => {
        minByUser[r.userId] = (minByUser[r.userId] || 0) + (Number(r.minutes) || 0);
      });
      const people = users
        .map((u) => ({ u, min: minByUser[u.id] || 0 }))
        .sort((a, b) => b.min - a.min || a.u.displayName.localeCompare(b.u.displayName));

      records.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));

      const byDate = Object.create(null);
      records.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });

      const today = U.todayISO();
      let selDate = today;
      let calY = Number(today.slice(0, 4));
      let calM = Number(today.slice(5, 7)) - 1;

      root.innerHTML = `
      <div class="pub" id="pub">
        <header class="pub__bar">
          <img class="pub__logo" src="assets/logo.png" alt="Logo">
          <div class="pub__bar-actions">
            <button type="button" class="btn btn--ghost btn--sm" id="pub-theme" aria-label="Cambiar tema">
              <i class="fa-solid ${UI.theme.current === "dark" ? "fa-sun" : "fa-moon"}"></i>
            </button>
            <a class="btn btn--primary btn--sm" id="pub-login" href="#/login">
              <i class="fa-solid ${authed ? "fa-gauge-high" : "fa-right-to-bracket"}"></i> ${authed ? "Mi panel" : "Iniciar sesión"}
            </a>
          </div>
        </header>

        <section class="pub__hero">
          <span class="crumb"><i class="fa-solid fa-earth-americas"></i> Resumen público</span>
          <h1>Horas y asistencias de cada participante</h1>
          <p>Toda la información de asistencia y las horas acumuladas, sin necesidad de iniciar sesión.</p>
        </section>

        <section class="grid grid-4 pub__kpis">
          <div class="stat">
            <span class="card__icon"><i class="fa-solid fa-hourglass-half"></i></span>
            <div class="stat__body">
              <div class="stat__label">Horas totales</div>
              <div class="stat__value">${U.fmtHM(totalMin)}</div>
              <div class="stat__sub">aprobadas en conjunto</div>
            </div>
          </div>
          <div class="stat">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-users"></i></span>
            <div class="stat__body">
              <div class="stat__label">Participantes</div>
              <div class="stat__value">${users.length}</div>
              <div class="stat__sub">con cuenta registrada</div>
            </div>
          </div>
          <div class="stat">
            <span class="card__icon card__icon--success"><i class="fa-solid fa-clipboard-check"></i></span>
            <div class="stat__body">
              <div class="stat__label">Asistencias</div>
              <div class="stat__value">${records.length}</div>
              <div class="stat__sub">${approved.length} aprobadas</div>
            </div>
          </div>
          <div class="stat">
            <span class="card__icon card__icon--warn"><i class="fa-solid fa-clock"></i></span>
            <div class="stat__body">
              <div class="stat__label">Por revisar</div>
              <div class="stat__value">${pending}</div>
              <div class="stat__sub">solicitudes pendientes</div>
            </div>
          </div>
        </section>

        <section class="pub__grid">
          <div class="card pub__card">
            <div class="card__head">
              <h3><i class="fa-solid fa-ranking-star"></i> Horas totales por persona</h3>
              <span class="badge badge--neutral"><i class="fa-solid fa-bullseye"></i> Meta ${goalHours} hrs</span>
            </div>
            <div class="pub-hours">
              ${people.length ? people.map(({ u, min }) => `
                <div class="pub-hours__row">
                  ${UI.avatar(u.displayName, "avatar--sm")}
                  <div class="pub-hours__who">
                    <strong>${esc(u.displayName)}</strong>
                    <span>@${esc(u.username)} · ${esc(UI.groupLabel(u.group))}</span>
                  </div>
                  <div class="progress progress--flat pub-hours__bar">
                    <div class="progress__fill" style="width:${U.pct(min, goalMin)}%"></div>
                  </div>
                  <strong class="pub-hours__min">${U.fmtHM(min)}</strong>
                </div>`).join("")
                : UI.emptyState("fa-hourglass-half", "Aún no hay horas registradas", "Las horas aparecerán en cuanto los participantes registren su asistencia.")}
            </div>
          </div>

          <div class="card pub__card">
            <div class="card__head">
              <h3><i class="fa-solid fa-calendar-days"></i> Calendario de asistencias</h3>
            </div>
            <div class="cal">
              <div class="cal__nav">
                <button type="button" class="btn btn--sm btn--ghost" id="cal-prev" aria-label="Mes anterior">
                  <i class="fa-solid fa-chevron-left"></i>
                </button>
                <strong class="cal__title" id="cal-title">${MONTHS[calM]} ${calY}</strong>
                <button type="button" class="btn btn--sm btn--ghost" id="cal-next" aria-label="Mes siguiente">
                  <i class="fa-solid fa-chevron-right"></i>
                </button>
              </div>
              <div class="cal__dow">${DOW.map((d) => `<span>${d}</span>`).join("")}</div>
              <div class="cal__grid" id="cal-grid"></div>
            </div>
            <div class="cal-day" id="cal-day"></div>
          </div>
        </section>

        <section class="card pub__card">
          <div class="card__head">
            <h3><i class="fa-solid fa-list-check"></i> Todas las asistencias</h3>
            <span class="badge badge--neutral">${records.length} registro${records.length === 1 ? "" : "s"}</span>
          </div>
          <div class="rec-list">
            ${records.length ? records.map((r) => `
              <div class="rec-card">
                <span class="rec-card__avatar">${UI.avatar(recName(r), "avatar--sm")}</span>
                <div class="rec-card__who">
                  <strong>${esc(recName(r))}</strong>
                  <span>${U.fmtDate(r.date)} · ${esc(UI.groupLabel(r.group))}${r.detail ? " · " + esc(r.detail) : ""}</span>
                </div>
                <div class="rec-card__times">
                  <span><i class="fa-solid fa-arrow-right-to-bracket"></i>${esc(r.entry || "--:--")}</span>
                  <span><i class="fa-solid fa-arrow-right-from-bracket"></i>${esc(r.exit || "--:--")}</span>
                  <span class="rec-card__hours"><i class="fa-solid fa-hourglass-half" style="color:var(--muted);margin-right:5px"></i>${U.fmtHM(Number(r.minutes) || 0)}</span>
                </div>
                <div class="gap-row" style="gap:6px">${UI.statusBadge(r.status)}</div>
              </div>`).join("")
                : UI.emptyState("fa-calendar-xmark", "Aún no hay asistencias", "El historial completo aparecerá en cuanto se registren las primeras jornadas.")}
          </div>
        </section>

        <footer class="pub__foot">
          <span><i class="fa-solid fa-rotate"></i> La información se actualiza con cada registro aprobado.</span>
          <a class="btn btn--soft btn--sm" href="#/login"><i class="fa-solid fa-user-check"></i> ¿Participas? Inicia sesión para registrar tu asistencia</a>
        </footer>
      </div>`;

      /* ------------------------- Calendario ------------------------- */
      function renderDay() {
        const day = root.querySelector("#cal-day");
        const list = byDate[selDate] || [];
        day.innerHTML = `
        <div class="cal-day__head"><i class="fa-solid fa-calendar-check"></i> <strong>${U.fmtDateLong(selDate)}</strong></div>
        ${list.length ? list.map((r) => `
          <div class="cal-day__row">
            ${UI.avatar(recName(r), "avatar--sm")}
            <div class="cal-day__who">
              <strong>${esc(recName(r))}</strong>
              <span>${esc(r.entry || "--:--")} a ${esc(r.exit || "--:--")} · ${esc(UI.groupLabel(r.group))}</span>
            </div>
            <strong class="cal-day__min">${U.fmtHM(Number(r.minutes) || 0)}</strong>
            ${UI.statusBadge(r.status)}
          </div>`).join("")
            : UI.emptyState("fa-calendar-xmark", "Sin asistencias este día", "Elige otro día del calendario.")}`;
      }

      function renderCal() {
        root.querySelector("#cal-title").textContent = `${MONTHS[calM]} ${calY}`;
        const first = new Date(calY, calM, 1);
        const offset = (first.getDay() + 6) % 7; // la semana empieza en lunes
        const days = new Date(calY, calM + 1, 0).getDate();
        let cells = "";
        for (let i = 0; i < offset; i++) cells += `<span class="cal__cell cal__cell--empty"></span>`;
        for (let d = 1; d <= days; d++) {
          const iso = `${calY}-${String(calM + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const n = (byDate[iso] || []).length;
          cells += `<button type="button" class="cal__cell cal__day${n ? " has-rec" : ""}${iso === today ? " is-today" : ""}${iso === selDate ? " is-selected" : ""}" data-date="${iso}">
            <span class="cal__num">${d}</span>${n ? `<span class="cal__cnt">${n}</span>` : ""}
          </button>`;
        }
        const grid = root.querySelector("#cal-grid");
        grid.innerHTML = cells;
        grid.querySelectorAll(".cal__day").forEach((btn) => {
          btn.addEventListener("click", () => { selDate = btn.dataset.date; renderCal(); });
        });
        renderDay();
      }

      function moveMonth(delta) {
        calM += delta;
        if (calM < 0) { calM = 11; calY--; }
        if (calM > 11) { calM = 0; calY++; }
        renderCal();
      }

      root.querySelector("#cal-prev").addEventListener("click", () => moveMonth(-1));
      root.querySelector("#cal-next").addEventListener("click", () => moveMonth(1));

      root.querySelector("#pub-theme").addEventListener("click", () => {
        const next = UI.theme.current === "dark" ? "light" : "dark";
        UI.theme.apply(next);
        SS.store.setSettings({ theme: next });
        root.querySelector("#pub-theme").innerHTML = `<i class="fa-solid ${next === "dark" ? "fa-sun" : "fa-moon"}"></i>`;
      });

      renderCal();
    }
  };
})();
