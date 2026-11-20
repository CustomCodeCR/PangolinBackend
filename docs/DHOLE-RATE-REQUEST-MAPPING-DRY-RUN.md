# Dhole «Solicitar tarifa»: mapeo y prueba local sin envío

> Análisis reproducible, **no** contrato público de escritura aprobado. Esta fase no solicita, publica, genera claves ni envía cotizaciones a Dhole. `main-2` no cambia.

## Evidencia a 20 noviembre 2026

- Capturas en API Manager del usuario: `GET /api/integrations/third-party/catalog` expone `pricing-rate-request-create` con `ready=true`, `method=POST` y `path=/api/pricing/rate-requests/`. El campo de catálogo `priority` es obligatorio; el catálogo permite `payload` completo o `payload.*` desglosado, nunca ambos a la vez.
- `GET /api/integrations/third-party/endpoints` devolvió `[]`: no existe **contrato público publicado** en ese ambiente.
- `GET /api/integrations/third-party/status` devolvió `routesRegistered=true` y `storageReady=true`. Esto **no** implica autorización de nuestra API Key para escritura.
- Código fuente de Dhole: `CustomCodeCR/DholeApiGateway/Dhole.ApiGateway/ThirdParty/ThirdPartyFieldCatalog.cs`, `ThirdPartyRateRequestFormCatalog.cs`, `ThirdPartyServiceIdentity.cs`, `ThirdPartyApiEndpoints.cs`. Internamente Pricing usa `CustomCodeCR/DholePricingService/src/Dhole.Pricing.Api/Endpoints/RateRequestEndpoints.cs`. El enum `RateRequestPriority` declara `Green`, `Yellow` y `Red`. Estos campos/modelos pueden cambiar; verificar contra despliegue activo.
- El Gateway exige `Idempotency-Key` en POST, de 8 a 128 caracteres. La respuesta pública depende del `outputs` publicado; puede devolver el identificador con un nombre configurable, p. ej. `solicitudId`.

## Mapeo provisional (fuente: `OfficialQuoteSubmit` en BackendJJ)

| Campo de cotización web | Campo interno de Pricing | Seguridad / trabajo pendiente |
| --- | --- | --- |
| `Mode`, `ShipmentType` | `shipmentMode` y `payload.form.shipmentMode` | Maritime/FCL → Fcl, Maritime/LCL → Lcl, Air/AIR_LCL → Air, Land/FTL → Ftl, Land/LTL → Ltl; confirmar valores en entorno de prueba |
| `OriginLocationId`, `DestinationLocationId`, `PodLocationId` | `payload.form.originId`, `destinationId`, `podId` y `poeId`/`podId` externos | Solo UUID ya seleccionados de catálogos Dhole. POD obligatorio en marítimo según nuestra web; no enviarlo en otras modalidades |
| `Incoterm` (texto) | `payload.form.incotermId` (UUID) | **Bloqueado** hasta resolver ID desde catálogo vigente; no derivarlo del nombre |
| `Services` (etiquetas web) | `payload.form.serviceIds` (lista de UUID) | **Bloqueado** sin tabla de correspondencias aprobada para servicios |
| `Equipment` (FCL, FTL) | `payload.form.fclContainers` o `landContainers` | **Bloqueado** hasta resolver `containerTypeId`, `containerTypeName` y `containerTypeCode`; preservar cantidad y pesos por unidad |
| `Packages` (LCL, AIR_LCL, LTL) | `payload.sellerContext.consolidatedCargoLines` | Convertir kg/lb y cm/m/in; sin inventar tarimas ni volúmenes comerciales |
| `CargoReadyDate` | `payload.form.loadDate` y `payload.sellerContext.cargoReadyDate` | Fecha ISO; no asignar validez `validTo` sin regla comercial |
| `CargoDescription`, `Observations`, `CargoValue`, `CabysCode` | `payload.form.cargoDescription`, `cargoObservations`, `cargoValue`, `cabysCode` | Preservar solo valores que existen |
| `CargoFlags` | `dangerousCargo`, `nonStackable`, `overweight` | Revisar semántica de banderas por modalidad |
| `FiscalStorageDays`, `PickupAddress`, `DeliveryAddress` | `storageDays`, `pickupAddress`, `inlandDeliveryLocation.address` | Confirmar condicionales según servicios |
| `CustomerName` | `clientName` | No sustituir automáticamente por nombre de contacto; cliente comercial requiere revisión |
| `ContactEmail`, `ContactPhone` | No mapeados | El contrato conocido no identifica estos campos; no enviar sin decisión y habilitación explícita |
| Permiso `Authorized` | Precondición del constructor local | Nunca preparar un envío de solicitudes pendientes o rechazadas |
| Prioridad | `priority` | No existe en el wizard web; debe elegirla administración, jamás deducirla |

## Ejecución de pruebas simuladas

Desde la raíz del repositorio:

```sh
node --test scripts/tests/dhole-rate-request-preview.test.mjs
```

El módulo `scripts/dhole-rate-request-preview.mjs` es intencionalmente **puro y desconectado**: no realiza `fetch`, HTTP, acceso a bases, ni admite API Key. Solo proyecta una solicitud autorizada, produce errores o bloqueos en campos sin resolución, y simula una creación en un `Map` en memoria que devuelve IDs `sim-...` (jamás UUID reales). Cubre 5 modalidades, cantidades, unidades, autorización, ruta, faltantes, prioridad, UUID y reintentos con la misma clave. **Una prueba local verde no demuestra que Pricing acepte la solicitud real**.

## Bloqueos antes de conectar escritura (PR diferente)

1. Publicación **explícita** del contrato para `pricing-rate-request-create`, revisión de campos públicos/defaults y vendedor institucional fijo; recién entonces puede otorgarse una API Key limitada. No reutilizar ciegamente la clave de catálogos.
2. Resolver con catálogos reales UUID de Incoterm, servicios y equipo, y verificar campos/números con Pricing. Confirmar `shipmentMode`, `priority`, tipos de tarifa, identidad comercial y contacto, formato de peso en líneas, POE/POD y cargo handling.
3. Confirmar en sandbox que `Idempotency-Key` estable por cotización previene duplicados; cotejar identificador remoto por lectura después de timeouts.
4. Probar autorización y rechazo con DB desechable en CI, incluyendo administrador sin `can_authorize`; mantener bandera de envío apagada, sin secretos en repositorio.
5. Solo tras aprobación explícita, probar **un POST real** en entorno autorizado, sin clientes reales y con supervisión. Luego modo con aprobación; **automático después**, en otra decisión.

La PR #274 continúa en borrador y solo prepara localmente la autorización/outbox; **no implementa despachador**.
