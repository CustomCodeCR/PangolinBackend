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
3. En `ThirdPartyFieldCatalog.Outputs`, tratar `config-catalog-pricing-services` **antes** de la rama genérica `config-catalog-*` y permitir exclusivamente `id`, `code`, `name`, `value` e `isActive` (o una garantía probada de filtrado por activos desde el Gateway); no permitir `metadata`, `metadataJson` ni campos comerciales internos. `Inputs` vacío; sin filtros/IDs del consumidor.
4. Mantener desactivada la bandera y no publicar el endpoint hasta revisar la PR de Gateway, pruebas de auth/Config y legitimidad de los datos seleccionados. El usuario debe aprobar por separado cualquier publicación en el API Manager o entrega de API Key.

## Vigencia de los elementos: bloqueo adicional detectado

El normalizador de BackendJJ descarta `isActive: false` **cuando ese campo llega en la respuesta**; si no llega, no puede demostrar que el elemento siga activo. Por tanto, limitar el GET a `id/code/name/value` sin una garantía explícita sobre vigencia **no basta para autorizar el mapeo de UUID**.

Antes de publicar o activar esta consulta, el dueño de Dhole debe escoger y verificar una solución de mínimo privilegio: que el Gateway filtre estrictamente los elementos activos en el servidor y se pruebe el filtro, o que publique además `isActive` (sin metadatos privados) y que BackendJJ exija explícitamente `true` para servicios y tipos de equipo. **No inferir actividad de un campo ausente**. Para los tipos FTL también hay que verificar tamaño y clase de equipo sin publicar `metadataJson` opaco.

Este requisito sigue **pendiente**: no se modificó el Gateway, no se publicó ningún GET y no existe autorización de POST.

## Revisión adicional del GET de tipos FTL (código Gateway actual)

Revisado directamente en `CustomCodeCR/DholeApiGateway` el 20/11/2026:

- `ThirdPartyServiceIdentity.AllowedCatalogs` **ya incluye** el target `config-catalog-trailer-types` con slug exacto `land-equipment-types`, método GET, servicio `config` y scope fijo `config.catalog-items.view`. **Esto demuestra viabilidad técnica, no publicación ni autorización de una API externa**.
- `ThirdPartyFieldCatalog.Outputs` permite hoy `id`, `code`, `name`, `value` e `isActive` para catálogos, pero **no ofrece proyecciones tipadas separadas** de `metadataJson.size` y `metadataJson.kind`. El resolvedor FTL necesita esos dos valores para corroborar la relación entre tamaño, clase y código.
- En una **PR aparte de DholeApiGateway**, añadir a la lista de salidas únicamente para `config-catalog-trailer-types` los campos públicos `size` y `kind` con rutas internas `metadataJson.size` y `metadataJson.kind`. No abrir `metadata` ni `metadataJson` completos. Publicar `isActive` explícito y probar rechazo de inactivos, duplicados, valores sin tamaño/tipo y metadatos contradictorios.
- Para `pricing-services`, la salida mínima propuesta sigue siendo `id`, `code`, `name`, `value`, `isActive`. La relación con los 12 servicios de la web se haría **por código verificado** contra catálogo vigente, **no por igualdad de nombres visibles**.
- Aún hace falta una persona con permisos de escritura y publicación en DholeApiGateway/API Manager. No se crearon ramas, se cambiaron permisos ni se habilitaron endpoints en Dhole desde BackendJJ.

## Pruebas de Gateway a exigir

- Con bandera apagada, `IsReady=false` y `GetCredential=null`, **incluso con token explícito configurado**.
- Con bandera activada, el target GET exacto de `pricing-services` obtiene exclusivamente scope `config.catalog-items.view`; no tiene `roles`, `permissions`, sesión ni alcances de escritura.
- Rechazar target cambiado a `POST`/`PUT`, `CatalogSlug` distinto, ruta distinta y código `route.*`.
- El catálogo de campos de salida ofrece `id`, `code`, `name`, `value` e `isActive` sin `metadataJson`; probar el filtrado de elementos activos y nunca interpretar un campo ausente como `true`.
- Verificar proyección de datos de Config con registros ficticios, inactivos, duplicados y sin UUID; no usar servidores reales en CI.

## Mapeo preparado de Castro Fallas

En `scripts/dhole-catalog-id-resolver.mjs` los snapshots opcionales `pricing-services` y `land-equipment-types` se aceptan **solo** con `catalog` correcto, `stale=false`, fecha fresca y UUID único. Los servicios requieren **código único y UUID válido**; FTL requiere **UUID de tipo**, código, tamaño explícito igual al grupo de tamaños y tipo semántico coincidente. Si no hay catálogos publicados, respuesta ambigua o metadatos de tamaño insuficientes, la solicitud continúa bloqueada.

**No habilitar ningún POST de Pricing, ni publicar la API, ni fusionar esta PR con la suposición de que el Gateway ya está disponible.**
