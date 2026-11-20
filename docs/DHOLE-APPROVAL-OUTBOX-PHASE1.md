# Dhole — fase de aprobación y registro local (sin envíos externos)

## Objetivo

Preparar un recorrido seguro **cliente envía cotización → admin con permiso especial autoriza → se guarda un registro independiente para integración futura**. Esta fase **NO envía solicitudes ni tarifas a Dhole**. No existe cliente HTTP de escritura, ningún worker ni programador de reintentos.

La integración usa las cotizaciones oficiales existentes (`POST /api/quotes/official`), creadas por el asistente GIO o el formulario de cuatro pasos. No modifica el cotizador antiguo `POST /api/quotes`, ni los catálogos GET de Dhole ni Tracking.

## Activación segura

- Flag backend **deshabilitado por defecto**: `DholeSubmission:ApprovalQueueEnabled=false`.
- Antes de activar, respaldar PostgreSQL y aplicar manualmente la migración aditiva al final de `backend/Database/OfficialQuotesSchema.sql` (tabla `public.official_quote_dhole_outbox`). **No borrar ni recrear volúmenes.**
- En una máquina local de prueba, usar la variable de entorno `DholeSubmission__ApprovalQueueEnabled=true` solamente si la tabla existe y el backend está preparado para usarla.
- Si la flag está apagada, **no se consulta ni escribe la tabla nueva**; la aprobación de cotizaciones continúa igual que antes.
- La flag `DholeCatalogs:SubmissionEnabled` es para **validación de catálogos del formulario**, no autoriza un POST al proveedor. No confundirla con el envío de solicitudes.

## Flujo y estados

1. Cliente completa la cotización. La autorización inicial continúa `Pending`; no hay outbox.
2. El administrador con `official_quote_permissions.can_authorize=true` puede autorizar o rechazar. Los demás administradores continúan pudiendo gestionar, pero **no autorizar**.
3. Si decide `Rejected`: se registra la decisión, **sin crear outbox**.
4. Si decide `Authorized` **y** `DholeSubmission:ApprovalQueueEnabled=true`: dentro de la transacción de aprobación se crea **una** fila con `quote_id` como clave primaria, `state=AwaitingConnector`, `attempt_count=0` y la identidad del administrador. Se registra `DholeStaged` en auditoría. Las decisiones concurrentes sobre la misma solicitud se serializan con un bloqueo de fila.
5. El panel muestra el estado `Aprobada; pendiente de integración con Dhole`, nunca `Enviada`, porque aún no se hizo una llamada al proveedor.
6. Una autorización previamente realizada con la flag apagada permanece autorizada pero no se encola retroactivamente.

La tabla reserva campos para un futuro adaptador (`Pending`, `Sending`, `Sent`, `Failed`; referencia remota, intentos, error y fecha de confirmación). **No hay lógica que pueda establecer `Sent` en esta fase.**

## Pendiente para el envío REAL (otra PR)

- Contrato autorizado del endpoint de Dhole (método, ruta y versión), ejemplo de request/response, headers y permisos de la clave de API. La mención interna `solicitar-tarifa` no verifica por sí sola su contrato.
- Mapeo validado campo por campo entre `OfficialQuoteSubmit` y el contrato externo: modalidad, ubicación, POD, Incoterm, cargas y unidades; decidir qué campos internos no deben transmitirse.
- Idempotencia / deduplicación soportada por Dhole o reconciliación por referencia antes de reintentos tras timeout; nunca asumir que un timeout significa que Dhole no creó la solicitud.
- Controlar credenciales exclusivamente en backend, host/path fijos, HTTPS, sin redirects, tamaños y timeouts acotados, respuestas sanitizadas, auditoría sin datos personales ni secretos.
- Respetar autorización: solo filas autorizadas se intentan enviar; rechazos no se despachan. Verificar error remoto y persistir referencia y sello de tiempo **solo tras confirmación real**.
- Pruebas aisladas con handler simulado, PostgreSQL descartable y comprobación de permisos, duplicados, errores y confirmaciones; luego prueba autorizada en entorno sandbox. **Nunca realizar un POST real en los test automatizados.**
- Solo después de validar la fase con aprobación manual se considera el modo automático, con un flag independiente y apagado por defecto.

## Comprobaciones mínimas

- Con flag apagada: autorizar/rechazar sigue funcionando en esquema previo sin tabla nueva; el panel dice que no se ha enviado.
- Con flag encendida y tabla migrada: usuario sin permiso recibe HTTP 403 al autorizar; rechazo no crea fila; autorización crea exactamente una fila `AwaitingConnector` y un evento `DholeStaged`.
- Una segunda autorización devuelve HTTP 409 sin segundo registro.
- La consulta de detalles administrativos muestra el estado, sin exponer credenciales o llamadas remotas.
- Comprobar ambos temas, GIO, wizard y los flujos existentes del Docker híbrido.
