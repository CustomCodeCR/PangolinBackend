# Catálogos Dhole: integración de identidades y roles (fase 2)

## Hallazgo validado

Los endpoints de Dhole devuelven UUID **externos**, pero las cotizaciones del backend actual usan `official_quote_locations.id` y `official_quote_location_usage` como catálogo **local**. La tabla `official_quote_requests` guarda `origin_name`, `destination_name` y un `form_json` completo; **no tiene una FK a `official_quote_locations`**. Las cotizaciones históricas pueden contener UUID locales en ese JSON.

Ejemplo real de distintas identidades para un mismo nombre:

| Rol | Origen API | Nombre | UUID |
| --- | --- | --- | --- |
| origen | POL | Acajutla, El Salvador | `19a5ce22-340d-579f-ad27-f6517a2dde27` |
| destino | POE | Acajutla, El Salvador | `25882b97-8df9-407f-8300-8994184dfad1` |

**No buscar equivalencias por nombre**, no reemplazar UUIDs locales existentes ni confundir UUID externo de POL con el de POE. Los nombres repetidos en San José también pueden representar registros válidos distintos.

## Modelo recomendado para solicitudes nuevas

En vez de crear a ciegas miles de filas locales a partir de Dhole, usar un **origen de catálogo explícito** al enviar una cotización nueva (`dhole` versus `local` legado), junto con los UUID de ubicación.

1. Para solicitudes legadas, mantener la validación actual de `OfficialQuoteLocation.Id` y sus relaciones de uso.
2. Para nuevas solicitudes marcadas `dhole` **solamente después de activar un rollout independiente**, validar en backend que cada UUID figure en el catálogo remoto correspondiente y en la modalidad/rol elegidos. Un UUID de POL no debe aceptarse en POE por coincidencia de texto.
3. Resolver el nombre desde el catálogo validado por servidor, nunca desde el texto recibido del navegador.
4. Guardar el `form_json` con su `catalogSource`, UUID externos, nombres de origen/destino históricos y, si se acuerda, códigos Dhole. No reescribir solicitudes ya existentes.
5. Si el catálogo está indisponible, evitar aceptar ubicaciones o combinaciones no verificadas; implementar una política explícita sobre caché fresca/stale para la escritura. La lectura puede mostrar datos cacheados, pero **no enviar una cotización nueva contra datos obsoletos sin autorización**.
6. Unificar frontend, backend y GIO en el mismo contrato; mantener el diseño original y traducciones. Probar las cinco modalidades de embarque y sus roles permitidos.

Esta estrategia evita una migración masiva de `official_quote_locations`; exige adaptar conjuntamente el endpoint de opciones, el endpoint POST y cualquier otro consumidor de IDs locales. **No está implementada todavía**: esta fase contiene un proyector separado y pruebas sin cambiar el POST.

## Proyector en fase 2 (solo previsualización administrativa)

`DholeQuoteLocationProjector` consume los registros normalizados del endpoint correcto:

- `origin` → `pol`
- `destination` → `poe`
- `pod` → `pod` (solamente se solicita en modo Maritime)

Reglas:

- Por ahora, se excluye exclusivamente `isActive === false`.
- POE se filtra por modalidad y terminal. POL se clasifica provisionalmente de igual forma a la espera de revisión funcional de negocio. `Maritime + SD` se conserva como variante POL observada (Moin).
- POD incluye **todos los registros activos** que entregue su endpoint, sin filtrar por modalidad, terminal ni por anomalías de `routeRole`. Las inconsistencias se contabilizan para revisión, pero no ocultan una opción de POD.
- `routeRole` ausente no elimina por sí solo la opción; valor explícitamente diferente del catálogo causa marca de revisión.
- Pares modalidad/terminal no observados o ausencia de datos quedan apartados para revisión, sin escoger arbitrariamente una de las propiedades.
- Nunca deduplicar los candidatos por su nombre; identificar por `(catalog, externalId)`.

Endpoint opcional **solo para administradores**, deshabilitado por configuración si Dhole no está habilitado:

`GET /api/dhole/quote-location-preview?mode=Maritime&role=origin`

Devuelve `source: dhole`, `catalog`, `mode`, `role`, `options`, `reviewCount`, `fetchedAtUtc`, `stale` y `submissionEnabled: false`. No es un reemplazo de `/api/quotes/official/locations` ni habilita envíos.

## Validación

Harness de pruebas offline:
`dotnet run --project tests/DholeCatalogHarness/DholeCatalogHarness.csproj -c Release`

Revisar GitHub Actions de la PR en borrador antes de avanzar. CI no almacena la API key y no accede a Dhole real.

## Equipos FCL/FTL: proyección paralela sin cambiar formularios

Se agregó `DholeEquipmentProjector` para evaluar **los pares FCL reales** entregados por `container-types` junto con `container-sizes`. Conserva `sizeExternalId` y `typeExternalId` y traduce `metadata.kind` a los tipos visibles existentes (Dry Van, High Cube, Open Top, Open Side, Tank, Flat Rack, NOR). Si falta un tamaño o el tipo no es reconocido, se señala como rechazado para revisión; no se inventa ninguna combinación. Los registros `Air/LCL` no se proyectan hasta que negocio confirme los tres equipos aéreos.

Para FCL marítimo se aceptan los equipos que Dhole marca `Maritime` o `Multimodal`: de ese modo, `48HC` sigue siendo candidato aun cuando su metadata solo diga `Multimodal`. No se añadió modo ni sección extra al wizard.

Para FTL se toman `truck-sizes` activos tal como vienen; hoy 24, 26, 48, 53 pies. No existe lista estática de reemplazo 40→48 en este proyector. Los valores históricos de 40 pies permanecerán intactos hasta que se active conjuntamente el nuevo frontend y su validador backend.

Nueva previsualización **solo para administradores** y con `DholeCatalogs:Enabled=true` en entorno autorizado:

`GET /api/dhole/quote-equipment-preview`

Responde `source: dhole`, `stale`, `fclCombinations`, `ftlSizes`, `rejectedTypeCodes`, `airEquipmentDecisionPending: true`, `submissionEnabled: false`. No altera ningún POST ni el selector actual. Se agregaron pruebas de FCL 45 High Cube, Multimodal 48HC, FTL sin 40, capacidades de peso desconocidas y exclusión de LCL aéreo.

## Pendiente sin bloquear este proyector

- Validar directamente desde el backend una consulta real con credenciales configuradas **solo en un ambiente de prueba**.
- Confirmar formalmente la regla específica de POL al cerrar revisión funcional (POE y POD ya tienen criterio de negocio explícito).
- Definir equipos LOOSE/PALLET/ULD en cotización aérea; no añadir campos de momento.
- No fusionar PR ni habilitar tráfico de clientes sin conexión real, validación de escritura y controles de regresión.
