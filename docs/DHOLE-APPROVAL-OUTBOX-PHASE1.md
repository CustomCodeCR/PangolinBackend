# Dhole — fase de aprobación y registro local (sin envíos externos)

## Objetivo

Preparar un recorrido seguro **cliente envía cotización → admin con permiso especial autoriza → se guarda un registro independiente para integración futura**. Esta fase **NO envía solicitudes ni tarifas a Dhole**. No existe cliente HTTP de escritura, ningún worker ni programador de reintentos.

La integración usa las cotizaciones oficiales existentes (`POST /api/quotes/official`), creadas por el asistente GIO o el formulario de cuatro pasos. No modifica el cotizador antiguo `POST /api/quotes`, ni los catálogos GET de Dhole ni Tracking.

## Activación segura

- Flag backend **deshabilitado por defecto**: `DholeSubmission:ApprovalQueueEnabled=false`.
- Antes de activar, respaldar PostgreSQL y aplicar manualmente la migración aditiva al final de `backend/Database/OfficialQuotesSchema.sql` (tabla `public.official_quote_dhole_outbox` y columna `priority`; el ALTER es idempotente). **No borrar ni recrear volúmenes.**
- En Docker híbrido local, una vez existente la tabla, configurar `DHOLE_APPROVAL_QUEUE_ENABLED=true` en el `.env` privado (Compose lo envía al backend como `DholeSubmission__ApprovalQueueEnabled`). **No habilitarlo en producción** hasta revisar la migración y los permisos. No hace falta una clave de escritura para esta fase porque no realiza POST externo.
- Si la flag está apagada, **no se consulta ni escribe la tabla nueva**; la aprobación de cotizaciones continúa igual que antes.
- La flag `DholeCatalogs:SubmissionEnabled` es para **validación de catálogos del formulario**, no autoriza un POST al proveedor. No confundirla con el envío de solicitudes.

## Flujo y estados

1. Cliente completa la cotización. La autorización inicial continúa `Pending`; no hay outbox.
2. El administrador con `official_quote_permissions.can_authorize=true` puede autorizar o rechazar. Los demás administradores continúan pudiendo gestionar, pero **no autorizar**.
3. Si decide `Rejected`: se registra la decisión, **sin crear outbox**.
4. Si decide `Authorized` **y** `DholeSubmission:ApprovalQueueEnabled=true`: dentro de la transacción de aprobación se crea **una** fila con `quote_id` como clave primaria, `state=AwaitingConnector`, `attempt_count=0` y la identidad del administrador. Se registra `DholeStaged` en auditoría junto con la prioridad. El administrador inicia en **Green**, puede elegir **Yellow** o **Red** antes de aprobar, y esa prioridad se persiste en el outbox. Las decisiones concurrentes sobre la misma solicitud se serializan con un bloqueo de fila.
5. El panel muestra el estado `Aprobada; pendiente de integración con Dhole`, nunca `Enviada`, porque aún no se hizo una llamada al proveedor.
6. Una autorización previamente realizada con la flag apagada permanece autorizada pero no se encola retroactivamente.

La tabla reserva campos para un futuro adaptador (`Pending`, `Sending`, `Sent`, `Failed`; referencia remota, intentos, error y fecha de confirmación). **No hay lógica que pueda establecer `Sent` en esta fase.** El cliente HTTP aislado añadido más adelante no modifica esta tabla ni tiene ningún invocador automático.

## Pendiente para el envío REAL (otra PR)

- El POST **sí fue publicado** en el Dhole oficial como `api/external/v1/solicitar-tarifa-wjicua4` (distinto del Dhole de pruebas). Verificar su configuración efectiva al conectar el sender, sus inputs/defaults y el response real. La clave Pangolin originalmente disponía de siete GET; el 20/11/2026 el usuario confirmó que **vinculó «Solicitar tarifa» también a Pangolin** en API Manager. No se ha probado el permiso efectivo con POST autenticado ni se ha activado un sender. Por mínimo privilegio, se recomienda separar permisos de lectura y escritura antes del uso operativo. Ver `docs/DHOLE-CATALOG-PRODUCTION-CROSSWALK-20261120.md`.
- Mapeo validado campo por campo entre `OfficialQuoteSubmit` y el contrato externo: modalidad, ubicación, POD, Incoterm, cargas y unidades; decidir qué campos internos no deben transmitirse.
- Idempotencia / deduplicación soportada por Dhole o reconciliación por referencia antes de reintentos tras timeout; nunca asumir que un timeout significa que Dhole no creó la solicitud.
- Controlar credenciales exclusivamente en backend, host/path fijos, HTTPS, sin redirects, tamaños y timeouts acotados, respuestas sanitizadas, auditoría sin datos personales ni secretos.
- Respetar autorización: solo filas autorizadas se intentan enviar; rechazos no se despachan. Verificar error remoto y persistir referencia y sello de tiempo **solo tras confirmación real**.
- Pruebas aisladas con handler simulado, PostgreSQL descartable y comprobación de permisos, duplicados, errores y confirmaciones; luego prueba autorizada en entorno sandbox. **Nunca realizar un POST real en los test automatizados.**
- Solo después de validar la fase con aprobación manual se considera el modo automático, con un flag independiente y apagado por defecto.

## Paso 2 iniciado: cliente HTTP preparado, envío inactivo (20/11/2026)

El usuario decidió **no depender de los dos nuevos GET** (`pricing-services` y `land-equipment-types`) para continuar la preparación. La prueba posterior podrá utilizar una **instantánea verificada y reciente de valores maestros**, con datos de solicitante ficticios, pero esto **no autoriza usar UUID históricos no verificados** ni implica que se pueda enviar una cotización real sin comprobar la integridad de los catálogos implicados.

Se incorporó `backend/Services/DholeQuotePostTransport.cs`, un cliente de salida independiente que **no está conectado** a ninguna ruta HTTP, cola de aprobación, trabajador ni disparador automático. El formulario, GIO y el panel siguen igual. Aunque un operador habilite `DholeSubmission:ApprovalQueueEnabled`, no se inicia envío. El adaptador JavaScript de contrato sigue devolviendo `readyForSending=false`.

Controles ya implementados en el transportador inerte:

- `DholeSubmission:PostEnabled` predeterminado en **false** y `DholeSubmission:ApiKey` privada, no incluida en GitHub, Compose, navegador ni pruebas; el permiso habilitado en API Manager **no cambia** estas barreras del backend.
- Host HTTPS y ruta externa fijos: `/api/external/v1/solicitar-tarifa-wjicua4`. `HttpClientHandler` sin redirects ni cookies, timeout de 12 segundos, cuerpo máximo de 128 KiB y respuesta máxima de 64 KiB.
- Lista de campos de salida estrictamente limitada a los del adaptador plano revisado. No permite `clientName`, `executiveName`, `sellerUserId` ni campos adicionales. Exige prioridad, modalidad, IDs de servicios sintácticamente válidos y descripción con encabezado de contacto.
- Idempotency-Key determinista `cf-official-<UUID de la solicitud>`; un intento HTTP por invocación, **sin reintentos automáticos**. Timeout, HTTP 429 y errores 5xx quedan como resultado no confirmado, nunca como prueba de que Dhole no registró nada. Un HTTP 2xx es solo aceptación HTTP, no comprobación de persistencia en Pricing.
- Nunca devuelve ni registra cuerpo de respuesta externo, credenciales o información personal; no actualiza el outbox. **No hay modo de activar un envío desde la interfaz** con esta fase.

La prueba aislada `tests/DholePostTransportHarness` usa únicamente un `HttpMessageHandler` ficticio y una clave inventada. Verifica que feature apagada, secreto ausente y payload incorrecto producen **cero solicitudes HTTP**, además del host fijo, encabezados, idempotencia, 2xx/403/429 simulados. Se ejecuta en CI mediante `.github/workflows/dhole-post-transport-preflight.yml`.

**Falta para la fase posterior:** un orquestador que recupere exclusivamente una cotización previamente autorizada y con payload validado, los identificadores vigentes (obtenidos de un catálogo o verificados puntualmente), el permiso operativo para probar con datos ficticios, y la comprobación del estado persistido en Dhole. No activar manualmente `DholeSubmission:PostEnabled` ni suministrar la clave de escritura a esa configuración todavía.

## Comprobaciones mínimas

- Con flag apagada: autorizar/rechazar sigue funcionando en esquema previo sin tabla nueva; el panel dice que no se ha enviado.
- Con flag encendida y tabla migrada: usuario sin permiso recibe HTTP 403 al autorizar; rechazo no crea fila; autorización crea exactamente una fila `AwaitingConnector` y un evento `DholeStaged`.
- Una segunda autorización devuelve HTTP 409 sin segundo registro.
- La consulta de detalles administrativos muestra el estado, sin exponer credenciales o llamadas remotas.
- Comprobar ambos temas, GIO, wizard y los flujos existentes del Docker híbrido.
