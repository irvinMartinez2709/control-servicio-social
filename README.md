# Control Servicio Social

Aplicación Web Progresiva (SPA) para el control, auditoría y registro de horas de **Servicio Social**,
con grupos dinámicos (Cuadro 3, Cuadro 6 y los que cree el Líder Supremo), bitácora de actividades
y evidencia fotográfica.

Diseño *flat* moderno, modo claro/oscuro, iconografía **FontAwesome 6** (sin emojis nativos),
**portada pública con resumen de horas y asistencias** (visible sin sesión, con calendario),
**cuenta única con dos modos de ingreso** (Visitante / Administración), autenticación por roles con
**2FA** (PIN maestro o TOTP), **registro de auditoría completo** y persistencia en `LocalStorage`
con utilidades de exportación/importación de los JSON del repositorio.

---

## Estructura del repositorio

```text
Labor social/
├── index.html                  # Esqueleto de la SPA + splash + armazón
├── manifest.json               # Manifest PWA (instalable)
├── sw.js                       # Service Worker (caché offline)
├── render.yaml                 # Blueprint de Render (API en línea)
├── README.md
│
├── server/                     # API en línea (Express + MongoDB Atlas)
│   ├── index.js                # GET /api/data, POST /api/sync, /api/health
│   └── package.json            # express, mongodb, cors, dotenv
│
├── css/                        # Estilos modulares (Flat Design)
│   ├── tokens.css              # Variables: paletas, temas light/dark, radios, sombras
│   ├── base.css                # Reset, tipografía, splash, utilidades
│   ├── layout.css              # Topbar, sidebar, vista, responsive
│   ├── components.css          # Botones, cards, tablas, modales, toasts, badges…
│   └── views.css               # Login/2FA, resumen, asistencia, galería, ajustes
│
├── js/                         # Scripts estructurados (sin dependencias)
│   ├── util.js                 # DOM, fechas, formato estricto de tiempo (hrs/mins)
│   ├── crypto.js               # SHA-256 + sal, Base32, TOTP (RFC 6238), QR
│   ├── config.js               # URL del API en línea (sin secretos)
│   ├── store.js                # Almacenamiento, grupos, auditoría, export/import
│   ├── sync.js                 # Sincronización en línea (bajar/subir, cola outbox)
│   ├── audit.js                # Registrador central de auditoría
│   ├── ui.js                   # Tema, splash, toasts, modales, badges
│   ├── auth.js                 # Login dual, registro, 2FA y matriz de permisos
│   ├── app.js                  # Router con Auth Guard + arranque + service worker
│   └── views/
│       ├── public.js            # Portada pública: resumen + calendario (sin sesión)
│       ├── login.js            # Login (Visitante/Admin), Registro, 2FA
│       ├── dashboard.js        # Resumen (meta 60 hrs, desglose, estados)
│       ├── attendance.js       # Asistencia (jornadas, solicitudes, registro directo)
│       ├── solicitudes.js      # Cola de aprobación (Admin / Super Admin)
│       ├── bitacora.js         # Bitácora por jornada y grupo
│       ├── gallery.js          # Galería de evidencia fotográfica
│       ├── users.js            # Usuarios, roles, grupos y datos de contacto
│       ├── groups.js           # Gestión de grupos (solo Líder Supremo)
│       ├── audit.js            # Registro de auditoría con búsqueda y filtros
│       └── settings.js         # Perfil, 2FA, tema, respaldos, ayuda, acerca de
│
├── data/                       # JSON del repositorio (fuente de datos versionada)
│   ├── users.json              # Usuarios, roles, contactos, hashes y 2FA
│   ├── attendance.json         # Asistencia: grupos, horas y estados
│   ├── jornadas.json           # Jornadas habilitadas (fecha + grupo)
│   ├── bitacoras.json          # Resumen narrativo por fecha y grupo
│   ├── groups.json             # Grupos de la plataforma
│   ├── audit.json              # Registro de auditoría
│   └── photos.json             # Metadatos de fotos (ruta, fecha, descripción)
│
└── assets/
    ├── favicon.png
    ├── logo.png
    └── photos/                 # Evidencia fotográfica (imágenes vinculadas a fechas)
```

---

## Cuenta preconfigurada

| Campo | Valor |
|---|---|
| Usuario | `irvin_martinez` |
| Contraseña | `sarsamora.0927.love` |
| Rol | **Super Admin (Líder Supremo)** |

> Al primer ingreso al **modo Administración** deberá configurar su **2FA** (PIN maestro o
> código TOTP con Google Authenticator / Authy). Las contraseñas se guardan como
> `sha256$<sal>$<hash>`; nunca en texto plano.

### Portada pública (resumen sin sesión)

La página inicial (`#/`) ya **no es el login**: es un **resumen público** pensado para que
cualquiera consulte la información sin iniciar sesión.

- **KPIs** con horas totales aprobadas, participantes, asistencias y solicitudes por revisar.
- **Horas totales de cada persona** con barra de progreso hacia la meta (60 hrs).
- **Calendario mensual** navegable: cada día con asistencias muestra su conteo; al seleccionar
  un día se despliega el detalle (persona, horario, horas y estado).
- **Todas las asistencias** en una lista completa (fecha, persona, grupo, llegada/salida,
  horas, estado y detalle).
- **Datos sincronizados con el repositorio**: la portada se reconstruye con los JSON
  publicados (`data/users.json` y `data/attendance.json`), de modo que **todos los
  dispositivos ven exactamente lo mismo**; sin red se usa la copia local como respaldo.
- Botón **Iniciar sesión** (o *Mi panel* si ya hay sesión) y conmutador de tema claro/oscuro.
- **100 % responsive**: en móvil el texto no se infla (sin zoom out), las secciones anchas
  se deslizan con el dedo sin barra visible, el pie se centra sin desbordes y el calendario
  nunca sobresale (meses con registros de asistencias incluidos).

Registrar asistencias sigue exigiendo sesión: desde el login puedes volver al resumen con
el enlace *"Ver el resumen público sin iniciar sesión"*.

### Modos de ingreso (cuenta única, dos vistas)

El login pide **solo usuario y contraseña**. El modo NO se elige antes de entrar:

- **Cuenta de Visitante normal:** entra directo como Visitante, sin ninguna pregunta.
- **Credenciales de versión visitante de un Admin:** el admin puede definir en
  *Ajustes → Tu versión visitante* un **usuario y contraseña distintos** para su vista
  de visitante; con ellos entra directo como Visitante, sin pregunta ni 2FA.
- **Usuario y contraseña de administración:** solo aquí aparece la pregunta
  **"¿Cómo deseas ingresar?"** (Visitante o Administración). Administración exige 2FA;
  Visitante entra sin doble factor. La última opción elegida queda marcada como
  **opción preferida**. Desde el menú de usuario puede **Cambiar de modo** en cualquier momento.

| Rol | Permisos |
|---|---|
| Super Admin | CRUD total, aprobar/rechazar, **crear, renombrar y eliminar grupos**, nombrar o revocar Admins, **restablece la contraseña de cualquier cuenta (por si la olvidan)**, meta de horas, sincronizar y reiniciar. Ningún otro usuario puede modificarlo. |
| Admin | CRUD de asistencia, fotos y bitácoras; aprueba/deniega/corrige solicitudes; **cambia el grupo de cualquier persona (y el suyo)**; nombra Admins; restablece contraseñas de Visitantes; accede a la **Auditoría**. **También registra sus horas.** |
| Visitante | Solo lectura de **su grupo**; envía su solicitud de asistencia (fecha, llegada, salida) y cambia su propia contraseña. |

### Registro y grupos

- El registro pide **correo, teléfono, cédula y carrera**, además de nombre, usuario,
  contraseña y **grupo al que pertenece**. Esos cuatro datos son **texto libre**:
  no se exige ningún formato y pueden dejarse vacíos (también al crear o editar
  usuarios desde *Usuarios* y desde *Ajustes → Editar mis datos*).
- Los visitantes solo ven la información (horas, jornadas, bitácoras y fotos) de **su grupo**.
- **Solo el Líder Supremo crea grupos** (sección *Grupos*); los grupos no pueden eliminarse
  si tienen usuarios, registros, jornadas, fotos o bitácoras asociadas.
- Al **eliminar una cuenta**, sus registros de asistencia se eliminan también: dejan de
  aparecer en el resumen, la asistencia, las colas y la portada pública. La *Auditoría*
  conserva el evento de eliminación.

### Auditoría

Todos los administradores tienen la sección *Auditoría*: cada inicio de sesión, cuenta
creada, cambio, solicitud, subida de fotos y acción de sistema queda registrado con
**usuario, día y hora**, con **búsqueda** y **filtro por tipo de acción**
(Sesión, Cuentas, Asistencia, Contenido, Grupos, Sistema).

### Guardado y sincronización

Los datos se **autoguardan** en el navegador en cada cambio y, si hay conexión y
token, se **suben al repositorio** (ver *Datos en línea* más abajo), de modo que
todos los dispositivos cargan y guardan lo mismo. El botón **Guardar** de la barra
superior (solo administraciones) fuerza la persistencia completa **y sube los
cambios a GitHub** como respaldo adicional.

---

## Datos en línea (GitHub como base de datos)

**Estado: activo.** El repositorio es la base de datos de la app: no hace falta
Firebase, MongoDB ni ningún servidor nuevo. La web se sirve desde GitHub Pages y
los mismos `data/*.json` del repo son la fuente de verdad:

```
PWA (GitHub Pages, js/github.js + js/sync.js)
   │  lectura: raw.githubusercontent.com (data/*.json, sin token)
   ▼
Repositorio (rama main, data/*.json)
   ▲  escritura: API de Contents con token personal (commit por archivo)
```

* **Al abrir la página**: la app *baja* `data/*.json` desde la rama `main` (sin
  caché) y los aplica al almacenamiento local; todos los dispositivos ven lo que
  está publicado en el repo.
* **Al guardar cambios** (crear/editar/borrar usuarios, asistencia, jornadas,
  bitácoras, fotos, grupos o auditoría): la app los aplica en local y, si el
  administrador configuró su token, los **sube como commits** (uno por archivo
  JSON modificado, y solo si el contenido cambió realmente). Hay subida
  automática (~2.5 s después del cambio, al recuperar la pestaña y cada 90 s) y
  también el botón **Guardar** y **Ajustes → Datos en línea → Subir cambios
  ahora** para subir a mano.
* **Sin token** (o sin red): todo se guarda en el navegador y la app avisa una
  vez; al configurar el token o volver la red se sube lo pendiente.
* **Primera sincronización:** carga inicial = *unión* de lo local con lo del
  repo (upsert por id): nada se pierde ni se borra salvo un borrado explícito.
* **No se sincronizan:** la sesión del dispositivo, la bandera de semilla ni el
  tema (preferencias de cada navegador).
* La portada pública lee primero `data/*.json` del repo (sin token); si falla,
  usa los JSON servidos por Pages; si no, lo local.

### Token de GitHub (cada administrador, una sola vez)

Los cambios solo se suben a GitHub desde una cuenta autorizada. Cada
administrador crea **su propio token** (así se puede revocar por persona) y lo
pega una vez en **Ajustes → Datos en línea (GitHub) → Configurar**; el token se
guarda **solo en su navegador**, nunca en el código ni en el repo.

1. En GitHub: **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. *Resource owner*: tu cuenta. En **Repository access** elige **Only select
   repositories** → `irvinMartinez2709/control-servicio-social`.
3. En **Permissions → Repository permissions** deja todo en *No access* salvo
   **Contents: Read and write**.
4. Elige expiración (90 días es buena práctica) y genera el token; cópialo.
5. En la app: **Ajustes → Datos en línea (GitHub) → Configurar** → pega el
   token → **Guardar token**. El estado mostrará `Conectado como @tuusuario`.
6. Para revocarlo: bórralo en GitHub y en la app vacía el campo y guarda (la
   app vuelve a modo solo-local con aviso).

> **Advertencia:** quien tenga el token puede modificar este repo; por eso está
> limitado al permiso *Contents* y a este repositorio, y cada administrador usa
> el suyo. Si un token se filtra, revócalo de inmediato.

### CRUD completo por sección

Toda sección que agrega contenido tiene operaciones completas de crear, leer,
editar y eliminar (los cambios viajan al repo por la sincronización):

| Sección | Crear | Leer | Editar | Eliminar |
|---|---|---|---|---|
| Usuarios (con 2FA incluido) | sí | sí | sí | sí |
| Grupos | sí | sí | renombrar | sí |
| Jornadas | sí | sí | nota de apertura | sí (solo vacías) |
| Registros de asistencia | sí | sí | corregir / aprobar / rechazar | sí |
| Bitácoras | sí | sí | redactar / editar | sí |
| Evidencias (fotos) | sí | sí | título y descripción | sí |
| Auditoría | registro inmutable por diseño | | | |

Los usuarios (incluido su 2FA: PIN/TOTP) viven en `data/users.json`: una vez
registrado y validado, cualquier dispositivo que sincronice reconoce la cuenta
sin volver a pedir el 2FA.

### Notas y límites

* Cada subida es un **commit por archivo** con mensaje
  `app: coleccion (N registros) · fecha`; el historial del repo documenta cada
  cambio y un commit vacío nunca se crea.
* Si dos administradores editan a la vez, gana el último en subir ese archivo
  (escritura a archivo completo). Editando a ritmo humano normal no debería
  ocurrir.
* El bloque `_info` documental de cada JSON del repo **se conserva** en cada
  subida (la app lo reescribe solo con `items` actualizados).
* La API de Contents rechaza archivos de más de ~100 MB; con fotos en base64
  eso es muy difícil de alcanzar, pero si ocurriera la app lo avisa y esos
  datos quedan en el dispositivo.

### Alternativas no activas (por si algún día se necesitan)

* **API propio (MongoDB Atlas + Render o Vercel):** `server/index.js` (Express +
  driver de MongoDB) expone `GET /api/data`, `POST /api/sync` y `GET /api/health`
  con la misma semántica (upsert por id + depuración de huérfanos). Se activa
  definiendo `apiBase` en `js/config.js`; `render.yaml` (Render) y `api/index.js`
  (Vercel) ya están listos. Sin `MONGODB_URI` corre en modo memoria (así lo usan
  las pruebas locales).
* **Firebase (Firestore):** `js/config.js` tiene el bloque `firebase` con
  `enabled: false`. Pegando la config pública de una web de Firebase y marcando
  `enabled: true`, `js/sync.js` usa Firestore (colección `state`, doc
  `coleccion:id`, lotes de 400) como transporte, descargando el SDK solo bajo
  demanda.

---

## Despliegue en GitHub Pages

**Estado: PUBLICADA y activa** (verificación HTTP 200 y pruebas E2E en producción)

* **Repositorio:** https://github.com/irvinMartinez2709/control-servicio-social (rama `main`)
* **Aplicación en vivo:** https://irvinmartinez2709.github.io/control-servicio-social/

Para publicar o actualizar una versión:

1. **Sube los cambios**
   ```bash
   cd "Labor social"
   git add .
   git commit -m "Descripción del cambio"
   git push
   ```

2. **GitHub Pages** ya está configurado (*Repo → Settings → Pages → Source: Deploy from
   a branch → **main** / **/** root*). El push dispara el despliegue automático.

3. **Actualiza los datos versionados** subiendo a `data/` los JSON exportados desde
   *Ajustes → Datos y respaldos → Descargar archivos JSON del repo*.

4. **Estructura del repo**
   `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `data/`, `assets/`
   (con `assets/photos/` para las evidencias) y `server/` + `render.yaml` (API en línea).

### Publicación manual de datos e imágenes (alternativa)

La app ya lee y escribe `data/*.json` automáticamente (ver *Datos en línea*).
Este flujo manual queda como alternativa para publicar sin token y para las
imágenes de `assets/photos/`:

1. **Ajustes → Datos y respaldos → Descargar archivos JSON del repo**
   (genera `users.json`, `attendance.json`, `jornadas.json`, `bitacoras.json`,
   `groups.json`, `audit.json` y `photos.json`).
2. Copia esos archivos a la carpeta `data/`.
3. Para cada imagen: **Galería → Descargar** y guarda el archivo en `assets/photos/`
   con el nombre indicado en la tabla de rutas.
4. Commit y push:
   ```bash
   git add data/ assets/photos/
   git commit -m "Actualiza datos de servicio social"
   git push
   ```
5. En el navegador, **Ajustes → Sincronizar desde el repositorio** (Líder Supremo)
   recarga `data/*.json`.

> Con el token configurado no hace falta este flujo para los JSON: la app los
> sube sola como commits. Solo sigue haciendo falta para las imágenes de
> `assets/photos/`.

---

## Funciones principales

- **Splash** animado con el logo al cargar y al validar sesión.
- **Auth Guard**: sin sesión solo se ven la portada pública, Login y Registro (las demás
  secciones redirigen a Login).
- **Visibilidad de contraseña** (ojo FontAwesome) en todos los formularios.
- **2FA obligatorio** para Admin y Super Admin (PIN o TOTP con QR).
- **Asistencia** con jornadas por fecha, aprobación/rechazo/corrección y registro directo.
  **Se pueden registrar fechas pasadas** (en la solicitud y en el registro directo): el
  Admin revisa y aprueba o rechaza siempre.
- **Horas en formato estricto** (`10 hrs 48 mins`), meta de **60 hrs** con barra de progreso.
- **Bitácora** por jornada y **galería** de fotos vinculadas a fechas.
- **Resumen**: avance, desglose Cuadro 3 / Cuadro 6, estados de solicitudes y accesos directos.
- **Modo claro/oscuro**, diálogos y avisos propios (sin `alert`/`confirm` nativos).
