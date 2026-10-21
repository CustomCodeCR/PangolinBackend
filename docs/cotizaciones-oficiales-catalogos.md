# Catálogos de rutas por modalidad y posición

Cada modalidad tiene orígenes y destinos independientes y Marítimo tiene POD. LCL requiere POD. La API valida que una opción esté autorizada para esa posición.

- `official_quote_locations`: entidades conocidas; mantiene IDs ya usados por solicitudes de prueba.
- `official_quote_location_usage`: relación aditiva (ubicación, embarque, posición).
- `OfficialQuotesVerifiedLocations.sql`: subconjunto de opciones **legibles y verificadas** en los videos del 21/10/2026. No representa el catálogo marítimo o aéreo exhaustivo; existen elementos ilegibles. No introducir otros nombres sin confirmarlos con la fuente.
- `OfficialQuotesDevelopmentLocations.sql`: opciones `DEV-*` ficticias para entornos de desarrollo. No usar en producción.

Las consultas del nuevo wizard usan `kind`, `shipmentType` y `routeRole`. La API valida la selección contra la relación; no basta inventar un UUID de ubicación.

## Pendientes de publicación

Confirmar exhaustivamente origen y destino de Marítimo FCL y LCL; catálogo Aéreo LCL hasta la letra B; POD FCL y LCL y compatibilidad con lugares interiores. Solo publicar en producción tras verificación humana y respaldo de base. Ninguno de estos scripts debe eliminar registros previos.

## Ubicaciones terrestres verificadas
El script de verificación carga 13 lugares terrestres legibles del video en desarrollo para FTL y LTL. Se ejecuta después de aplicar el esquema y los lugares ficticios; no borra esos lugares ni las solicitudes que los usan. No se presume haber completado con ello las listas marítimas o aéreas.

## Actualización de catálogos desde grabaciones (21/10/2026)
El script `OfficialQuotesVideoLocations.sql` añade 217 ubicaciones distintivas verificadas visualmente: 78 orígenes marítimos legibles, 80 destinos marítimos legibles, 17 opciones POD y 75 lugares aéreos; algunos nombres se reutilizan entre roles. Las listas marítimas y aéreas **son parciales** según el recorrido disponible; en aéreo solo se llega hasta B. No se autoprovisionan en producción.

El script debe ejecutarse **después** del esquema base y de `OfficialQuotesVerifiedLocations.sql`. Las ubicaciones de origen/destino marítimos comparten tipos FCL/LCL únicamente cuando la grabación las muestra en ambos; el puerto Cortés aparece en el POE de LCL. El POD usa ubicaciones `inland` y se asigna a FCL y LCL. La API excluye ubicaciones ficticias `DEV-*` de listas con al menos una real.
