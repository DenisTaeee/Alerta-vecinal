# AlertaVecinal — Mapa de incidentes y seguimiento policial

Este ZIP conserva el proyecto web y las configuraciones existentes. **No borres las tablas ni restablezcas Supabase.**

## Obligatorio: actualizar Supabase

1. Ingresa al proyecto **Supabase → SQL Editor → New query**.
2. Abre `supabase/upgrade_interactive_dispatch.sql` y copia **todo** su contenido.
3. Ejecuta con **Run**. El mensaje `Success. No rows returned` es normal.
4. Comprueba que la tabla `public.incident_responses` exista en **Table Editor**.
5. Ejecuta `SELECT incident_id, officer_id, response_status, latitude, longitude, updated_at FROM public.incident_responses;` para verificar el seguimiento. Estará vacía hasta que un agente inicie una intervención.

Si todavía no aplicaste `supabase/upgrade_location_media.sql`, ejecútalo también para la carga de evidencias.

## Inicio

Abre **la carpeta que contiene `index.html`** en VS Code y arranca **Live Server**. Se conservan las claves públicas en `js/config.js`; verifica que corresponden a tu proyecto actual. No pegues claves `service_role` o `sb_secret_` en el navegador.

## Vecino: elegir el lugar desde el mapa

1. Inicia sesión como vecino y entra a **Mapa de alertas**.
2. Pulsa **📍 Marcar incidente en el mapa**. Si entras desde el mapa de la página principal, tocar el mapa te dirige a la selección.
3. Toca la **calle donde ocurre** el incidente; aparece un marcador naranja que puedes arrastrar. Esto **no cambia ni publica tu posición personal**.
4. Pulsa **Crear reporte en este lugar**. Se abre el formulario con el punto ya seleccionado.
5. Escoge la categoría (🆘 Emergencia, 🚨 Robo, etc.), describe el hecho y publica.
6. La app te lleva al mapa y centra el incidente con un pin de su categoría. Al pulsarlo se abre una tarjeta con descripción y botón **Ver reporte completo**.

**El botón «Obtener mi ubicación» SOLO identifica tu posición personal (punto azul).** No sustituye el lugar de un incidente. La ubicación de un tercero se elige manualmente en el mapa. No se permiten nuevos reportes sin coordenadas.

## Policía: desplazamiento / atención

1. Entra como policía y abre un incidente desde su marcador o la lista.
2. Pulsa **🚓 Salir hacia el incidente · compartir GPS** y acepta el permiso de ubicación del navegador.
3. El estado se actualiza a **En camino** y se crea la asignación en `incident_responses`. La posición del agente aparece como 🚓 en los mapas de todos los roles que puedan consultar la alerta; se refresca mientras la página y el permiso están activos.
4. La línea discontinua conecta **dos puntos como referencia visual; NO es una ruta real de calles ni una ETA**.
5. Al llegar pulsa **✓ Llegué y estoy atendiendo**: cambia a **Atendida** y se deja de emitir ubicación en vivo. Se muestra el último punto compartido si existe.
6. **Detener compartir GPS** permite dejar de enviar nuevas posiciones antes de llegar (el estado anterior queda guardado).

La fila `incident_responses` admite **un agente por incidente**. Si ya hay otro asignado, la base de datos puede rechazar el intento para evitar asignaciones duplicadas. Las coordenadas del policía se comparten *solo cuando el agente activa esa acción*; no se usan coordenadas privadas del vecino como seguimiento policial.

## Administrador: alerta antigua sin marcador

El mapa solo dibuja un icono si `public.incidents.latitude` y `longitude` son números válidos. Algunos reportes antiguos se guardaron sin coordenadas. El administrador encontrará **Ubicar manualmente** al lado del reporte: selecciona el punto y confirma. No se crean coordenadas automáticas ni se adivina dónde ocurrió un delito.

Puedes comprobarlo con:

```sql
SELECT report_code, category, address, latitude, longitude, status
FROM public.incidents ORDER BY created_at DESC;
```

## Prueba con web y móvil conectados a la misma base

1. Abre la web como **vecino** y publica una alerta 🆘 en una esquina seleccionada manualmente.
2. Comprueba en Supabase que el incidente tenga latitud/longitud.
3. Abre Android como **policía** (otra cuenta), toca el marcador 🆘 y pulsa **Salir hacia el incidente**.
4. Abre la web como **administrador** (otro navegador o ventana privada): verás el marcador 🆘 y, si la policía autorizó GPS, 🚓.
5. En Android pulsa **Llegué y estoy atendiendo**; el cambio queda en `incidents.status` y `incident_responses.response_status`.

## Limitaciones conscientes

- Ninguna tecnología GPS garantiza metros exactos: la precisión depende de GPS, Wi‑Fi, permisos y señal. La web debe ejecutarse en HTTPS o `localhost`.
- Solo hay seguimiento de posición del policía **con la página o la app en primer plano y seguimiento activo**. No es rastreo 24/7 ni navegación calle por calle.
- Los reportes marcados «Falsa alarma» pueden no mostrarse a otros vecinos por los permisos establecidos.
- Para notificaciones con la app Android cerrada es necesaria una integración adicional con FCM; el módulo anterior de avisos en primer plano se conserva.
- El almacenamiento de imágenes del proyecto previo debe revisarse antes de publicar una app real; no subas datos sensibles al bucket público de demostración.
- Ejecutar el SQL es imprescindible: sin `incident_responses`, los estados del incidente pueden cambiar, pero el seguimiento de agentes fallará.
