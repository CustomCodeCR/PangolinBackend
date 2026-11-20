# Propuesta separada para DholeApiGateway: catálogo GET `pricing-services`

**Estado:** propuesta de código **NO APLICADA EN DHOLE**. El conector de GitHub pudo consultar `CustomCodeCR/DholeApiGateway` pero devolvió **HTTP 403 Resource not accessible by integration** al crear una rama allí el 20/11/2026. Por tanto no hay PR de Gateway, despliegue, API publicada ni clave creada. Se requiere acceso autorizado de escritura o un mantenedor del Gateway para aplicar y revisar los cambios.

## Contrato observado

- `DholeWeb/src/modules/pricing/composables/usePricingCatalogs.ts` usa `pricing-services` como grupo de Config para `serviceIds` y `land-equipment-types` para los tipos de equipos terrestres.
- `Dhole.ApiGateway/ThirdParty/ThirdPartyServiceIdentity.cs` tiene ocho catálogos GET técnicos permitidos: el de tipos de furgón ya figura, pero **`pricing-services` no**.
- El endpoint interno de Config es `GET /api/config/catalog-items/by-group/{catalogGroupSlug}`. No usar acceso directo de terceros ni tokens ajenos al Gateway.
- El asistente de «Tipo de furgón» mostró cuatro campos seleccionados: Identificador, Código, Nombre, Valor. Es suficiente para revisar nombres y UUID, pero **no se ha verificado que baste para asociar el tipo a su tamaño**: el catálogo podría requerir metadatos individuales `size` y `kind` (no exponer `metadata` completo a ciegas).

## Cambio propuesto, exclusivo del repositorio DholeApiGateway

1. En `Dhole.ApiGateway/appsettings.json`, agregar el target de Config:
   - `Code=config-catalog-pricing-services`
   - `Service=config`, `Method=GET`, `Path=/api/config/catalog-items/by-group/{catalogGroupSlug}`
   - `CatalogSlug=pricing-services`
   - Descripción: `Servicios de Pricing (solo lectura, campos limitados)`.
   - `ThirdParty:PricingServicesCatalogEnabled=false` **por defecto**.
2. En `ThirdPartyServiceIdentity.cs`, permitir esa pareja exacta target/slug **solo cuando** `ThirdParty:PricingServicesCatalogEnabled=true`, tanto en `IsReady` como en `GetCredential` (incluyendo la ruta de token explícito, para evitar bypass). Conservar únicamente `config.catalog-items.view`, sin nuevos permisos, sin mutaciones y sin alcance de creación de tarifas.
3. En `ThirdPartyFieldCatalog.Outputs`, tratar `config-catalog-pricing-services` **antes** de la rama genérica `config-catalog-*` y permitir exclusivamente `id`, `code`, `name` y `value`; no permitir `metadata`, `metadataJson` ni campos comerciales internos. `Inputs` vacío; sin filtros/IDs del consumidor.
4. Mantener desactivada la bandera y no publicar el endpoint hasta revisar la PR de Gateway, pruebas de auth/Config y legitimidad de los datos seleccionados. El usuario debe aprobar por separado cualquier publicación en el API Manager o entrega de API Key.

## Vigencia de los elementos: bloqueo adicional detectado

El normalizador de BackendJJ descarta `isActive: false` **cuando ese campo llega en la respuesta**; si no llega, no puede demostrar que el elemento siga activo. Por tanto, limitar el GET a `id/code/name/value` sin una garantía explícita sobre vigencia **no basta para autorizar el mapeo de UUID**.

Antes de publicar o activar esta consulta, el dueño de Dhole debe escoger y verificar una solución de mínimo privilegio: que el Gateway filtre estrictamente los elementos activos en el servidor y se pruebe el filtro, o que publique además `isActive` (sin metadatos privados) y que BackendJJ exija explícitamente `true` para servicios y tipos de equipo. **No inferir actividad de un campo ausente**. Para los tipos FTL también hay que verificar tamaño y clase de equipo sin publicar `metadataJson` opaco.

Este requisito sigue **pendiente**: no se modificó el Gateway, no se publicó ningún GET y no existe autorización de POST.

## Pruebas de Gateway a exigir

- Con bandera apagada, `IsReady=false` y `GetCredential=null`, **incluso con token explícito configurado**.
- Con bandera activada, el target GET exacto de `pricing-services` obtiene exclusivamente scope `config.catalog-items.view`; no tiene `roles`, `permissions`, sesión ni alcances de escritura.
- Rechazar target cambiado a `POST`/`PUT`, `CatalogSlug` distinto, ruta distinta y código `route.*`.
- El catálogo de campos de salida ofrece solo `id`, `code`, `name`, `value`; `metadataJson` queda fuera de la allowlist.
- Verificar proyección de datos de Config con registros ficticios, inactivos, duplicados y sin UUID; no usar servidores reales en CI.

## Mapeo preparado de Castro Fallas

En `scripts/dhole-catalog-id-resolver.mjs` los snapshots opcionales `pricing-services` y `land-equipment-types` se aceptan **solo** con `catalog` correcto, `stale=false`, fecha fresca y UUID único. Los servicios requieren nombre/valor coincidente; FTL requiere **UUID de tipo**, código, tamaño explícito igual al grupo de tamaños y tipo semántico coincidente. Si no hay catálogos publicados, respuesta ambigua o metadatos de tamaño insuficientes, la solicitud continúa bloqueada.

**No habilitar ningún POST de Pricing, ni publicar la API, ni fusionar esta PR con la suposición de que el Gateway ya está disponible.**
