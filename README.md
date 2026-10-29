> **Versión mejorada (octubre 2026):** diseño moderno azul y dorado, modo claro/oscuro automático, letra ajustable, animaciones, sonido al pasar el cursor, recuperar contraseña con validación, alertas por cercanía, monitoreo en vivo, ruta al incidente y silencio temporal. Ver sección «Mejoras» al final.

> **Nueva funcionalidad 2026:** para mapa interactivo y despacho policial, lee primero [`GUIA_MAPA_DESPACHO.md`](GUIA_MAPA_DESPACHO.md) y ejecuta `supabase/upgrade_interactive_dispatch.sql` en Supabase.

# AlertaVecinal — Sistema de Alerta Comunitaria para la Prevención de Robos

Interfaz web responsive en azul y blanco para el proyecto DHAAP. Está organizada para abrirse y editarse en Visual Studio Code, con interfaz diferenciada por rol **Vecino**, **Policía** y **Administrador**.

## 1. Abrir el proyecto

1. Descomprime el ZIP.
2. Abre la carpeta `alerta_comunitaria` en VS Code.
3. Ejecuta `index.html` con la extensión **Live Server** (recomendado), o sírvela desde un servidor local. La geolocalización del navegador suele requerir HTTPS o `localhost`.
4. Sin claves configuradas, usa los botones **Probar vecino**, **Probar policía** y **Probar admin** en la pantalla de acceso. Es un modo de demostración que guarda cambios en el navegador (`localStorage`), no en una base de datos remota.

## 2. Dónde colocar las claves

Abre `js/config.js` y sustituye los valores de ejemplo:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'AQUI_VA_LA_URL_DE_TU_PROYECTO_SUPABASE',
  SUPABASE_ANON_KEY: 'AQUI_VA_LA_CLAVE_PUBLICABLE_DE_SUPABASE',
  MAPBOX_TOKEN: 'AQUI_VA_TU_CLAVE_PUBLICA_DE_MAPBOX'
};
```

- **Supabase URL:** en el panel de Supabase, Project Settings → API (Project URL).
- **Supabase public/anon key:** la clave publicable del proyecto. No uses `service_role` ni ninguna clave secreta en código que se descarga al navegador.
- **Mapbox token:** usa un token público que empiece normalmente por `pk.`. Nunca pongas un token secreto.

Cuando URL y clave de Supabase están configuradas, el login/registro se realiza con Supabase Auth y se consultan las tablas remotas. Mapbox se habilita al añadir el token. Si no hay token, se muestra una alternativa visual y siguen funcionando las listas.

## 3. Configurar la base de datos

1. En Supabase abre **SQL Editor → New query**.
2. Copia y ejecuta todo el contenido de `supabase/schema.sql`.
3. En Authentication configura la confirmación de correo según las necesidades de la prueba.
4. Registra tu cuenta de administrador mediante Authentication → Users.
5. En SQL Editor asigna el rol de administrador a esa cuenta, cambiando el correo:

```sql
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and u.email = 'TU_CORREO_ADMIN@ejemplo.com';
```

6. Añade los retenes desde la interfaz de Administrador o directamente en `public.police_stations`.
7. Crea los usuarios de policía en Supabase Auth usando un proceso administrativo seguro y luego asígnales `role='policia'`, `station_id` y `active=true` en `public.profiles`. **No es seguro crear usuarios privilegiados directamente desde el navegador**; para producción implementa una Supabase Edge Function protegida que use la clave `service_role` únicamente en el servidor.

Las cuentas creadas por el formulario público quedan con rol `vecino` por defecto. Las contraseñas las almacena Supabase Auth; no se guardan en la tabla `profiles`.

## 4. Roles e interfaces

### Vecino
- Registro con nombre, celular, correo y contraseña.
- Inicio de sesión y perfil editable.
- Crear alertas con categoría, descripción, ubicación del navegador y foto opcional comprimida.
- Confirmar reportes, comentar, marcar falsa alarma o resuelto en sus reportes.
- Consultar sus reportes, ver estados, mapa, retenes, preferencias de radio y modo no molestar.
- Cierre de sesión.

### Policía
- Panel operativo independiente.
- Alertas ordenadas por fecha, filtros, detalles ampliados, estado de atención, observaciones y vista de historial.
- Ruta de navegación externa al incidente.
- Los reportes se filtran por retén asignado cuando el perfil tiene `station_id`.

### Administrador
- Panel de supervisión, estadísticas y vista preparada para mapa de calor.
- Gestión de cuentas policiales (crear ficha en demo, activar/desactivar fichas de demo), retenes y reportes.
- Las cuentas privilegiadas reales se gestionan con un flujo backend seguro; la interfaz no expone la clave administrativa.

## 5. Iteraciones e historias contempladas

La navegación y los módulos se organizaron siguiendo el documento de historias de usuario:

- **Iteración 1:** HU-01 registrar usuario, HU-11 iniciar sesión, HU-13 editar perfil y HU-14 cerrar sesión.
- **Iteración 2:** HU-03 obtener ubicación, HU-02 enviar alerta, HU-16 adjuntar evidencia y HU-07 registrar incidentes.
- **Iteración 3:** HU-15 categorías, HU-04 mapa de incidentes, HU-06 detalle, HU-09 retenes y HU-05 alertas por cercanía.
- **Iteración 4:** HU-18 confirmar alerta, HU-20 resolver incidente, HU-10 mis reportes y HU-22 cola de alertas offline.
- **Iteraciones 5–7 / módulo policial y administración:** HU-26 login policial, HU-27 control de roles, HU-35 gestión de cuentas policiales, HU-28 panel de alertas, HU-29 detalle policial, HU-30 ruta, HU-31 estados, HU-32 filtros, HU-33 observaciones y HU-34 historial.
- También hay vistas de preferencias, estadísticas de 7 días y mapa de calor preparado para HU-21, HU-23, HU-24 y HU-25.

## 6. Alcance real y tareas pendientes para producción

Este ZIP entrega una **base frontend funcional y navegable** con modo demo y conectores Supabase/Mapbox. No debe confundirse el modo demo con un sistema de emergencia desplegado. Algunas funciones del documento requieren backend y servicios externos adicionales antes de considerarse terminadas para producción:

- **Notificaciones push por geocerca (HU-05) y tiempo real:** la suscripción Realtime actual refresca incidentes cuando Supabase publica cambios. La entrega push real por distancia requiere permisos, service worker y un servicio servidor/Edge Function.
- **Offline (HU-22):** las alertas se ponen en cola en `localStorage` y se intenta sincronizarlas al volver internet cuando hay una sesión activa. Para robustez móvil se recomienda IndexedDB + service worker y manejo de reintentos.
- **Fotos:** la interfaz comprime la imagen. Para despliegue, configura Supabase Storage con bucket privado, límites de tamaño y políticas; evita guardar data URLs grandes en la tabla.
- **Ruta/ETA:** el enlace externo abre navegación. Distancia y tiempo estimado integrados requieren Mapbox Directions API.
- **Administrador/policía real:** crea/activa cuentas con una Edge Function protegida y valida roles también en servidor/RLS. El frontend por sí solo no es una frontera de seguridad.
- **Mapa de calor:** la capa Mapbox está preparada con las coordenadas disponibles; sin coordenadas no habrá puntos que representar.
- **Recuperación de contraseña:** habilita y personaliza el flujo de recuperación de Supabase Auth y sus plantillas de correo.

Antes de usarlo en una comunidad real, prueba RLS con usuarios de cada rol, activa HTTPS, configura las notificaciones, Storage, retén y protocolos oficiales de emergencia.

## 7. Estructura

```text
alerta_comunitaria/
├── index.html
├── css/styles.css
├── js/config.js       # AQUÍ van Supabase y Mapbox
├── js/app.js
├── supabase/schema.sql
└── README.md
```

## Actualización: ubicación elegida en mapa y avisos policiales
- Ejecutar `supabase/upgrade_location_media.sql` en el proyecto Supabase existente.
- Vecino: Reportar → Seleccionar lugar del incidente en el mapa. El marcador naranja representa el INCIDENTE, no la posición GPS del usuario. La posición azul es independiente.
- Policía: mapa muestra marcadores con iconos por categoría. En Mapa → Activar avisos, aceptar permisos del navegador. Avisos por Supabase Realtime con la pestaña abierta; no equivale a push cuando el navegador está cerrado.
- Habilitar Realtime para `public.incidents` en Supabase Database > Publications > supabase_realtime si aún no está habilitado.
- Precisión: GPS no garantiza coordenadas exactas, y el punto de incidente es una selección humana en el mapa.
- Evidencia: bucket público de demostración; no usar con datos sensibles. Para producción usar bucket privado y URLs firmadas.


## Mejoras (versión moderna)
- **Archivos nuevos:** `css/modern.css` (diseño, tema oscuro, animaciones) y `js/enhancements.js` (funciones nuevas). `app.js` solo expone `window.AV` y no cambió su lógica.
- **Accesibilidad:** panel inferior derecho con tema (auto/claro/oscuro), `A−`/`A+`, sonido y animaciones. Respeta `prefers-reduced-motion`.
- **Alertas por cercanía:** pulsa «Activar ubicación»; se avisa solo si la alerta cae dentro del radio de Preferencias (se guarda al mover el control).
- **Silenciar:** Preferencias → 15 min, 1 h, 8 h o hasta mañana 7:00; el chip superior muestra la cuenta regresiva.
- **Tiempo real:** Supabase Realtime + respaldo cada 15 s. En modo demo se sincronizan dos pestañas del mismo navegador.
- **Ruta:** en el detalle de un incidente, «Mostrar ruta» usa Mapbox Directions (distancia y minutos). Si falla, muestra línea recta.
- **Recuperar contraseña:** en Supabase → Authentication → URL Configuration agrega la URL de tu sitio (GitHub Pages) en *Redirect URLs*.
- **Sonido al pasar el cursor:** los navegadores lo permiten solo después del primer clic o toque en la página.

## Alarma por cercanía (sonido de alerta)
Cuando alguien reporta una alerta cerca de ti, la página hace sonar una **sirena** hasta que pulses **«Ya vi la alerta»**.

1. **Una sola vez**, en Supabase → SQL Editor, ejecuta `supabase/upgrade_proximity_alarm.sql` (crea la función `nearby_alerts`).
2. Inicia sesión como **vecino** y pulsa **Activar** en el aviso (o ve a Preferencias → *Alarma por cercanía*). El navegador pedirá ubicación y avisos.
3. Prueba con **Probar alarma**.

Funciona mientras la página esté abierta, también en otra pestaña o ventana (con varias pestañas abiertas solo una vigila). Si la pestaña está oculta se envía además un aviso del navegador.
Límites: si cierras la pestaña o el navegador, o el celular apaga la pantalla y pausa la página, no suena. Para eso usa la app Android (servicio en segundo plano). El sonido requiere un toque previo en la página (regla del navegador).
