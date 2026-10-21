# Catálogos de rutas por modalidad y posición

Cada modalidad tiene orígenes y destinos independientes y Marítimo tiene POD. LCL requiere POD. La API valida que una opción esté autorizada para esa posición.

- `official_quote_locations`: entidades conocidas; mantiene IDs ya usados por solicitudes de prueba.
- `official_quote_location_usage`: relación aditiva (ubicación, embarque, posición).
- `OfficialQuotesVerifiedLocations.sql`: subconjunto de opciones **legibles y verificadas** en los videos del 21/10/2026. No representa el catálogo marítimo o aéreo exhaustivo; existen elementos ilegibles. No introducir otros nombres sin confirmarlos con la fuente.
- `OfficialQuotesDevelopmentLocations.sql`: opciones `DEV-*` ficticias para entornos de desarrollo. No usar en producción.

Las consultas del nuevo wizard usan `kind`, `shipmentType` y `routeRole`. La API valida la selección contra la relación; no basta inventar un UUID de ubicación.

## Pendientes de publicación

Confirmar exhaustivamente origen y destino de Marítimo FCL y LCL; catálogo Aéreo LCL hasta la letra B; POD FCL y LCL y compatibilidad con lugares interiores. Solo publicar en producción tras verificación humana y respaldo de base. Ninguno de estos scripts debe eliminar registros previos.
