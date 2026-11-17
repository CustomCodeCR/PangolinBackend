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

## Decisión de negocio POE confirmada (17/11/2026)
**Fuente:** el usuario transmitió las instrucciones del jefe después de revisar el resultado real del endpoint POE.

1. **POE se filtra según la modalidad del formulario**, a diferencia de POD, que muestra todas las ubicaciones válidas. Matriz observada en 944 registros de POE:
   - Marítimo: `transportMode=Maritime` y `terminalType=CY` → 77.
   - Aéreo: `transportMode=Air` y `terminalType=APT` → 851.
   - Terrestre: `transportMode=Land` y `terminalType=SD` → 16.
   Estos pares están **observados como concordantes** en las 944 ubicaciones clasificadas, no son una garantía futura. Si contradicen uno al otro en datos futuros, señalar inconsistencia y no adivinar una modalidad.
2. **Excepciones históricas marítimas confirmadas por el jefe:** los tres registros sin metadata ni modalidad son válidos para **POE marítimo**:
   - Port Willemstad, Curacao — `d43f9a0e-3fed-449d-bea0-067c9a2c30c4` (`POE-2026-007`).
   - Rio Haina, Republica Dominicana — `9141e228-7ecc-42cb-a00b-bb609077db28` (`POE-2026-009`).
   - Hong Kong, China — `150b6051-b099-4211-a2c8-b7ad85b51898` (`POE-2026-011`).
   Hoy, 77+3 = **80 destinos POE marítimos**, 851 aéreos y 16 terrestres.
3. **Falta de `routeRole` NO invalida POE:** si el registro viene del endpoint POE y no declara un rol distinto, puede usarse como POE aunque `routeRole` sea nulo o falte (por ejemplo Puerto Cortes, Honduras). Si en el futuro aparece un `routeRole` explícitamente contradictorio, detener para revisión: no se acordó aún esa regla.
4. **Clasificación automática:** para cambios posteriores de Dhole, dar prioridad a `transportMode` y `terminalType` actuales (campos superiores o metadata normalizada, si aplicable). Las tres excepciones deberían emplearse **solo mientras falten los metadatos**, y ser retiradas al confirmarse corrección; identificar por UUID estable en vez de nombres mostrados.
5. **No reintroducir `pricingWorkflow` en el filtrado.** El negocio confirmó que no importa para este trabajo.
6. **Pendiente técnico, no bloqueo de investigación:** confirmar con equipo si POE comparte con POD la regla provisional de `isActive !== false`; no darla por aceptada tácitamente para todos los catálogos. Mantener la API key en backend, gestionar caché, no sustituir UUID locales a ciegas, preservar cotizaciones existentes.

Esta decisión aplica a **POE**, no a POL (aún sin investigar) ni a la regla distinta ya decidida para POD.

## POE: refinamiento de reglas tras validación con el negocio (17/11/2026)
- En la última respuesta examinada, 944/947 POE tienen ambos campos `transportMode` y `terminalType` concordantes (77 Maritime/CY, 851 Air/APT, 16 Land/SD). Los otros tres tienen `id`, `code`, `name`, pero carecían de ambos campos; la clasificación marítima fue confirmada por el jefe.
- El jefe indica que los tres **ya podrían haber sido corregidos en Dhole**. **Primero reconsultar GET POE** y comprobar esos tres UUID. **No introducir excepciones permanentes** si los metadatos ya están correctos. Si todavía no están corregidos, analizar fallback temporal sin sobrescribir los valores explícitos.
- Si `transportMode` y `terminalType` contradicen la matriz verificada, **no dar prioridad arbitraria a uno**: registrar conflicto y dejar ese registro para revisión sin clasificación automática; no ocultar ni alterar otros registros válidos. Una contradicción futura se considera incidencia de calidad de datos y requiere definición del negocio.
- El usuario confirma que, **provisionalmente también para POE**, se excluya únicamente `isActive === false` (booleano explícito). `true`, `null` y propiedad ausente no quedan excluidos por este criterio. **Confirmar esta política con el jefe al final de la investigación**.
- Para `routeRole` nulo o ausente, se mantiene que no invalida un registro POE entregado por ese endpoint. `pricingWorkflow` no interviene.
- Próximo paso: refrescar POE para verificar correcciones y consultar POL, sin realizar cambios funcionales.

## POE: corrección de tres registros confirmada en nueva consulta GET (17/11/2026)
El usuario volvió a consultar el endpoint POE usando PowerShell y verificó por UUID los tres registros que antes carecían de clasificación:
- `d43f9a0e-3fed-449d-bea0-067c9a2c30c4` Port Willemstad, Curacao: `transportMode=Maritime`, `terminalType=CY`, `routeRole=POE`, `isActive=true`.
- `9141e228-7ecc-42cb-a00b-bb609077db28` Rio Haina, Republica Dominicana: `Maritime` / `CY` / `POE` / `true`.
- `150b6051-b099-4211-a2c8-b7ad85b51898` Hong Kong, China: `Maritime` / `CY` / `POE` / `true`.

**Las excepciones temporales ya no son necesarias para esos tres registros.** Si todos los demás registros siguen inalterados desde la consulta anterior, el conteo POE marítimo pasa a **80** (77+3), aéreo 851, terrestre 16; para presentar estos números como distribución completa actual, confirmar mediante un agrupamiento sobre toda la nueva respuesta. Se aplicará clasificación dinámica por metadatos, sin listas de UUID excepcionales salvo que aparezca otro caso avalado por negocio.

## POL: primera respuesta real (GET autenticado por PowerShell del usuario, 17/11/2026)
- Endpoint: `/api/external/v1/pol-puerto-de-origen-wi11hg7`; `$itemsPol.Count = 1062`. Los 1062 registros tienen `isActive: true` según `Group-Object isActive`.
- Conteos cruzados **fila por fila** de `transportMode, terminalType`: `Air, APT = 854`, `Maritime, CY = 189`, `Land, SD = 15`, ambos sin valor visible = 3, y **`Maritime, SD = 1`**. Suman 1062. No asumir que Maritime+SD es inválido sin validar con el negocio.
- Conteo `routeRole`: `POL = 1056`, rol ausente/vacío = 5, **`POD = 1`**, total 1062. No imponer `routeRole=POL` como criterio obligatorio hasta entender el registro contradictorio.
- Ejemplo aéreo: Oregon, Estados Unidos, `iataCode = PDX`, `airportName = Portland International Airport`, `Air/APT/POL`.
- Ejemplo marítimo: Acajutla, El Salvador, `Maritime/CY/POL`.
- Ejemplo terrestre: Ciudad de Guatemala, Guatemala, `Land/SD/POL`.
- Ejemplo sin modalidad visible: Atlanta, Estados Unidos, código `POL-2026-109`, sin metadatos mostrados en ese ejemplo.
- El catálogo POL no coincide en cantidades con POE; por diseño funcional, son roles distintos y no se debe asumir que comparten todos los destinos.
- **Pendiente inmediato:** identificar por `id`, `code`, `name` y `metadata` el registro `Maritime/SD`, el registro `routeRole=POD`, los 5 sin rol y los 3 sin modalidad. Verificar si son el mismo registro o casos separados. Consultar al negocio solo en las anomalías que persistan; no inventar clasificación ni excluir opciones válidas unilateralmente.
- Reglas POL de filtrado y fallback **aún no confirmadas**; estudiar primero las excepciones antes de homologarlas con POE. Política provisional `isActive !== false` se confirmó para POD y POE; debe acordarse para POL si se quiere generalizar.


## POL: siete casos especiales identificados en GET (17/11/2026)
Resultado de `$itemsPol | Where-Object` con condiciones: Maritime+SD, rol POD, falta de rol o modalidad superior. Son **7 registros únicos**, todos con `isActive: true`.

| Registro | id | Datos observados | Estado / decisión técnica provisional |
|---|---|---|---|
| Atlanta, Estados Unidos (POL-2026-109) | `24a938cf-7fe9-4e34-a774-d26475760270` | transportMode, terminalType, routeRole y metadata: null | Pedir clasificación a Dhole; no inferir modalidad |
| London Gateway, United Kingdom (POL-2026-110) | `c6519b0a-5bc6-4cd2-87d6-32e9822a5c20` | transportMode, terminalType, routeRole y metadata: null | Pedir clasificación |
| Anhui, China (POL-2026-111) | `88dd96bb-44b2-4714-9f89-e721206413ac` | Maritime/CY, rol superior null y metadata sin rol; `pricingWorkflow: false` | Bajo hipótesis de catálogo POL autoritativo, candidato POL marítimo, sin exigir rol no contradictorio |
| Jiangxi, China (POL-2026-112) | `10d89a35-8898-4cf1-8166-931c279f3bff` | Maritime/CY, rol superior null y metadata sin rol; `pricingWorkflow: true` | Candidato POL marítimo sin exigir rol |
| Minnesota, Estados Unidos (POL-2026-113) | `27eb3622-4725-4705-a76f-8f4a8fa934ad` | Maritime/CY, rol superior null y metadata sin rol; `pricingWorkflow: false` | Candidato POL marítimo sin exigir rol |
| Moin, Costa Rica (POL-2026-116) | `8ebb78e5-6a9c-47c0-9a31-ddbb057540c6` | Maritime/SD; `routeRole: POD` arriba y en metadata | **Conflicto explícito de rol y par de modalidad/terminal**. Confirmar con Dhole/jefe antes de decidir su inclusión; no imponer la modalidad ni el rol por prioridad arbitraria |
| San José, Costa Rica (POL-2026-117) | `d3a43858-7ade-419c-a108-af5203bf0f2e` | rol superior `pol`; transportMode y terminalType superiores null; metadata con `TransportMode: Maritime`, `TerminalType: CY`, `CountryCode: SV`, `routeRole: pol`, `PricingWorkflow: true` | Normalizar nombre de claves (PascalCase/camelCase) y rol en minúscula; **revisar CountryCode=SV frente al nombre Costa Rica**, sin corregirlo unilateralmente |

**Recuento tras inspección:** 1058 registros POL con modalidad/terminal coherentes a la matriz Air/APT, Maritime/CY, Land/SD (854+189+15); San José es un registro adicional que puede recuperarse como Maritime/CY vía metadata, aunque tiene anomalía en país. Hay 2 registros aún sin clasificación confirmada (Atlanta, London Gateway), y 1 explícitamente contradictorio (Moin Maritime/SD y rol POD). Los conteos de agrupación originales siguen siendo útiles; no sustituirlos por cifras recalculadas sin nuevo GET completo.

**Recomendación:** investigar estos 3 bloqueos reales (Atlanta, London Gateway, Moin) y el país de San José con el responsable, pero continuar la investigación de los tres catálogos de equipos de solo lectura. Mantener `pricingWorkflow` sin efecto en el filtrado. No cambiar selectores actuales hasta acordar la política POL.


## Aclaración posterior sobre POL y San José (17/11/2026)
- El usuario reporta que el equipo Dhole **ya habría corregido** los casos especiales de POL. La salida pegada en esta conversación es la **misma consulta anterior**, por lo que no verifica la actualización. Debe realizarse **un nuevo GET** a POL y revisar nuevamente por UUID.
- El usuario aclara que **San José aparece en varias variantes/tipos** en el sistema. Por tanto, **el mismo nombre en varias modalidades o terminales no es, por sí solo, una incongruencia ni motivo para deduplicar registros diferentes**.
- El registro antiguo `POL-2026-117` (`d3a43858-7ade-419c-a108-af5203bf0f2e`) mostraba `CountryCode=SV` dentro de metadata pese a su nombre 'San José, Costa Rica'. No declarar esto definitivamente erróneo ni cambiarlo hasta comparar su nueva respuesta y el significado de este campo; diferenciar registros por UUID, no por nombre.
- Revisar los siete UUID anómalos con consulta nueva y clasificar el resultado como corregido, pendiente o cambio intencional; no reutilizar colecciones PowerShell de una llamada antigua.
- Mantener la regla de no imponer automáticamente una prioridad cuando `transportMode` y `terminalType` realmente se contradigan dentro **del mismo registro**, pero no interpretar variantes legítimas de un mismo nombre como contradicción.

## POL: reconsulta posterior a correcciones de Dhole (17/11/2026)
El usuario ejecutó **un nuevo GET** a `pol-puerto-de-origen-wi11hg7`, no la colección antigua `$itemsPol`.

- Distribución actual **en campos superiores** (total 1062): `Air/APT=854`, `Maritime/CY=191`, `Land/SD=15`, `Maritime/SD=1`, `sin transportMode/terminalType superiores=1`.
- Registros históricos inspeccionados por UUID:
  - Atlanta `24a938cf-7fe9-4e34-a774-d26475760270`: ahora `Maritime/CY/POL`.
  - London Gateway `c6519b0a-5bc6-4cd2-87d6-32e9822a5c20`: ahora `Maritime/CY/POL`.
  - Anhui `88dd96bb-44b2-4714-9f89-e721206413ac`: ahora `Maritime/CY/POL`.
  - Jiangxi `10d89a35-8898-4cf1-8166-931c279f3bff`: ahora `Maritime/CY/POL`.
  - Minnesota `27eb3622-4725-4705-a76f-8f4a8fa934ad`: ahora `Maritime/CY/POL`.
  - Moin `8ebb78e5-6a9c-47c0-9a31-ddbb057540c6`: ahora `Maritime/SD/POL`. **Se corrigió la contradicción de rol POD**, pero conserva la combinación `Maritime/SD`. No marcar esta combinación como error sin conocer su semántica; el usuario indicó que múltiples tipos pueden ser legítimos.
  - San José `d3a43858-7ade-419c-a108-af5203bf0f2e`: campos superiores `transportMode=null`, `terminalType=null`, `routeRole="pol"`; `metadata.TransportMode="Maritime"`, `metadata.TerminalType="CY"`, `metadata.routeRole="pol"`, `metadata.CountryCode="SV"`. **Clasificación recuperable por metadata con capitalización diferente**. El usuario aclara que San José puede representar múltiples registros/tipos válidos; no deduplicar por nombre. País `SV` vs nombre Costa Rica se mantiene como inconsistencia aparente por confirmar, no se corrige de forma automática.
- No hacen falta excepciones codificadas para Atlanta, London Gateway, Anhui, Jiangxi ni Minnesota. Validar futuras actualizaciones dinámicamente usando los campos vigentes de la API.
- Se mantiene política acordada ante contradicción real de modalidad/terminal: registrar para revisión, no dar prioridad arbitraria a uno. **Pero `Maritime/SD` no se declara automáticamente contradictorio**, pues se observó en un registro de origen que ahora declara `POL` y no está confirmada la regla de exclusividad de tipos de terminal.
- La definición final del filtro POL por modalidad aún deberá confirmarse con el negocio; se puede continuar investigando tamaños/tipos sin bloquear por esta confirmación.

## Tamaños de contenedor: resultado real API 5/7 (GET autenticado, 17/11/2026)
- Endpoint: `/api/external/v1/tamano-de-contenedor-wja5k6l`.
- Respuesta deserializada como arreglo de **4** elementos, todos con `isActive=true`.
- Registros completos (valores verificados):

| id | code/slug/value | name | sortOrder | metadata.feet |
|---|---|---|---:|---:|
| `c1100000-0000-4000-8000-000000000020` | `20` | `20 pies` | 20 | 20 |
| `c1100000-0000-4000-8000-000000000040` | `40` | `40 pies` | 40 | 40 |
| `c1100000-0000-4000-8000-000000000045` | `45` | `45 pies` | 45 | 45 |
| `c1100000-0000-4000-8000-000000000048` | `48` | `48 pies` | 48 | 48 |

Cada registro incluye además `description: Contenedor de XX pies`, `metadata: {feet: N}` y `metadataJson` equivalente. Sin inconsistencias observadas.
- Los **cuatro nombres visibles** coinciden con los tamaños FCL existentes y validados por `backend/Endpoints/OfficialQuoteEndpoints.cs`; el frontend tiene datos estáticos en `frontend/src/lib/officialQuoteOptions.ts`.
- **Diferencia de contrato:** `name="40 pies"` pero `value/code="40"` y un UUID externo específico. No sustituir `name` por `value` en el payload local sin adaptar la validación del backend y preservar cotizaciones existentes.
- Implementación deseada: catálogo obtenido dinámicamente desde backend seguro con cache, preservar diseño/labels, mantener UUID Dhole diferenciado del identificador de equipo o ubicación local. Seguir regla provisional `isActive !== false` si se decide aplicarla globalmente.
- No modifica ni justifica ajustes en las listas FTL (furgón), que pertenecen a otra API.

## Tipos de contenedor: resultado real API 6/7 (GET autenticado, 17/11/2026)
- Endpoint: `/api/external/v1/tipo-de-contenedor-wja62r8`.
- El usuario adjuntó la respuesta completa de PowerShell: **18** registros, **todos `isActive:true`**. Cada uno tiene `id` UUID externo, `code`, `slug`, `name`, `description`, `value` (igual que `code`), `sortOrder`, `metadata` y `metadataJson`.
- **15 equipos de contenedor FCL** (size+kind en `metadata`, todos con `shipmentModes:["FCL"]`):
  - `dry-van`: `20DV`, `40DV`.
  - `high-cube`: `40HC`, `45HC`, `48HC`.
  - `open-top`: `20OT`, `40OT`.
  - `open-side`: `20OS`, `40OS`.
  - `tank`: `20TK`, `40TK`.
  - `flat-rack`: `20FR`, `40FR`.
  - `nor`: `20NOR`, `40NOR`.
  - **14 de 15** listan `metadata.modalities=["Maritime","Multimodal"]`; `48HC` lista solamente `["Multimodal"]`, pese a tener `shipmentModes:["FCL"]`.
- **3 equipos lógicos para carga aérea LCL**: `LOOSE` / Carga suelta, `PALLET` / Pallet aéreo, `ULD` / ULD. Cada uno con `metadata.modalities=["Air"]` y `metadata.shipmentModes=["LCL"]`. No contienen necesariamente `metadata.size` o `metadata.kind`. La interfaz local usa denominación `AIR_LCL`; mapear `LCL + Air` explícitamente sin confundir con LCL marítimo.
- Metadatos opcionales de equipos: `kind`, `size`, `aliases` y `kindCode` presentes solo en algunos; no obligarlos globalmente. No todos los tamaños y tipos combinan: `45HC` existe, **no se recibió `45DV`**.
- Comparación con la web: la validación FCL actual enumera tipos generales `Dry Van, High Cube, Open Top, Open Side, Tank, Flat Rack, NOR` y tamaños `20 pies, 40 pies, 45 pies, 48 pies` como campos independientes. **No reemplazar un tipo general por `code` combinado** (p. ej. `40HC`) en el payload local sin adaptador, y no modificar el comportamiento del selector antes de aprobar regla de compatibilidad con negocio. La integración ideal obtiene y valida combinaciones Dhole de forma dinámica preservando textos, diseño e históricos.
- **Detalle a confirmar:** la `description` de `20DV/40DV/40HC/45HC` dice "marítimo, terrestre y multimodal" mientras `metadata.modalities` **no contiene Land**. Por ahora preferir modalidad estructurada como dato de clasificación y elevar discrepancia; no asumir automáticamente que "terrestre" significa `Land` permitido. `48HC` es solo `Multimodal` en metadata; confirmar uso en marítimo antes de permitirlo/prohibirlo.
- Todos los 18 están activos; mantener el criterio provisional `isActive !== false` sujeto a revisión final conjunta.


## Riesgos y preguntas pendientes
1. Verificar formato real de respuesta, paginación, métodos, filtros, ids, tipos, nulos y códigos de estado; no inferir modalidad por nombre.
2. Comprobar si POL/POE/POD contienen metadatos explícitos de transporte y si los endpoints distinguen roles de los catálogos locales.
3. Comparar el conjunto y la semántica de IDs externos contra `OfficialQuoteLocation.Id`; definir mapeo sin romper solicitudes existentes.
4. Determinar si los tamaños y tipos externos son compatibles con las validaciones actuales y GIO.
5. Proteger la API key solo en backend, por configuración de entorno, sin exponerla al frontend, repositorio ni logs.
6. Gestionar indisponibilidad, paginación, caché, deduplicación, rate limit y respuestas inesperadas; evitar regresiones 429.
7. Solicitar especificación de `solicitar-tarifa` antes de cualquier prueba POST; ejemplo recibido no demuestra cuáles campos son obligatorios.

## Acceso a la API externa
La prueba DNS desde el entorno del asistente falló: `Could not resolve host: api.logisticacastrofallas.com`. Sin embargo, el usuario **sí obtuvo un JSON autenticado de Incoterms usando PowerShell** (GET). Ya se observaron respuestas autenticadas para seis de los siete catálogos (incoterms, POD, POE, POL, tamaños y tipos de contenedor); falta tamaños de furgón y la confirmación del contrato POST de tarifas. No se almacena ninguna clave API en este repositorio.

## Paralelismo
PR #246: `frontend/src/pages/About.vue`.
PR #247: workflow, Compose, pruebas y documentación de medios WebP.
Mantener cambios en la rama `research/dhole-external-catalogs-20261117` y comparar conflictos antes de fusionar.
