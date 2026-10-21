# Despliegue seguro y reversible de cotizaciones oficiales

## Requisitos
- No hacer merge directo a `main` hasta que pase la compilación, verificación manual y catálogo oficial.
- **No borrar volúmenes**, ni ejecutar `docker compose down -v`. Respaldar PostgreSQL antes de modificar esquemas.
- El schema en `backend/Database/OfficialQuotesSchema.sql` es **aditivo e idempotente** (CREATE TABLE/INDEX IF NOT EXISTS). No modifica tablas antiguas; aplicarlo con una herramienta de migración bajo control operativo, verificando previamente las dependencias `public.clientes`, `public.usuarios` y `gen_random_uuid()`.
- El script `OfficialQuotesDevelopmentLocations.sql` contiene exclusivamente lugares de PRUEBA y **no debe ejecutarse fuera de desarrollo**. No constituye un catálogo oficial.
- La activación de `/cotizaciones` se controla con `VITE_OFFICIAL_QUOTES_ENABLED` al **compilar el frontend**: `true` presenta el wizard oficial, cualquier otro valor presenta el cotizador heredado V2. En Docker local se activa de forma predeterminada. En producción, su valor por omisión es desactivado.
- `/cotizaciones/nuevo` permanece como ruta directa de pruebas del wizard nuevo; antes de exponerlo en producción debe verificarse que el despliegue y catálogo sean aptos.
- `/api/quotes` (V2) se conserva íntegro. La captura nueva utiliza `/api/quotes/official`.
- Los administradores autenticados pueden ver/gestionar solicitudes; solo el permiso explícito `official_quote_permissions.can_authorize` permite autorizar. **Autorizar no equivale a enviar a Dhole**.

## Checklist obligatorio
1. Confirmar que la rama está al día con `main`, ejecutar `npm ci && npm run build` en `frontend`, `dotnet build` en `backend` y pruebas de integración.
2. Ejecutar migración SQL aditiva bajo transacción controlada, fuera del proceso de arranque en producción, tras respaldo.
3. Cargar el catálogo real validado, diferenciando las listas cuando proceda (POL, POE, POD, modalidades).
4. Probar las cinco modalidades: marítimo FCL/LCL, aéreo LCL, terrestre FTL/LTL, con servicios vacíos (rechazado), solo entrega (dirección obligatoria), solo recolección (dirección obligatoria), solo almacenamiento (días obligatorios) y combinaciones.
5. Comprobar ambos temas visuales y responsive; asegurar el acceso de usuarios administrativos, aislamiento entre clientes, historial y autorización restringida.
6. Desplegar primero con `VITE_OFFICIAL_QUOTES_ENABLED=false` y activar `true` solo tras comprobaciones de producción. Recordar que la flag es de compilación de Vite y debe reconstruirse el frontend.

## Reversión
Reconstruir frontend con `VITE_OFFICIAL_QUOTES_ENABLED=false` para devolver la ruta principal al formulario V2. **No borrar tablas nuevas ni solicitudes creadas**. Conservar cualquier copia y auditar las solicitudes nuevas antes de continuar.
