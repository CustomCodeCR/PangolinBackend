# Entrega express: integración oficial de cotizaciones

PR #274. Sin despliegue ni nuevo POST. Objetivo: main-2 → validación única en Docker → main por el release normal.

## Revisión comercial provisional (requiere aprobación)

DholeWeb d942a420, pricingCommercialRules.ts: seguro sobre FOB + flete en USD. No hay evidencia de conversión automática del valor declarado de otra moneda. ManualCommercialReviewEnabled (apagado por defecto) preserva importes y moneda originales, pesos/bultos adicionales, manejo en destino y datos EXW en observaciones de Pricing para revisión humana. Mantiene servicios seleccionados y totales de las líneas; no sustituye form_cargoValue/currencyId ni calcula seguro. Sin aprobación, los campos no resueltos bloquean envío.

## Puertas para el piloto y entrega

1. Confirmar permisos para compartir los datos de contacto con Pricing.
2. Obtener GET restringido pricing-rate-request-detail con salida exacta id/status y clave de lectura separada del POST; limitar acceso a las solicitudes de esta integración.
3. Rotar la clave POST antes compartida. Configurar secretos solo en servidor y verificar Graph.
4. Aplicar migración aditiva backend/Database/OfficialQuotesSchema.sql con respaldo y flags apagados.
5. En Docker aislado: captura, cola e idempotencia; guardar una solicitud ficticia NO COTIZAR con worker y POST apagados. Con autorización expresa, configurar PilotQuoteId exacto y gates de DHOLE-DISPATCH-WORKER-20261124.md; no AllNewQuotesEnabled. Configurar vigencia temporal y, si se aprueba, ManualCommercialReviewEnabled.
6. Verificar un intento, existencia en Pricing y bultos/medidas/pesos, estado Confirmed, mensaje y correo al destinatario controlado. No repetir un POST incierto.
7. CI verde y autorización: fusionar a main-2 y comprobar Docker sin repetir POST. Preparar main y release habitual. Para activar todas las nuevas solicitudes, elegir NewQuotesStartUtc y retirar PilotQuoteId; no enviar backlog ni copiar configuración del piloto.
8. Incidencia: apagar WorkerEnabled y PostEnabled mediante reinicio controlado; conservar datos y reservas, no resetear InFlight/Unconfirmed. Rollback de imagen compatible sin borrar tablas. No reintentar solicitudes históricas.

Administración muestra UUID verificado y estado de correo. Accepted significa aceptación por Graph, no entrega final en buzón. Este documento es un orden operativo, no una autorización ni comandos de despliegue ya validados.
