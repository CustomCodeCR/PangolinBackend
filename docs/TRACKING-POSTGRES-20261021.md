# Búsqueda de embarques con PostgreSQL (fase 1)

## Alcance real
- La página `/tracking` consulta `GET /api/tracking/search?kind=BL&reference=...`.
- Compatible con BL, HBL, IDTRA, CONTAINER y PO. Se normaliza la referencia a mayúsculas y se permiten letras ASCII, números, barra, guion y guion bajo (longitud de 5 a 100).
- PostgreSQL es la fuente actual. No existe integración externa con Castro Fallas ni posición GPS en vivo. `source` admite `manual` y `external` para una futura integración gestionada en backend.
- Se muestran exclusivamente estado, origen, destino, ETA, última actualización y hasta 30 movimientos autorizados para divulgación. **No registrar aquí datos personales ni documentos confidenciales**.
- Los embarques solo aparecen si `is_public=true`. El valor por defecto es **false**. La empresa debe aprobar expresamente qué embarques y movimientos pueden quedar visibles al público. Un 404 cubre tanto referencias inexistentes como privadas.
- Límite por IP: 12 búsquedas/minuto. No se registra la referencia en logs de aplicación. La consulta lleva `Cache-Control: no-store`.
- Los registros con `is_demo=true` muestran una advertencia visible y nunca deben usarse como estado real.

## Archivos y despliegue
- Migración aditiva: `backend/Database/TrackingSchema.sql`. No modifica tablas de login, noticias, cotizaciones ni itinerarios.
- Ejemplo ficticio: `backend/Database/TrackingSeedDevelopment.sql`. **Solo se aplica automáticamente en Development cuando `Development:ApplySchema=true`**. Nunca en producción.
- Backend: `backend/Endpoints/ShipmentTrackingEndpoints.cs`, entidades en `backend/Models/ShipmentTracking.cs` y contexto EF.
- Antes de arrancar producción: respaldar PostgreSQL y ejecutar **solo** `TrackingSchema.sql` en la base `login` con cuenta administradora de migraciones. Comprobar /api/health/ready. No ejecutar la semilla demo en producción. No ejecutar `docker compose down -v`.

## Prueba local (PowerShell, en la raíz del repositorio)
```powershell
# Mantener .env privado y usar una DB exclusiva de desarrollo.
docker compose up -d --build
Invoke-RestMethod http://127.0.0.1:5000/api/health/ready
python scripts/verify-tracking-live.py
```
En `/tracking`, seleccionar **BL**, escribir **DEMO-BL-2026-001** y buscar. Se verá el estado 'En tránsito', un movimiento ficticio y la advertencia de simulación. Probar también referencia inexistente, entrada inválida, cambio de idioma y vista móvil.

## Crear un embarque real manualmente (solo después de autorización)
La siguiente estructura es un ejemplo **para DB de pruebas**, no un embarque real:
```sql
INSERT INTO public.shipment_tracking
(reference_kind, reference_normalized, status, origin, destination, is_public, is_demo, source)
VALUES ('IDTRA', 'PRUEBA-INTERNA-2026-002', 'registered',
        'Origen de prueba', 'Destino de prueba', FALSE, TRUE, 'manual');
```
Así el registro **no** es público. Para hacerlo visible habría que revisar que la información no sea confidencial y que exista una autorización de la empresa; solo entonces un administrador de datos puede cambiar `is_public` a true. No ofrecer una API de escrituras anónimas.

## Integración futura
La integración con el software actual de Castro Fallas debe ejecutarse desde backend con credenciales en secretos del servidor, sincronización idempotente por `(reference_kind, reference_normalized)`, auditoría, horarios de actualización, normalización de estados, manejo de errores y regla de aprobación para publicación. Antes de implementar hace falta conocer al proveedor, sus permisos y el contrato de API/exportación. Nunca enviar sus credenciales al navegador.

## Límites y decisiones antes de producción
- La autorización actual es **por registro**, no por usuario. No aprobar públicamente datos sensibles; para embarques privados construir una consulta autenticada con vínculo verificable al cliente o un código de acceso individual de alta entropía.
- Tras un reverse proxy, el limitador por IP necesita una configuración de proxy de confianza. Si toda la API observa la misma IP, la cuota se comparte entre visitantes. Nunca confiar ciegamente en `X-Forwarded-For`.
- Los datos de demostración se insertan solo en Development. Para producción primero migración, permisos, pruebas en staging y aprobación funcional del personal operativo.
