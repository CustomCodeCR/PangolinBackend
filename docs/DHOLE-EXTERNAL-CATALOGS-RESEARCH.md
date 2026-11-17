# Investigación: catálogos externos de Dhole (17/11/2026)

Estado: **primer catálogo verificado a través de PowerShell del usuario; sin integración funcional**.

## Alcance de endpoints recibidos
Lectura prevista (verificar método y formato real antes de integrar):
- `incoterms-wi15gr9`
- `pod-puerto-de-destino-wi14v6w`
- `poe-puerto-de-entrada-wi14b3j`
- `pol-puerto-de-origen-wi11hg7`
- `tamano-de-contenedor-wja5k6l`
- `tipo-de-contenedor-wja62r8`
- `tamano-de-furgon-wja6f0k`

Acción potencialmente mutadora: `solicitar-tarifa-wjicua4` (POST). **No ejecutar sin autorización específica, entorno de pruebas y conocimiento de sus efectos**.

## Hallazgos confirmados en main-2
- `frontend/src/lib/officialQuoteOptions.ts`: Incoterms y tamaños/tipos de equipos fijos.
- `backend/Endpoints/OfficialQuoteEndpoints.cs`: validación estricta de Incoterms, tamaños/tipos; cambios en frontend requieren coherencia con backend.
- `backend/Models/OfficialQuoteModels.cs`: formulario oficial guarda UUID de origen, destino y POD; sus IDs pertenecen al catálogo local y no se pueden sustituir ciegamente por identificadores de Dhole.
- `docs/cotizaciones-oficiales-catalogos.md`: ubicaciones y uso por modalidad/rol mediante `official_quote_locations` y `official_quote_location_usage`; carga parcial desde videos.
- `frontend/src/lib/itineraryLocations.ts`: Itinerarios usa `/api/itinerarios/locations`; cachea nombres por modalidad y rol cinco minutos y controla 429.
- `docs/ITINERARIOS-429.md`: endpoint agregado por rol para evitar múltiples consultas; mantener límites y comportamiento durante integración.
- `docs/cotizaciones-oficiales-despliegue.md`: cotizador V2 independiente; wizard oficial controlado por flags; no activar producción sin catálogo real y QA.

## Resultado real verificado: Incoterms (GET, PowerShell del usuario, 17/11/2026)
- Endpoint: `/api/external/v1/incoterms-wi15gr9`. `GET` con `X-Api-Key` devuelve objeto JSON con `value` (arreglo) y `Count: 11`. El arreglo contiene exactamente 11 registros y todos presentan `isActive: true`.
- Nombres, ordenados por `sortOrder`: EXW, FCA, FAS, FOB, CFR, CIF, CPT, CIP, DAP, DPU, DDP. **Coinciden con los 11 valores existentes en `officialIncoterms`**; todavía no es necesario modificar el selector visible.
- Campos por registro: `id` (UUID, por ejemplo EXW `2d873827-71c1-41da-bb9f-932e931277b0`), `code` (ej. `INC-2026-001`), `slug`, `name`, `value`, `isActive`, `sortOrder`, `metadata.rateSections` (lista de cadenas) y `metadataJson` (el mismo objeto de metadata serializado como texto; coincide en los 11 registros observados).
- La metadata contiene secciones de tarifa: `pickup_origin`, `origin_charges`, `international_freight`, `destination_charges`, `delivery_destination`; no provee un atributo explícito `air`/`maritime`/`land`. **No deducir modalidades**.
- Anomalía verificada: CIF tiene `name: "CIF"`, `value: "CIF"`, pero `slug: "cfi"`. Evitar `slug` como identidad de negocio o corregirlo unilateralmente.
- Los códigos internos de DAP y DPU son `INC-2026-010` e `INC-2026-009`, respectivamente, aunque sus `sortOrder` son 90 y 100; no ordenar por `code` ni usarlo como semántica de orden.
- Hipótesis de integración: presentar `name` y `value`, respetar `isActive`/`sortOrder`, y conservar `id` externo solo para un eventual contrato Dhole, sin confundirlo con los UUID de ubicaciones locales. Validar compatibilidad backend antes de sustituir reglas.
- Esta única respuesta no demuestra cadencia de cambios, filtros, paginación, disponibilidad ni uso específico de `rateSections` en `solicitar-tarifa`.

## Resultado real parcial: POD (GET, PowerShell del usuario, 17/11/2026)
- Endpoint: `/api/external/v1/pod-puerto-de-destino-wi14v6w`. `GET` con `X-Api-Key` tuvo respuesta exitosa.
- El valor deserializado de `$r` aparece como arreglo de **24 elementos** (`$r.Count = 24`). Las propiedades mostradas por `$r.PSObject.Properties.Name` corresponden al objeto arreglo .NET: `Count`, `Length`, `LongLength`, `Rank`, `SyncRoot`, `IsReadOnly`, `IsFixedSize`, `IsSynchronized`. **No deben confundirse con campos JSON de registros POD.**
- La expresión `$r.value | Select-Object -First 3` produjo los textos: `Colon Free Zone, Panamá`, `Long Beach, Estados Unidos`, `Managua, Nicaragua`.
- Falta consultar `$r[0]`, sus propiedades y tipos: no se sabe si hay `id`, `name`, `value`, modalidad, códigos, activo, paginación ni otros metadatos. Tampoco se debe inferir modalidad por el nombre del destino.
- Próxima prueba de solo lectura, sin imprimir credenciales: `$r[0] | ConvertTo-Json -Depth 10` y `$r[0].PSObject.Properties.Name`. Adicionalmente `$r.GetType().FullName`.

## POD: inspección del primer registro completo (GET, PowerShell del usuario, 17/11/2026)
- `$r.GetType().FullName` = `System.Object[]`: la respuesta deserializada es un arreglo; `Count = 24` es longitud del arreglo, no necesariamente un campo raíz enviado por la API.
- Primer registro (`$r[0]`): `id = cb4741d9-1932-422e-b354-ad01ac1634bd`, `code = POD-2026-002`, `slug = colon-free-zone-panama`, `name = value = Colon Free Zone, Panamá`, `isActive = true`, `sortOrder = 1`.
- `metadata` es objeto con `routeRole = POD`, `countryCode = PA`, `terminalType = SD`, `transportMode = Maritime`. Estos campos también aparecen al nivel superior del objeto; `metadataJson` contiene la versión serializada.
- **Hallazgo crítico:** el registro ofrece un `transportMode` **explícito**. No hay que inferir modalidad por el nombre del lugar. **Solo se ha inspeccionado el primer registro**; no afirmar que los 24 son Maritime ni que todos tengan metadatos completos.
- No asumir qué significa el código `SD` hasta confirmación del equipo Dhole. Tampoco igualar `id` externo con UUID de `official_quote_locations` sin mapeo verificado.
- Inspección pendiente: agrupar los 24 registros por `transportMode`, `routeRole`, `terminalType`, `isActive`; contar ausencia de `id`/`value` y duplicados de ID. Esto permitirá decidir filtros seguros y compatibilidad de cotizaciones/itinerarios.

## POD: análisis de los 24 registros según PowerShell (17/11/2026)
- `transportMode`: `Maritime = 12`, `Land = 3`, valor no mostrado = 9.
- `routeRole`: `POD = 15`, valor no mostrado = 9.
- `terminalType`: `SD = 15`, valor no mostrado = 9.
- `isActive`: `True = 24`.
- Los nueve nombres sin modalidad/rol/tipo visibles en el listado:
  - Caldera, Costa Rica
  - Cartago, Costa Rica
  - San Jose, Costa Rica
  - Alajuela, Costa Rica
  - Heredia, Costa Rica
  - Coyol, Costa Rica
  - Port Willemstad, Curaçao
  - Tocumen, Panama
  - Georgetown, Guyana
- Los tres con `transportMode = Land`, `routeRole = POD`, `terminalType = SD`: Long Beach, Estados Unidos; Veracruz, México; Pital, San Carlos, Costa Rica. **No corregir sus etiquetas ni asumir un error**; confirmar semántica con Dhole.
- Los otros 12 con `transportMode = Maritime`: Colon Free Zone (Panamá), Managua (Nicaragua), San Pedro Sula (Honduras), Puerto Cortes (Honduras), Tegucigalpa (Honduras), San Salvador (El Salvador), Santo Tomas del Castillo (Guatemala), Ciudad de Guatemala (Guatemala), Manzanillo (Panamá), New Jersey (Estados Unidos), Moin (Costa Rica), Rotterdam (Paises Bajos).
- Precaución: PowerShell muestra espacios en blanco tanto para propiedades inexistentes como valores `null` o cadena vacía; se requiere inspección explícita de objetos, `metadata` y presencia de propiedades antes de concluir causa.
- **Bloqueo de integración:** no se puede filtrar POD únicamente por `transportMode` y descartar silenciosamente los nueve registros sin modalidad. No inferir `Maritime` desde nombre, ni del endpoint, ni del puerto.
- Próxima inspección de solo lectura: seleccionar los nueve registros sin modalidad, mostrar sus campos `id/code/name/metadata/transportMode/routeRole/terminalType`, comparar con casos `Land`. Pregunta para Dhole: ¿ausencia de metadata y clasificación terrestre es intencional? ¿Qué significa `SD`? ¿Cómo se aplica el rol POD para marítimo/terrestre? ¿Hay otra fuente de verdad para filtrar?

## POD: inspección de los nueve registros sin modalidad superior (PowerShell, 17/11/2026)
Se inspeccionaron `id`, `name`, `code`, `transportMode`, `routeRole`, `terminalType` y `metadata` de los nueve registros que tenían `transportMode` superior vacío.

- **Ocho** objetos tienen `transportMode: null`, `routeRole: null`, `terminalType: null` y `metadata: null`: Caldera (POD-2026-010), Cartago (011), San Jose (012), Alajuela (013), Heredia (014), Coyol (015), Port Willemstad (016), Tocumen (017).
- **Georgetown, Guyana** (`id: 4cc5036e-6d4c-4e6a-af7f-9e5d4b12a59e`, `code: POD-2026-022`) tiene los tres campos superiores nulos, pero `metadata` incluye `RouteRole: "pod"`, `CountryCode: "GY"`, `TerminalType: "SD"`, `TransportMode: "Maritime"` y `PricingWorkflow: false`.
- La convención de claves en `metadata` difiere: en el primer registro están en camelCase (`transportMode`, `routeRole`); en Georgetown PascalCase (`TransportMode`, `RouteRole`), y el valor de rol también difiere en mayúsculas. Normalizar explícitamente sin presumir que `metadataJson` tiene siempre el mismo formato.
- **Resumen tras esta inspección:** 12 registros son `Maritime` en campo superior, 3 son `Land` en campo superior, 1 (`Georgetown`) es `Maritime` en metadata y 8 carecen de clasificación consultada. Hay 24 registros activos según la consulta anterior.
- No usar `PricingWorkflow: false` para eliminar Georgetown de los selectores hasta verificar qué significa con Dhole.
- No inventar modalidad de los ocho registros sin metadata; solicitar definición del catálogo y política de clasificación.
- En cualquier implementación, distinguir entre filtros informativos para UI y validación de IDs externos; mantener intactos los registros históricos.

## Decisión funcional confirmada con el jefe — POD (17/11/2026)
**Fuente:** el usuario transmite la decisión del jefe del negocio tras revisar los resultados de la API.

- **Usar los 24 destinos que devuelve el endpoint POD como opciones válidas de POD**, independientemente de `transportMode` y de que tengan `metadata` nula. Hay registros históricos anteriores a la regularización de metadatos.
- **No filtrar** el selector POD por `transportMode = Maritime`, ni descartar destinos `Land`, con `transportMode: null` o sin metadata. Los 24 elementos observados están activos.
- POD en el formulario se refiere a la posición de puerto de descarga/destino en la ruta marítima, pero **la elegibilidad de las opciones la determina el catálogo POD entregado por Dhole**; un nombre o `transportMode` de un registro no invalida su aparición como opción de POD.
- `PricingWorkflow`: **el negocio confirmó que no importa para esta integración**. Se ignora completamente para el selector POD: no filtrar, validar, priorizar ni bloquear por este campo.
- Esta decisión resuelve el filtrado funcional de POD; faltan comprender el contrato de identificadores externo↔local, controles de error/cache y la integración dinámica antes de cambiar la UI.

## Regla de elegibilidad POD acordada (17/11/2026, provisional)
- **Usar todos los registros devueltos por el endpoint POD excepto los que tengan `isActive` como booleano `false` explícito.**
- `isActive === true`, `isActive === null` o ausencia de la propiedad **no excluyen** el registro.
- `transportMode` y `metadata` no filtran elegibilidad POD, aunque presenten valores inesperados o estén ausentes.
- `PricingWorkflow` no es relevante para esta integración, según la aclaración más reciente del negocio. No hace falta preguntar su significado para implementar POD.
- Esta decisión es provisional y **solo para POD**; no extrapolarla a POE, POL ni otros catálogos hasta revisar sus contratos.
- Conservar IDs de origen Dhole, asegurar nombre legible antes de presentar una opción y validar datos de manera defensiva.
- En la muestra actual de 24 elementos, todos tienen `isActive: true` y se mostrarían los 24.
- No se ha integrado aún ningún selector: la decisión se aplicará al desarrollar el adaptador backend y la UI.

## POE: primera respuesta real (PowerShell del usuario, 17/11/2026)
- Endpoint: `/api/external/v1/poe-puerto-de-entrada-wi14b3j`. GET autenticado exitoso; `$items.Count = 947`. Se usó lógica para aceptar respuesta como arreglo o un objeto con propiedad `value`; **la forma exacta de la raíz no quedó explícitamente impresa**, no confundir con certeza de formato.
- Distribución `transportMode` en el nivel superior: `Air = 851`, `Maritime = 77`, `Land = 16`, sin valor visible = `3`. Total = 947.
- `isActive: true` para los 947 registros agrupados; ninguno reportado como falso.
- Los tres primeros registros: `Acajutla, El Salvador`, `Algeciras, España`, `Altamira, México`. Todos muestran `transportMode: Maritime`, `routeRole: POE`, `terminalType: CY`, `pricingWorkflow: true`, `isActive: true`, `countryCode` correspondiente, identificador UUID, `code`, `slug`, `description`, `value`, `sortOrder`, `metadata`, `metadataJson`.
- Para los tres ejemplos `description` indica "Puerto marítimo de carga internacional · Container Yard (CY)." Es información observada, **no** un patrón demostrado de las 947 entradas.
- Clave: aunque el endpoint se llame POE, incluye 851 registros Air. No asumir que el endpoint es un catálogo de puertos marítimos exclusivamente; tampoco trasladar automáticamente la regla funcional POD a POE.
- `pricingWorkflow` aparece en la muestra, pero no se ha establecido un uso funcional para POE; **no filtrar ni implementar lógica sobre este campo hasta conocer la regla**.
- Pendiente: analizar la metadata de los 3 sin `transportMode`, distribuciones de `routeRole`/`terminalType`, estructura real de entradas aéreas y terrestres, posibles duplicados y relación con origen/destino en UI.
- La regla de elegibilidad para POE **no está decidida**. Esperar a estudiar estos datos y, si hace falta, consultar al negocio.

## POE: inspección por roles y terminales (PowerShell del usuario, 17/11/2026)
- Sobre **947** elementos: `routeRole = POE` en **943** y sin valor superior visible en **4**.
- `terminalType = APT`: **851**; `CY`: **77**; `SD`: **16**; sin valor visible: **3**. Esta distribución suma 947.
- Junto a la prueba anterior, `transportMode = Air`: 851; `Maritime`: 77; `Land`: 16; sin valor visible: 3. **Las cantidades coinciden por grupo, pero eso por sí solo no demuestra correspondencia fila por fila entre tipo y modalidad; verificar con agrupamiento cruzado si hace falta.**
- Ejemplo **Land**: Ciudad de Guatemala, Guatemala; código `SD_CIUDAD_DE_GUATEMALA_GUATEMALA`; `transportMode: Land`, `terminalType: SD`, `routeRole: POE`, `pricingWorkflow: true`, metadatos redundantes.
- Ejemplo **Air**: Abidjan, Côte d’Ivoire; `code: APT_ABJ`, `name: Abidjan, Côte d’Ivoire (ABJ)` mientras `value: Abidjan, Côte d’Ivoire`; `transportMode: Air`, `terminalType: APT`, `routeRole: POE`; metadatos de aeropuerto `iataCode: ABJ`, `icaoCode: DIAP`, `airportName: Abidjan Port Bouet Airport`, latitud/longitud, city/country, `airportCategory: mid`, `source: FreeGeoDB`.
- Tres registros **sin transportMode superior** muestran `id/code/slug/name/value/isActive/sortOrder` pero no muestran `metadata`, `routeRole` ni `terminalType`: Port Willemstad, Curacao (`POE-2026-007`); Rio Haina, Republica Dominicana (`POE-2026-009`); Hong Kong, China (`POE-2026-011`). **No asignar modalidad de forma inferida**.
- Hay **un registro adicional** sin `routeRole` superior más allá de esos tres. No está identificado aún.
- Aplicación: POE parece ser un catálogo compartido con aeropuertos, terminales marítimas y ubicaciones terrestres. **Regla de negocio específica de POE pendiente de decisión**; no aplicar automáticamente la excepción de POD.
- Próximo análisis mínimo: obtener los cuatro registros sin `routeRole` y el recuento cruzado `transportMode` × `terminalType`, sin repetir toda la consulta (aprovechar `$items` de PowerShell).

## POE: comprobación cruzada de modalidad, terminal y rol (17/11/2026)
La agrupación cruzada del conjunto completo confirma exactamente:
- `Maritime, CY`: **77**
- `Land, SD`: **16**
- `Air, APT`: **851**
- Sin ambos campos visibles: **3**
Así se valida la correspondencia observada por modalidad y tipo de terminal en los 944 registros clasificados, sin asumir una modalidad para los tres restantes.

Los **4 registros sin `routeRole` superior** fueron identificados:
1. `POE-2026-007`: Port Willemstad, Curacao; `transportMode`, `terminalType` y `metadata` nulos en la salida.
2. `POE-2026-009`: Rio Haina, Republica Dominicana; los mismos valores nulos.
3. `POE-2026-010`: Puerto Cortes, Honduras; **Maritime / CY** tanto en campos superiores como en metadata, pero metadata **no trae `routeRole`**; `countryCode: HN`, `pricingWorkflow: true`.
4. `POE-2026-011`: Hong Kong, China; los mismos valores nulos que los otros dos sin modalidad.

**Implicación:** filtrar únicamente `routeRole === "POE"` excluiría Puerto Cortes y los tres registros históricos sin rol. No hacerlo sin definición del negocio. Mantener `pricingWorkflow` fuera de lógica de filtrado mientras no exista indicación para POE. Reglas POE siguen pendientes de discusión; no copiar sin confirmación las reglas decididas para POD.

## Riesgos y preguntas pendientes
1. Verificar formato real de respuesta, paginación, métodos, filtros, ids, tipos, nulos y códigos de estado; no inferir modalidad por nombre.
2. Comprobar si POL/POE/POD contienen metadatos explícitos de transporte y si los endpoints distinguen roles de los catálogos locales.
3. Comparar el conjunto y la semántica de IDs externos contra `OfficialQuoteLocation.Id`; definir mapeo sin romper solicitudes existentes.
4. Determinar si los tamaños y tipos externos son compatibles con las validaciones actuales y GIO.
5. Proteger la API key solo en backend, por configuración de entorno, sin exponerla al frontend, repositorio ni logs.
6. Gestionar indisponibilidad, paginación, caché, deduplicación, rate limit y respuestas inesperadas; evitar regresiones 429.
7. Solicitar especificación de `solicitar-tarifa` antes de cualquier prueba POST; ejemplo recibido no demuestra cuáles campos son obligatorios.

## Acceso a la API externa
La prueba DNS desde el entorno del asistente falló: `Could not resolve host: api.logisticacastrofallas.com`. Sin embargo, el usuario **sí obtuvo un JSON autenticado de Incoterms usando PowerShell** (GET). Quedan pendientes los JSON reales de los otros seis catálogos y la confirmación del contrato POST de tarifas. No se almacena ninguna clave API en este repositorio.

## Paralelismo
PR #246: `frontend/src/pages/About.vue`.
PR #247: workflow, Compose, pruebas y documentación de medios WebP.
Mantener cambios en la rama `research/dhole-external-catalogs-20261117` y comparar conflictos antes de fusionar.
