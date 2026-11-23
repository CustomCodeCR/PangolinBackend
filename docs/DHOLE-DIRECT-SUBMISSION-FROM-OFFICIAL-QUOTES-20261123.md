# Decisión de negocio actualizada — Cotizaciones oficiales → Dhole directo

**Fecha:** 2026-11-23. **Base:** PR #274 en borrador. Sin activación de POST, sin fusión a main-2/producción y sin nueva prueba real.

## Flujo aprobado por el usuario

Al crear una cotización en el formulario oficial o mediante GIO:

1. Validar la solicitud en el backend y los catálogos de Dhole seleccionados.
2. **Conservar íntegramente la copia original** en `public.official_quote_requests` (`/api/quotes/official`), disponible en Administración como siempre.
3. Preparar automáticamente su envío al Dhole oficial, **sin aprobación previa del administrador**.
4. Mostrar el estado de entrega en Administración, sin reemplazar el estado comercial de la solicitud.

Esta decisión **sustituye la propuesta anterior de aprobación administrativa antes de Dhole**. `DholeSubmission:ApprovalQueueEnabled`, `/authorization` y el outbox condicionado a aprobación son código experimental previo y **no deben usarse como dependencia del envío directo**. Se conservarán los flujos históricos hasta que el nuevo sistema esté validado. El objetivo final es un **outbox transaccional en la creación**, no enviar directamente desde Vue/GIO y no depender de la autorización comercial interna.

## Primer paso ya implementado en esta PR: capturar y proyectar

- El wizard agrega `packages[].unitType` seleccionable (`Box`, `Pallet`, `Loose`, `Other`), obligatorio solo si el catálogo seleccionado es `dhole`; una solicitud local heredada conserva compatibilidad.
- GIO pregunta el tipo de bulto únicamente si utiliza catálogos Dhole. Como GIO pide peso **por bulto**, lo multiplica por la cantidad para persistir un peso **total por línea**, igual que el formulario oficial.
- El DTO `OfficialPackageInput` añade `UnitType` opcional para registros antiguos, y la validación del endpoint exige un tipo explícito si usa Dhole.
- `DholeOfficialQuoteDraftBuilder.Project` toma `OfficialQuoteSubmit` validado en backend, el ID asignado por Castro Fallas y la ruta validada contra un catálogo **fresco**, y genera **solo en memoria** un modelo de envío con origen/POE/POD, tipo de embarque, incoterm, servicios, datos del solicitante y mercancía.
- El modelo conserva `totalWeightKg` y distribuye los kilogramos por unidad solo para Dhole. Para líneas consolidadas: `quantity`, `unitType`, `weightKg` por unidad, `length`, `width`, `height`, `isStackable`. Evita el defecto de la primera prueba (una unidad histórica sin dimensiones).
- El modelo es **no enviable** y declara pendientes los IDs de servicios/Incoterm y de equipos cuando corresponda; no adivina UUID, ni cliente/ejecutivo, ni importes.
- En la ruta POST oficial, tras validar catálogo fresco, el backend proyecta el borrador y **después guarda la solicitud original en PostgreSQL**. Si el mapeo de una solicitud nueva con catálogo Dhole resulta incompatible, devuelve error de validación sin guardar una copia a medias. Nada conecta aquí con `DholeQuotePostTransport`.
- Tests de .NET y los existentes de frontend verifican las cinco modalidades y preservan el comportamiento de las cotizaciones anteriores. No hay consulta remota de precios ni POST a Dhole en CI.

## Segundo paso, implementado en borrador (pendiente de CI y autorización de despliegue)

Se añadió una tabla **separada**, `public.official_quote_dhole_creation_outbox`, con estado inicial `PendingDispatch`, ligada a `OfficialQuoteRequest.Id` y clave de idempotencia `cf-official-{quoteId}`, única y estable. No reutiliza el outbox histórico dependiente de autorización.

El nuevo flag `DholeSubmission:DirectOutboxEnabled=false` (apagado por ausencia de configuración) registra la copia original y el job en **una sola transacción**, solo en solicitudes `catalogSource=dhole` que ya pasaron validaciones y proyección local. No guarda contactos duplicados, secretos ni payload externo: estos permanecen únicamente en la cotización original; el dispatcher futuro deberá reconstruirlos y resolver catálogos vigentes. No genera solicitudes HTTP reales y conserva comportamiento heredado cuando está apagado.

La migración aditiva en `backend/Database/OfficialQuotesSchema.sql` debe aplicarse con respaldo **antes** de habilitar este flag. La PR/CI no activa el flag en producción. El estado aparece en el detalle de Administración al habilitarse, sin requerir una aprobación administrativa.

**Limitación deliberada:** la unicidad protege cada cotización y su clave de envío; no deduplica todavía dos POST HTTP independientes del navegador que creen dos cotizaciones diferentes. Eso requerirá una clave idempotente de creación validada en una fase posterior. Los estados avanzados están reservados en el esquema; ningún worker los cambia aún.

## Tercer paso en preparación: revisión local del contrato plano

El backend añade `DholeOfficialQuoteFlatPreviewBuilder.BuildReview`, sin conectar a ningún worker, HTTP ni endpoint público. Toma el borrador de formulario/GIO y una resolución explícita de catálogos que debe proceder de una fuente autenticada. **Bloquea** resoluciones vencidas (más de 15 minutos), IDs vacíos, servicios que no correspondan exactamente, Incoterm inconsistente y equipamiento cuyo modo, tamaño o tipo no coincida.

La vista de revisión construye los campos planos publicados `form_*`, `requestContext_*` y `sellerContext_*` y valida los cinco modos:

- FCL: `form_fclContainers` con UUID de tipo verificado y peso individual;
- FTL: `form_landContainers` usando UUID de **tipo FTL**, no de tamaño;
- LCL/Air/LTL: `sellerContext_consolidatedCargoLines` con `quantity`, `unitType`, `weightKg` **por unidad**, dimensiones y estibabilidad; totales separados.

Conserva POL/POE/POD según rol, contacto solo en descripción, prioridad Green y tarifa Spot provisional. **No envía ni inventa** cliente/ejecutivo, vendedor, importes, divisa o IDs faltantes. El objeto declara siempre `RemoteSubmissionPermitted=false`; un contrato revisable **no equivale a un payload aprobado para transmisión**. El arnés .NET prueba las cinco modalidades con IDs ficticios y rechaza cruces FCL/FTL o catálogos caducados. Ninguno de esos fixtures representa un catálogo autorizado para producción.

**PENDIENTE para una integración de extremo a extremo:** servicio que obtenga y certifique los catálogos vigentes de Dhole; revisar los campos comerciales del formulario que todavía no se incluyen en el borrador (observaciones, almacenamiento, direcciones, CABYS según su disponibilidad), validación de contrato del API Gateway, acceso a contactos según rol en Pricing, implementación de dispatcher y reconciliación sin reintentos ambiguos. No enviar este borrador a Dhole ni activar ninguna bandera hasta obtener aprobación específica.

**Fases siguientes pendientes:**

1. [Implementado, pendiente de verificación CI] Guardar copia oficial + outbox en una única transacción solo para Dhole si se habilita DirectOutboxEnabled.
2. [Pendiente] Un dispatcher del backend obtiene IDs de catálogo vigentes, resuelve servicios/Incoterm/equipos, construye el contrato plano permitido y hace el POST oficial con API Key privada; sin paso de aprobación administrativa.
3. `HttpAcceptedUnverified` **no significa creación confirmada**: no reintentar automáticamente un resultado incierto o 2xx sin una política probada de idempotencia externa. Mostrar `Unconfirmed` y pedir verificación en Pricing.
4. Evitar duplicados incluso con peticiones simultáneas; disponer de reconciliación de envíos, trazabilidad y permisos de lectura adecuados.
5. Mantener el envío apagado por defecto hasta validación end-to-end, simulación de errores, autorización para despliegue y pruebas de roles de acceso a contactos.

**Este documento no es autorización para un segundo POST real.** La prueba anterior ya consumió su autorización específica. No debe borrarse ni modificar su evidencia sin conservar el resultado.
