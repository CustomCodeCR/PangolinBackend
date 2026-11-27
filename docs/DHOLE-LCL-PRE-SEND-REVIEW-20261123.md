# Dhole / PR #274 — revisión previa al primer POST real de prueba

**23 de noviembre de 2026. Solo preparación. Ningún POST realizado.** El artefacto original de revisión sigue marcado «PRUEBA TECNICA FICTICIA. NO ENVIAR.». Ningún servicio web, job, endpoint ni Docker invoca el ejecutor aislado.

## Contrato externo y ejemplo elegido

| Campo de POST | Valor previsto para revisión |
| --- | --- |
| priority | Green |
| shipmentMode / form_shipmentMode | Lcl |
| form_modality | Maritime |
| form_rateType | Spot (valor provisional; aceptación real NO confirmada) |
| form_originId | Shanghai, China; UUID del catálogo pol |
| form_destinationId / poeId / requestContext_poeId | Limón/Moin, Costa Rica; UUID propio de poe |
| form_podId / podId / requestContext_podId | Moín, Costa Rica; UUID propio de pod |
| form_incotermId | CIF; resolver por value, no por code o slug |
| form_serviceIds | Solo ID del ítem INT_TRANSPORT, no rateTermItemIds |
| form_loadDate / sellerContext_cargoReadyDate | 2026-12-18 (fecha ficticia futura) |
| form_cargoDescription | Descripción de repuestos de prueba + bloque etiquetado de contacto ficticio |
| form_cargoObservations | PRUEBA TECNICA FICTICIA. NO ENVIAR. |
| form_cargoPackages | 3 |
| form_cargoWeightKg | 10 kg **totales** para una línea de tres cajas |
| sellerContext_consolidatedCargoLines | Una línea: 3 bultos; peso total 10 kg; dimensiones 20 × 12 × 8 cm |
| form_nonStackable | true (supuesto ficticio del ejemplo, no exigencia de cliente) |
| form_cargoValue / form_currencyId | **Omitidos**: no existe moneda validada para el valor ficticio anterior de 1600 |

No se envían identificadores de cliente/ejecutivo, direcciones de correo en campos comerciales independientes, ni credenciales en el JSON. Los valores fijos del Gateway **CLIENTE GENERICO** y **Castro Fallas** permanecen en manos de Dhole. Los datos de persona que aparecen en la descripción son ficticios: Persona de Prueba / prueba@example.invalid / +506 0000-0000.

La revisión local comprueba que el cuerpo plano solo use campos publicados y permitidos, mantiene los UUID separados por grupo y rechaza importe comercial sin moneda. Los códigos, tipos de terminal y estados son evidencia manual del **20/11/2026**, no un catálogo consultado en tiempo real el día del envío.

## Qué se puede verificar sin POST

1. El contrato plano local y sus 103 campos publicados en la instantánea; no se infiere compatibilidad futura a partir de una instantánea anterior.
2. El código de la interfaz Dhole incluye un componente de previsualización de entrega a Pricing que renderiza «Descripción» desde cargoDescription. Esto demuestra una **capacidad de visualización**, no confirma almacenamiento, visibilidad en la solicitud creada por API ni permisos de lectura.
3. Las pruebas de POST a un controlador HTTP simulado comprueban URI fija, cabecera de idempotencia, ningún reintento y conservación del cuerpo. Un HTTP 2xx real **solo** significaría aceptación HTTP, no creación persistida.

## Bloqueos pendientes antes de permitir un POST auténtico

- **Catálogos vigentes:** volver a consultar los cinco UUID y sus estados activos. El registro manual de hace tres días no basta por sí solo para demostrar vigencia en el momento de enviar.
- **Tratamiento en Dhole:** verificar con su responsable si la descripción es almacenada y mostrada solo a usuarios autorizados de Pricing; no asumirlo por el componente frontend.
- **Contrato real:** comprobar que el Gateway oficial acepta «Spot»/«Maritime», la ruta elegida y las unidades, sin cambiar defaults comerciales.
- **Seguridad del operador:** preparar un nuevo JSON de prueba con marcador de autorización, UUID nuevo y huella exacta, fuera de Git; registrar consentimiento explícito para **un solo POST**.
- **Comprobación posterior:** visualizar en Dhole la solicitud ficticia, contactar con responsable de Pricing si hay estado inconcluso y no reintentar una petición cuyo resultado sea desconocido.

**Decisión de este paso:** la fase técnica puede cerrarse con el JSON de revisión que no transmite nada. La autorización para el primer POST real **no está dada** por un «siguiente» genérico; deberá solicitarse claramente cuando los bloqueos hayan sido revisados. La PR #274 permanece en borrador y no se fusiona a main-2.
