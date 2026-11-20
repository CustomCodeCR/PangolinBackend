# Dhole: dos catálogos adicionales en modo GET, sin publicar ni enviar

## Alcance
La PR prepara un cliente y rutas de consulta de solo lectura en BackendJJ. El comportamiento predeterminado está desactivado; **no publica APIs en Dhole, no genera claves, no transmite cotizaciones y no habilita ningún POST externo**.

La respuesta `[]` de `GET /api/integrations/third-party/endpoints` procedía del **Dhole de pruebas**, no del oficial. En el **Dhole oficial** sí está publicada la API POST `solicitar-tarifa-wjicua4`, pero las dos consultas GET internas (`pricing-services`, `land-equipment-types`) todavía no constan como APIs externas publicadas. Ver `docs/DHOLE-CATALOG-PRODUCTION-CROSSWALK-20261120.md`. No confundir los permisos de la API POST con la publicación de catálogos internos.

Fuentes internas: `DholeApiGateway/ThirdParty/ThirdPartyServiceIdentity.cs` contempla la identidad GET para `land-equipment-types` como target `config-catalog-trailer-types`, pero no para `pricing-services`. El código `DholeWeb/src/modules/pricing/composables/usePricingCatalogs.ts` utiliza los grupos `pricing-services`, `land-equipment-types` y `land-equipment-sizes`.

## Endpoints privados de BackendJJ
- `GET /api/admin/dhole/lookup-catalogs/pricing-services`
- `GET /api/admin/dhole/lookup-catalogs/land-equipment-types`

Requieren rol de administrador. Con `DholeLookups:Enabled=false` (predeterminado), responden 404. Si se activa sin disponer de clave propia y ruta externa publicada responden 503. No hay POST, proceso automático ni persistencia de UUID.

La configuración de servidor acepta únicamente dos rutas relativas con forma `api/external/v1/<slug>` y una clave distinta `DholeLookups:ApiKey`. La conexión usa host fijo HTTPS, redirecciones y cookies deshabilitadas, timeout de 10 s, respuesta máxima 2 MiB y salida normalizada. La proyección privada conserva `isActive` si la fuente lo publica, pero el resolvedor offline exige `isActive=true` para servicios de Pricing y tipos FTL; si está ausente o no puede verificarse, no permite resolver el UUID. Esto requiere que el futuro Gateway exponga ese dato de forma segura y confirme la compatibilidad de tamaño y tipo FTL. No se reenvía JSON opaco a visitantes ni se toma una URL del navegador.

## Dependencia acordada con el equipo de Dhole (20/11/2026)

El usuario confirmó que el equipo de Dhole **entregará posteriormente** las APIs de consulta de servicios de Pricing y tipos de equipo FTL. Aunque podría intentar configurarlas por su cuenta, le indicaron que esperara su entrega.

**Decisión:** no crear, publicar ni modificar esos GET en DholeApiGateway ni en API Manager desde este proyecto. Mantener `DholeLookups:Enabled=false` y las opciones de servicios actuales como lista local de 12 elementos (sin «Transporte nacional»). Esta dependencia **no bloquea** las pruebas offline ni el desarrollo local de validaciones, pero **sí bloquea** el mapeo remoto con UUID vigentes y cualquier habilitación de POST.

Cuando Dhole entregue las APIs, verificar rutas reales, permiso de lectura, credencial de mínimo privilegio, `isActive`, código único, UUID válido y campos `size`/`kind` de FTL antes de configurar BackendJJ. No asumir que la entrega equivalga a autorizar automáticamente envíos de cotizaciones.

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
