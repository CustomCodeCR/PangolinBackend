# Rastreo de embarques de demostración

**Exclusivo de desarrollo.** No existe integración con transportistas ni GPS. Rutas, fechas, ubicaciones, estados y porcentajes son totalmente ficticios.

## Arquitectura

- Al iniciar el backend en Development con `Development:ApplySchema=true`, se aplica `backend/Database/TrackingDemoSchema.sql` de forma idempotente. No borra datos existentes.
- `GET /api/tracking/demo?type=BL&reference=BL-TEST-001` consulta PostgreSQL por tipo y referencia. Solo devuelve filas `is_demo=true`, aplica validación de entrada, `Cache-Control: no-store` y rate limit de 20/minuto por IP. En producción retorna 404.
- La sección `/tracking` muestra origen, destino, estado, ETD, ETA y progreso ilustrativo. En el globo se resalta la ruta con un arco y el punto interpolado, **nunca** una posición real.
- Ningún registro de prueba se vincula con clientes o cotizaciones reales. El globo de `/home` conserva su comportamiento original.

## Referencias ficticias

| Tipo | Referencia | Estado |
| --- | --- | --- |
| BL | BL-TEST-001 | En tránsito |
| HBL | HBL-TEST-002 | Llegó a destino |
| IDTRA | IDTRA-TEST-003 | Planificado |
| Contenedor | CONT-TEST-004 | Entregado |
| PO | PO-TEST-005 | En tránsito |

## QA antes de fusionar a main

1. Respaldar PostgreSQL de desarrollo y comprobar `git status --short` antes de cambiar de rama.
2. Construir .NET 10 y frontend Vue (`dotnet build` y `npm run build`).
3. Iniciar Docker conservando `.env` y los volúmenes con nombre; no ejecutar `docker compose down -v`.
4. Ejecutar `python scripts/smoke-tracking-demo.py` desde el host con backend en `http://127.0.0.1:5000`.
5. Buscar las cinco referencias en `/tracking` y verificar el cambio de arco, cámara y ficha, el botón «Ver ruta en el globo», modo oscuro y móvil.
6. Probar referencia desconocida, campo vacío, caracteres inválidos, red caída y cambios rápidos de referencia.
7. Confirmar que la ruta de demostración devuelve HTTP 404 en `Production`; nunca publicar rutas reales sin autenticación y autorización por cliente.

Este PR es una primera versión DEMO. No fusionar sin pruebas funcionales y una revisión de seguridad.
