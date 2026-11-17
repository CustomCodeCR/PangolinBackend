# Dhole catálogos — fase 1: lectura segura aislada

Esta implementación vive en la rama feat/dhole-catalog-backend-20261117, nacida de main-2. No modifica formularios, itinerarios, validaciones actuales ni IDs almacenados.

## Configuración (solo en backend, nunca en GitHub ni navegador)

- Variable: DholeCatalogs__Enabled=true
- Variable: DholeCatalogs__ApiKey=(secreto del backend, no compartir)

El servicio está deshabilitado por defecto. Se utiliza un HttpClient HTTPS fijo, sin redirecciones ni cookies. Se envía X-Api-Key (distinto de X-Dhole-Api-Key usado actualmente por Tracking). Las siete rutas remotas están predefinidas y ningún usuario puede cambiar la URL o solicitar un POST.

## Ruta propia de lectura

GET /api/dhole/catalogs/{catalog}

Valores de catalog: incoterms, pol, poe, pod, container-sizes, container-types, truck-sizes.

- HTTP 200: catalog, fetchedAtUtc, stale, items normalizados; no se exponen claves ni metadatos opacos del proveedor.
- HTTP 404: nombre de catálogo desconocido.
- HTTP 503: integración deshabilitada o sin clave configurada.
- HTTP 502: fallo de upstream, JSON inválido o timeout sin copia válida.
- Cuando la actualización falla y existe una copia previa válida conservada, se responde HTTP 200 con stale=true y la marca de tiempo original; no se inventan opciones.

Caché en memoria: 5 minutos de frescura, hasta 1 hora como contingencia. Exclusión mutua por catálogo para solicitudes simultáneas. El endpoint usa el limitador de lectura pública existente.

## Normalización y consistencia

- Recibe arreglo JSON o sobre con propiedad value.
- Lee campos directos y metadata / metadataJson, admitiendo camelCase y PascalCase.
- Descarta exclusivamente registros con isActive booleano false según política provisional.
- No presupone que Maritime/SD sea inválido ni deduplica destinos diferentes solo por nombre.
- Rechaza un campo que se contradiga explícitamente entre valor directo y anidado, y también IDs UUID inválidos o duplicados.
- Tipos de contenedor mantienen size, kind, modalities, shipmentModes; tamaños de furgón mantienen feet y capacityTons.
- Los UUID externos no sustituyen automáticamente los UUID locales de cotizaciones.

## Verificación local

Con .NET SDK 10, desde raíz del repositorio:

    dotnet run --project tests/DholeCatalogHarness/DholeCatalogHarness.csproj
    dotnet build backend/CastroFallas.MiniQuote.Api.csproj

El harness verifica campos con mayúsculas heterogéneas, isActive, compatibilidad de equipos, JSON envuelto y rechazo de IDs/datos contradictorios. No se pudieron ejecutar pruebas en el entorno del asistente porque no dispone de dotnet. No se ha probado una conexión real con credenciales del servidor.

## Próximos pasos

1. Ejecutar build y harness, y validar las siete respuestas GET en un ambiente de pruebas autorizado sin compartir credenciales.
2. Diseñar adaptador Dhole↔UUID local para POL/POE/POD, manteniendo referencias históricas.
3. Sustituir dinámicamente listas de Incoterms y equipos, con validación sincronizada; en FTL Dhole ofrece actualmente 24, 26, 48 y 53 pies en lugar del 40 estático de la web.
4. Adaptar Itinerarios sin cambiar los filtros guardados ni la protección frente a 429.
5. Dejar LOOSE, PALLET y ULD en espera de confirmación; no crear campos aéreos nuevos.

No fusionar ni desplegar todavía: esta es solo la base técnica de fase 1.
