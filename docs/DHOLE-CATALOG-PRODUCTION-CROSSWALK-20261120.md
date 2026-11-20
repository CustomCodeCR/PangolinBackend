# Dhole oficial — correspondencia de servicios y FTL (2026-11-20)

> **Documento de revisión / sin envío.** La PR #274 permanece en borrador; no habilita POST externos ni modifica Dhole, `main-2` o producción. Los catálogos listados fueron compartidos por el usuario desde `https://sistema.logisticacastrofallas.com/`; no constituyen una verificación GET en vivo desde BackendJJ.

## Evidencia y límites

- El API Manager **oficial** (distinto del entorno de pruebas inicialmente consultado) tiene publicada la API POST `/api/external/v1/solicitar-tarifa-wjicua4`. El contrato presentado incluye campos públicos `form_*`, `requestContext_*`, `sellerContext_*`, prioridad `Green/Yellow/Red` y valores fijos de cliente/ejecutivo. **No se ha ejecutado ningún POST real**; el formato de respuesta de producción sigue sin verificarse con un envío.
- **Actualización declarada por el usuario (20/11/2026):** en API Manager se habilitó también «Solicitar tarifa» para la clave **Pangolin** que ya consultaba siete APIs GET. Es una confirmación de la configuración realizada en la interfaz; **no se ha comprobado el permiso efectivo mediante un POST autenticado**. La clave contiene permisos de lectura y escritura; considerar segregarlos antes del uso operativo, sin deshacer cambios de API Manager desde esta PR.
- Los dos catálogos internos `pricing-services` y `land-equipment-types` se obtuvieron mediante consultas autenticadas de solo lectura en la pantalla **Config / Catálogos** de Dhole. **No hay GET públicos publicados para esos dos grupos** según el inventario observado. `DholeLookups:Enabled` sigue desactivado.
- Los UUID reales observados son datos maestros, **no constantes de programación**. La resolución de futuras cotizaciones exige catálogo vigente, un solo elemento activo por código y rechazo ante duplicidad, ausencia o datos vencidos.
- Los documentos más antiguos de esta PR contienen hallazgos obtenidos desde el Dhole de pruebas, donde `endpoints` era `[]`. Este documento registra el contraste con la evidencia **del Dhole oficial**; no se debe concluir que falta publicar el POST oficial.

## Servicios de Castro Fallas → código del catálogo Pricing

Los 12 códigos identificados son únicos y activos en la muestra oficial del 2026-11-20. **Los servicios que se muestran hoy en la web siguen siendo opciones locales: aún no se cargan ni mapean automáticamente desde Dhole.** Las capturas del selector de Pricing del 2026-11-20 confirman visualmente estos 12 servicios, y no muestran «Transporte nacional». El resolver `scripts/dhole-catalog-id-resolver.mjs` prepara una correspondencia **por código verificado** solo para una futura integración con una API GET aprobada y catálogos vigentes, no para la captura actual del wizard/GIO. Se rechaza una selección si el código no aparece de forma única en una copia **reciente** del catálogo.

| Servicio Castro Fallas | Código Dhole | Observación |
| --- | --- | --- |
| Transporte internacional | `INT_TRANSPORT` | Coincide por código; `defaultSelected` en metadata de Pricing no autoriza añadirlo si el cliente no lo eligió |
| Agencia de Aduanas CR | `CUSTOMS_CR` | En Dhole: «Agencia de Aduanas CRC» |
| Agencia de Aduanas Exterior | `CUSTOMS_FOREIGN` | Idéntico nombre |
| Almacenamiento | `STORAGE` | Servicio opcional |
| Control de inventario | `INVENTORY_CONTROL` | Servicio opcional |
| Embalaje | `PACKING` | En Dhole: «Embalaje de carga» |
| Exoneración | `EXONERATION` | Servicio opcional |
| Picking Carga | `PICKING` | En Dhole: «Picking cargas» |
| Recepción de carga | `RECEPTION` | En Dhole: «Recepción de carga» |
| Seguro de carga | `CARGO_INSURANCE` | Pricing exige valor de carga para calcular seguro; no inventar un importe |
| Transporte entrega | `DELIVERY` | Distinto de recolección |
| Transporte recolección | `PICKUP` | Distinto de entrega |
| **Transporte nacional (retirado de nuevas cotizaciones)** | **No figura en el selector de Dhole** | **Decisión del 2026-11-20:** eliminarlo de las opciones del formulario y GIO y rechazarlo en nuevas solicitudes HTTP; no alterar cotizaciones históricas ni sustituirlo por otros servicios |

El wizard y GIO ofrecen ahora solo los **12 servicios observados**. Las solicitudes históricas que ya incluyan «Transporte nacional» se conservan tal como fueron registradas; **no se aceptará esa selección en cotizaciones nuevas**. No se configura todavía una API de servicios Dhole ni se inventan UUID. La consulta de catálogo autorizada y vigente será necesaria para mapear los servicios en un envío futuro.

**Regla de validación del mapeo offline:** cada código activo debe aparecer exactamente una vez y esa única fila debe tener UUID válido. Dos filas activas con el mismo código —aunque una contenga un UUID inválido o metadatos FTL contradictorios— bloquean la correspondencia completa de ese servicio o equipo. Los tests cubren catálogos duplicados, UUID inválidos y tamaños ambiguos. Esto sigue siendo una preparación sin GET publicado ni POST real.

## FTL: tipos y tamaños observados

El grupo interno `land-equipment-types` contiene **16 registros activos**: cuatro tipos por cada tamaño 24, 26, 48 y 53 pies. Las combinaciones se identifican inequívocamente por `metadataJson.size`, `metadataJson.kind` y `code`, nunca por el UUID del catálogo de tamaños.

| Tipo en Castro Fallas | `metadataJson.kind` | Código por tamaño |
| --- | --- | --- |
| Furgón seco | `dry-van` | `<size>_DRY_VAN` |
| Plataforma / Carreta | `platform` | `<size>_PLATFORM` |
| Refrigerado | `reefer` | `<size>_REEFER` |
| Furgón con cortina | `curtain-side` | `<size>_CURTAIN_SIDE` |

Cada `<size>` es uno de **24, 26, 48, 53**. No se observó FTL de 40 pies, por lo que no debe ofrecerse como tamaño elegible. El valor genérico anterior `Furgón` es ambiguo y no sirve como tipo de Pricing.

El formulario oficial, GIO y la validación HTTP comparten los nuevos tipos. La proyección de formulario actualmente comprueba tamaños activos publicados mediante `truck-sizes` y limita tamaños a los cuatro revisados. **Aún no valida el catálogo de tipos en vivo**: antes de habilitar POST, el servidor debe resolver el UUID del tipo concreto frente a una fuente de lectura aprobada y vigente. Si un tipo es retirado de Dhole, no enviarlo aunque la pantalla lo hubiera mostrado antes.

## Prioridad y autorización

Dhole utiliza `Green` (72 h), `Yellow` (48 h) y `Red` (24 h) para calcular el plazo de atención; no son promesas al cliente. La decisión de negocio acordada es **Green por defecto, editable por administrador durante la fase provisional de aprobación**. La PR #274 ahora registra la prioridad en el outbox **solo cuando `DholeSubmission:ApprovalQueueEnabled=true`**, después de verificar `can_authorize`; queda auditada con la aprobación. Con la flag apagada no accede a esa tabla, no selecciona prioridad de envío ni produce POST. No inferir `Red` por texto del cliente.

La aprobación administrativa es provisional y se implementará con posibilidad de eliminarla después, sin eliminar necesariamente la regla de prioridad. El outbox de la PR #274 continúa desactivado por defecto y no envía tráfico a Dhole.

## Contrato externo plano: proyección offline preparada

La API externa oficial publicada tiene **103 campos de entrada**, solamente `priority` requerido; el target es `pricing-rate-request-create` y el único campo de salida publicado es `value` (opcional) sin `responseRoot`. Los defaults del servidor son `clientName=CLIENTE GENERICO` y `executiveName=Castro Fallas` y no pueden sobrescribirse desde el request público.

La instantánea normalizada de lectura, sin API Keys ni datos personales, está en `scripts/contracts/dhole-solicitar-tarifa-published-20261120.json`. El adaptador **sin ningún transporte HTTP** está en `scripts/dhole-public-rate-request-preview.mjs`. Parte de un preview local autorizado y validado, utiliza únicamente el mapa público `form_*`, `requestContext_*` y `sellerContext_*`, y verifica la estructura de las listas de contenedores y carga consolidada. Incluye los valores provisionales `form_rateType=Spot` y `form_modality=Maritime/Air/Land` según lo observado en el asistente interno de Dhole; **no se deben considerar aceptados por el POST hasta una prueba contractual controlada**. Mantiene los pesos de carga consolidada como peso **total por línea**, no como peso multiplicado por paquetes.

La función **nunca** produce un envío listo: devuelve `readyForSending=false` y bloqueos explícitos de validación del uso del campo de descripción en Dhole, autorización de clave POST, catálogos GET actualizados y respuesta real del proveedor. No emite campos **independientes** `clientName`, `executiveName`, `sellerUserId`, `form_clientName`, `contactName`, `contactEmail`, `contactPhone` ni campos fuera de la allowlist; **los valores de nombre, correo y teléfono sí se incluyen deliberadamente dentro de `form_cargoDescription`**, según la decisión comercial documentada. Tampoco entrega host, encabezados ni transportador. La clave de idempotencia local es determinista a partir del UUID de la cotización, pero no ha sido validada contra un POST real de Dhole.

Ejecutar las pruebas **sin Internet ni credenciales**:

```sh
node --test scripts/tests/dhole-public-rate-request-preview.test.mjs scripts/tests/dhole-rate-request-preview.test.mjs scripts/tests/dhole-catalog-id-resolver.test.mjs
```

Los tests cubren las cinco modalidades, 103 entradas publicadas, los defaults bloqueados, arrays y pesos, UUID incorrectos, referencias, no filtración de datos personales e idempotencia. Los resultados de CI se confirman en PR #274, **no suponer éxito sin ver el último commit**.

## Identidad comercial y contacto — revisión local sin envío (20-11-2026)

Se verificó en `backend/Endpoints/OfficialQuoteEndpoints.cs` y `backend/Models/OfficialQuoteModels.cs`:

- Una cotización **autenticada** toma `CustomerName` de `user.NombreCliente`, y guarda `ClienteId`/`UsuarioId` cuando están presentes.
- En una cotización de **visitante sin sesión**, `CustomerName` se inicializa con `ContactName` porque no hay identidad de empresa autenticada. **Este texto NO verifica el cliente comercial** de Pricing ni debe convertirse en `clientName` externo sin una regla confirmada.
- En ambos casos se guardan separadamente `ContactName`, `ContactEmail` y `ContactPhone` en Castro Fallas; el formulario original queda también en `FormJson`. El administrador autorizado puede consultar el detalle local. Esto no da automáticamente permiso para exponer los contactos a Dhole.
- En el contrato POST externo publicado, `clientName=CLIENTE GENERICO` y `executiveName=Castro Fallas` son *defaults de servidor*. El adaptador plano no los sobrescribe ni emite identificadores de cliente/ejecutivo, nombres de contacto, correos, teléfonos o referencias comerciales inventadas. **No inferir que Dhole ya puede recuperar los contactos desde estos defaults.**
- La salida `readyForSending=false` y el bloqueo `commercialIdentity:` permanecen obligatorios hasta que el responsable de Dhole indique cómo identificar a la empresa, cómo consultar de forma autorizada sus contactos, y cómo verificar la correspondencia sin exponer información innecesaria.
- **Precisión de privacidad:** la exclusión de campos dedicados de contacto no garantiza que el JSON esté libre de datos personales: `cargoDescription`, observaciones, direcciones de recolección/entrega u otros textos aportados por usuarios pueden incluirlos. Revisar propósito, minimización y acceso antes de habilitar envíos externos.

Se agregaron tests offline para visitantes y empresas registradas con contactos distintos. **Cambiar nombre/correo/teléfono ahora cambia únicamente `form_cargoDescription`**, nunca los demás campos de la tarifa ni los defaults de Dhole; cambiar el nombre comercial `CustomerName` no lo inserta como cliente del proveedor. La función sigue bloqueada para envíos reales. La prueba utiliza datos ficticios y no valida el tratamiento remoto.

**Decisión posterior, 20/11/2026:** el responsable de Dhole indicó conservar `CLIENTE GENERICO` y `Castro Fallas`, y usar la descripción para nombre, correo y teléfono del solicitante. No se asume un campo externo nuevo, enlace automático por nombre ni acceso directo desde Dhole a la base de datos de Castro Fallas.

## Decisión confirmada con el responsable de Dhole: contacto en descripción

**Acordado el 20/11/2026:** los valores de servidor `clientName=CLIENTE GENERICO` y `executiveName=Castro Fallas` deben **permanecer exactamente como están**. No crear ni enlazar un cliente comercial diferente por la identidad introducida en nuestra web.

El nombre, correo y teléfono **obligatorios** que la persona introduce en el formulario de Castro Fallas se añadirán como bloque claramente etiquetado al final de la descripción de la carga, preservando primero la descripción original. El contrato público de la API ya ofrece `form_cargoDescription` (`payload.form.cargoDescription`); `form_cargoObservations` es un campo separado, no el elegido para esta decisión. Ejemplo de **datos ficticios**:

```text
Repuestos automotrices

Solicitante desde la web de Castro Fallas:
Nombre: Persona de ejemplo
Correo: ejemplo@example.invalid
Teléfono: +506 2222-2222
```

La transformación se prepara únicamente en `scripts/dhole-rate-request-preview.mjs` y se refleja en `form_cargoDescription` del adaptador plano offline. No modifica `FormJson`, ni la descripción guardada localmente, ni `clientName`, `executiveName`, `sellerUserId`, ni los campos de cliente/ejecutivo de Pricing. Se rechazan contactos incompletos, caracteres de control y descripciones finales que superen 4000 caracteres; nunca se truncan datos silenciosamente. Las pruebas usan únicamente identidades ficticias.

**Todavía no es un permiso de envío:** esa descripción contendrá datos personales. Antes de conectar un POST real, validar con el responsable que Dhole la guarda y visualiza solo para usuarios autorizados, la protección de esos datos y el límite aceptado por Pricing. Las API GET pendientes y la autorización POST siguen siendo bloqueos independientes. No ejecutar pruebas reales con contactos personales.

## Pendientes que bloquean el POST

1. **Decisión tomada:** conservar los defaults de cliente/ejecutivo, añadir nombre/correo/teléfono web al final de `form_cargoDescription`. **Pendiente técnico:** confirmar que Dhole guarda y muestra ese campo de forma adecuada y con acceso restringido antes de cualquier POST real.
2. **Decisión tomada:** «Transporte nacional» ya no se ofrece en nuevas cotizaciones de la web y el backend lo rechaza en envíos nuevos; los datos históricos permanecen intactos. No incorporarlo a solicitudes remotas por una equivalencia inventada.
3. Disponer de consulta autenticada de solo lectura de `pricing-services` y `land-equipment-types` para la resolución **vigente** de UUID; el JSON compartido sirve para revisar códigos y tests, no para dar por vigente un ID en el futuro.
4. **Permiso declarado como habilitado:** el usuario vinculó la API POST a la clave Pangolin en API Manager. Antes de cualquier envío, verificar el permiso efectivo, la vigencia y el almacenamiento privado del secreto en el backend; evaluar una clave de escritura separada por mínimo privilegio, sin bloquear las pruebas offline.
5. Validar el JSON **público y plano** contra los campos realmente publicados; el preview existente modela la solicitud interna anidada, no garantiza que sea aceptada por el Gateway oficial.
6. Solo tras autorización explícita, realizar una prueba de POST controlada y verificar la respuesta e idempotencia. No fusionar la PR solo por pruebas de mocks.

## Pruebas sin red

- `node --test scripts/tests/dhole-catalog-id-resolver.test.mjs`: nombres diferentes con códigos correctos, 12 servicios, servicio nacional pendiente, duplicados, inactivos, catálogos obsoletos y 16 combinaciones FTL.
- `dotnet run --project tests/DholeCatalogHarness/DholeCatalogHarness.csproj`: tamaño/tipo FTL (con proyección provisional), validación HTTP de formulario y rechazo del tipo genérico.
- El estado de CI se comprueba en la PR #274. **No afirmar verde hasta que los checks del último commit concluyan.**
