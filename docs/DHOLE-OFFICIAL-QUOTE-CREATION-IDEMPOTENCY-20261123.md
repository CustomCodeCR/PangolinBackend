# Prevención de cotizaciones duplicadas tras un error de red — PR #274

Fecha: 2026-11-23. Estado: **borrador, pendiente de CI y despliegue autorizado**. Ni la creación duplicada ni la transmisión Dhole están habilitadas desde esta PR.

## Problema y distinción

El outbox de envío directo usa la clave `cf-official-{quoteId}`: evita múltiples **registros de entrega de la misma cotización**. No impedía que un visitante creara **dos cotizaciones diferentes** si el servidor guardaba la primera, pero la respuesta HTTP 201 se perdía y el visitante presionaba «Enviar» de nuevo.

Se añadió una protección separada para la **creación de la cotización**, no para el POST a Dhole.

## Flujo nuevo, desactivado por defecto

- El asistente GIO y el cotizador generan un UUID v4 por intento inicial. Envían `X-CF-Quote-Request-Key: <uuid>` a `POST /api/quotes/official`.
- El navegador conserva en `sessionStorage` solo la clave y una huella SHA-256 del contenido (no un segundo payload con datos privados). Reintentos del mismo contenido usan la misma clave; cambiar los datos tras un resultado ambiguo se bloquea para evitar crear una segunda solicitud sin saber qué ocurrió con la primera. Se retira la clave cuando llega una respuesta con identificador válido; un **400 de validación confirmado** permite nueva corrección y clave.
- El backend **ignora** esa cabecera por defecto. Solo en solicitudes `catalogSource=dhole`, si `DholeSubmission:ClientCreateIdempotencyEnabled=true` y el esquema ya fue migrado, exige UUID canónico, registra `client_submission_key` único y una huella SHA-256 normalizada del DTO + identidad autenticada (cuando exista). Los datos personales no se duplican en el outbox ni en logs nuevos.
- En reintento con idéntica clave e idénticos datos, la respuesta reutiliza el `id`, el estado de Administración y el estado actual del outbox; **no crea ninguna cotización ni job adicional**. Si cambia la carga, responde HTTP **409** con `quote_request_key_conflict` y no escribe nada.
- Para envíos concurrentes, PostgreSQL `pg_advisory_xact_lock` serializa la misma clave dentro de la transacción, y un índice `UNIQUE` sobre `client_submission_key` proporciona una segunda barrera.
- La transacción guarda copia administrativa y, si `DirectOutboxEnabled=true`, un único registro de outbox; falla todo junto si falla cualquiera de los pasos.

## Seguridad, mantenimiento y limitaciones

- La migración aditiva está en `backend/Database/OfficialQuotesSchema.sql`: dos columnas **NULL** y un índice único parcial. Las solicitudes antiguas y el flujo de catálogo local no se modifican. Aplicar migración con respaldo **antes** de activar `ClientCreateIdempotencyEnabled`.
- Ninguna bandera de esta PR habilita un dispatcher, un HTTP POST externo, un envío de correo o un despliegue. La configuración predeterminada mantiene el nuevo comportamiento **apagado**.
- Las claves enviadas por clientes no sustituyen autenticación, límites de tasa, validación de catálogo, autorización ni verificación de Pricing. No se debe utilizar el UUID del navegador como la clave de idempotencia del proveedor Dhole.
- La protección frente a datos modificados se conserva durante el mismo intento de la pestaña; el estado en `sessionStorage` tiene una vigencia de **24 horas**. Si un usuario borra los datos del navegador, cambia de dispositivo o crea una nueva clave, no se deduplican automáticamente solicitudes de contenido equivalente con claves distintas. Las peticiones anteriores a la activación no tenían claves persistidas.
- Con el flag apagado, las cabeceras de GIO/cotizador son inertes en el servidor, por lo que **todavía no se puede afirmar que evita duplicados en producción**.
- Los nombres de las banderas no figuran habilitados en los Compose del entorno oficial. No activar en producción sin prueba local y revisión de CI.

## Pruebas aisladas

El arnés HTTP sobre PostgreSQL desechable `tests/DholeQuoteHttpHarness/Program.cs` cubre:
1. ausencia y UUID vacío → 400 cuando está habilitado;
2. creación normal con clave → 201;
3. pérdida de respuesta / repetición idéntica → mismo UUID, sin segunda inserción;
4. reutilización de clave con contenido distinto → 409;
5. dos POST concurrentes con la misma clave → una sola fila y un solo job;
6. catálogo dinámico simulado y ninguna llamada externa de escritura.

Los smokes de navegador de GIO y cotizador comprueban generación de clave v4, reutilización tras error simulado y eliminación al recibir el recibo. La compilación de estas modificaciones sigue pendiente de la cola de GitHub Actions.
