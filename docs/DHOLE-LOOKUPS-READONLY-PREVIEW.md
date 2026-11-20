# Dhole: dos catálogos adicionales en modo GET, sin publicar ni enviar

## Alcance
La PR prepara un cliente y rutas de consulta de solo lectura en BackendJJ. El comportamiento predeterminado está desactivado; **no publica APIs en Dhole, no genera claves, no transmite cotizaciones y no habilita ningún POST externo**.

El usuario verificó que `GET /api/integrations/third-party/endpoints` devolvió `[]` en el entorno mostrado. La presencia de un catálogo interno no significa que haya una API externa publicada.

Fuentes internas: `DholeApiGateway/ThirdParty/ThirdPartyServiceIdentity.cs` contempla la identidad GET para `land-equipment-types` como target `config-catalog-trailer-types`, pero no para `pricing-services`. El código `DholeWeb/src/modules/pricing/composables/usePricingCatalogs.ts` utiliza los grupos `pricing-services`, `land-equipment-types` y `land-equipment-sizes`.

## Endpoints privados de BackendJJ
- `GET /api/admin/dhole/lookup-catalogs/pricing-services`
- `GET /api/admin/dhole/lookup-catalogs/land-equipment-types`

Requieren rol de administrador. Con `DholeLookups:Enabled=false` (predeterminado), responden 404. Si se activa sin disponer de clave propia y ruta externa publicada responden 503. No hay POST, proceso automático ni persistencia de UUID.

La configuración de servidor acepta únicamente dos rutas relativas con forma `api/external/v1/<slug>` y una clave distinta `DholeLookups:ApiKey`. La conexión usa host fijo HTTPS, redirecciones y cookies deshabilitadas, timeout de 10 s, respuesta máxima 2 MiB y salida normalizada. No se reenvía JSON opaco a visitantes ni se toma una URL del navegador.

## Activación futura, NO autorizada todavía
Se requiere publicar explícitamente y verificar las dos APIs externas GET en Dhole, determinar campos y permisos, y entregar una clave de mínimo privilegio distinta a la de catálogos existentes. La publicación de `pricing-services` requiere una revisión aparte del Gateway: todavía no tiene identidad técnica automática.

Solo después, en secretos privados del backend:

```text
DholeLookups__Enabled=true
DholeLookups__ApiKey=<CLAVE_PRIVADA_DISTINTA>
DholeLookups__PricingServicesPath=api/external/v1/<slug-real-verificado>
DholeLookups__LandEquipmentTypesPath=api/external/v1/<slug-real-verificado>
```

**No activar estas variables ahora.** Tampoco crear, modificar ni publicar APIs en Dhole para esta fase. Se debe verificar coincidencia única de UUID, vigencia y compatibilidad por modalidad antes de usar datos para el mapeo de cotizaciones.

## Pruebas simuladas
`tests/DholeCatalogHarness/Program.cs` prueba bandera apagada, ausencia de tráfico, rechazo de URL arbitraria o traversal, GET simulados con claves ficticias, campos seleccionados y respuesta upstream 403. `tests/DholeQuoteHttpHarness/Program.cs` prueba que visitantes reciben HTTP 401 y que un administrador sigue recibiendo HTTP 404 mientras la función esté apagada.

Esta PR sigue en borrador. No modifica `main-2` ni el servicio Dhole.
