# Prevención de cotizaciones duplicadas tras un error de red — PR #274

Fecha: 2026-11-23. Estado: **borrador, pendiente de CI y despliegue autorizado**. La protección de duplicados y la transmisión real a Dhole continúan desactivadas por defecto.

## Problema y distinción

El outbox de envío directo usa la clave `cf-official-{quoteId}`: evita múltiples **registros de entrega de la misma cotización**. No impedía que un visitante creara **dos cotizaciones diferentes** si el servidor guardaba la primera, pero la respuesta HTTP 201 se perdía y el visitante presionaba «Enviar» de nuevo.

Se añadió una protección separada para la **creación de la cotización**, no para el POST a Dhole.

## Flujo nuevo, desactivado por defecto

- El backend indica `clientCreateIdempotencyEnabled` en el GET **público de opciones Dhole**, sin exponer credenciales. GIO y el cotizador generan una clave UUID v4 y envían `X-CF-Quote-Request-Key: <uuid>` **solo si** el servidor ha anunciado explícitamente `true`. El catálogo local y cualquier respuesta antigua sin el campo no se consideran compatibles con reintentos idempotentes.
- En HTTPS o localhost, el navegador conserva en `sessionStorage` solo la clave y una huella SHA-256 del contenido (no un segundo payload con datos privados). En las vistas previas de Docker abiertas por **HTTP en una IP de la LAN**, donde `crypto.subtle` puede faltar, genera igualmente un UUID v4 criptográficamente aleatorio con `crypto.getRandomValues` y compara el cuerpo **solo en memoria**, sin persistir huellas no verificables. En ese caso la protección local no sobrevive una recarga. Reintentos del mismo contenido usan la misma clave mientras continúe la sesión; cambiar los datos tras un resultado ambiguo se bloquea. Se retira la clave cuando llega una respuesta con identificador válido; un **400 de validación confirmado** permite nueva corrección y clave.
- El backend deja el feature **apagado por defecto**. Si recibe una clave de creación para una solicitud Dhole pero el flag está apagado, devuelve **503** con `quote_idempotency_unavailable` antes de escribir nada: nunca ignora silenciosamente la clave. Solo con `DholeSubmission:ClientCreateIdempotencyEnabled=true` y el esquema ya migrado exige UUID v4 canónico y registra `submission_key` y `request_digest` en la **tabla independiente** `official_quote_client_submissions`. La huella SHA-256 se calcula con el DTO normalizado y la identidad autenticada, cuando exista. Los datos personales no se duplican en el outbox ni en logs nuevos.
- En reintento con idéntica clave e idénticos datos, la respuesta reutiliza el `id`, el estado de Administración y el estado actual del outbox; **no crea ninguna cotización ni job adicional**. Si cambia la carga, responde HTTP **409** con `quote_request_key_conflict` y no escribe nada.
- Para envíos concurrentes, PostgreSQL `pg_advisory_xact_lock` serializa la misma clave dentro de la transacción, y la clave primaria única de `official_quote_client_submissions` proporciona una segunda barrera.
- La transacción guarda copia administrativa y, si `DirectOutboxEnabled=true`, un único registro de outbox; falla todo junto si falla cualquiera de los pasos.

### Protección adicional al cambiar la configuración

Si una cotización tuvo un POST **sin clave** y su respuesta fue incierta, habilitar la idempotencia posteriormente **no autoriza** crearla de nuevo con una clave nueva. En sentido inverso, una cotización enviada con clave pero todavía sin recibo no puede reenviarse **sin clave** si el servidor deshabilita la función antes del siguiente intento. Ambos formularios conservan el bloqueo de la solicitud ambigua hasta recibir verificación, evitando un cambio de modo silencioso. La ruta segura usa `unresolvedKeyedQuoteAttempt` además del marcador `:unverified` de solicitudes anteriores sin clave. El comprobador de paridad y el arnés del helper verifican estas reglas sin enviar datos a Dhole.

## Seguridad, mantenimiento y limitaciones

- La migración aditiva está en `backend/Database/OfficialQuotesSchema.sql`: crea una **tabla independiente**, con clave primaria, referencia única a la cotización y hash del contenido. **No añade columnas ni modifica el mapeo de `official_quote_requests`**. Por eso el flujo histórico sigue funcionando aunque esa tabla aún no exista y el flag esté apagado. Aplicar migración con respaldo **antes** de activar `ClientCreateIdempotencyEnabled`.
- Ninguna bandera de esta PR habilita un dispatcher, un HTTP POST externo, un envío de correo o un despliegue. La configuración predeterminada mantiene el nuevo comportamiento **apagado**.
- Las claves enviadas por clientes no sustituyen autenticación, límites de tasa, validación de catálogo, autorización ni verificación de Pricing. No se debe utilizar el UUID del navegador como la clave de idempotencia del proveedor Dhole.
- La protección frente a datos modificados se conserva durante el mismo intento de la pestaña. El estado persistido en `sessionStorage` (solo en contexto seguro) tiene una vigencia de **24 horas**; en HTTP LAN la clave permanece solo en memoria. Si el usuario recarga una vista previa HTTP, borra datos, cambia de dispositivo o genera una nueva clave, no se deduplican automáticamente solicitudes equivalentes con claves distintas. Las peticiones anteriores a la activación no tenían claves persistidas.
- Con el flag apagado, ambos navegadores **omiten la cabecera de idempotencia**. Si un POST sin protección devuelve un resultado incierto (red, error inesperado, pérdida de recibo), se mantiene una marca `:unverified` sin datos personales en `sessionStorage` y **se bloquea su reenvío** hasta contactar soporte. Una respuesta 400 de validación confirmada permite corregir y volver a enviar; una respuesta con recibo válido libera la marca. Si la capacidad cambia de `true` a `false` entre GET y POST, la cabecera keyed se **rechaza con 503** en vez de crear un duplicado. La defensa persiste mientras esa información del navegador continúe disponible; no sustituye una tabla de deduplicación activada y probada.
- Los nombres de las banderas no figuran habilitados en los Compose del entorno oficial. No activar en producción sin prueba local y revisión de CI.

## Pruebas aisladas

El arnés HTTP sobre PostgreSQL desechable `tests/DholeQuoteHttpHarness/Program.cs` cubre:
1. ausencia y UUID vacío → 400 cuando está habilitado;
2. creación normal con clave → 201;
3. pérdida de respuesta / repetición idéntica → mismo UUID, sin segunda inserción;
4. reutilización de clave con contenido distinto → 409;
5. dos POST concurrentes con la misma clave → una fila en la tabla de claves, una cotización y un solo job;
6. fallo intencional de la inserción de outbox → reversión de cotización y clave, con recuperación del mismo intento tras restablecer la BD;
7. catálogo dinámico simulado y ninguna llamada externa de escritura.

Los smokes de navegador de GIO y cotizador comprueban que el modo Dhole anuncia explícitamente `true` antes de generar y enviar la clave, que el modo legado no transmite una cabecera no soportada y que los reintentos con clave reutilizan el mismo UUID. Se verifica también la limpieza de la marca tras el recibo. `frontend/scripts/test-official-quote-submission-attempt.cjs` ejecuta el helper real transpílado en Node con crypto segura y sin `SubtleCrypto` (simula el Docker por HTTP LAN), rechazando modificaciones y asegurando que los datos no se guarden en `sessionStorage` en la ruta HTTP. La compilación y pruebas de estas modificaciones siguen pendientes de la cola de GitHub Actions.
