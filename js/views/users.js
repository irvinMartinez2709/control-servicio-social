/* =============================================================
   views/users.js — Gestión de usuarios y roles
   Cualquier Admin puede cambiar el grupo de una persona; los datos
   de contacto (correo, teléfono, cédula, carrera) se gestionan aquí.
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  const filters = { q: "", role: "todos" };

  /* ------------------------- Acciones ------------------------- */
  function createUser(actor) {
    const canMakeAdmin = SS.auth.can(actor, "users:promote-admin");
    UI.formModal({
      title: "Agregar usuario",
      icon: "fa-user-plus",
      size: "wide",
      submitLabel: "Crear usuario",
      submitIcon: "fa-user-check",
      fields: [
        { name: "displayName", label: "Nombre completo", icon: "fa-id-card", required: true, placeholder: "Ej. Marco Antonio Ruiz" },
        { name: "username", label: "Usuario", icon: "fa-user", required: true, placeholder: "marco_ruiz", hint: "4 a 24 caracteres (letras, números, . _ -)" },
        { name: "email", label: "Correo electrónico", icon: "fa-envelope", type: "email", placeholder: "Ej. ana@correo.com", hint: "Opcional: texto libre." },
        { name: "phone", label: "Teléfono", icon: "fa-phone", type: "tel", placeholder: "Ej. 0414-1234567", hint: "Opcional: texto libre." },
        { name: "cedula", label: "Cédula", icon: "fa-address-card", placeholder: "Ej. V-12345678", hint: "Opcional: texto libre, sin formato exigido." },
        { name: "carrera", label: "Carrera", icon: "fa-graduation-cap", placeholder: "Ej. Ingeniería de Sistemas", hint: "Opcional: texto libre." },
        {
          name: "role", label: "Rol inicial", icon: "fa-user-tag", type: "select", required: true, value: "visitante",
          options: [
            { value: "visitante", label: "Visitante (solo lectura + solicitudes)" },
            ...(canMakeAdmin ? [{ value: "admin", label: "Admin (CRUD y aprobaciones)" }] : []),
            ...(canMakeAdmin && SS.auth.isSuper(actor) ? [{ value: "superadmin", label: "Líder Supremo (control total)" }] : [])
          ]
        },
        {
          name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: SS.store.defaultGroupId(),
          options: SS.store.groupsOptions()
        },
        { name: "password", label: "Contraseña temporal", icon: "fa-key", type: "password", required: true, hint: "Mínimo 6 caracteres. El usuario deberá cambiarla desde su perfil." }
      ],
      onSubmit: async (data) => {
        if (!/^[a-zA-Z0-9_.-]{4,24}$/.test(data.username)) throw new Error("Usuario inválido: 4 a 24 caracteres");
        if (SS.store.usernameTaken(data.username)) throw new Error("Ese nombre de usuario ya existe");
        if (data.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
        if (!SS.auth.can(actor, "users:create")) throw new Error("No tienes permiso para crear usuarios");
        if (data.role === "admin" && !SS.auth.can(actor, "users:promote-admin")) throw new Error("No puedes crear Admins");
        if (data.role === "superadmin" && !SS.auth.isSuper(actor)) throw new Error("Solo el Líder Supremo otorga ese rol");

        SS.store.addUser({
          id: U.uid("usr"),
          username: data.username,
          displayName: data.displayName,
          role: data.role,
          group: data.group,
          email: String(data.email || "").trim(),
          phone: String(data.phone || "").trim(),
          cedula: String(data.cedula || "").trim(),
          carrera: String(data.carrera || "").trim(),
          passwordHash: await SS.crypto.hashPassword(data.password),
          twoFactor: { method: null, pinHash: null, secret: null, enabled: false },
          mustChangePassword: true,
          createdAt: Date.now(),
          createdBy: actor.username
        });
        SS.audit.log("cuentas", "Creó usuario", `@${data.username} · rol ${data.role} · ${SS.store.groupName(data.group)}`);
        UI.toast("Usuario creado", "success", 3200, `${data.username} · ${data.role}`);
        return true;
      }
    }).then((res) => { if (res !== null) render(U.$("#view")); });
  }

  function resetPassword(actor, target) {
    UI.formModal({
      title: `Restablecer contraseña`,
      icon: "fa-key",
      submitLabel: "Guardar contraseña",
      submitIcon: "fa-floppy-disk",
      fields: [
        { name: "target", label: "Usuario afectado", icon: "fa-user", value: `${target.displayName} (${target.username})`, hint: "El Líder Supremo restablece cualquier cuenta; un Admin solo Visitantes." },
        { name: "password", label: "Nueva contraseña", icon: "fa-key", type: "password", required: true, hint: "Mínimo 6 caracteres." },
        { name: "confirm", label: "Confirmar contraseña", icon: "fa-lock", type: "password", required: true }
      ],
      onSubmit: async (data) => {
        if (data.password !== data.confirm) throw new Error("Las contraseñas no coinciden");
        await SS.auth.resetPasswordFor(actor, target.id, data.password);
        UI.toast("Contraseña restablecida", "success", 3400, target.username);
        return true;
      }
    }).then((res) => { if (res !== null) render(U.$("#view")); });
  }

  function editUser(actor, target) {
    const fullEdit = SS.auth.can(actor, "users:edit", target);
    const groupOnly = !fullEdit && SS.auth.can(actor, "users:group", target);
    if (!fullEdit && !groupOnly) { UI.toast("No tienes permiso para editar a este usuario", "error"); return; }
    const canChangeRole = SS.auth.isSuper(actor) || (target.role === "visitante" && SS.auth.can(actor, "users:promote-admin"));

    UI.formModal({
      title: groupOnly ? "Cambiar grupo" : "Editar usuario",
      icon: groupOnly ? "fa-people-group" : "fa-user-pen",
      size: fullEdit ? "wide" : "normal",
      submitLabel: groupOnly ? "Guardar grupo" : "Guardar cambios",
      fields: [
        ...(fullEdit ? [
          { name: "displayName", label: "Nombre completo", icon: "fa-id-card", required: true, value: target.displayName },
          { name: "email", label: "Correo electrónico", icon: "fa-envelope", type: "email", value: target.email || "", hint: "Texto libre." },
          { name: "phone", label: "Teléfono", icon: "fa-phone", type: "tel", value: target.phone || "", hint: "Texto libre." },
          { name: "cedula", label: "Cédula", icon: "fa-address-card", value: target.cedula || "", hint: "Texto libre." },
          { name: "carrera", label: "Carrera", icon: "fa-graduation-cap", value: target.carrera || "", hint: "Texto libre." }
        ] : []),
        {
          name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: target.group,
          options: SS.store.groupsOptions(),
          hint: groupOnly ? "Puedes reasignar a cualquier persona a un grupo existente." : undefined
        },
        ...(fullEdit && canChangeRole ? [{
          name: "role", label: "Rol", icon: "fa-user-tag", type: "select", required: true, value: target.role,
          options: [
            { value: "visitante", label: "Visitante" },
            { value: "admin", label: "Admin" },
            ...(SS.auth.isSuper(actor) ? [{ value: "superadmin", label: "Líder Supremo" }] : [])
          ],
          hint: "El rol Admin requiere doble factor activo."
        }] : [])
      ],
      onSubmit: (data) => {
        const patch = {};
        const changes = [];
        if (data.group !== target.group) {
          patch.group = data.group;
          changes.push(`grupo ${UI.groupLabel(target.group)} → ${SS.store.groupName(data.group)}`);
        }
        if (fullEdit) {
          patch.displayName = data.displayName;
          patch.email = String(data.email || "").trim();
          patch.phone = String(data.phone || "").trim();
          patch.cedula = String(data.cedula || "").trim();
          patch.carrera = String(data.carrera || "").trim();
          if (data.displayName !== target.displayName) changes.push(`nombre "${target.displayName}" → "${data.displayName}"`);
        }
        if (fullEdit && data.role && data.role !== target.role) {
          if (data.role === "superadmin" && !SS.auth.isSuper(actor)) throw new Error("Solo el Líder Supremo otorga ese rol");
          if (target.role === "superadmin" && !SS.auth.isSuper(actor)) throw new Error("No se puede modificar al Líder Supremo");
          if (data.role === "admin" && target.role !== "admin" && !SS.auth.can(actor, "users:promote-admin", target)) throw new Error("No puedes promover a Admin");
          if (target.role === "admin" && data.role !== "admin" && !SS.auth.can(actor, "users:demote-admin", target)) throw new Error("Solo el Líder Supremo revoca Admins");
          patch.role = data.role;
          changes.push(`rol ${target.role} → ${data.role}`);
          if (data.role === "visitante") {
            patch.twoFactor = { method: null, pinHash: null, secret: null, enabled: false };
          }
        }
        if (!Object.keys(patch).length) { UI.toast("No hay cambios que guardar", "warn"); return false; }
        SS.store.updateUser(target.id, patch);
        SS.audit.log("cuentas", "Editó usuario", `@${target.username} · ${changes.join(" · ")}`);
        UI.toast(groupOnly ? "Grupo actualizado" : "Usuario actualizado", "success");
        return true;
      }
    }).then((res) => { if (res !== null) { render(U.$("#view")); SS.app.refreshChrome(); } });
  }

  function changeRole(actor, target, role) {
    const demoting = role === "visitante";
    UI.confirm({
      heading: demoting ? "Revocar privilegios" : "Nombrar administrador",
      title: demoting
        ? `¿Revocar el rol de Admin a ${target.displayName}?`
        : `¿Nombrar a ${target.displayName} como Admin?`,
      message: demoting
        ? "Perderá el acceso a CRUD, aprobaciones y gestión de usuarios. Su historial se conserva."
        : "Tendrá CRUD de asistencia, fotos y bitácoras, además de aprobar solicitudes. Deberá configurar doble factor.",
      confirmLabel: demoting ? "Revocar" : "Nombrar Admin",
      danger: demoting
    }).then((ok) => {
      if (!ok) return;
      if (demoting && !SS.auth.can(actor, "users:demote-admin", target)) { UI.toast("No tienes permiso para revocar este rol", "error"); return; }
      if (!demoting && !SS.auth.can(actor, "users:promote-admin", target)) { UI.toast("No tienes permiso para nombrar Admins", "error"); return; }
      SS.store.updateUser(target.id, { role });
      if (role === "visitante") SS.store.updateUser(target.id, { twoFactor: { method: null, pinHash: null, secret: null, enabled: false } });
      SS.audit.log("cuentas", demoting ? "Revocó rol Admin" : "Nombró Admin", `@${target.username}`);
      UI.toast(demoting ? "Rol revocado" : "Usuario nombrado Admin", demoting ? "warn" : "success");
      render(U.$("#view"));
    });
  }

  function deleteUser(actor, target) {
    if (target.id === actor.id) { UI.toast("No puedes eliminar tu propia cuenta", "error"); return; }
    if (target.role === "superadmin" && !SS.auth.isSuper(actor)) { UI.toast("Nadie puede eliminar al Líder Supremo", "error"); return; }
    if (!SS.auth.can(actor, "users:delete", target)) { UI.toast("No tienes permiso para eliminar usuarios", "error"); return; }

    UI.confirm({
      heading: "Eliminar usuario",
      title: `¿Eliminar la cuenta de ${target.displayName}?`,
      message: `Usuario: ${target.username}. Sus registros de asistencia se eliminarán junto con la cuenta; la auditoría conserva este evento.`,
      confirmLabel: "Eliminar cuenta",
      danger: true
    }).then((ok) => {
      if (!ok) return;
      SS.store.loadAll();
      const recs = SS.store.state.attendance.filter((r) => r.userId === target.id).length;
      SS.store.removeUser(target.id);
      SS.audit.log("cuentas", "Eliminó usuario",
        `@${target.username} · ${target.displayName}${recs ? ` · ${recs} asistencia${recs === 1 ? "" : "s"} eliminada${recs === 1 ? "" : "s"}` : ""}`);
      UI.toast(recs ? "Usuario eliminado con sus asistencias" : "Usuario eliminado", "warn");
      render(U.$("#view"));
      SS.app.refreshChrome();
    });
  }

  /* ------------------------- Vista ------------------------- */
  function render(root) {
    const actor = SS.auth.currentUser();
    if (!actor) return;
    if (!SS.auth.can(actor, "users:view")) {
      root.innerHTML = `
        <div class="page-head"><div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-lock"></i> Acceso restringido</span>
          <h1>Usuarios</h1><p>Sección reservada a administradores.</p>
        </div></div>
        ${UI.emptyState("fa-user-shield", "Sin permisos", "Tu rol no tiene acceso a la gestión de usuarios.", `<a class="btn btn--primary" href="#/resumen"><i class="fa-solid fa-arrow-left"></i> Volver</a>`)}`;
      return;
    }

    const st = SS.store.state;
    let users = st.users.slice().sort((a, b) => {
      const order = { superadmin: 0, admin: 1, visitante: 2 };
      if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
      return a.displayName.localeCompare(b.displayName);
    });
    if (filters.q) {
      const q = filters.q.toLowerCase();
      users = users.filter((u) => `${u.displayName} ${u.username} ${u.cedula || ""} ${u.email || ""}`.toLowerCase().includes(q));
    }
    if (filters.role !== "todos") users = users.filter((u) => u.role === filters.role);

    const totalHours = st.users.reduce((s, u) => s + SS.store.minutesOfUser(u.id), 0);

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-users-gear"></i> Administración</span>
          <h1>Usuarios</h1>
          <p>Roles, grupos, datos de contacto, horas acumuladas y accesos.</p>
        </div>
        <div class="page-head__actions">
          ${SS.auth.can(actor, "users:create") ? `<button class="btn btn--primary" id="btn-create"><i class="fa-solid fa-user-plus"></i> Agregar usuario</button>` : ""}
        </div>
      </div>

      <div class="grid grid-4 mb-4">
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-users"></i></span>
          <div class="stat__body"><div class="stat__label">Total usuarios</div><div class="stat__value">${st.users.length}</div><div class="stat__sub">en la plataforma</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-user-shield"></i></span>
          <div class="stat__body"><div class="stat__label">Administradores</div><div class="stat__value">${st.users.filter((u) => u.role !== "visitante").length}</div><div class="stat__sub">con 2FA obligatorio</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--warn"><i class="fa-solid fa-eye"></i></span>
          <div class="stat__body"><div class="stat__label">Visitantes</div><div class="stat__value">${st.users.filter((u) => u.role === "visitante").length}</div><div class="stat__sub">solo lectura</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--accent"><i class="fa-solid fa-hourglass-half"></i></span>
          <div class="stat__body"><div class="stat__label">Horas globales</div><div class="stat__value">${U.fmtHM(totalHours)}</div><div class="stat__sub">aprobadas en total</div></div>
        </div>
      </div>

      <div class="toolbar">
        <div class="search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input class="input" id="q" type="search" placeholder="Buscar por nombre, usuario, cédula o correo…" value="${esc(filters.q)}">
        </div>
        <select class="select" id="f-role" style="width:auto;min-width:160px">
          <option value="todos" ${filters.role === "todos" ? "selected" : ""}>Todos los roles</option>
          <option value="superadmin" ${filters.role === "superadmin" ? "selected" : ""}>Líder Supremo</option>
          <option value="admin" ${filters.role === "admin" ? "selected" : ""}>Admin</option>
          <option value="visitante" ${filters.role === "visitante" ? "selected" : ""}>Visitantes</option>
        </select>
        <select class="select" id="f-group" style="width:auto;min-width:150px">
          <option value="todos">Todos los grupos</option>
          ${SS.store.groupsOptions().map((g) => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join("")}
        </select>
      </div>

      <div class="stack">
        ${users.length ? users.map((u) => userRow(actor, u)).join("")
          : UI.emptyState("fa-user-slash", "Sin resultados", "Ajusta los filtros de búsqueda.")}
      </div>`;

    const btnCreate = root.querySelector("#btn-create");
    if (btnCreate) btnCreate.addEventListener("click", () => createUser(actor));

    root.querySelector("#f-role").addEventListener("change", (e) => { filters.role = e.target.value; render(root); });
    root.querySelector("#f-group").addEventListener("change", (e) => {
      const gid = e.target.value;
      root.querySelectorAll(".user-row").forEach((row) => {
        row.style.display = gid === "todos" || row.dataset.group === gid ? "" : "none";
      });
    });
    const q = root.querySelector("#q");
    if (q) q.addEventListener("input", U.debounce(() => {
      filters.q = q.value.trim();
      render(root);
      const nq = root.querySelector("#q");
      if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); }
    }, 250));

    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = SS.store.getUser(btn.dataset.user);
        if (!target) return;
        switch (btn.dataset.act) {
          case "edit": editUser(actor, target); break;
          case "promote": changeRole(actor, target, "admin"); break;
          case "demote": changeRole(actor, target, "visitante"); break;
          case "reset": resetPassword(actor, target); break;
          case "delete": deleteUser(actor, target); break;
        }
      });
    });
  }

  function userRow(actor, u) {
    const minutes = SS.store.minutesOfUser(u.id);
    const pending = SS.store.recordsOfUser(u.id).filter((r) => r.status === "pendiente").length;
    const isSelf = u.id === actor.id;
    const isSuperTarget = u.role === "superadmin";
    const tfOn = u.twoFactor && u.twoFactor.enabled;
    const canFullEdit = SS.auth.can(actor, "users:edit", u);
    const canGroup = canFullEdit || SS.auth.can(actor, "users:group", u);

    const acts = [];
    if (canFullEdit || canGroup) {
      acts.push(`<button class="btn btn--sm btn--ghost" data-act="edit" data-user="${esc(u.id)}"><i class="fa-solid fa-pen"></i> ${canFullEdit ? "Editar" : "Cambiar grupo"}</button>`);
    }
    if (!isSuperTarget && SS.auth.can(actor, "users:promote-admin", u) && u.role === "visitante")
      acts.push(`<button class="btn btn--sm btn--soft" data-act="promote" data-user="${esc(u.id)}"><i class="fa-solid fa-user-shield"></i> Hacer Admin</button>`);
    if (SS.auth.can(actor, "users:demote-admin", u) && u.role === "admin")
      acts.push(`<button class="btn btn--sm btn--ghost" data-act="demote" data-user="${esc(u.id)}"><i class="fa-solid fa-user-minus"></i> Revocar Admin</button>`);
    if (!isSelf && (SS.auth.isSuper(actor) || (u.role === "visitante" && SS.auth.can(actor, "reset:visitor-password", u))))
      acts.push(`<button class="btn btn--sm btn--ghost" data-act="reset" data-user="${esc(u.id)}"><i class="fa-solid fa-key"></i> Restablecer clave</button>`);
    if (!isSelf && SS.auth.can(actor, "users:delete", u))
      acts.push(`<button class="btn btn--sm btn--ghost" data-act="delete" data-user="${esc(u.id)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>`);

    const contact = [u.cedula ? `C.I. ${esc(u.cedula)}` : "", u.email ? esc(u.email) : "", u.phone ? esc(u.phone) : ""]
      .filter(Boolean).join(" · ");

    return `
      <div class="user-row" data-group="${esc(u.group)}">
        ${UI.avatar(u.displayName)}
        <div class="user-row__who">
          <strong>${esc(u.displayName)} ${isSelf ? '<span class="badge badge--neutral">Tú</span>' : ""}</strong>
          <span>@${esc(u.username)} · ${esc(UI.groupLabel(u.group))} · alta ${U.fmtStamp(u.createdAt)}</span>
          ${contact ? `<span class="small muted">${contact}</span>` : ""}
        </div>
        <div class="user-row__tags">
          ${UI.roleBadge(u.role)}
          ${UI.groupBadge(u.group)}
          ${u.role !== "visitante" ? (tfOn
            ? `<span class="badge badge--aprobado"><i class="fa-solid fa-shield-halved"></i>2FA ${(u.twoFactor.method || "").toUpperCase()}</span>`
            : `<span class="badge badge--pendiente"><i class="fa-solid fa-shield"></i>2FA sin configurar</span>`) : ""}
          ${pending ? `<span class="badge badge--pendiente"><i class="fa-solid fa-clock"></i>${pending} pendiente(s)</span>` : ""}
        </div>
        <div class="chip chip--soft" title="Horas aprobadas"><i class="fa-solid fa-hourglass-half"></i> ${U.fmtHM(minutes)}</div>
        <div class="user-row__acts">${acts.join("")}</div>
      </div>`;
  }

  SS.views.usuarios = render;
})();
