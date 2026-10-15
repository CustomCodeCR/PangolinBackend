# Cotizaciones v2: una tabla por modalidad

Esta propuesta conserva `public.quote_requests` y sus cotizaciones anteriores. **No ejecutar contra una base real sin respaldo previo**. Se añade `quote_contacts` y cuatro tablas de detalle **independientes**:

| Servicio | Tabla | Detalle |
|---|---|---|
| Land | `quote_land_details` | FTL/LTL, equipo, seguro, tipo de cliente |
| Air | `quote_air_details` | Operación, Incoterm, nacionalización, descripción, equipo, cantidad, mercancía peligrosa, detalles |
| Maritime | `quote_maritime_details` | Operación, Incoterm, nacionalización, FCL/LCL, contenedor, descripción, cantidad, mercancía peligrosa, detalles |
| Multimodal | `quote_multimodal_details` | Operación, Incoterm, nacionalización, país de entrada, contenedor, descripción, cantidad, mercancía peligrosa, detalles |

Cada tabla tiene una fila por solicitud y `quote_id` es a la vez PK y FK hacia `quote_requests("Id")`. Las filas históricas no se rellenan artificialmente; su contacto y detalle pueden ser `null` al consultar. `WeightKg` y `Pieces` pasan a ser opcionales en la tabla madre. El peso real solo se guarda si lo aporta el usuario; no se utiliza 1 kg ficticio. `quote_requests` conserva los nombres de columnas existentes, `ClienteId`, `UsuarioId`, `ServiceType` y `CargoType` para preservar compatibilidad.

## Flujo y permisos

1. El cliente inicia sesión mediante OTP y cookie JWT HttpOnly.
2. Vue envía `POST /api/quotes`, con un `contact` y **un único** objeto de detalle del tipo correspondiente.
3. .NET obtiene el cliente y usuario de la sesión; ignora cualquier `clienteId` que pudiera mandar el navegador.
4. EF Core valida e inserta encabezado, contacto y detalle en una transacción PostgreSQL.
5. `GET /api/quotes/{id}` exige sesión y solo devuelve datos si `ClienteId` pertenece a la misma empresa; `GET /api/quotes/mine?page=1&pageSize=20` lista únicamente solicitudes de esa empresa.

**No existen PUT, PATCH ni DELETE para cotizaciones**. `POST /api/quotes` y `GET /api/quotes/mine` requieren rol `client`; la consulta puntual conserva `registered` y control por empresa. Una cuenta admin no puede generar una cotización como cliente en esta versión. El estado inicial es `Received`.

## Contrato HTTP

`POST /api/quotes` devuelve `201 Created` y `Location: /api/quotes/{id}`. Los nombres JSON se envían en camelCase.

### Terrestre

```json
{
  "serviceType": "Land",
  "origin": "Costa Rica",
  "destination": "Panamá",
  "weightKg": null,
  "contact": {
    "fullName": "Cliente de prueba",
    "company": "Empresa Demo",
    "email": "demo.cliente@castrofallas.test",
    "phone": "8888-8888",
    "country": "Costa Rica"
  },
  "land": {
    "transportKind": "FTL",
    "equipment": "Furgón",
    "insured": false,
    "customerType": "Empresa"
  }
}
```

### Aéreo

```json
{
  "serviceType": "Air",
  "origin": "Estados Unidos",
  "destination": "Costa Rica",
  "contact": {"fullName":"Cliente de prueba","company":"Empresa Demo","email":"demo.cliente@castrofallas.test","phone":"8888-8888","country":null},
  "air": {
    "operation":"Importación","incoterm":"FOB","nationalization":true,
    "description":"Equipo de prueba","equipmentType":"No aplica","quantity":2,
    "dangerousGoods":null,"additionalDetails":null
  }
}
```

### Marítimo

```json
{
  "serviceType": "Maritime",
  "origin": "China",
  "destination": "Costa Rica",
  "contact": {"fullName":"Cliente de prueba","company":"Empresa Demo","email":"demo.cliente@castrofallas.test","phone":"8888-8888","country":null},
  "maritime": {
    "operation":"Importación","incoterm":"FOB","nationalization":false,
    "shippingType":"FCL","description":"Repuestos",
    "containerType":"40HC","quantity":2,
    "dangerousGoods":false,"additionalDetails":"Carga general"
  }
}
```

### Multimodal

```json
{
  "serviceType": "Multimodal",
  "origin": "Estados Unidos",
  "destination": "Costa Rica",
  "contact": {"fullName":"Cliente de prueba","company":"Empresa Demo","email":"demo.cliente@castrofallas.test","phone":"8888-8888","country":null},
  "multimodal": {
    "operation":"Importación","incoterm":"FOB","nationalization":true,
    "entryCountry":"Panamá","description":"Repuestos",
    "containerType":"40HC","quantity":2,
    "dangerousGoods":false,"additionalDetails":null
  }
}
```

Si los datos son inválidos, la API devuelve `400` con `error`; una sesión ausente devuelve `401`, y un admin intentando crear recibe `403`. Los datos no son visibles entre empresas, incluso si alguien conoce el UUID de otra cotización.

**Compatibilidad:** el endpoint aún acepta temporalmente el contrato anterior sin `contact` ni detalle, siempre que aporte `cargoType`, `weightKg > 0` y `pieces > 0`. Esto permite migrar consumidores antiguos de forma gradual. Las solicitudes nuevas del frontend ya utilizan el contrato estructurado.

## Migración y pruebas

En **desarrollo** y con `Development__ApplySchema=true`, el backend aplica automáticamente el SQL idempotente de `backend/Database/AuthSchema.sql`. En otros entornos la migración debe aplicarse explícitamente con respaldo y ventana de mantenimiento.

Desde PowerShell, con `main` o la rama de este PR revisada, PostgreSQL de pruebas y `EMAIL_MODE=LocalOutbox`:

```powershell
docker compose up -d --build --force-recreate
curl.exe -i http://127.0.0.1:5000/api/health/ready
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U postgres -d login -f /tmp/SeedLocal.sql
python scripts/smoke-local.py
```

El smoke test crea **cuatro cotizaciones de prueba reales** en PostgreSQL, una por tipo, y comprueba lectura, permisos y validaciones. No debe ejecutarse contra datos reales sin preparar un entorno aislado. Las cotizaciones de prueba se conservan para permitir inspección manual en DBeaver. No ejecutar `docker compose down -v`.

**Pendientes antes de producción:** revisión por equipo, prueba de compilación .NET/Vue, prueba del smoke con Docker y decisión futura sobre respuestas de Pricing. El formulario de contacto rápido aún abre `mailto:` y no registra una cotización.
