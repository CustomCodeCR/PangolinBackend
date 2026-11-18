# Fase 4: opciones POL/POD de Itinerarios desde Dhole (opt-in)

## Distinción importante
El buscador de **Itinerarios** utiliza campos `POL` (origen) y `POD` (destino). Es diferente de **Cotizaciones**, donde la selección de destino corresponde a `POE` y puede haber un `POD` adicional en marítimo. **No intercambiar esas APIs**.

La nueva ruta no altera itinerarios publicados, nombres almacenados, filtros de resultados, modalidades ni estado de viajes; solo el origen de la lista de ubicaciones del selector.

## Regla de carga

Se añadió `DholeItineraryLocationProjector` y se amplió `GET /api/itinerarios/locations?transport=maritime&routeRole=origin` en el backend existente:

- `routeRole=origin`: POL Dhole, con `transport=maritime` para registros de modalidad marítima, `transport=ground` para terrestre y `all` para ambos.
- `routeRole=destination`: **POD** Dhole. Se incluyen todos sus registros activos independientemente de modalidad o tipo de terminal; una anomalía de `routeRole` se registra en la proyección, pero no excluye el registro.
- El catálogo se obtiene a través del cliente backend con clave privada, caché y limitador `public-read`; no hay secretos ni enlaces directos de Dhole en el frontend.
- El contrato del endpoint conserva `items: [{displayName}]`. Como los filtros existentes usan cadenas (y no UUID), se deduplican solo los nombres para evitar sugerencias idénticas; **esto no modifica los UUID ni los nombres en Cotizaciones**.
- `frontend/src/lib/itineraryLocations.ts` conserva su caché de 5 minutos y la protección 429, pero utiliza una versión nueva de almacenamiento para no reutilizar opciones históricas de la sesión.
- Ante catálogos no configurados, vacíos o caducos, el endpoint dinámico devuelve error controlado; no mezcla silenciosamente listas locales desactualizadas.

## Activación

**Desactivado por defecto**. Para habilitar el origen Dhole de las listas de itinerarios en un despliegue de prueba, se requerirán:

- `DholeCatalogs__Enabled=true`.
- `DholeCatalogs__ApiKey=` clave privada solo en backend.
- `DholeCatalogs__ItinerariesEnabled=true`.

**No configurar esos valores aún en producción**. Cuando el flag de itinerarios sea falso, el endpoint sigue usando su consulta actual a `OfficialQuoteLocations` y `OfficialQuoteLocationUsages` exactamente como antes.

## Pruebas

En `tests/DholeCatalogHarness/Program.cs` hay casos de:

- POL marítimo y terrestre con filtrado por modalidad.
- `transport=all` con ambos tipos de origen.
- POD idéntico para ambos transportes, incluidos registros con clasificación poco habitual.
- Nombres repetidos: se deduplican únicamente en filtros de Itinerarios.

El workflow Dhole ejecuta el harness y compila backend sin llamar a Dhole real. Pendiente probar valores reales cuando el usuario libere espacio en Docker, verificar continuidad de búsquedas con itinerarios publicados y hacer revisión final de CI.

## Pendiente de despliegue

GIO continúa usando el catálogo local de rutas mientras se determina un rollout conjunto de sus consumidores; no habilitar todas las banderas como sustitución integral sin probar GIO y el formulario en conjunto. No se realiza ningún POST al proveedor. La PR #250 sigue en borrador.
