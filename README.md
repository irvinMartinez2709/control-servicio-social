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

Los datos se **autoguardan** en el navegador en cada cambio y, si hay conexión, se
**suben al API en línea** (ver *Datos en línea* más abajo), de modo que todos los
dispositivos cargan y guardan lo mismo. El botón **Guardar** de la barra superior
(solo administraciones) fuerza la persistencia completa como respaldo adicional.

---

## Datos en línea (MongoDB Atlas + Render)

**Estado: listo para configurar** (el código del API y del cliente ya está en el repo;
falta crear la cuenta de Atlas y desplegar el API en Render — pasos abajo).

Antes cada navegador tenía su propia copia en `LocalStorage`. Ahora:

* **Al abrir la página** (`js/sync.js` → `SS.sync.run()`): primero *baja* los datos del
  API y los aplica al almacenamiento local; después *sube* la cola pendiente.
* **Cada cambio local** (crear/editar/borrar) se encola como operaciones `put`/`del`
  por documento (`ss.outbox.v1`) y se envía al API en ~2.5 s, al recuperar la red, al
  volver a la pestaña y cada 90 s.
* **Primera sincronización:** carga inicial = *unión* de lo local con lo remoto
  (upsert por id): dos dispositivos que se conectan por primera vez se combinan, nada
  se borra salvo un `del` explícito.
* **Sin red:** todo sigue funcionando en local y la cola se sube al volver la conexión.
* **No se sincronizan:** la sesión del dispositivo y la bandera de semilla.
* La portada pública lee el API primero (`publicData()`); si el API no responde, usa
  `data/*.json` del repositorio; si no, lo local.

### Arquitectura

```
PWA (GitHub Pages)  ──GET /api/data──►  API Express (Render)  ──►  MongoDB Atlas M0
   js/sync.js         ◄──POST /api/sync──   server/index.js           colección "docs"
```

* `server/index.js`: Express + driver oficial de MongoDB. Sin `MONGODB_URI` corre en
  **modo memoria** con la semilla de `data/*.json` (eso es lo que usan las pruebas).
* Tras cada sincronización el API **depura asistencias huérfanas** (una cuenta
  eliminada no deja registros en línea).
* `render.yaml` (Blueprint) define el servicio: `control-servicio-social-api`.
* Lecturas abiertas (los datos de portada son públicos por diseño). Escrituras: si
  defines la variable de entorno `APP_KEY` en Render, el API exige el encabezado
  `x-app-key` y hay que poner el **mismo** valor en `js/config.js` (`appKey`).
  *Nunca* guardes la cadena de MongoDB en el código ni en el repo.

### 1. Crear la base de datos en MongoDB Atlas (gratis, sin tarjeta)

1. Entra a https://www.mongodb.com/cloud/atlas/register y crea la cuenta (email o Google).
2. En **Database → Build a Database** elige **M0 (Free)**, región más cercana
   (p. ej. `us-east-1`), nombre del cluster: `Cluster0` y **Create**.
3. En **Security → Database Access → Add New Database User**: usuario y contraseña
   (guárdalas, no las necesitarás en el código) y permiso **Read and write to any
   database**. **Add User**.
4. En **Security → Network Access → Add IP Address**: **Allow Access From Anywhere**
   (`0.0.0.0/0`) — el API de Render necesita llegar desde internet.
5. En **Deployment → Database → Connect → Connect your application**: copia la cadena
   `mongodb+srv://...` (**tal cual, sin comillas**). Esta cadena SOLO vive en Render.

### 2. Desplegar el API en Render (gratis)

1. Entra a https://dashboard.render.com con GitHub.
2. **New → Blueprint** → conecta el repositorio `irvinMartinez2709/control-servicio-social`.
   Render detecta el `render.yaml` y crea el servicio **control-servicio-social-api**.
3. En *Environment* del servicio, pega en **MONGODB_URI** la cadena de Atlas
   (opcionalmente define **APP_KEY** con un valor secreto tuyo).
4. **Apply / Deploy**. Espera a que digue *Live*: la URL será
   `https://control-servicio-social-api.onrender.com` (la que `js/config.js` ya usa).
5. Comprueba: `https://control-servicio-social-api.onrender.com/api/health` debe
   responder `{"ok":true,"mode":"mongo"}`.

> **Notas:** Render duerme el servicio gratis tras ~15 min sin uso; la primera petición
> tarda hasta ~50 s (la app lo detecta y usa el respaldo local/repo sin romperse).
> Tras crear Atlas **vacío**, la primera apertura de la app sube sus datos locales al
> API (carga inicial) y a partir de ahí todos los dispositivos ven lo mismo.

### 3. Pruebas locales del API

```bash
cd server && npm install
node index.js          # puerto 8124, modo memoria con semilla de data/*.json
```
La suite E2E apunta a `http://127.0.0.1:8124` (inyectado con `window.__SS_API_BASE__`);
el humo de producción apunta a un puerto muerto para nunca tocar la API real.

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

### Sincronizar datos con el repositorio (respaldo)

La fuente principal en línea es el API (sección *Datos en línea*). Estos JSON siguen
siendo el **respaldo** cuando no hay API (y la fuente de la semilla inicial):

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

> En la primera carga (navegador limpio) la app lee automáticamente los JSON de `data/`.
> A partir de que modificas datos en local, deja de sobrescribirlos: usa el botón
> *Sincronizar* para forzar la lectura desde el repositorio.

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
