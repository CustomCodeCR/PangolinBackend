# Dhole «Solicitar tarifa»: mapeo y prueba local sin envío

> Pruebas reproducibles y **simulación del payload INTERNO**. La API POST externa **sí existe en el Dhole oficial**, pero no hay clave de escritura autorizada ni adaptador plano probado. Esta fase no publica, genera claves ni envía cotizaciones; `main-2` no cambia. La evidencia oficial posterior se detalla en `docs/DHOLE-CATALOG-PRODUCTION-CROSSWALK-20261120.md`.

## Evidencia a 20 noviembre 2026

- Capturas en API Manager del usuario: `GET /api/integrations/third-party/catalog` expone `pricing-rate-request-create` con `ready=true`, `method=POST` y `path=/api/pricing/rate-requests/`. El campo de catálogo `priority` es obligatorio; el catálogo permite `payload` completo o `payload.*` desglosado, nunca ambos a la vez.
- `GET /api/integrations/third-party/endpoints` devolvió `[]` en el **Dhole de pruebas**. En el **Dhole oficial** se confirmó el POST externo `/api/external/v1/solicitar-tarifa-wjicua4` publicado y habilitado. La clave de catálogos Pangolin tiene siete GET, pero **no tiene autorización para ese POST**.
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

1. **Ya existe** el POST externo en Dhole oficial. Falta verificar al conectar el sender su lista de entradas publicada, defaults y outputs, y autorizar una API Key de escritura independiente. No reutilizar la clave de siete GET de Pangolin.
2. Resolver con catálogos reales UUID de Incoterm, servicios y equipo, y verificar campos/números con Pricing. Confirmar `shipmentMode`, `priority`, tipos de tarifa, identidad comercial y contacto, formato de peso en líneas, POE/POD y cargo handling.
3. Confirmar en sandbox que `Idempotency-Key` estable por cotización previene duplicados; cotejar identificador remoto por lectura después de timeouts.
4. Probar autorización y rechazo con DB desechable en CI, incluyendo administrador sin `can_authorize`; mantener bandera de envío apagada, sin secretos en repositorio.
5. Solo tras aprobación explícita, probar **un POST real** en entorno autorizado, sin clientes reales y con supervisión. Luego modo con aprobación; **automático después**, en otra decisión.

La PR #274 continúa en borrador y solo prepara localmente la autorización/outbox; **no implementa despachador**.

## Fase de equivalencias de catálogos: resultados comprobables (sin red)

Se agregó `scripts/dhole-catalog-id-resolver.mjs` con pruebas en `scripts/tests/dhole-catalog-id-resolver.test.mjs`. Consume solamente copias locales de `DholeCatalogSnapshot` (contrato de `DholeCatalogService`): `catalog`, `fetchedAtUtc`, `stale=false`, `items`. Rechaza catálogos obsoletos (más de cinco minutos), futuros, duplicados o sin UUID válido. **Los tests usan snapshots falsos**, no catálogos descargados de producción.

Resultado del análisis de código existente:

- **Incoterms:** los `DholeCatalogItem` ya tienen `Id` y `Value`. El wizard guarda `Incoterm` como valor de texto. Podemos resolver el UUID por **coincidencia exacta y única** sobre elementos vigentes; códigos repetidos o ausentes se bloquean. Debe ejecutarse con un snapshot vigente antes de cualquier intento remoto.
- **POD:** la cotización ya guarda el UUID de Dhole. Podemos recuperar el nombre mediante el mismo UUID de un snapshot POD vigente; no inferirlo por la descripción de la ubicación.
- **FCL:** `DholeEquipmentProjector` combina tamaños con tipos a partir de metadatos `size`, `kind`, `shipmentModes` y `modalities`. El identificador de **tipo de contenedor** es `TypeExternalId`, distinto del UUID del tamaño. La resolución offline lo usa solo si encuentra **una** combinación vigente e inequívoca con nombre de tamaño, nombre de tipo y código de tipo.
- **FTL:** el catálogo `truck-sizes` proporciona UUID de **tamaño de furgón**, pero no prueba que sea el `containerTypeId` que Pricing espera en `landContainers`. **Nunca sustituir ese campo por el UUID del tamaño**. Queda bloqueado a la espera de confirmar su contrato/tipo de equipo en Pricing.
- **Servicios:** los catálogos externos consultados no incluyen el catálogo de `serviceIds` de Pricing; los servicios de la web son etiquetas. Se requiere una operación **de solo lectura**, o una correspondencia revisada manualmente contra el catálogo vigente de Config/Pricing. No inventar UUID ni deducirlos a partir del nombre.
- **Prioridad:** `Green/Yellow/Red` existe en el enum de Pricing, pero no se captura en la web. Debe definirse mediante aprobación/configuración administrativa; no usar una prioridad predeterminada sin autorización.
- **Identidad comercial y endpoint público:** el POST plano está publicado en el Dhole oficial, pero hay defaults fijos para cliente/ejecutivo y quedan pendientes las decisiones sobre datos de cliente y contacto. El simulador continúa construyendo el payload **anidado interno**, no un request externo validado.

Este módulo **no crea** `serviceIds`, prioridad, usuario vendedor, URL pública ni API Key. Los bloqueos se muestran aunque resuelva todos los Incoterms, POD y equipos FCL.

Ejecutar junto con el simulador sin acceso a Dhole:

```sh
node --test scripts/tests/dhole-rate-request-preview.test.mjs scripts/tests/dhole-catalog-id-resolver.test.mjs
```

No afecta el backend en ejecución ni agrega conexiones externas.

## Investigación de catálogos internos existentes en Dhole

En `CustomCodeCR/DholeWeb/src/modules/pricing/composables/usePricingCatalogs.ts` se verificó que **Pricing consume estos grupos de Config**:

- `incoterms`: ya existe una API GET de catálogo para Castro Fallas.
- `container-types` y `container-sizes`: ya existen API GET y permiten resolver una combinación FCL.
- `land-equipment-sizes`: disponible como API de tamaños de furgón, **no** equivale a un UUID de tipo.
- `land-equipment-types`: el usuario compartió **16 registros activos del Dhole oficial** desde la consulta interna autenticada de Config. No se ha publicado una API GET externa para resolverlos automáticamente; el backend sigue con lookups desactivados.
- `pricing-services`: **existe como catálogo interno** para `serviceIds`; no aparece en la lista fija de catálogos con identidad técnica automática en `Dhole.ApiGateway/ThirdParty/ThirdPartyServiceIdentity.cs`. Requiere evaluar una publicación de solo lectura con permisos explícitos, sin ampliar autorizaciones de escritura.

Por tanto: **no es necesario inventar los tipos FTL ni los IDs de servicio**. Ya se verificaron 12 de los 13 códigos de servicio y 16 combinaciones FTL de la muestra oficial; falta obtenerlos de forma **vigente y autorizada** cuando se construya el sender real. `Transporte nacional` no tiene código equivalente confirmado y debe bloquearse, no sustituirse. En esta PR **no se publica ninguna API GET adicional** ni se modifica Dhole.
