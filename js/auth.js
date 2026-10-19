/* =============================================================
   auth.js — Autenticación, sesión dual, 2FA y matriz de permisos
   Modos de sesión:
     - "visitante": vista limitada al propio grupo (cualquier cuenta)
     - "admin":      panel completo; exige 2FA a Admin / Super Admin
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const C = SS.crypto;

  const ROLES = { SUPER: "superadmin", ADMIN: "admin", VISITOR: "visitante" };
  const MODES = { VISITOR: "visitante", ADMIN: "admin" };

  /* ------------------------- Sesión actual ------------------------- */
  function session() { return SS.store.getSession(); }

  /** Modo de la sesión activa (por defecto "admin" en sesiones heredadas) */
  function sessionMode() {
    const s = session();
    if (!s) return null;
    return s.mode === MODES.VISITOR ? MODES.VISITOR : MODES.ADMIN;
  }

  function currentUser() {
    SS.store.loadAll();
    const s = session();
    if (!s || !s.userId) return null;
    const u = SS.store.getUser(s.userId);
    if (!u) { SS.store.setSession(null); return null; }
    return u;
  }

  function isAuthed() { return !!currentUser(); }

  /**
   * Rol efectivo: en modo visitante cualquier cuenta (incluso un Admin)
   * opera con permisos de Visitante.
   */
  function effectiveRole(user) {
    if (!user) return null;
    if (sessionMode() === MODES.VISITOR) return ROLES.VISITOR;
    return user.role;
  }

  function openSession(user, mode) {
    const m = mode === MODES.VISITOR ? MODES.VISITOR : MODES.ADMIN;
    SS.store.setSession({
      userId: user.id,
      username: user.username,
      role: user.role,
      mode: m,
      loginAt: Date.now(),
      ua: navigator.userAgent.slice(0, 120)
    });
    return user;
  }

  function logout() {
    const s = session();
    if (s && s.username) {
      SS.audit.log("sesion", "Cerró sesión", `@${s.username} · modo ${s.mode || "admin"}`);
    }
    SS.store.setSession(null);
  }

  /* ------------------------- Registro (siempre Visitante) ------------------------- */
  async function register(data) {
    const username = String(data.username || "").trim();
    if (!/^[a-zA-Z0-9_.-]{4,24}$/.test(username)) {
      throw new Error("El usuario debe tener de 4 a 24 caracteres (letras, números, punto, guion bajo o guion)");
    }
    if (SS.store.usernameTaken(username)) throw new Error("Ese nombre de usuario ya existe");
    if (String(data.password || "").length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    if (data.password !== data.confirm) throw new Error("Las contraseñas no coinciden");

    const email = String(data.email || "").trim();
    const phone = String(data.phone || "").trim();
    const cedula = String(data.cedula || "").trim();
    const carrera = String(data.carrera || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Escribe un correo electrónico válido");
    if (!/^[+()\d\s-]{8,15}$/.test(phone)) throw new Error("Escribe un teléfono válido (8 a 15 dígitos)");
    if (!/^[V,E,G,J]-?\d{5,12}$/.test(cedula.toUpperCase().replace(/\s/g, ""))) throw new Error("Escribe una cédula válida (ej. V-12345678)");
    if (carrera.length < 3) throw new Error("Escribe tu carrera");

    const groupId = String(data.group || "").trim();
    const group = SS.store.groupById(groupId) ? groupId : SS.store.defaultGroupId();

    const user = {
      id: SS.util.uid("usr"),
      username,
      displayName: String(data.displayName || username).trim(),
      role: ROLES.VISITOR,
      group,
      email,
      phone,
      cedula: cedula.toUpperCase().replace(/\s/g, ""),
      carrera,
      passwordHash: await C.hashPassword(data.password),
      twoFactor: { method: null, pinHash: null, secret: null, enabled: false },
      mustChangePassword: false,
      createdAt: Date.now(),
      createdBy: "registro"
    };
    SS.store.addUser(user);
    SS.audit.log("cuentas", "Creó su cuenta", `@${username} · ${user.displayName} · ${SS.store.groupName(group)} · ${cedula}`, {
      actor: username, actorName: username, role: ROLES.VISITOR, mode: MODES.VISITOR
    });
    return user;
  }

  /* ------------------------- Paso 1: credenciales ------------------------- */
  /**
   * Valida usuario + contraseña.
   * Soporta dos "sabores" de credenciales:
   *   - "principal": usuario/contraseña normales (administración o visitante puro)
   *   - "visitante": usuario/contraseña propios de la versión visitante de un admin
   * @returns {Promise<{user: object, flavor: "principal"|"visitante"}>}
   */
  async function checkCredentials(username, password) {
    SS.store.loadAll();
    const hit = SS.store.resolveLoginUser(username);
    const stored = hit
      ? (hit.flavor === "visitante" ? hit.user.visitorPasswordHash : hit.user.passwordHash)
      : null;
    // Hash ficticio para usuarios inexistentes (evita enumeración básica)
    const dummy = "$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
    const ok = await C.verifyPassword(password, stored || dummy);
    if (!hit || !stored || !ok) throw new Error("Usuario o contraseña incorrectos");
    return hit;
  }

  /**
   * Fija el usuario y contraseña propios de la versión visitante de un administrador.
   * Con estas credenciales el admin entra directo como visitante (sin pregunta de modo).
   */
  async function setVisitorCredentials(user, data) {
    if (!user || user.role === ROLES.VISITOR) throw new Error("Solo los administradores tienen versión visitante propia");
    const username = String(data.username || "").trim();
    if (!/^[a-zA-Z0-9_.-]{4,24}$/.test(username)) {
      throw new Error("El usuario debe tener de 4 a 24 caracteres (letras, números, punto, guion bajo o guion)");
    }
    if (username.toLowerCase() === String(user.username).toLowerCase()) {
      throw new Error("El usuario de tu versión visitante debe ser distinto al de administración");
    }
    if (SS.store.usernameTaken(username, user.id)) throw new Error("Ese nombre de usuario ya está en uso");
    if (String(data.password || "").length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    if (data.password !== data.confirm) throw new Error("Las contraseñas no coinciden");
    const passwordHash = await C.hashPassword(data.password);
    SS.store.updateUser(user.id, { visitorUsername: username, visitorPasswordHash: passwordHash });
    SS.audit.log("cuentas", "Configuró sus credenciales de versión visitante",
      `@${user.username} → usuario visitante @${username}`);
    return username;
  }

  /**
   * ¿El usuario requiere segundo factor?
   * Solo aplica al modo administración y solo a Admin / Super Admin.
   */
  function requires2FA(user, mode) {
    if (!user) return false;
    if (mode === MODES.VISITOR) return false;
    if (sessionMode() === MODES.VISITOR) return false;
    if (user.role === ROLES.VISITOR) return false;
    return true; // exige configurarlo si aún no lo hizo
  }

  /** Métodos disponibles para el usuario */
  function availableMethods(user) {
    const tf = (user && user.twoFactor) || {};
    const methods = [];
    if (tf.pinHash) methods.push("pin");
    if (tf.secret) methods.push("totp");
    return methods;
  }

  /**
   * Paso 2: validación del segundo factor.
   * @param {object} user
   * @param {object} data {method:'pin'|'totp', code:string}
   * @returns {Promise<{ok:boolean, message?:string, needsSetup?:boolean}>}
   */
  async function verifySecondFactor(user, data) {
    const tf = user.twoFactor || {};
    if (data.method === "pin") {
      if (!tf.pinHash) return { ok: false, message: "Este usuario aún no tiene PIN configurado" };
      const ok = await C.verifyPin(data.code, tf.pinHash);
      return ok ? { ok: true } : { ok: false, message: "PIN incorrecto" };
    }
    if (data.method === "totp") {
      if (!tf.secret) return { ok: false, message: "Este usuario aún no tiene TOTP configurado" };
      const ok = await C.verifyTotp(tf.secret, data.code);
      return ok ? { ok: true } : { ok: false, message: "Código incorrecto o expirado" };
    }
    return { ok: false, message: "Método de verificación no válido" };
  }

  /**
   * Completa el login de Admin/Super Admin.
   * Si no tiene 2FA configurado, exige configurarlo en este mismo flujo.
   * @param {object} user
   * @param {object} data {method, code, setupPin?, setupPinConfirm?, setupSecret?, setupTotpCode?}
   */
  async function completeAdminLogin(user, data) {
    const tf = user.twoFactor || { method: null, pinHash: null, secret: null, enabled: false };

    if (!tf.enabled) {
      // --- Configuración obligatoria en primer ingreso ---
      if (data.method === "pin") {
        const pin = String(data.setupPin || data.code || "");
        if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: "El PIN debe tener de 4 a 8 dígitos" };
        if (pin !== String(data.setupPinConfirm || "")) return { ok: false, message: "La confirmación del PIN no coincide" };
        user.twoFactor = {
          method: "pin",
          pinHash: await C.hashPin(pin),
          secret: tf.secret || null,
          enabled: true,
          updatedAt: Date.now()
        };
        SS.store.updateUser(user.id, { twoFactor: user.twoFactor });
        SS.audit.log("sesion", "Configuró 2FA (PIN)", `@${user.username}`, { actor: user.username, actorName: user.username, role: user.role });
        return { ok: true, configured: true };
      }
      if (data.method === "totp") {
        const secret = data.setupSecret || tf.secret;
        if (!secret) return { ok: false, message: "Genera primero la clave secreta TOTP" };
        const ok = await C.verifyTotp(secret, data.code);
        if (!ok) return { ok: false, message: "El código del autenticador no es válido" };
        user.twoFactor = {
          method: "totp",
          pinHash: tf.pinHash || null,
          secret,
          enabled: true,
          updatedAt: Date.now()
        };
        SS.store.updateUser(user.id, { twoFactor: user.twoFactor });
        SS.audit.log("sesion", "Configuró 2FA (TOTP)", `@${user.username}`, { actor: user.username, actorName: user.username, role: user.role });
        return { ok: true, configured: true };
      }
      return { ok: false, message: "Selecciona un método de verificación" };
    }

    // --- Verificación normal ---
    const res = await verifySecondFactor(user, data);
    if (!res.ok) return res;

    // Permite añadir un segundo método en caliente (opcional)
    if (data.addMethod === "pin" && data.setupPin) {
      const pin = String(data.setupPin);
      if (!/^\d{4,8}$/.test(pin)) return { ok: false, message: "El PIN debe tener de 4 a 8 dígitos" };
      user.twoFactor = Object.assign({}, user.twoFactor, { pinHash: await C.hashPin(pin), method: "pin" });
      SS.store.updateUser(user.id, { twoFactor: user.twoFactor });
    }
    return { ok: true };
  }

  /* ------------------------- Cambio de contraseñas ------------------------- */
  async function changeOwnPassword(user, currentPassword, newPassword, confirm) {
    const ok = await C.verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new Error("La contraseña actual es incorrecta");
    if (String(newPassword).length < 6) throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
    if (newPassword !== confirm) throw new Error("Las contraseñas no coinciden");
    const hash = await C.hashPassword(newPassword);
    SS.store.updateUser(user.id, { passwordHash: hash, mustChangePassword: false });
    SS.audit.log("cuentas", "Cambió su contraseña", `@${user.username}`);
    return true;
  }

  /** Restablece contraseña de un Visitante (solo Admin / Super Admin) */
  async function resetVisitorPassword(actor, targetId, newPassword) {
    if (!can(actor, "reset:visitor-password", SS.store.getUser(targetId))) {
      throw new Error("No tienes permiso para restablecer esta contraseña");
    }
    const target = SS.store.getUser(targetId);
    if (!target) throw new Error("Usuario no encontrado");
    if (target.role !== ROLES.VISITOR) {
      throw new Error("Solo se pueden restablecer contraseñas de Visitantes (usa 2FA desde el perfil)");
    }
    if (String(newPassword).length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    const hash = await C.hashPassword(newPassword);
    SS.store.updateUser(targetId, { passwordHash: hash, mustChangePassword: false });
    SS.audit.log("cuentas", "Restableció contraseña", `@${target.username}`);
    return true;
  }

  /* ------------------------- MATRIZ DE PERMISOS ------------------------- */
  const MATRIX = {
    [ROLES.SUPER]: [
      "view", "attendance:self", "attendance:manage", "attendance:approve",
      "photos:manage", "bitacora:manage",
      "users:view", "users:create", "users:edit", "users:delete", "users:group",
      "users:promote-admin", "users:demote-admin", "users:promote-super",
      "reset:visitor-password", "settings:manage", "data:export", "data:import",
      "groups:manage", "audit:view"
    ],
    [ROLES.ADMIN]: [
      "view", "attendance:self", "attendance:manage", "attendance:approve",
      "photos:manage", "bitacora:manage",
      "users:view", "users:create", "users:group", "users:promote-admin",
      "reset:visitor-password", "data:export", "audit:view", "group:self"
    ],
    [ROLES.VISITOR]: [
      "view", "attendance:self-request", "password:self-change"
    ]
  };
  // El Líder Supremo también puede cambiar su propio grupo
  MATRIX[ROLES.SUPER].push("group:self");

  /**
   * @param {object} actor usuario actual
   * @param {string} action permiso a validar
   * @param {object} [target] usuario afectado (opcional)
   */
  function can(actor, action, target) {
    if (!actor) return false;
    const role = effectiveRole(actor);
    const perms = MATRIX[role] || [];
    if (!perms.includes(action)) return false;

    // Salvaguardas sobre el Líder Supremo
    if (target && target.role === ROLES.SUPER && role !== ROLES.SUPER) {
      return false; // nadie más toca al Super Admin
    }
    // Solo el Super Admin (efectivo) puede promover a Super Admin
    if (action === "users:promote-super" && role !== ROLES.SUPER) return false;
    // Solo el Super Admin (efectivo) puede degradar/borrar Admins
    if (["users:demote-admin", "users:delete"].includes(action) && target && target.role === ROLES.ADMIN && role !== ROLES.SUPER) {
      return false;
    }
    return true;
  }

  function isSuper(user) { return effectiveRole(user) === ROLES.SUPER; }
  function isAdmin(user) {
    const r = effectiveRole(user);
    return r === ROLES.SUPER || r === ROLES.ADMIN;
  }

  /** Grupo visible: los visitantes (por modo o rol) solo ven su grupo */
  function visibleGroup(user) {
    if (!user) return null;
    if (effectiveRole(user) === ROLES.VISITOR) return user.group || SS.store.defaultGroupId();
    return null; // administración: todos los grupos
  }

  SS.auth = {
    ROLES, MODES,
    currentUser, isAuthed, openSession, logout,
    session, sessionMode, effectiveRole, visibleGroup,
    register, checkCredentials, setVisitorCredentials,
    requires2FA, availableMethods, verifySecondFactor, completeAdminLogin,
    changeOwnPassword, resetVisitorPassword,
    can, isSuper, isAdmin
  };
})();
