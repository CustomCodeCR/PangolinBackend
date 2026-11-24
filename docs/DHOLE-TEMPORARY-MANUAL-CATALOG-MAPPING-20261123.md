# Mapeo temporal de Dhole sin nuevos GET externos

**23/11/2026 · PR #274 · Solo revisión local · NO enviar tarifas**

## Decisión y datos que ya tenemos

El usuario autorizó usar de manera provisional los datos existentes y mapearlos mientras el equipo de Dhole tarda unos días en publicar las APIs externas de `pricing-services` y `land-equipment-types`.

**Ya están validadas las correspondencias funcionales** —sin inventar UUID—:

- **Servicios:** los 12 códigos `INT_TRANSPORT`, `CUSTOMS_CR`, `CUSTOMS_FOREIGN`, `STORAGE`, `INVENTORY_CONTROL`, `PACKING`, `EXONERATION`, `PICKING`, `RECEPTION`, `CARGO_INSURANCE`, `DELIVERY`, `PICKUP`. Las diferencias entre nombres visibles y nombres de Pricing se resuelven por **código estable**, nunca por coincidencia aproximada de texto.
- **FTL:** cuatro tamaños **24, 26, 48 y 53 pies**, cada uno con los tipos `DRY_VAN`, `PLATFORM`, `REEFER` y `CURTAIN_SIDE` (16 combinaciones). Se usa **UUID del ítem de tipo**, no UUID del tamaño.
- **Datos que sí podemos seguir obteniendo automáticamente**: los 7 GET externos ya publicados para Incoterms, ubicaciones POL/POE/POD, tamaños de contenedor, tipos de contenedor y tamaños de furgón. No reemplazarlos por datos estáticos.

El 20/11/2026 se observó un catálogo interno con 12 UUID de servicios y otro con 16 de FTL. Esos UUID **no se fijan en código** ni se consideran verificados automáticamente tres días después.

## Procedimiento provisional, sin nueva API ni credenciales en el repositorio

Cuando sea necesario revisar un mapeo reciente, desde la UI de **Config → Catálogos** de Dhole, exportar de la pestaña **Network → Response** las respuestas JSON de lectura autenticada:

1. `/api/config/catalog-items/by-group/pricing-services`
2. `/api/config/catalog-items/by-group/land-equipment-types`

Conservar exclusivamente el **Response JSON**, no URL con token, headers, cookies, claves ni capturas de autorización. Guardar ambos archivos **fuera del repositorio**. No usar los UUID de `metadataJson.rateTermItemIds` en lugar de `data[].id`.

Desde PowerShell, ubicándose en el repositorio:

```powershell
node .\scripts\dhole-temporary-manual-catalog-import.mjs `
  "$env:TEMP\pricing-services.json" `
  "$env:TEMP\land-equipment-types.json" `
  "$env:TEMP\dhole-catalog-review.json" `
  --reviewed-just-now
```

El programa **no consulta Dhole**; solo lee dos archivos locales y genera un resultado *sanitizado* en una ruta privada fuera del repositorio. Si el archivo de salida ya existe se niega a sobrescribirlo; se debe borrar la revisión antigua y crear otra con exportaciones realmente nuevas.

Las verificaciones incluyen:

- Código correcto, estado `isActive=true`, UUID no vacío y único de los 12 servicios.
- 16 combinaciones FTL exactas, con `catalogGroupSlug`, código, `metadataJson.size` y `metadataJson.kind` coherentes. Rechaza códigos desconocidos, metadatos contradictorios, inactivos y duplicados.
- Instantánea local marcada con origen **manual**, caducidad **cinco minutos**, `readyForRemotePost:false` y `noTransport:true`. Solo contiene los campos mínimos y no conserva `metadataJson` completo ni información personal.
- Su formato de instantáneas permite que `scripts/dhole-catalog-id-resolver.mjs` resuelva **en una vista preliminar local** los nombres actuales de servicio y los pares FTL, junto con las demás instantáneas GET que ya tenemos.

La herramienta no crea una API nueva, no escribe en la base de datos, no activa un worker, no solicita ni transmite cotizaciones y **no convierte un export manual en prueba de vigencia para producción**. No prolongar artificialmente su fecha de revisión ni pasar este artefacto directamente a `DholeQuotePostTransport`.

## Lo que todavía impide la automatización real

1. Sin GET externo, el estado activo y UUID **deben comprobarse manualmente para cada operación autorizada**. Un export temporal no es una fuente estable para envíos desatendidos.
2. La política de valor de mercancía/seguro y el UUID de moneda siguen sin resolver: el transporte bloquea importes sin moneda comercial validada.
3. Aún se requiere acuerdo de identidad comercial, confirmación de respuesta remota, detección de duplicados y autorización **específica** para cualquier prueba de POST real.
4. La copia en Administración y el outbox permanecen separados del envío real, apagado por defecto. No fusionar ni desplegar desde esta nota.
5. Cuando Dhole entregue los dos GET externos, quitar el uso manual y volver a la resolución por **catálogo fresco y autorizado**, conservando los tests de duplicados/inactivos.

**Prueba aislada** (solo UUID ficticios, sin red): `node --test scripts/tests/dhole-temporary-manual-catalog-import.test.mjs`.
