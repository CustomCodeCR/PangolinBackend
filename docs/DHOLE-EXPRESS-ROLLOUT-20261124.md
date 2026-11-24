# Entrega express: integración oficial de cotizaciones

PR #274. Sin despliegue ni nuevo POST. Objetivo: main-2 → validación única en Docker → main por el release normal.

## Revisión comercial provisional (decisión aceptada el 24/11)

DholeWeb d942a420, pricingCommercialRules.ts: seguro sobre FOB + flete en USD. No hay evidencia de conversión automática del valor declarado de otra moneda. ManualCommercialReviewEnabled (apagado por defecto) preserva importes y moneda originales, pesos/bultos adicionales, manejo en destino y datos EXW en observaciones de Pricing para revisión humana. Mantiene servicios seleccionados y totales de las líneas; no sustituye form_cargoValue/currencyId ni calcula seguro. El propietario delegó la decisión de moneda y se elige este mecanismo para la entrega express. Activar explícitamente PANGOLIN_DHOLE_MANUAL_COMMERCIAL_REVIEW_ENABLED=true en el release autorizado. El overlay de piloto ya lo configura; los defaults generales y de producción siguen apagados. El importe y moneda se conservan en Administración y en observaciones de Pricing, no se convierten automáticamente. El cálculo final del seguro corresponde a Pricing.

## Puertas para el piloto y entrega

1. Confirmar permisos para compartir los datos de contacto con Pricing.
2. No se requieren nuevos GET para la primera entrega: usar el contrato POST HTTP 200 + UUID exacto y confirmar manualmente durante el piloto. Mantener GET independiente para después, según DHOLE-CREATION-RECEIPT-EXPRESS-20261124.md.
3. Rotar la clave POST antes compartida. Configurar secretos solo en servidor y verificar Graph.
4. Aplicar migración aditiva backend/Database/OfficialQuotesSchema.sql con respaldo y flags apagados.
5. En Docker aislado: captura, cola e idempotencia; guardar una solicitud ficticia NO COTIZAR con worker y POST apagados. Con autorización expresa, configurar PilotQuoteId exacto y gates de DHOLE-DISPATCH-WORKER-20261124.md; no AllNewQuotesEnabled. Configurar vigencia temporal y ManualCommercialReviewEnabled (política de moneda elegida; no autoriza un POST).
6. Verificar un intento, existencia en Pricing y bultos/medidas/pesos, estado AcceptedByProvider (o Confirmed si se habilita GET futuro), mensaje y correo al destinatario controlado. No repetir un POST incierto.
7. CI verde y autorización: fusionar a main-2 y comprobar Docker sin repetir POST. Preparar main y release habitual. Para activar todas las nuevas solicitudes, elegir NewQuotesStartUtc y retirar PilotQuoteId; no enviar backlog ni copiar configuración del piloto.
8. Incidencia: apagar WorkerEnabled y PostEnabled mediante reinicio controlado; conservar datos y reservas, no resetear InFlight/Unconfirmed. Rollback de imagen compatible sin borrar tablas. No reintentar solicitudes históricas.

Administración muestra UUID verificado y estado de correo. Accepted significa aceptación por Graph, no entrega final en buzón. Este documento es un orden operativo, no una autorización ni comandos de despliegue ya validados.
