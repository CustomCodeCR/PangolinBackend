# CRUD administrativo de itinerarios: contrato para frontend

El backend implementa esta API, **sin añadir interfaces Vue**.

## Roles y autenticación

El OTP emite una cookie JWT **HttpOnly** llamada cf_session; el navegador la envía con credentials: "same-origin". Consultar GET /api/auth/me para obtener role (admin/client). No leer ni almacenar el JWT en localStorage, ni confiar en que esconder botones Vue sea un control de acceso.

- **admin** (usuarios.tipo_acceso = usuario): lectura, alta, edición y eliminación.
- **client** (usuarios.tipo_acceso = cliente): solo lectura.
- **invitado**: sin acceso.
- JWT validado por firma, emisor, caducidad, rol **y sesión activa en PostgreSQL**.
- Los itinerarios son globales a public.itinerarios, **no** están segmentados por cliente. Revisar quién tiene rol admin.

## Endpoints

| Método | Ruta | Acceso | Éxito |
| --- | --- | --- | --- |
| GET | /api/itinerarios | client/admin | 200 página filtrada |
| GET | /api/itinerarios/{id} | client/admin | 200 registro completo |
| POST | /api/admin/itinerarios | admin | 201 registro + Location |
| PUT | /api/admin/itinerarios/{id} | admin | 200 registro actualizado |
| DELETE | /api/admin/itinerarios/{id} | admin | 204 vacío |

Error 400 para JSON inválido o violaciones de campos, 401 sin sesión, 403 rol insuficiente, 404 id inexistente, 409 borrado concurrente detectado, 500 error inesperado con traceId.

El **GET de listado existente no cambia**: filtros pol, pod, status, transporte, modalidad; closing/etd/eta exactos; closingDesde/Hasta, etdDesde/Hasta, etaDesde/Hasta inclusivos; page (>= 1), pageSize (1–100, defecto 20). Devuelve un objeto con items, total, page, pageSize, totalPages. Los items del listado incluyen id, pol, pod, closing, etd, eta, status, transport, modality. Para carrier/vessel/voyage usar GET individual.

## JSON de POST y PUT

PUT es reemplazo completo (no PATCH); enviar todas las propiedades requeridas.

~~~json
{
  "pol": "Caldera",
  "pod": "Miami",
  "closing": "2026-10-19",
  "etd": "2026-10-20",
  "eta": "2026-10-27",
  "status": "planning",
  "transport": "maritime",
  "modality": "FCL",
  "carrier": "Naviera Ejemplo",
  "vessel": "Buque Ejemplo",
  "voyage": "V-102"
}
~~~

Validaciones:

- pol, pod: texto obligatorio no vacío, máximo 150 caracteres.
- etd, eta: fechas obligatorias YYYY-MM-DD, eta igual o posterior a etd.
- closing: opcional, YYYY-MM-DD o null; si existe no debe ser posterior a etd.
- status: planning, transit, delivered, delayed.
- transport: maritime o ground.
- modality: maritime solo FCL/LCL; ground solo LTL.
- carrier, vessel: null u opcionales, máximo 150 caracteres; voyage máximo 50.
- Campos de texto se recortan; status/transport se convierten a minúsculas y modality a mayúsculas. Opcionales vacíos se guardan como null.
- El servidor crea id (UUID) y createdAt (fecha UTC). No se pueden modificar por PUT.

Ejemplo de 201 o 200:

~~~json
{
  "id": "00112233-4455-6677-8899-aabbccddeeff",
  "pol": "Caldera",
  "pod": "Miami",
  "closing": "2026-10-19",
  "etd": "2026-10-20",
  "eta": "2026-10-27",
  "status": "planning",
  "transport": "maritime",
  "modality": "FCL",
  "carrier": "Naviera Ejemplo",
  "vessel": "Buque Ejemplo",
  "voyage": "V-102",
  "createdAt": "2026-10-15T17:00:00Z"
}
~~~

Un error de validación devuelve 400 application/problem+json con mapa errors, por ejemplo:

~~~json
{
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {"eta": ["ETA no puede ser anterior a ETD."]}
}
~~~

## Ejemplo mínimo de frontend

~~~ts
const authResponse = await fetch('/api/auth/me', { credentials: 'same-origin' })
const auth = authResponse.ok ? await authResponse.json() : null
const canEdit = auth?.role === 'admin' // visibilidad UI, no autorización real

async function createItinerario(payload: unknown) {
  const r = await fetch('/api/admin/itinerarios', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  if (!r.ok) throw await r.json()
  return r.json()
}
~~~

Para actualizar usar PUT con el mismo cuerpo y el UUID en la ruta. Para eliminar usar DELETE y **no** llamar response.json() después de un 204. Tras cambios, refrescar el listado.

## Base de datos / pruebas

El SQL idempotente backend/Database/AuthSchema.sql añade status VARCHAR(20) NOT NULL DEFAULT 'planning' incluso en tablas anteriores; preserva filas. En Docker Development__ApplySchema=true lo ejecuta el backend en cada inicio. **En producción debe aplicarse manualmente tras respaldar la base.** GET /api/health/ready ahora comprueba columnas de itinerarios.

Prueba únicamente con base DEMO, LocalOutbox y usuarios de SeedLocal.sql:

~~~powershell
docker compose up -d --build
docker compose exec postgres psql -U postgres -d login -f /tmp/SeedLocal.sql
python scripts/smoke-local.py
~~~

El script prueba OTP/JWT, admin CRUD, consulta paginada, campos inválidos, denegaciones 401/403, JWT manipulado y logout. El itinerario de prueba se elimina al terminar o en un bloque finally. **Pendiente ejecutar en un entorno con .NET 10 y PostgreSQL antes de fusionar.**
