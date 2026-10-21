# Servicios y campos condicionales
- Transporte internacional se selecciona inicialmente, pero puede quitarse.
- Se requiere al menos un servicio, validado tanto en frontend como backend.
- Almacenamiento exige días de almacenaje fiscal.
- Transporte entrega exige dirección de entrega escrita manualmente.
- Transporte recolección exige dirección de recolección escrita manualmente.
- No hay mapas, cálculos ni costos.
- Los campos adicionales se conservan en form_json (JSONB). No requieren columnas nuevas ni modifican cotizaciones previas.
