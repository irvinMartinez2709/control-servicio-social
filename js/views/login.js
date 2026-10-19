/* =============================================================
   views/login.js — Login, elección de modo (solo cuentas de
   administración), credenciales de versión visitante, 2FA
   y Registro
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const $ = U.$;
  const esc = U.esc;

  SS.views = SS.views || {};

  /* ------------------------- Utilidades de formulario ------------------------- */
  /** Alterna visibilidad de contraseña (botón de ojo FontAwesome) */
  function bindPasswordToggles(root) {
    U.$$(".js-eye", root).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = `<i class="fa-solid ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
        btn.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña");
      });
    });
  }

  function field(opts) {
    const isPass = opts.type === "password";
    return `
      <div class="field">
        <label class="field__label" for="${opts.id}">
          <i class="fa-solid ${opts.icon}"></i>${esc(opts.label)}${opts.required ? " *" : ""}
        </label>
        <div class="${isPass ? "input-wrap" : ""}">
          <input class="input" id="${opts.id}" name="${opts.id}" type="${opts.type || "text"}"
                 placeholder="${esc(opts.placeholder || "")}"
                 ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ""}
                 ${opts.required ? "required" : ""}>
          ${isPass ? `<button type="button" class="input-wrap__btn js-eye" aria-label="Mostrar contraseña"><i class="fa-solid fa-eye"></i></button>` : ""}
        </div>
        ${opts.hint ? `<span class="field__hint">${esc(opts.hint)}</span>` : ""}
        <span class="field__error">${esc(opts.error || "Campo obligatorio")}</span>
      </div>`;
  }

  function fail(inputEl, message) {
    const f = inputEl ? inputEl.closest(".field") : null;
    if (f) {
      f.classList.add("has-error");
      const err = f.querySelector(".field__error");
      if (err && message) err.textContent = message;
      inputEl.focus();
      f.style.animation = "shake .3s ease";
      setTimeout(() => { f.style.animation = ""; }, 320);
    }
    UI.toast(message || "Revisa los campos marcados", "error");
  }

  function clearError(root) {
    U.$$(".field.has-error", root).forEach((f) => f.classList.remove("has-error"));
  }

  /* ------------------------- Marca lateral (sin información administrativa) ------------------------- */
  function brandPanel() {
    return `
      <aside class="auth__brand">
        <div>
          <img class="auth__logo auth__logo--wide" src="assets/logo.png" alt="Logo Control Servicio Social">
          <h2 class="auth__headline mt-4">Registro y control de asistencia</h2>
          <p class="auth__sub">Ingresa con tu usuario y contraseña para ver tus horas y actividades.</p>
        </div>
        <div class="auth__foot">
          <span><i class="fa-brands fa-github"></i> GitHub Pages</span>
          <span><i class="fa-solid fa-lock"></i> Cifrado SHA-256</span>
        </div>
      </aside>`;
  }

  /** Selector de modo — SOLO se muestra tras validar credenciales de administración */
  function prefKey(user) { return "ss.loginmode." + user.id; }
  function getPrefMode(user) {
    try { return localStorage.getItem(prefKey(user)) || ""; } catch (e) { return ""; }
  }
  function setPrefMode(user, mode) {
    try { localStorage.setItem(prefKey(user), mode); } catch (e) { /* almacenamiento no disponible */ }
  }

  function renderModeChoice(root, user) {
    const pref = getPrefMode(user);
    const box = root.querySelector(".auth__box");
    box.innerHTML = `
      <div class="auth__head">
        <span class="crumb"><i class="fa-solid fa-toggle-on"></i> Modo de ingreso</span>
        <h1>¿Cómo deseas ingresar?</h1>
        <p>La cuenta <strong>@${esc(user.username)}</strong> tiene acceso de administración.
           Elige el modo de esta sesión.</p>
      </div>

      <div class="mode-choice">
        <button type="button" class="mode-choice__opt ${pref === "visitante" ? "is-preferred" : ""}" data-mode="visitante">
          <span class="mode-choice__icon"><i class="fa-solid fa-eye"></i></span>
          <span class="mode-choice__body">
            <strong>Visitante</strong>
            <span>Solo tu grupo: horas, bitácoras y fotos. Entra directo, sin doble factor.</span>
          </span>
          ${pref === "visitante" ? '<em class="mode-choice__tag"><i class="fa-solid fa-star"></i> Tu opción preferida</em>' : ""}
        </button>
        <button type="button" class="mode-choice__opt ${pref === "admin" ? "is-preferred" : ""}" data-mode="admin">
          <span class="mode-choice__icon"><i class="fa-solid fa-user-shield"></i></span>
          <span class="mode-choice__body">
            <strong>Administración</strong>
            <span>Panel completo: aprobaciones, usuarios, grupos y auditoría. Exige doble factor.</span>
          </span>
          ${pref === "admin" ? '<em class="mode-choice__tag"><i class="fa-solid fa-star"></i> Tu opción preferida</em>' : ""}
        </button>
      </div>

      <div class="gap-row gap-row--end">
        <button type="button" class="btn btn--ghost" id="btn-back-login"><i class="fa-solid fa-arrow-left"></i> Volver</button>
      </div>`;

    box.querySelector("#btn-back-login").addEventListener("click", () => renderLogin(root));

    box.querySelectorAll(".mode-choice__opt").forEach((opt) => {
      opt.addEventListener("click", () => {
        const mode = opt.dataset.mode;
        setPrefMode(user, mode);

        if (mode === "visitante") {
          SS.auth.openSession(user, SS.auth.MODES.VISITOR);
          SS.audit.log("sesion", "Inició sesión", `@${user.username} · modo visitante (cuenta de administración)`);
          UI.toast(`Bienvenido, ${user.displayName}`, "success");
          SS.app.onAuthenticated();
          return;
        }
        // Administración → segundo factor o su configuración inicial
        renderTwoFactor(root, user);
      });
    });
  }

  /* ============================ LOGIN ============================ */
  function renderLogin(root) {
    root.innerHTML = `
      <div class="auth">
        ${brandPanel()}
        <section class="auth__panel">
          <div class="auth__box">
            <div class="auth__head">
              <span class="crumb"><i class="fa-solid fa-right-to-bracket"></i> Acceso</span>
              <h1>Iniciar sesión</h1>
              <p>Ingresa con tu usuario y contraseña.</p>
            </div>

            <form id="form-login" class="auth__form" novalidate>
              ${field({ id: "username", label: "Usuario", icon: "fa-user", autocomplete: "username", required: true })}
              ${field({ id: "password", label: "Contraseña", icon: "fa-key", type: "password", placeholder: "••••••••", autocomplete: "current-password", required: true })}
              <button class="btn btn--primary btn--lg btn--block" type="submit" id="btn-login">
                <i class="fa-solid fa-right-to-bracket"></i> Ingresar
              </button>
            </form>

            <div class="auth__switch">
              ¿Aún no tienes cuenta? <button type="button" data-go="register">Crear cuenta</button>
            </div>
            <div class="auth__switch auth__switch--sub">
              <button type="button" data-go="public"><i class="fa-solid fa-earth-americas"></i> Ver el resumen público sin iniciar sesión</button>
            </div>
          </div>
        </section>
      </div>`;

    bindPasswordToggles(root);

    root.querySelector("[data-go='register']").addEventListener("click", () => { location.hash = "#/registro"; });
    root.querySelector("[data-go='public']").addEventListener("click", () => { location.hash = "#/resumen-publico"; });

    const form = root.querySelector("#form-login");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError(root);
      const username = form.username.value.trim();
      const password = form.password.value;
      if (!username) return fail(form.username, "Escribe tu usuario");
      if (!password) return fail(form.password, "Escribe tu contraseña");

      const btn = root.querySelector("#btn-login");
      btn.setAttribute("aria-disabled", "true");
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> Validando…`;

      try {
        const hit = await SS.auth.checkCredentials(username, password);

        // Credenciales de versión visitante propias de un admin → entra directo como visitante
        if (hit.flavor === "visitante") {
          SS.auth.openSession(hit.user, SS.auth.MODES.VISITOR);
          SS.audit.log("sesion", "Inició sesión", `@${hit.user.username} · modo visitante · credenciales de versión visitante`);
          UI.toast(`Bienvenido, ${hit.user.displayName}`, "success");
          SS.app.onAuthenticated();
          return;
        }

        const user = hit.user;

        // Visitante normal → entra directo, sin preguntar el modo
        if (user.role === "visitante") {
          SS.auth.openSession(user, SS.auth.MODES.VISITOR);
          SS.audit.log("sesion", "Inició sesión", `@${user.username} · modo visitante`);
          UI.toast(`Bienvenido, ${user.displayName}`, "success");
          SS.app.onAuthenticated();
          return;
        }

        // Cuenta de administración → aquí (y solo aquí) se pregunta el modo de ingreso
        renderModeChoice(root, user);
      } catch (err) {
        SS.audit.log("sesion", "Inicio de sesión fallido", `Usuario intentado: ${username}`, { actor: username || "anonimo", actorName: username || "Anónimo" });
        UI.toast(err.message || "No se pudo iniciar sesión", "error");
        fail(form.password, err.message);
        btn.removeAttribute("aria-disabled");
        btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Ingresar`;
      }
    });
  }

  /* ============================ 2FA ============================ */
  function renderTwoFactor(root, user) {
    const tf = user.twoFactor || {};
    const needsSetup = !tf.enabled;
    const methods = SS.auth.availableMethods(user);
    const method = needsSetup ? (methods[0] || "pin") : (methods[0] || tf.method || "pin");
    let secret = tf.secret || SS.crypto.generateTotpSecret();

    root.querySelector(".auth__box").innerHTML = `
      <div class="auth__head">
        <span class="crumb"><i class="fa-solid fa-shield-halved"></i> Verificación en dos pasos</span>
        <h1>${needsSetup ? "Configura tu 2FA" : "Segundo factor"}</h1>
        <p>${needsSetup
          ? `El acceso administrativo exige doble factor. Configúralo una sola vez.`
          : `Hola <strong>${esc(user.displayName)}</strong>. Ingresa tu segundo factor para completar el acceso.`}</p>
      </div>

      <div class="twofa">
        <div class="twofa__tabs" role="tablist">
          <button type="button" class="twofa__tab ${method === "pin" ? "is-active" : ""}" data-method="pin" ${needsSetup ? "" : (methods.includes("pin") ? "" : "hidden")}>
            <i class="fa-solid fa-hashtag"></i> PIN maestro
          </button>
          <button type="button" class="twofa__tab ${method === "totp" ? "is-active" : ""}" data-method="totp" ${needsSetup ? "" : (methods.includes("totp") ? "" : "hidden")}>
            <i class="fa-solid fa-mobile-screen"></i> Código TOTP
          </button>
        </div>

        <!-- Panel PIN -->
        <div class="twofa" data-panel="pin" ${method === "pin" ? "" : "hidden"}>
          ${needsSetup ? `
            <div class="auth__notice auth__notice--warn">
              <i class="fa-solid fa-triangle-exclamation"></i>
              <div>Crea un PIN maestro de <strong>4 a 8 dígitos</strong>. Lo usarás en cada ingreso administrativo.</div>
            </div>` : ""}
          <div class="field">
            <label class="field__label" for="pin-1"><i class="fa-solid fa-hashtag"></i>${needsSetup ? "Crear PIN" : "PIN maestro"} *</label>
            <div class="input-wrap">
              <input class="input pin-input" id="pin-1" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">
              <button type="button" class="input-wrap__btn js-eye" aria-label="Mostrar contraseña"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
          ${needsSetup ? `
          <div class="field">
            <label class="field__label" for="pin-2"><i class="fa-solid fa-check-double"></i>Confirmar PIN *</label>
            <div class="input-wrap">
              <input class="input pin-input" id="pin-2" type="password" inputmode="numeric" maxlength="8" placeholder="••••" autocomplete="off">
              <button type="button" class="input-wrap__btn js-eye" aria-label="Mostrar contraseña"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>` : ""}
        </div>

        <!-- Panel TOTP -->
        <div class="twofa" data-panel="totp" ${method === "totp" ? "" : "hidden"}>
          ${needsSetup ? `
            <div class="auth__notice auth__notice--warn">
              <i class="fa-solid fa-qrcode"></i>
              <div>Escanea el QR con <strong>Google Authenticator</strong> o <strong>Authy</strong>, o captura la clave secreta.</div>
            </div>
            <div class="qr-box">
              <div id="qr-holder"></div>
              <div class="qr-secret" id="qr-secret">${esc(secret)}</div>
              <button type="button" class="btn btn--ghost btn--sm" id="btn-copy-secret"><i class="fa-solid fa-copy"></i> Copiar clave</button>
            </div>` : ""}
          <div class="field">
            <label class="field__label" for="totp-code"><i class="fa-solid fa-6"></i> Código de 6 dígitos *</label>
            <input class="input code-input" id="totp-code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">
            <span class="field__hint">El código cambia cada 30 segundos.</span>
          </div>
        </div>

        <div class="gap-row gap-row--end">
          <button type="button" class="btn btn--ghost" id="btn-back"><i class="fa-solid fa-arrow-left"></i> Volver</button>
          <button type="button" class="btn btn--primary btn--lg" id="btn-verify">
            <i class="fa-solid fa-shield-halved"></i> ${needsSetup ? "Guardar y entrar" : "Verificar"}
          </button>
        </div>
      </div>`;

    const box = root.querySelector(".auth__box");
    bindPasswordToggles(box);

    const qrHolder = box.querySelector("#qr-holder");
    const copySecretBtn = box.querySelector("#btn-copy-secret");

    if (needsSetup && method === "totp" && qrHolder) {
      SS.crypto.renderQR(qrHolder, SS.crypto.otpauthURI(secret, user.username));
    }

    if (copySecretBtn) {
      copySecretBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(secret);
          UI.toast("Clave secreta copiada", "success");
        } catch (e) {
          UI.toast("Copia manualmente la clave mostrada", "warn");
        }
      });
    }

    // Cambio de método
    box.querySelectorAll(".twofa__tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const m = tab.dataset.method;
        box.querySelectorAll(".twofa__tab").forEach((t) => t.classList.toggle("is-active", t === tab));
        box.querySelector('[data-panel="pin"]').hidden = m !== "pin";
        box.querySelector('[data-panel="totp"]').hidden = m !== "totp";
        const holder = box.querySelector("#qr-holder");
        if (needsSetup && m === "totp" && holder && !holder.querySelector("img")) {
          SS.crypto.renderQR(holder, SS.crypto.otpauthURI(secret, user.username));
        }
      });
    });

    box.querySelector("#btn-back").addEventListener("click", () => renderLogin(root));

    box.querySelector("#btn-verify").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const active = box.querySelector(".twofa__tab.is-active");
      const activeMethod = active ? active.dataset.method : method;
      btn.setAttribute("aria-disabled", "true");
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> Verificando…`;

      try {
        let payload;
        if (needsSetup) {
          payload = activeMethod === "pin"
            ? { method: "pin", setupPin: box.querySelector("#pin-1").value.trim(), setupPinConfirm: box.querySelector("#pin-2").value.trim() }
            : { method: "totp", setupSecret: secret, code: box.querySelector("#totp-code").value.trim() };
        } else {
          payload = activeMethod === "pin"
            ? { method: "pin", code: box.querySelector("#pin-1").value.trim() }
            : { method: "totp", code: box.querySelector("#totp-code").value.trim() };
          if (!payload.code) throw new Error("Ingresa el código solicitado");
        }

        const res = await SS.auth.completeAdminLogin(user, payload);
        if (!res.ok) throw new Error(res.message || "Verificación fallida");

        if (res.configured) UI.toast("Doble factor configurado correctamente", "success");
        SS.auth.openSession(user, SS.auth.MODES.ADMIN);
        SS.audit.log("sesion", "Inició sesión", `@${user.username} · modo administración · 2FA ${(payload.method || "").toUpperCase()}`);
        UI.toast(`Bienvenido, ${user.displayName}`, "success");
        SS.app.onAuthenticated();
      } catch (err) {
        UI.toast(err.message || "Verificación fallida", "error");
        btn.removeAttribute("aria-disabled");
        btn.innerHTML = `<i class="fa-solid fa-shield-halved"></i> ${needsSetup ? "Guardar y entrar" : "Verificar"}`;
      }
    });
  }

  /* ============================ REGISTRO ============================ */
  function renderRegister(root) {
    const groups = SS.store.groupsOptions();

    root.innerHTML = `
      <div class="auth">
        ${brandPanel()}
        <section class="auth__panel">
          <div class="auth__box">
            <div class="auth__head">
              <span class="crumb"><i class="fa-solid fa-user-plus"></i> Nueva cuenta</span>
              <h1>Registro</h1>
              <p>Crea tu cuenta de participante y selecciona el grupo al que perteneces.</p>
            </div>

            <form id="form-register" class="auth__form" novalidate>
              ${field({ id: "displayName", label: "Nombre completo", icon: "fa-id-card", placeholder: "Ej. Ana López Ruiz", autocomplete: "name", required: true })}
              ${field({ id: "username", label: "Usuario", icon: "fa-user", placeholder: "ana_lopez", autocomplete: "username", required: true, hint: "4 a 24 caracteres: letras, números, punto, guion bajo o guion." })}
              ${field({ id: "email", label: "Correo electrónico", icon: "fa-envelope", type: "email", placeholder: "Ej. ana@correo.com", autocomplete: "email", hint: "Opcional: texto libre." })}
              ${field({ id: "phone", label: "Teléfono", icon: "fa-phone", type: "tel", placeholder: "Ej. 0414-1234567", autocomplete: "tel", hint: "Opcional: texto libre." })}
              ${field({ id: "cedula", label: "Cédula", icon: "fa-address-card", placeholder: "Ej. V-12345678", hint: "Opcional: texto libre, sin formato exigido." })}
              ${field({ id: "carrera", label: "Carrera", icon: "fa-graduation-cap", placeholder: "Ej. Ingeniería de Sistemas", hint: "Opcional: texto libre." })}

              <div class="field">
                <label class="field__label" for="group"><i class="fa-solid fa-people-group"></i>Grupo al que perteneces *</label>
                <select class="select" id="group" name="group">
                  ${groups.map((g) => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join("")}
                </select>
              </div>

              ${field({ id: "password", label: "Contraseña", icon: "fa-key", type: "password", placeholder: "Mínimo 6 caracteres", autocomplete: "new-password", required: true })}
              ${field({ id: "confirm", label: "Confirmar contraseña", icon: "fa-lock", type: "password", placeholder: "Repite la contraseña", autocomplete: "new-password", required: true })}

              <button class="btn btn--primary btn--lg btn--block" type="submit" id="btn-register">
                <i class="fa-solid fa-user-check"></i> Crear cuenta
              </button>
            </form>

            <div class="auth__switch">
              ¿Ya tienes cuenta? <button type="button" data-go="login">Iniciar sesión</button>
            </div>
          </div>
        </section>
      </div>`;

    bindPasswordToggles(root);
    root.querySelector("[data-go='login']").addEventListener("click", () => { location.hash = "#/login"; });

    const form = root.querySelector("#form-register");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearError(root);
      const data = {
        displayName: form.displayName.value.trim(),
        username: form.username.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        cedula: form.cedula.value.trim(),
        carrera: form.carrera.value.trim(),
        group: form.group.value,
        password: form.password.value,
        confirm: form.confirm.value
      };
      if (!data.displayName) return fail(form.displayName, "Escribe tu nombre completo");
      if (!data.username) return fail(form.username, "Escribe un usuario");
      if (!data.password) return fail(form.password, "Escribe una contraseña");
      if (data.password !== data.confirm) return fail(form.confirm, "Las contraseñas no coinciden");

      const btn = root.querySelector("#btn-register");
      btn.setAttribute("aria-disabled", "true");
      btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> Creando…`;

      try {
        const user = await SS.auth.register(data);
        UI.toast("Cuenta creada correctamente", "success", 3200, "Bienvenido a la plataforma");
        SS.auth.openSession(user, SS.auth.MODES.VISITOR);
        SS.app.onAuthenticated();
      } catch (err) {
        UI.toast(err.message, "error");
        if (/usuario/i.test(err.message)) fail(form.username, err.message);
        else if (/contrase/i.test(err.message)) fail(form.password, err.message);
        btn.removeAttribute("aria-disabled");
        btn.innerHTML = `<i class="fa-solid fa-user-check"></i> Crear cuenta`;
      }
    });
  }

  SS.views.login = renderLogin;
  SS.views.registro = renderRegister;
})();
