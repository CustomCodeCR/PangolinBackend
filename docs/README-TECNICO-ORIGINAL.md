# Castro Fallas Mini Quote

Proyecto didáctico pequeño que implementa **un único flujo real de la web de Grupo Castro Fallas: solicitar una cotización logística**.

## Tecnologías

- **Vue 3 + TypeScript**: formulario web y visualización del resultado.
- **ASP.NET Core / .NET 10 + C#**: API y reglas del proceso.
- **PostgreSQL 16**: fuente de verdad de las solicitudes.
- **Redis**: caché temporal de cada solicitud durante 10 minutos.
- **MongoDB**: registro documental del evento `QuoteCreated`.
- **Nginx**: sirve el frontend y redirige `/api/*` al backend.
- **Docker Compose**: levanta todo el entorno.

## Flujo

```text
Usuario
  │
  ▼
Vue 3 + TypeScript
  │ POST /api/quotes
  ▼
.NET 10 API
  │
  ├── PostgreSQL 16 → guarda la solicitud
  ├── Redis         → cachea quote:{id} por 10 minutos
  └── MongoDB       → registra QuoteCreated
  │
  ▼
Respuesta HTTP 201
  │
  ▼
Vue muestra ID + estado Received
```

Al presionar **Consultar nuevamente**:

```text
GET /api/quotes/{id}
        │
        ▼
      Redis
        │
   existe ─────► respuesta rápida
        │
      no
        ▼
   PostgreSQL
        │
        └──────► repuebla Redis
```

El backend agrega el header `X-Data-Source: redis|postgres` para que sea fácil demostrar de dónde salió la lectura.

## Ejecutar con Docker

Requisito: Docker + Docker Compose.

```bash
docker compose up -d --build
```

Abrir:

- Web: http://localhost:8080
- API: http://localhost:5000/api/health

Para apagar:

```bash
docker compose down
```

Para borrar también las bases de datos de la demo:

```bash
docker compose down -v
```

## Endpoints

### Crear solicitud

`POST /api/quotes`

```json
{
  "serviceType": "Maritime",
  "origin": "Shanghai, China",
  "destination": "Puerto Caldera, Costa Rica",
  "cargoType": "General cargo",
  "weightKg": 15000,
  "pieces": 1,
  "notes": "1 x 40HC"
}
```

### Consultar solicitud

`GET /api/quotes/{id}`

### Health check

`GET /api/health`

## Qué observar para explicar el proyecto

1. **Vue** captura la información del usuario.
2. **TypeScript** define tipos y controla el comportamiento del formulario.
3. **HTTP/JSON** transporta la solicitud hacia la API.
4. **C#/.NET 10** valida y coordina el flujo.
5. **PostgreSQL** conserva el dato importante de manera relacional.
6. **Redis** acelera lecturas repetidas.
7. **MongoDB** conserva un evento flexible en forma de documento.
8. **Docker** permite que todos los componentes se ejecuten juntos sin instalarlos manualmente en la máquina.

## Alcance intencional

Esta demo no implementa autenticación, Dhole Pricing, correo, archivos ni un cotizador real. La solicitud termina en estado `Received`. Está hecha así a propósito para que el flujo pueda estudiarse sin convertir el ejemplo en un sistema completo.
