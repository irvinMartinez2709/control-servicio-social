/* =============================================================
   views/settings.js — Ajustes, perfil, 2FA, respaldos y ayuda
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  /* ------------------------- Cambio de contraseña propio ------------------------- */
  function changePassword(user) {
    UI.formModal({
      title: "Cambiar mi contraseña",
      icon: "fa-key",
      submitLabel: "Actualizar contraseña",
      submitIcon: "fa-floppy-disk",
      fields: [
        { name: "current", label: "Contraseña actual", icon: "fa-lock", type: "password", required: true, autocomplete: "current-password" },
        { name: "password", label: "Nueva contraseña", icon: "fa-key", type: "password", required: true, hint: "Mínimo 6 caracteres.", autocomplete: "new-password" },
        { name: "confirm", label: "Confirmar nueva contraseña", icon: "fa-lock", type: "password", required: true, autocomplete: "new-password" }
      ],
      onSubmit: async (data) => {
        await SS.auth.changeOwnPassword(user, data.current, data.password, data.confirm);
        UI.toast("Contraseña actualizada", "success");
        return true;
      }
    });
  }

  /* ------------------------- Edición de perfil propio ------------------------- */
  function editProfile(user) {
    UI.formModal({
      title: "Editar mis datos",
      icon: "fa-user-pen",
      size: "wide",
      submitLabel: "Guardar datos",
      fields: [
        { name: "displayName", label: "Nombre completo", icon: "fa-id-card", required: true, value: user.displayName },
        { name: "email", label: "Correo electrónico", icon: "fa-envelope", type: "email", value: user.email || "", hint: "Texto libre." },
        { name: "phone", label: "Teléfono", icon: "fa-phone", type: "tel", value: user.phone || "", hint: "Texto libre." },
        { name: "cedula", label: "Cédula", icon: "fa-address-card", value: user.cedula || "", hint: "Texto libre." },
        { name: "carrera", label: "Carrera", icon: "fa-graduation-cap", value: user.carrera || "", hint: "Texto libre." }
      ],
      onSubmit: (data) => {
        // Texto libre: sin formato exigido para correo, teléfono, cédula ni carrera
        const cedula = String(data.cedula || "").trim();
        SS.store.updateUser(user.id, {
          displayName: data.displayName, email: String(data.email || "").trim(),
          phone: String(data.phone || "").trim(), cedula, carrera: String(data.carrera || "").trim()
        });
        SS.audit.log("cuentas", "Editó sus datos de contacto", `@${user.username}${cedula ? " · " + cedula : ""}`);
        UI.toast("Datos actualizados", "success");
        render(U.$("#view"));
        SS.app.refreshChrome();
        return true;
      }
    });
  }

  /** Cambio del propio grupo (solo roles con permiso group:self) */
  function changeOwnGroup(user) {
    UI.formModal({
      title: "Cambiar mi grupo",
      icon: "fa-people-group",
      submitLabel: "Guardar grupo",
      fields: [
        {
          name: "group", label: "Grupo", icon: "fa-people-group", type: "select", required: true, value: user.group,
          options: SS.store.groupsOptions(),
          hint: "Tus horas, bitácoras y fotos se asociarán al grupo elegido."
        }
      ],
      onSubmit: (data) => {
        if (!SS.auth.can(user, "group:self")) throw new Error("No tienes permiso para cambiar tu grupo");
        if (data.group === user.group) { UI.toast("Tu grupo no cambió", "info"); return false; }
        const old = user.group;
        SS.store.updateUser(user.id, { group: data.group });
        SS.audit.log("cuentas", "Cambió su grupo", `@${user.username} · ${SS.store.groupName(old)} → ${SS.store.groupName(data.group)}`);
        UI.toast("Grupo actualizado", "success", 3000, `Ahora perteneces a ${SS.store.groupName(data.group)}`);
        render(U.$("#view"));
        SS.app.refreshChrome();
        return true;
      }
    });
  }

  /* ------------------------- Credenciales de versión visitante ------------------------- */
  function visitorCreds(user) {
    UI.formModal({
      title: "Credenciales de tu versión visitante",
      icon: "fa-user-lock",
      submitLabel: "Guardar credenciales",
      submitIcon: "fa-floppy-disk",
      fields: [
        {
          name: "username", label: "Usuario visitante", icon: "fa-user", required: true,
          value: user.visitorUsername || "", placeholder: "Ej. irvin_visitante",
          hint: "4 a 24 caracteres. Debe ser distinto a tu usuario de administración y no puede coincidir con el de otra cuenta."
        },
        {
          name: "password", label: "Contraseña visitante", icon: "fa-key", type: "password", required: true,
          placeholder: "Mínimo 6 caracteres",
          hint: "Totalmente independiente de tu contraseña de administración."
        },
        { name: "confirm", label: "Confirmar contraseña", icon: "fa-lock", type: "password", required: true }
      ],
      onSubmit: async (data) => {
        const username = await SS.auth.setVisitorCredentials(user, data);
        UI.toast("Credenciales de versión visitante guardadas", "success", 3600, `Ingresa con @${username}`);
        render(U.$("#view"));
        return true;
      }
    });
  }

  /* ------------------------- Configuración 2FA ------------------------- */
  function manage2FA(user) {
    const tf = user.twoFactor || {};
    const isConfigured = !!tf.enabled;
    const currentLabel = !isConfigured
      ? "Sin configurar"
      : tf.method === "pin" ? "PIN maestro" : "Código TOTP (app de autenticación)";

    const body = U.html(`
      <div class="stack">
        <div class="auth__notice ${isConfigured ? "" : "auth__notice--warn"}">
          <i class="fa-solid ${isConfigured ? "fa-shield-halved" : "fa-triangle-exclamation"}"></i>
          <div>
            Estado actual: <strong>${esc(currentLabel)}</strong>.
            ${user.role !== "visitante"
              ? "Tu rol exige doble factor para iniciar sesión."
              : "Como Visitante el 2FA es opcional; puedes activarlo para reforzar tu cuenta."}
          </div>
        </div>

        <div class="twofa__tabs">
          <button type="button" class="twofa__tab" data-m="pin"><i class="fa-solid fa-hashtag"></i> Usar PIN maestro</button>
          <button type="button" class="twofa__tab" data-m="totp"><i class="fa-solid fa-mobile-screen"></i> Usar código TOTP</button>
        </div>

        <div data-panel="pin" class="stack">
          <div class="field">
            <label class="field__label" for="set-pin"><i class="fa-solid fa-hashtag"></i> ${isConfigured && tf.method === "pin" ? "Nuevo PIN" : "PIN de 4 a 8 dígitos"} *</label>
            <div class="input-wrap">
              <input class="input pin-input" id="set-pin" type="password" inputmode="numeric" maxlength="8" placeholder="••••">
              <button type="button" class="input-wrap__btn js-eye" aria-label="Mostrar contraseña"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="set-pin2"><i class="fa-solid fa-check-double"></i> Confirmar PIN *</label>
            <div class="input-wrap">
              <input class="input pin-input" id="set-pin2" type="password" inputmode="numeric" maxlength="8" placeholder="••••">
              <button type="button" class="input-wrap__btn js-eye" aria-label="Mostrar contraseña"><i class="fa-solid fa-eye"></i></button>
            </div>
          </div>
        </div>

        <div data-panel="totp" class="stack" hidden>
          <div class="qr-box">
            <div id="qr-holder"></div>
            <div class="qr-secret" id="qr-secret"></div>
            <button type="button" class="btn btn--ghost btn--sm" id="copy-secret"><i class="fa-solid fa-copy"></i> Copiar clave</button>
          </div>
          <div class="field">
            <label class="field__label" for="set-code"><i class="fa-solid fa-6"></i> Código de verificación *</label>
            <input class="input code-input" id="set-code" type="text" inputmode="numeric" maxlength="6" placeholder="000000" autocomplete="one-time-code">
            <span class="field__hint">Escanea el QR con Google Authenticator o Authy y captura el código actual.</span>
          </div>
        </div>
      </div>`);

    let method = isConfigured ? tf.method || "pin" : "pin";
    let secret = SS.crypto.generateTotpSecret();

    const applyMethod = () => {
      body.querySelectorAll(".twofa__tab").forEach((t) => t.classList.toggle("is-active", t.dataset.m === method));
      body.querySelector('[data-panel="pin"]').hidden = method !== "pin";
      body.querySelector('[data-panel="totp"]').hidden = method !== "totp";
      if (method === "totp") {
        body.querySelector("#qr-secret").textContent = secret;
        SS.crypto.renderQR(body.querySelector("#qr-holder"), SS.crypto.otpauthURI(secret, user.username));
      }
    };

    body.querySelectorAll(".twofa__tab").forEach((t) => t.addEventListener("click", () => { method = t.dataset.m; applyMethod(); }));
    applyMethod();

    body.querySelector("#copy-secret").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(secret); UI.toast("Clave copiada", "success"); }
      catch (e) { UI.toast("Copia manualmente la clave", "warn"); }
    });

    // Mostrar/ocultar contraseñas del modal
    U.$$(".js-eye", body).forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = btn.parentElement.querySelector("input");
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.innerHTML = `<i class="fa-solid ${show ? "fa-eye-slash" : "fa-eye"}"></i>`;
      });
    });

    UI.modal({
      title: "Autenticación de dos factores",
      icon: "fa-shield-halved",
      body,
      actions: [
        { label: "Cancelar", class: "btn--ghost", id: "cancel" },
        ...(isConfigured ? [{ label: "Desactivar", class: "btn--danger", id: "off" }] : []),
        { label: "Guardar", icon: "fa-floppy-disk", class: "btn--primary", id: "save" }
      ],
      onAction: async (id, close, btn) => {
        if (id === "cancel") return close();
        if (id === "off") {
          const ok = await UI.confirm({
            heading: "Desactivar 2FA",
            title: "¿Desactivar el segundo factor?",
            message: user.role !== "visitante"
              ? "Tu rol administrativo exige 2FA: deberás configurarlo de nuevo en tu próximo inicio de sesión."
              : "Tu cuenta quedará protegida únicamente con la contraseña.",
            confirmLabel: "Desactivar",
            danger: true
          });
          if (!ok) return;
          SS.store.updateUser(user.id, { twoFactor: { method: null, pinHash: null, secret: null, enabled: false } });
          SS.audit.log("cuentas", "Desactivó 2FA", `@${user.username}`);
          UI.toast("2FA desactivado", "warn");
          close();
          render(U.$("#view"));
          return;
        }

        btn.setAttribute("aria-disabled", "true");
        btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> Guardando…`;
        try {
          if (method === "pin") {
            const pin = body.querySelector("#set-pin").value.trim();
            const pin2 = body.querySelector("#set-pin2").value.trim();
            if (!/^\d{4,8}$/.test(pin)) throw new Error("El PIN debe tener de 4 a 8 dígitos");
            if (pin !== pin2) throw new Error("La confirmación no coincide");
            SS.store.updateUser(user.id, {
              twoFactor: { method: "pin", pinHash: await SS.crypto.hashPin(pin), secret: tf.secret || null, enabled: true, updatedAt: Date.now() }
            });
          } else {
            const code = body.querySelector("#set-code").value.trim();
            const ok = await SS.crypto.verifyTotp(secret, code);
            if (!ok) throw new Error("El código del autenticador no es válido");
            SS.store.updateUser(user.id, {
              twoFactor: { method: "totp", pinHash: tf.pinHash || null, secret, enabled: true, updatedAt: Date.now() }
            });
          }
          UI.toast("Doble factor actualizado", "success");
          SS.audit.log("cuentas", "Configuró 2FA", `@${user.username} · método ${method.toUpperCase()}`);
          close();
          render(U.$("#view"));
        } catch (err) {
          btn.removeAttribute("aria-disabled");
          btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Guardar`;
          UI.toast(err.message, "error");
        }
      }
    });
  }

  /* ------------------------- Importar respaldo ------------------------- */
  function importBackup() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        const ok = await UI.confirm({
          heading: "Importar respaldo",
          title: "¿Reemplazar los datos locales?",
          message: "Se sustituirán usuarios, asistencia, bitácoras y fotos por los del archivo. La sesión actual permanecerá abierta si el usuario sigue existiendo.",
          confirmLabel: "Importar"
        });
        if (!ok) return;
        await SS.store.importBundle(obj);
        SS.audit.log("sistema", "Importó respaldo", `${file.name || "archivo JSON"}`);
        UI.toast("Respaldo importado", "success");
        SS.app.refreshChrome();
        render(U.$("#view"));
      } catch (err) {
        UI.toast(err.message || "Archivo inválido", "error");
      }
    });
    input.click();
  }

  /* ------------------------- Vista ------------------------- */
  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    const st = SS.store.state;
    const goal = Number(st.settings.hoursGoal) || 60;
    const myMinutes = SS.store.minutesOfUser(user.id);
    const isSuper = SS.auth.isSuper(user);
    const themeMode = st.settings.theme || "system";

    const faqs = [
      ["¿Cómo se calculan las horas?", "Cada registro aporta la diferencia exacta entre hora de llegada y salida (60 minutos = 1 hora). El total se muestra siempre en formato horas y minutos, nunca con decimales."],
      ["¿Quién aprueba mis solicitudes?", "Los Admins y el Líder Supremo revisan las solicitudes enviadas desde Asistencia. Hasta entonces permanecen en estado Pendiente y no suman al cómputo."],
      ["¿Qué es el doble factor (2FA)?", "Es un segundo paso de verificación obligatorio para administradores: un PIN maestro o un código de 6 dígitos generado por Google Authenticator o Authy."],
      ["¿Cómo llegan los datos al repositorio?", "La app guarda en el almacenamiento local del navegador. Desde Ajustes puedes exportar los archivos JSON (data/*.json) y las imágenes (assets/photos/) para hacer el commit en GitHub."],
      ["¿Qué significan Cuadro 3 y Cuadro 6?", "Son los dos grupos de trabajo del proyecto. Cada registro y evidencia se asocia a uno de ellos para el desglose de horas."],
      ["¿Cuál es la meta de horas?", `La meta máxima es de ${goal} horas de servicio social. El panel de Resumen muestra la barra de avance y el tiempo restante.`]
    ];

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-sliders"></i> Configuración</span>
          <h1>Ajustes</h1>
          <p>Perfil, seguridad, apariencia, respaldos y acerca de la plataforma.</p>
        </div>
      </div>

      <div class="settings-grid">
        <!-- PERFIL -->
        <section class="card">
          <div class="card__head">
            ${UI.avatar(user.displayName, "avatar--lg")}
            <div>
              <h2>${esc(user.displayName)}</h2>
              <div class="small muted">@${esc(user.username)} · ${esc(UI.groupLabel(user.group))} · ${SS.auth.sessionMode() === "visitante" ? "Modo visitante" : (SS.auth.isSuper(user) ? "Líder Supremo" : SS.auth.isAdmin(user) ? "Admin" : "Visitante")}</div>
            </div>
          </div>
          <div class="gap-row mb-3">${UI.roleBadge(user.role)} ${UI.groupBadge(user.group)} ${user.mustChangePassword ? '<span class="badge badge--pendiente"><i class="fa-solid fa-key"></i>Cambiar clave</span>' : ""}</div>

          <div class="setting-line">
            <span class="card__icon"><i class="fa-solid fa-hourglass-half"></i></span>
            <div class="setting-line__text"><strong>Horas acumuladas</strong><span>Meta ${goal} hrs</span></div>
            <strong>${U.fmtHM(myMinutes)}</strong>
          </div>
          <div class="setting-line">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-people-group"></i></span>
            <div class="setting-line__text"><strong>Grupo asignado</strong><span>${esc(UI.groupLabel(user.group))}</span></div>
            ${SS.auth.can(user, "group:self") ? `<button class="btn btn--sm btn--soft" id="btn-group"><i class="fa-solid fa-people-group"></i> Cambiar</button>` : UI.groupBadge(user.group)}
          </div>
          <div class="setting-line">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-address-card"></i></span>
            <div class="setting-line__text"><strong>Datos de contacto</strong>
              <span>${esc([user.cedula ? `C.I. ${user.cedula}` : "", user.email || "", user.phone || "", user.carrera || ""].filter(Boolean).join(" · ") || "Sin datos registrados")}</span>
            </div>
            <button class="btn btn--sm btn--soft" id="btn-profile"><i class="fa-solid fa-user-pen"></i> Editar</button>
          </div>
          <div class="setting-line">
            <span class="card__icon ${user.twoFactor && user.twoFactor.enabled ? "card__icon--success" : "card__icon--warn"}">
              <i class="fa-solid fa-shield-halved"></i>
            </span>
            <div class="setting-line__text"><strong>Doble factor</strong>
              <span>${user.twoFactor && user.twoFactor.enabled ? (user.twoFactor.method === "pin" ? "PIN maestro activo" : "TOTP activo") : "No configurado"}</span>
            </div>
            <button class="btn btn--sm btn--soft" id="btn-2fa"><i class="fa-solid fa-shield"></i> ${user.twoFactor && user.twoFactor.enabled ? "Gestionar" : "Activar"}</button>
          </div>
          ${user.role !== "visitante" ? `
          <div class="setting-line">
            <span class="card__icon card__icon--warn"><i class="fa-solid fa-user-lock"></i></span>
            <div class="setting-line__text"><strong>Tu versión visitante</strong>
              <span>${user.visitorUsername
                ? `Usuario @${esc(user.visitorUsername)} con contraseña propia · ingresa directo como visitante`
                : "Aún no defines usuario y contraseña propios para tu versión visitante"}</span>
            </div>
            <button class="btn btn--sm btn--soft" id="btn-visitor-creds"><i class="fa-solid fa-user-lock"></i> ${user.visitorUsername ? "Cambiar" : "Configurar"}</button>
          </div>` : ""}

          <div class="gap-row mt-3">
            <button class="btn btn--primary" id="btn-pass"><i class="fa-solid fa-key"></i> Cambiar contraseña</button>
          </div>
        </section>

        <!-- APARIENCIA -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon"><i class="fa-solid fa-palette"></i></span>
            <div><h2>Apariencia</h2><div class="small muted">Tema claro, oscuro o del sistema</div></div>
          </div>

          <div class="setting-line">
            <span class="card__icon"><i class="fa-solid fa-sun"></i></span>
            <div class="setting-line__text"><strong>Modo claro</strong><span>Interfaz luminosa</span></div>
            <button class="switch" id="sw-light" role="switch" aria-checked="${themeMode === "light"}" aria-label="Modo claro"></button>
          </div>
          <div class="setting-line">
            <span class="card__icon card__icon--warn"><i class="fa-solid fa-moon"></i></span>
            <div class="setting-line__text"><strong>Modo oscuro</strong><span>Interfaz con bajo contraste lumínico</span></div>
            <button class="switch" id="sw-dark" role="switch" aria-checked="${themeMode === "dark"}" aria-label="Modo oscuro"></button>
          </div>
          <div class="setting-line">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-circle-half-stroke"></i></span>
            <div class="setting-line__text"><strong>Seguir al sistema</strong><span>Usa la preferencia del dispositivo</span></div>
            <button class="switch" id="sw-system" role="switch" aria-checked="${themeMode === "system"}" aria-label="Seguir al sistema"></button>
          </div>

          ${isSuper ? `
          <div class="setting-line mt-3">
            <span class="card__icon card__icon--success"><i class="fa-solid fa-flag-checkered"></i></span>
            <div class="setting-line__text"><strong>Meta de horas</strong><span>Máximo de labor social (hrs)</span></div>
            <input class="input" id="goal" type="number" min="1" max="1000" value="${goal}" style="width:92px;text-align:center">
          </div>` : ""}
        </section>

        <!-- DATOS -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon card__icon--success"><i class="fa-solid fa-database"></i></span>
            <div><h2>Datos y respaldos</h2><div class="small muted">LocalStorage + JSON del repositorio</div></div>
          </div>

          <div class="setting-line">
            <div class="setting-line__text"><strong>Exportar respaldo completo</strong><span>Incluye usuarios, asistencia, bitácoras, fotos y ajustes</span></div>
            <button class="btn btn--sm btn--soft" id="btn-backup"><i class="fa-solid fa-file-export"></i> Exportar</button>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Descargar archivos JSON del repo</strong><span>users, attendance, jornadas, bitacoras y photos</span></div>
            <button class="btn btn--sm btn--soft" id="btn-repo"><i class="fa-solid fa-code-branch"></i> Descargar</button>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Importar respaldo</strong><span>Restaura los datos desde un archivo JSON</span></div>
            <button class="btn btn--sm btn--ghost" id="btn-import"><i class="fa-solid fa-file-import"></i> Importar</button>
          </div>
          ${isSuper ? `
          <div class="setting-line">
            <div class="setting-line__text"><strong>Sincronizar desde el repositorio</strong><span>Vuelve a leer data/*.json publicados</span></div>
            <button class="btn btn--sm btn--ghost" id="btn-pull"><i class="fa-solid fa-rotate"></i> Sincronizar</button>
          </div>` : ""}

          ${isSuper ? `
          <div class="card mt-3 danger-zone">
            <div class="card__head">
              <span class="card__icon card__icon--danger"><i class="fa-solid fa-triangle-exclamation"></i></span>
              <div><h3>Zona de riesgo</h3><div class="small muted">Acciones irreversibles</div></div>
            </div>
            <button class="btn btn--danger btn--block" id="btn-wipe"><i class="fa-solid fa-trash-can"></i> Reiniciar plataforma (borrar todo)</button>
          </div>` : ""}
        </section>

        <!-- AYUDA / ACERCA DE -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon card__icon--accent"><i class="fa-solid fa-circle-question"></i></span>
            <div><h2>Ayuda rápida</h2><div class="small muted">Preguntas frecuentes</div></div>
          </div>
          <div class="faq">
            ${faqs.map(([q, a], i) => `
              <div class="faq__item ${i === 0 ? "is-open" : ""}">
                <button class="faq__q" type="button"><i class="fa-solid fa-circle-question"></i>${esc(q)}<i class="fa-solid fa-chevron-down"></i></button>
                <div class="faq__a">${esc(a)}</div>
              </div>`).join("")}
          </div>
        </section>

        <!-- ACERCA DE -->
        <section class="card">
          <div class="card__head">
            <span class="card__icon"><i class="fa-solid fa-circle-info"></i></span>
            <div><h2>Acerca de</h2><div class="small muted">Control Servicio Social</div></div>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Versión</strong><span>Núcleo de datos v${SS.store.VERSION}</span></div>
            <span class="chip">2.0.0</span>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Plataforma</strong><span>PWA desplegada en GitHub Pages</span></div>
            <span class="chip chip--soft"><i class="fa-brands fa-github"></i> Pages</span>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Almacenamiento</strong><span>LocalStorage con exportación a JSON</span></div>
            <span class="chip chip--soft"><i class="fa-solid fa-hard-drive"></i> Local</span>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Seguridad</strong><span>Hash SHA-256 con sal + 2FA (PIN / TOTP)</span></div>
            <span class="chip chip--accent"><i class="fa-solid fa-lock"></i> SHA-256</span>
          </div>
          <div class="setting-line">
            <div class="setting-line__text"><strong>Iconografía</strong><span>Font Awesome 6 (sin emojis nativos)</span></div>
            <span class="chip chip--soft"><i class="fa-solid fa-icons"></i> FA6</span>
          </div>
        </section>
      </div>`;

    /* --- Eventos --- */
    root.querySelector("#btn-pass").addEventListener("click", () => changePassword(user));
    root.querySelector("#btn-2fa").addEventListener("click", () => manage2FA(user));
    root.querySelector("#btn-profile").addEventListener("click", () => editProfile(user));
    const btnVisitorCreds = root.querySelector("#btn-visitor-creds");
    if (btnVisitorCreds) btnVisitorCreds.addEventListener("click", () => visitorCreds(user));
    const btnGroup = root.querySelector("#btn-group");
    if (btnGroup) btnGroup.addEventListener("click", () => changeOwnGroup(user));

    const setTheme = (mode) => {
      UI.theme.apply(mode);
      SS.store.setSettings({ theme: mode });
      SS.audit.log("sistema", "Cambió el tema", `Modo ${mode}`);
      root.querySelectorAll("#sw-light,#sw-dark,#sw-system").forEach((s) => s.setAttribute("aria-checked", "false"));
      const map = { light: "#sw-light", dark: "#sw-dark", system: "#sw-system" };
      const el = root.querySelector(map[mode]);
      if (el) el.setAttribute("aria-checked", "true");
      UI.toast(mode === "light" ? "Modo claro activado" : mode === "dark" ? "Modo oscuro activado" : "Tema del sistema", "info", 1600);
    };
    root.querySelector("#sw-light").addEventListener("click", () => setTheme("light"));
    root.querySelector("#sw-dark").addEventListener("click", () => setTheme("dark"));
    root.querySelector("#sw-system").addEventListener("click", () => setTheme("system"));

    const goalInput = root.querySelector("#goal");
    if (goalInput) goalInput.addEventListener("change", () => {
      const v = U.clamp(parseInt(goalInput.value, 10) || 60, 1, 1000);
      SS.store.setSettings({ hoursGoal: v });
      SS.audit.log("sistema", "Cambió la meta de horas", `${goal} hrs → ${v} hrs`);
      UI.toast(`Meta actualizada a ${v} hrs`, "success");
      render(root);
      SS.app.refreshChrome();
    });

    root.querySelector("#btn-backup").addEventListener("click", () => { SS.store.downloadFullBackup(); SS.audit.log("sistema", "Exportó respaldo completo", "Backup con imágenes"); UI.toast("Respaldo descargado", "success"); });
    root.querySelector("#btn-repo").addEventListener("click", () => { SS.store.downloadRepoFiles(); SS.audit.log("sistema", "Exportó JSON del repo", "users, attendance, jornadas, bitacoras, groups, audit y photos"); UI.toast("Archivos JSON descargados", "success", 3400, "Sube los archivos a data/ y haz commit"); });
    root.querySelector("#btn-import").addEventListener("click", importBackup);

    const pull = root.querySelector("#btn-pull");
    if (pull) pull.addEventListener("click", async () => {
      pull.setAttribute("aria-disabled", "true");
      const ok = await SS.store.pullFromRepo(true);
      pull.removeAttribute("aria-disabled");
      SS.audit.log("sistema", "Sincronizó desde el repositorio", ok ? "Datos actualizados desde data/*.json" : "Sin cambios en data/*.json");
      UI.toast(ok ? "Datos sincronizados desde el repositorio" : "Sin cambios en data/*.json", ok ? "success" : "info");
      render(root);
      SS.app.refreshChrome();
    });

    const wipe = root.querySelector("#btn-wipe");
    if (wipe) wipe.addEventListener("click", async () => {
      const ok = await UI.confirm({
        heading: "Reiniciar plataforma",
        title: "¿Borrar todos los datos locales?",
        message: "Se eliminarán usuarios, asistencia, bitácoras y fotos guardados en este navegador, y volverá a crearse la cuenta inicial irvin_martinez. Esta acción no se puede deshacer.",
        confirmLabel: "Borrar todo",
        danger: true
      });
      if (!ok) return;
      SS.store.reset();
      await SS.store.seedDefaults();
      SS.audit.log("sistema", "Reinició la plataforma", "Todos los datos locales fueron borrados y se re-sembró la cuenta inicial");
      UI.toast("Plataforma reiniciada", "warn");
      location.hash = "#/login";
      location.reload();
    });

    // FAQ acordeón
    root.querySelectorAll(".faq__q").forEach((btn) => {
      btn.addEventListener("click", () => btn.closest(".faq__item").classList.toggle("is-open"));
    });
  }

  SS.views.ajustes = render;
})();
