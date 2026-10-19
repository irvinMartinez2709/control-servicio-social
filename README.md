# Control Servicio Social

Aplicación Web Progresiva (SPA) para el control, auditoría y registro de horas de **Servicio Social**,
con grupos dinámicos (Cuadro 3, Cuadro 6 y los que cree el Líder Supremo), bitácora de actividades
y evidencia fotográfica.

Diseño *flat* moderno, modo claro/oscuro, iconografía **FontAwesome 6** (sin emojis nativos),
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
├── README.md
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
│   ├── store.js                # Almacenamiento, grupos, auditoría, export/import
│   ├── audit.js                # Registrador central de auditoría
│   ├── ui.js                   # Tema, splash, toasts, modales, badges
│   ├── auth.js                 # Login dual, registro, 2FA y matriz de permisos
│   ├── app.js                  # Router con Auth Guard + arranque + service worker
│   └── views/
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
| Super Admin | CRUD total, aprobar/rechazar, **crear, renombrar y eliminar grupos**, nombrar o revocar Admins, meta de horas, sincronizar y reiniciar. Ningún otro usuario puede modificarlo. |
| Admin | CRUD de asistencia, fotos y bitácoras; aprueba/deniega/corrige solicitudes; **cambia el grupo de cualquier persona (y el suyo)**; nombra Admins; restablece contraseñas de Visitantes; accede a la **Auditoría**. **También registra sus horas.** |
| Visitante | Solo lectura de **su grupo**; envía su solicitud de asistencia (fecha, llegada, salida) y cambia su propia contraseña. |

### Registro y grupos

- El registro pide **correo, teléfono, cédula y carrera**, además de nombre, usuario,
  contraseña y **grupo al que pertenece**.
- Los visitantes solo ven la información (horas, jornadas, bitácoras y fotos) de **su grupo**.
- **Solo el Líder Supremo crea grupos** (sección *Grupos*); los grupos no pueden eliminarse
  si tienen usuarios, registros, jornadas, fotos o bitácoras asociadas.

### Auditoría

Todos los administradores tienen la sección *Auditoría*: cada inicio de sesión, cuenta
creada, cambio, solicitud, subida de fotos y acción de sistema queda registrado con
**usuario, día y hora**, con **búsqueda** y **filtro por tipo de acción**
(Sesión, Cuentas, Asistencia, Contenido, Grupos, Sistema).

### Guardado

Los datos se **autoguardan** en el navegador en cada cambio. El botón **Guardar** de la
barra superior (solo administraciones) fuerza la persistencia completa como respaldo
adicional.

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
   `index.html`, `manifest.json`, `sw.js`, `css/`, `js/`, `data/` y `assets/`
   (con `assets/photos/` para las evidencias).

### Sincronizar datos con el repositorio

La aplicación corre sobre `LocalStorage` (capa de ejecución). Para versionar los datos:

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
- **Auth Guard**: sin sesión no se accede a ninguna sección (redirige a Login).
- **Visibilidad de contraseña** (ojo FontAwesome) en todos los formularios.
- **2FA obligatorio** para Admin y Super Admin (PIN o TOTP con QR).
- **Asistencia** con jornadas por fecha, aprobación/rechazo/corrección y registro directo.
- **Horas en formato estricto** (`10 hrs 48 mins`), meta de **60 hrs** con barra de progreso.
- **Bitácora** por jornada y **galería** de fotos vinculadas a fechas.
- **Resumen**: avance, desglose Cuadro 3 / Cuadro 6, estados de solicitudes y accesos directos.
- **Modo claro/oscuro**, diálogos y avisos propios (sin `alert`/`confirm` nativos).
