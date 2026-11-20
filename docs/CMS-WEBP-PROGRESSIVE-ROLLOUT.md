# Plan de activación gradual y reversión — WebP del CMS

**Estado: preparación documental, sin autorización de despliegue.**  
Objetivo: que las noticias nuevas subidas por la diseñadora reciban variantes WebP de forma automática, sin cambiar el flujo editorial, sin perder los originales y sin degradar el sitio `www`.

## Separar entornos y opciones

| Entorno | Qué hay hoy | Cómo se activa |
|---|---|---|
| Local con Docker | `CMS_RESPONSIVE_WEBP_BACKEND` / `CMS_RESPONSIVE_WEBP_FRONTEND`, ambos `false` por defecto | Solo QA con MinIO y PostgreSQL **aislados** |
| CI | Backend + PostgreSQL/MinIO desechables, Chrome/Nuxt flags ON/OFF | Automático en PR #247; no desplega |
| Pangolin WWW en producción | Imágenes GHCR desde `.github/workflows/pangolin-images.yml`, y `deploy/docker-compose.images.yml` | **No activado** por la PR #247; requerirá una PR de release separada y autorizada |
| Fennec sin WWW | Aplicación distinta | **No se toca** |

**Detalle crucial:** las banderas `VITE_CMS_RESPONSIVE_WEBP_ENABLED` de Vue/Nuxt
son **de compilación**. Cambiar una variable del contenedor después de publicar
la imagen NO activa ni desactiva el `srcset`. Hay que reconstruir y publicar
una imagen GHCR versionada (nunca cambiar `:latest` a ciegas). La opción
`CmsMedia__ResponsiveWebpEnabled` sí se evalúa en el backend al subir cada
archivo, pero el Compose productivo actual no la configura.

## Barreras antes de autorizar la activación

1. Aprobar explícitamente la PR de código y las pruebas de Chrome, CMS editorial,
   SkiaSharp, ETag, expiración, borrado y MinIO aislado.
2. Resolver o evaluar de forma documentada el riesgo de la auditoría npm
   completa (#248). No rebajar umbrales ni silenciar advisories.
3. Validar respaldos **restaurables** de PostgreSQL y objetos S3/MinIO:
   comprobar retención/versiones y recuperación en almacenamiento
   independiente; los respaldos de PostgreSQL **no contienen** los binarios S3.
4. Realizar ensayo en staging con credenciales, bucket, base y dominio
   diferentes de producción. **Nunca reutilizar** `/opt/dhole/.env`,
   contenedores de Dhole ni el MinIO compartido.
5. Revisar visualmente y en móvil la fotografía, transparencia, orientación,
   GIF animados, colores y errores de conversión. Mantener original en toda
   respuesta de respaldo.
6. Comprobar que **nunca** se cachea públicamente una foto despublicada;
   ETag/304, solicitudes de rango y `?width=` deben consultar permisos
   de publicación.
7. Solicitar aprobación explícita para una PR de release separada. Las PR
   #246 (fondo de Nosotros), #247 (QA WebP) y #249 (seguridad) no autorizan
   por sí solas encender el procesamiento real.

## Despliegue propuesto, solo cuando se autorice

**Fase 0 — Línea base:** registrar fecha, commit, tag GHCR, estado del
sistema y número de imágenes nuevas sin variantes; medir bytes transferidos
en `/noticias`, Inicio y artículos (móvil/escritorio) y Core Web Vitals
sobre un conjunto constante de URLs. No atribuir a WebP una mejoría de
posicionamiento sin datos; observar LCP, transferencia, errores 4xx/5xx,
CPU/memoria y duración de subidas.

**Fase 1 — Backend, únicamente nuevas subidas:** mediante PR de release
separada habilitar la generación para las nuevas imágenes del CMS. Mantener
el frontend sin `srcset` en el primer paso; así **los visitantes siguen
descargando originales** mientras se verifican conversiones y espacio S3
en un medio autorizado. Las conversiones fallidas deben preservar el original.
Evitar probar con artículos reales hasta contar con aprobación editorial.

**Fase 2 — Frontend gradual:** publicar imágenes Vue y Nuxt reconstruidas
con el flag del `srcset` activo **tras** verificar el backend y sus variantes.
Antes de cambiar la ruta WWW, validar ambos artefactos con un canary local
conectado al entorno de staging. Garantizar `src` original como respaldo.
Evitar un frontend con `srcset` activo si se apaga o elimina la compatibilidad
de `?width=` en backend.

**Fase 3 — Observación y resultado:** medir por separado las imágenes
antiguas y las nuevas, peticiones con `?width=`, 404/500, bytes,
LCP, ancho seleccionado, trabajos omitidos y uso de CPU/MinIO. Comparar
contra la línea base con la misma metodología. No confundir el ahorro
de una imagen con una mejora automática del SEO.

**Fase 4 — Históricos:** migración independiente, con inventario y
`apply:false` por cada medio seleccionado, revisión visual previa,
PUT condicional verificado contra el proveedor de staging y ventana
de mantenimiento. **No usar `apply:true` durante QA o sobre MinIO real
sin una autorización distinta.** La imagen antigua de Hacienda tiene
3.574.691 bytes, cero WebP y cuatro tamaños faltantes según `dry-run`;
no se ha convertido.


- **QA de estado intermedio seguro:** la matriz editorial en GitHub Actions
  cubre tres configuraciones con MinIO/PostgreSQL aislados: backend ON +
  frontend ON, backend ON + frontend OFF y backend OFF + frontend OFF.
  En la combinación intermedia, el backend genera los WebP y responde a
  `?width=`, pero el navegador solo solicita el JPEG original. No se valida
  frontend ON + backend OFF como estado aceptable de despliegue (solo se
  comprueba su fallback de HTTP 400 en el smoke Chrome separado).

## Ensayo aislado de respaldo y restauración (sin datos de producción)

Se añade una verificación en el job `backend-on-frontend-on` del workflow
`cms-real-minio-http.yml`, posterior al ensayo editorial y ejecutada
exclusivamente con PostgreSQL/MinIO de laboratorio en loopback:

- **PostgreSQL:** `pg_dump -Fc` de la base desechable, validación de la
  cabecera y huella del archivo, restauración con `pg_restore` en una
  **segunda base temporal**, comparación del recuento de tablas del
  esquema público y de una fila testigo sintética.
- **MinIO:** exportación de dos objetos de laboratorio (JPEG original y
  WebP) a archivos temporales; borrado de **solo esas claves de prueba**,
  restauración con el SDK S3 y comprobación de bytes y MIME.
- Los datos temporales se eliminan al terminar; no hay conexiones a
  PostgreSQL, MinIO ni credenciales de producción.

**Límites:** esto prueba procedimientos de restauración de una base
temporal y dos objetos, **no** un backup completo de un bucket, consistencia
transaccional entre PostgreSQL/S3, recuperación ante desastres, retención,
ni restauración real de los respaldos productivos. Antes de activar WebP
en WWW seguirá siendo obligatorio aprobar y probar esos respaldos por
separado en un staging autorizado.

## Reversión y límites

- **Orden obligatorio para una reversión coordinada:** volver primero a los
  **tags GHCR anteriores de Vue y Nuxt** (ambos con `srcset` WebP desactivado),
  y comprobar con Network en móvil/escritorio que las imágenes CMS vuelven
  a su URL original sin `?width=`. No basta cambiar una variable de entorno
  en caliente: los flags del frontend son de compilación.
- **Solo después** desactivar `CmsMedia:ResponsiveWebpEnabled` en el backend
  mediante una revisión explícita del despliegue. Esta opción controla
  **tanto generación en nuevas subidas como lectura de `?width=`**; apagarla
  con un frontend WebP todavía activo produce respuestas HTTP 400 para las
  variantes. El navegador tiene fallback al original ante errores HTTP, pero
  no debe usarse ese fallback como procedimiento normal de rollback.
- Si la conversión consume recursos y no se puede reemplazar el frontend con
  seguridad, detener el rollout y evaluar la incidencia; **no apagar el flag
  backend a ciegas** mientras Vue o Nuxt puedan pedir variantes.
- Mantener originales y variantes intactos durante la reversión; nunca borrar
  filas CMS ni objetos MinIO para revertir la opción. La prueba aislada
  ON → OFF → ON valida bytes/ETag de objetos persistidos, **no** valida el
  cambio real de tags GHCR ni una restauración efectiva de backups.
- No revertir la base eliminando filas ni hacer limpieza masiva S3; se deben
  conservar las referencias originales y, de ser necesario, restaurar backups
  ya probados. Las variantes se tratan como derivados, no como fuente de verdad.
- Comprobar `https://www.logisticacastrofallas.com/`,
  `/noticias`, artículos, `/administracion`, y también la
  independencia de `https://logisticacastrofallas.com/` (Fennec).
- Si aparecen `401`, `403`, `404` anómalos o recortes, **detener rollout**.
  No debilitar Cloudflare/WAF para compensar problemas de la API.
- Registrar responsable, commit, tag anterior, tag nuevo, duración de
  observación y motivo si se revierte.

## Evidencia CI en la rama de QA

- [CMS editorial real con MinIO/PostgreSQL desechables — run 44171455065](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44171455065)
  cubre crear borrador, subir imagen, editar, publicar, servir WebP,
  despublicar y eliminar.
- [Chrome News ON/OFF — run 44168172761](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44168172761)
  comprueba navegador real, móvil, escritorio y fallback.
- [Prueba editorial ON/OFF y reversión backend ON→OFF→ON — run 44181084174](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44181084174)
  verifica continuidad de la publicación y objetos MinIO persistidos; la
  validación específica de fallback Chrome HTTP 400 se agrega a la regresión
  del navegador para cubrir el estado transitorio, no para recomendarlo.
- `scripts/test-cms-webp-compose.py` se ejecuta en CI de Nuxt y
  verifica que los builds oficiales GHCR continúan **default-off**.
- La auditoría npm completa mantiene un fallo conocido documentado en #248;
  esta documentación no debe interpretarse como aprobación de fusión.

**No ejecutar comandos de despliegue a partir de este documento sin la
evaluación, respaldos, revisión y autorización anteriores.**
