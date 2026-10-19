/* =============================================================
   views/gallery.js — Galería de evidencia fotográfica
   Ruta destino en repositorio: assets/photos/
   ============================================================= */
(function () {
  "use strict";

  const SS = (window.SS = window.SS || {});
  const U = SS.util;
  const UI = SS.ui;
  const esc = U.esc;

  SS.views = SS.views || {};

  const filters = { date: "todas", group: "todos" };

  /* ------------------------- Compresión antes de persistir ------------------------- */
  function compressImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("No se pudo leer el archivo"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("El archivo no es una imagen válida"));
        img.onload = () => {
          const max = maxDim || 1400;
          let { width: w, height: h } = img;
          if (w > max || h > max) {
            const scale = Math.min(max / w, max / h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          let dataUrl;
          try {
            dataUrl = canvas.toDataURL("image/jpeg", quality || 0.82);
          } catch (e) {
            dataUrl = fr.result;
          }
          resolve({ dataUrl, width: w, height: h });
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function safeFileName(original) {
    const clean = String(original || "foto.jpg").replace(/[^\w.\-]+/g, "_").slice(-60);
    return `${Date.now().toString(36)}_${clean.replace(/^_+/, "") || "foto.jpg"}`;
  }

  /* ------------------------- Modal de carga ------------------------- */
  async function uploadPhoto(user) {
    const dates = Array.from(new Set(SS.store.state.jornadas.map((j) => j.date))).sort().reverse();
    let chosenFile = null;
    let preview = null;

    const body = U.html(`
      <form class="stack" novalidate>
        <div class="field">
          <label class="field__label"><i class="fa-solid fa-image"></i> Imagen *</label>
          <div class="qr-box" id="drop">
            <div id="preview" class="center muted small">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:2rem;display:block;margin-bottom:8px;color:var(--border-strong)"></i>
              Selecciona una fotografía desde tu dispositivo
            </div>
            <input type="file" id="file" accept="image/*" class="input" style="padding:8px">
            <span class="field__hint center">Se comprime automáticamente para caber en el respaldo local.</span>
          </div>
          <span class="field__error">Debes seleccionar una imagen</span>
        </div>

        <div class="field">
          <label class="field__label" for="p-title"><i class="fa-solid fa-heading"></i> Título *</label>
          <input class="input" id="p-title" placeholder="Ej. Limpieza del aula 3B">
          <span class="field__error">Escribe un título</span>
        </div>

        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="p-date"><i class="fa-solid fa-calendar-day"></i> Fecha asociada *</label>
            <input class="input" id="p-date" type="date" value="${dates[0] || U.todayISO()}">
            <span class="field__hint">${dates.length ? "Jornadas habilitadas disponibles." : "Se usará esta fecha aunque no exista jornada."}</span>
          </div>
          <div class="field">
            <label class="field__label" for="p-group"><i class="fa-solid fa-people-group"></i> Grupo *</label>
            <select class="select" id="p-group">
              ${SS.store.groupsOptions().map((g) => `<option value="${esc(g.value)}">${esc(g.label)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="field">
          <label class="field__label" for="p-desc"><i class="fa-solid fa-align-left"></i> Descripción</label>
          <textarea class="textarea" id="p-desc" placeholder="Describe la evidencia capturada…"></textarea>
        </div>

        <div class="auth__notice">
          <i class="fa-solid fa-folder-tree"></i>
          <div>La imagen se vincula a la ruta <strong>assets/photos/</strong> del repositorio. Usa “Descargar” en la tarjeta para obtener el archivo y subirlo con <span class="kbd">git add</span>.</div>
        </div>
      </form>`);

    const m = UI.modal({
      title: "Subir evidencia fotográfica",
      icon: "fa-camera",
      size: "wide",
      body,
      actions: [
        { label: "Cancelar", class: "btn--ghost", id: "cancel" },
        { label: "Guardar foto", icon: "fa-cloud-arrow-up", class: "btn--primary", id: "ok" }
      ],
      onAction: async (id, close, btn) => {
        if (id === "cancel") { close(); return; }
        const title = body.querySelector("#p-title").value.trim();
        const date = body.querySelector("#p-date").value;
        const group = body.querySelector("#p-group").value;
        const desc = body.querySelector("#p-desc").value.trim();
        let valid = true;
        if (!chosenFile) { body.querySelector("#file").closest(".field").classList.add("has-error"); valid = false; }
        if (!title) { body.querySelector("#p-title").closest(".field").classList.add("has-error"); valid = false; }
        if (!valid) { UI.toast("Completa los campos obligatorios", "warn"); return; }

        btn.setAttribute("aria-disabled", "true");
        btn.innerHTML = `<i class="fa-solid fa-spinner spin"></i> Procesando…`;
        try {
          const compressed = await compressImage(chosenFile);
          const fileName = safeFileName(chosenFile.name);
          const photo = {
            id: U.uid("pho"),
            title,
            date,
            group,
            description: desc,
            fileName,
            path: `assets/photos/${fileName}`,
            dataUrl: compressed.dataUrl,
            width: compressed.width,
            height: compressed.height,
            uploadedBy: user.username,
            createdAt: Date.now()
          };
          SS.store.addPhoto(photo);
          SS.store.ensureJornada(date, group, user);
          SS.audit.log("contenido", "Subió evidencia fotográfica", `${fileName} · ${U.fmtDate(date)} · ${SS.store.groupName(group)}`);
          UI.toast("Evidencia guardada", "success", 3600, `Vinculada a ${U.fmtDate(date)}`);
          close();
          render(U.$("#view"));
        } catch (err) {
          btn.removeAttribute("aria-disabled");
          btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar foto`;
          UI.toast(err.message || "No se pudo procesar la imagen", "error");
        }
      }
    });

    const fileInput = body.querySelector("#file");
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      body.querySelector("#file").closest(".field").classList.remove("has-error");
      if (!f) return;
      if (!f.type.startsWith("image/")) { UI.toast("El archivo debe ser una imagen", "error"); return; }
      chosenFile = f;
      const url = URL.createObjectURL(f);
      preview = url;
      body.querySelector("#preview").innerHTML = `<img src="${url}" alt="Vista previa" style="max-height:190px;border-radius:12px;margin:0 auto">`;
    });

    return m;
  }

  /* ------------------------- Eliminar ------------------------- */
  function removePhoto(user, photo) {
    UI.confirm({
      heading: "Eliminar evidencia",
      title: "¿Eliminar esta fotografía?",
      message: `${photo.title} · ${U.fmtDate(photo.date)}`,
      confirmLabel: "Eliminar",
      danger: true
    }).then((ok) => {
      if (!ok) return;
      SS.store.removePhoto(photo.id);
      SS.audit.log("contenido", "Eliminó evidencia fotográfica", `${photo.title} · ${U.fmtDate(photo.date)}`);
      UI.toast("Fotografía eliminada", "warn");
      render(U.$("#view"));
    });
  }

  /* ------------------------- Vista ------------------------- */
  function render(root) {
    const user = SS.auth.currentUser();
    if (!user) return;
    const st = SS.store.state;
    const canManage = SS.auth.can(user, "photos:manage");
    const vg = SS.auth.visibleGroup(user); // visitantes: solo su grupo
    if (vg) filters.group = vg;

    let photos = st.photos.slice().sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)));
    if (vg) photos = photos.filter((p) => p.group === vg);
    if (filters.date !== "todas") photos = photos.filter((p) => p.date === filters.date);
    if (!vg && filters.group !== "todos") photos = photos.filter((p) => p.group === filters.group);

    const scopedForStats = vg ? st.photos.filter((p) => p.group === vg) : st.photos;
    const dateOptions = Array.from(new Set(scopedForStats.map((p) => p.date))).sort().reverse();

    // Fotos "del día" (acceso directo del dashboard)
    const today = U.todayISO();
    const todayCount = scopedForStats.filter((p) => p.date === today).length;

    root.innerHTML = `
      <div class="page-head">
        <div class="page-head__text">
          <span class="crumb"><i class="fa-solid fa-images"></i> Evidencia del proyecto</span>
          <h1>Galería de fotos</h1>
          <p>${vg
            ? `Evidencias de ${esc(UI.groupLabel(vg))} vinculadas a fechas de asistencia.`
            : `Fotografías vinculadas a fechas específicas de asistencia, respaldadas en <strong>assets/photos/</strong>.`}</p>
        </div>
        <div class="page-head__actions">
          ${canManage ? `<button class="btn btn--primary" id="btn-upload"><i class="fa-solid fa-camera"></i> Subir evidencia</button>` : ""}
        </div>
      </div>

      <div class="grid grid-3 mb-4">
        <div class="stat">
          <span class="card__icon"><i class="fa-solid fa-image"></i></span>
          <div class="stat__body"><div class="stat__label">Total de fotos</div><div class="stat__value">${scopedForStats.length}</div><div class="stat__sub">${vg ? `de ${esc(UI.groupLabel(vg))}` : "en el respaldo local"}</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--accent"><i class="fa-solid fa-calendar-day"></i></span>
          <div class="stat__body"><div class="stat__label">Fotos de hoy</div><div class="stat__value">${todayCount}</div><div class="stat__sub">${U.fmtDate(today, true)}</div></div>
        </div>
        <div class="stat">
          <span class="card__icon card__icon--success"><i class="fa-solid fa-folder-open"></i></span>
          <div class="stat__body"><div class="stat__label">Fechas con evidencia</div><div class="stat__value">${dateOptions.length}</div><div class="stat__sub">jornadas documentadas</div></div>
        </div>
      </div>

      <div class="toolbar">
        <select class="select" id="f-date" style="width:auto;min-width:170px">
          <option value="todas">Todas las fechas</option>
          ${dateOptions.map((d) => `<option value="${esc(d)}" ${filters.date === d ? "selected" : ""}>${esc(U.fmtDate(d))}</option>`).join("")}
        </select>
        ${vg ? `
          <span class="chip chip--soft"><i class="fa-solid fa-people-group"></i> ${esc(UI.groupLabel(vg))}</span>
        ` : `
          <select class="select" id="f-group" style="width:auto;min-width:150px">
            <option value="todos">Todos los grupos</option>
            ${SS.store.groupsOptions().map((g) => `<option value="${esc(g.value)}" ${filters.group === g.value ? "selected" : ""}>${esc(g.label)}</option>`).join("")}
          </select>`}
        <span class="chip chip--soft"><i class="fa-solid fa-photo-film"></i> ${photos.length} resultado(s)</span>
      </div>

      ${photos.length ? `
        <div class="gallery">
          ${photos.map((p) => {
            const src = p.dataUrl || null;
            return `
            <figure class="photo" data-photo="${esc(p.id)}">
              <div class="photo__frame" data-open="${esc(p.id)}" role="button" tabindex="0" aria-label="Ver ${esc(p.title)}">
                ${src ? `<img src="${src}" alt="${esc(p.title)}" loading="lazy">` : `<i class="fa-solid fa-image-portrait"></i>`}
                <span class="photo__date"><i class="fa-solid fa-calendar"></i> ${esc(U.fmtDate(p.date, true))}</span>
              </div>
              <figcaption class="photo__body">
                <strong>${esc(p.title)}</strong>
                <p>${esc(p.description || "Sin descripción")}</p>
                <div class="gap-row" style="gap:6px">${UI.groupBadge(p.group || SS.store.defaultGroupId())}</div>
              </figcaption>
              <div class="photo__foot">
                <button class="btn btn--sm btn--ghost" data-open="${esc(p.id)}"><i class="fa-solid fa-expand"></i> Ver</button>
                <button class="btn btn--sm btn--ghost" data-dl="${esc(p.id)}"><i class="fa-solid fa-download"></i> Descargar</button>
                ${canManage ? `<button class="btn btn--sm btn--ghost" data-del="${esc(p.id)}" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ""}
              </div>
            </figure>`;
          }).join("")}
        </div>`
      : UI.emptyState("fa-images", "Sin fotografías",
          canManage ? "Sube la primera evidencia fotográfica de tu jornada." : "La coordinación aún no publica evidencia.",
          canManage ? `<button class="btn btn--primary" id="btn-upload-empty"><i class="fa-solid fa-camera"></i> Subir evidencia</button>` : "")}

      <div class="card mt-4">
        <div class="card__head">
          <span class="card__icon card__icon--warn"><i class="fa-solid fa-folder-tree"></i></span>
          <div>
            <h2>Estructura en el repositorio</h2>
            <div class="small muted">Para publicar las imágenes en GitHub Pages</div>
          </div>
          ${canManage ? `<div class="card__actions"><button class="btn btn--sm btn--soft" id="btn-photos-json"><i class="fa-solid fa-file-code"></i> Exportar photos.json</button></div>` : ""}
        </div>
        <p class="small muted mb-2">Cada foto guardada genera un registro con su ruta definitiva. Descarga la imagen y colócala en la carpeta indicada antes de hacer el commit:</p>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Archivo</th><th>Ruta en repositorio</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              ${st.photos.slice(0, 8).map((p) => `
                <tr>
                  <td class="cell-main">${esc(p.fileName || "—")}</td>
                  <td><code class="kbd">${esc(p.path || "assets/photos/")}</code></td>
                  <td>${esc(U.fmtDate(p.date, true))}</td>
                  <td>${p.dataUrl ? '<span class="badge badge--aprobado"><i class="fa-solid fa-check"></i>En respaldo</span>' : '<span class="badge badge--pendiente"><i class="fa-solid fa-clock"></i>Sin imagen local</span>'}</td>
                </tr>`).join("") || `<tr><td colspan="4" class="muted center">Sin registros</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;

    const btnUp = root.querySelector("#btn-upload");
    if (btnUp) btnUp.addEventListener("click", () => uploadPhoto(user));
    const btnUpEmpty = root.querySelector("#btn-upload-empty");
    if (btnUpEmpty) btnUpEmpty.addEventListener("click", () => uploadPhoto(user));
    const btnJson = root.querySelector("#btn-photos-json");
    if (btnJson) btnJson.addEventListener("click", () => {
      const meta = st.photos.map((p) => { const c = Object.assign({}, p); delete c.dataUrl; return c; });
      U.downloadJSON({ _info: { app: "Control Servicio Social", generatedAt: new Date().toISOString() }, items: meta }, "photos.json");
      UI.toast("photos.json generado", "success", 3000, "Colócalo en data/ y las imágenes en assets/photos/");
    });

    root.querySelector("#f-date").addEventListener("change", (e) => { filters.date = e.target.value; render(root); });
    const fg = root.querySelector("#f-group");
    if (fg) fg.addEventListener("change", (e) => { filters.group = e.target.value; render(root); });

    const findPhoto = (id) => st.photos.find((p) => p.id === id);
    root.querySelectorAll("[data-open]").forEach((el) => {
      const open = () => { const p = findPhoto(el.dataset.open); if (p) UI.viewPhoto(p); };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
    root.querySelectorAll("[data-dl]").forEach((el) => {
      el.addEventListener("click", () => {
        const p = findPhoto(el.dataset.dl);
        if (!p) return;
        const ok = SS.store.downloadPhoto(p);
        if (!ok) UI.toast("Esta foto no tiene imagen local: usa photos.json + assets/photos/", "warn");
      });
    });
    root.querySelectorAll("[data-del]").forEach((el) => {
      el.addEventListener("click", () => { const p = findPhoto(el.dataset.del); if (p) removePhoto(user, p); });
    });
  }

  SS.views.fotos = render;
})();
