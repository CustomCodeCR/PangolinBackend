# Investigación: catálogos externos de Dhole (17/11/2026)

Estado: **investigación inicial; sin integración ni validación de respuestas externas**.

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

## Riesgos y preguntas pendientes
1. Verificar formato real de respuesta, paginación, métodos, filtros, ids, tipos, nulos y códigos de estado; no inferir modalidad por nombre.
2. Comprobar si POL/POE/POD contienen metadatos explícitos de transporte y si los endpoints distinguen roles de los catálogos locales.
3. Comparar el conjunto y la semántica de IDs externos contra `OfficialQuoteLocation.Id`; definir mapeo sin romper solicitudes existentes.
4. Determinar si los tamaños y tipos externos son compatibles con las validaciones actuales y GIO.
5. Proteger la API key solo en backend, por configuración de entorno, sin exponerla al frontend, repositorio ni logs.
6. Gestionar indisponibilidad, paginación, caché, deduplicación, rate limit y respuestas inesperadas; evitar regresiones 429.
7. Solicitar especificación de `solicitar-tarifa` antes de cualquier prueba POST; ejemplo recibido no demuestra cuáles campos son obligatorios.

## Acceso a la API externa
La prueba de conectividad DNS desde el entorno de ejecución de esta investigación falló: `Could not resolve host: api.logisticacastrofallas.com`. **No se obtuvo JSON ni se utilizó la clave**; no se puede declarar contenido, categorías, transportes ni compatibilidad de las respuestas hasta una consulta autenticada de solo lectura desde un entorno con acceso.

## Paralelismo
PR #246: `frontend/src/pages/About.vue`.
PR #247: workflow, Compose, pruebas y documentación de medios WebP.
Mantener cambios en la rama `research/dhole-external-catalogs-20261117` y comparar conflictos antes de fusionar.
