# Dhole oficial — correspondencia de servicios y FTL (2026-11-20)

> **Documento de revisión / sin envío.** La PR #274 permanece en borrador; no habilita POST externos ni modifica Dhole, `main-2` o producción. Los catálogos listados fueron compartidos por el usuario desde `https://sistema.logisticacastrofallas.com/`; no constituyen una verificación GET en vivo desde BackendJJ.

## Evidencia y límites

- El API Manager **oficial** (distinto del entorno de pruebas inicialmente consultado) tiene publicada la API POST `/api/external/v1/solicitar-tarifa-wjicua4`. El contrato presentado incluye campos públicos `form_*`, `requestContext_*`, `sellerContext_*`, prioridad `Green/Yellow/Red` y valores fijos de cliente/ejecutivo. **No se ha ejecutado ningún POST real**; el formato de respuesta de producción sigue sin verificarse con un envío.
- La clave de lectura denominada **Pangolin** tiene siete APIs GET autorizadas, pero **no** la API de solicitud de tarifa. No reutilizarla para escritura ni asumir permiso POST.
- Los dos catálogos internos `pricing-services` y `land-equipment-types` se obtuvieron mediante consultas autenticadas de solo lectura en la pantalla **Config / Catálogos** de Dhole. **No hay GET públicos publicados para esos dos grupos** según el inventario observado. `DholeLookups:Enabled` sigue desactivado.
- Los UUID reales observados son datos maestros, **no constantes de programación**. La resolución de futuras cotizaciones exige catálogo vigente, un solo elemento activo por código y rechazo ante duplicidad, ausencia o datos vencidos.
- Los documentos más antiguos de esta PR contienen hallazgos obtenidos desde el Dhole de pruebas, donde `endpoints` era `[]`. Este documento registra el contraste con la evidencia **del Dhole oficial**; no se debe concluir que falta publicar el POST oficial.

## Servicios de Castro Fallas → código del catálogo Pricing

Los 12 códigos identificados son únicos y activos en la muestra oficial del 2026-11-20. El resolver `scripts/dhole-catalog-id-resolver.mjs` realiza la correspondencia **por código verificado**, no por igualdad de etiqueta. Se rechaza una selección si el código no aparece de forma única en una copia **reciente** del catálogo.

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
| **Transporte nacional** | **Sin equivalencia confirmada** | **Bloquear su mapeo para POST**: no sustituir por `DELIVERY`, `PICKUP` ni `INT_TRANSPORT` |

El wizard puede continuar **capturando** la solicitud local; un campo pendiente de correspondencia impide considerarla lista para el conector remoto. No eliminar el servicio de la solicitud original ni inventar UUID.

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

Dhole utiliza `Green` (72 h), `Yellow` (48 h) y `Red` (24 h) para calcular el plazo de atención; no son promesas al cliente. La decisión de negocio acordada es **Green por defecto, editable por administrador durante la fase provisional de aprobación**. El conector real aún no existe; el valor debe persistirse de manera auditada antes de construirlo. No inferir `Red` por texto del cliente.

La aprobación administrativa es provisional y se implementará con posibilidad de eliminarla después, sin eliminar necesariamente la regla de prioridad. El outbox de la PR #274 continúa desactivado por defecto y no envía tráfico a Dhole.

## Pendientes que bloquean el POST

1. Confirmar con el dueño de Dhole el tratamiento del cliente comercial y cómo accederá Pricing a nombre, correo y teléfono, sin sobrescribir los defaults publicados.
2. Definir explícitamente `Transporte nacional` o aceptar que las solicitudes que lo incluyan **queden bloqueadas para envío remoto**, conservando la solicitud local.
3. Disponer de consulta autenticada de solo lectura de `pricing-services` y `land-equipment-types` para la resolución **vigente** de UUID; el JSON compartido sirve para revisar códigos y tests, no para dar por vigente un ID en el futuro.
4. Habilitar posteriormente una clave de escritura autorizada específicamente para el POST, sin reutilizar la clave Pangolin de catálogos.
5. Validar el JSON **público y plano** contra los campos realmente publicados; el preview existente modela la solicitud interna anidada, no garantiza que sea aceptada por el Gateway oficial.
6. Solo tras autorización explícita, realizar una prueba de POST controlada y verificar la respuesta e idempotencia. No fusionar la PR solo por pruebas de mocks.

## Pruebas sin red

- `node --test scripts/tests/dhole-catalog-id-resolver.test.mjs`: nombres diferentes con códigos correctos, 12 servicios, servicio nacional pendiente, duplicados, inactivos, catálogos obsoletos y 16 combinaciones FTL.
- `dotnet run --project tests/DholeCatalogHarness/DholeCatalogHarness.csproj`: tamaño/tipo FTL (con proyección provisional), validación HTTP de formulario y rechazo del tipo genérico.
- El estado de CI se comprueba en la PR #274. **No afirmar verde hasta que los checks del último commit concluyan.**
