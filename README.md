# Castro Fallas — Rediseño 8 + Docker GitHub

Esta entrega es la fusión de **`castrofallas-rediseno 8.zip` (interfaz principal)** con **`castrofallas-unificado-actualizado (2).zip` (API, autenticación, PostgreSQL y Docker)**. Está pensada para desarrollo local, **no** para producción directamente.

## Contenido de la integración

- Frontend Vue 3 + Vite: se conservan los estilos y cambios recientes de la entrega 8, incluidos navegación, modo invitado, noticias, servicios, itinerarios, cotizador, traducciones ES/EN, modo oscuro e imágenes.
- Autenticación en .NET 10: OTP con correo SMTP o LocalOutbox según `.env`, cookie HTTP-only, `/api/auth/me`, `/api/auth/logout`, rate limiting y sesiones en PostgreSQL.
- El menú nuevo usa el servidor para comprobar sesión. El ícono de usuario sirve para cerrar sesión; el modo invitado solo modifica la navegación **pública**, nunca otorga permiso para cotizar.
- `/cotizaciones` comprueba la sesión y `POST /api/quotes` exige autenticación también en el servidor. Los registros quedan en `login.quote_requests`, vinculados a cliente/usuario.
- PostgreSQL `login` almacena `clientes`, `usuarios`, OTP, sesiones y cotizaciones. Redis y MongoDB son opcionales/auxiliares para caché y auditoría.
- GIO orienta sobre Grupo Castro Fallas, rutas públicas y conceptos de logística en ES/EN. Usa Groq Free en el backend, con cuota conservadora y respuestas locales al fallar la IA; nunca consulta información privada.
- Se incorpora al esquema de desarrollo la tabla provisional `public.itinerarios` con `pol`, `pod`, `closing`, `etd`, `eta`, `carrier`, `vessel`, `voyage`, `transporte`, `modalidad`, `id`, `created_at`. El backend incluye consulta y CRUD de itinerarios; la vista pública y la gestión visual del frontend siguen usando el flujo local hasta conectar esas pantallas con los endpoints. El SQL es idempotente y preserva una tabla existente, añadiendo `closing` si falta.

## Actualizar una instalación de Docker existente en Windows

1. **Respaldá tu base de datos** antes de actualizar (especialmente si ya contiene usuarios, OTP, itinerarios o cotizaciones).
2. Extraé este ZIP en una **carpeta nueva**. Si ya tenías una configuración SMTP/Gmail funcionando en el proyecto anterior, **copiá tu `.env` anterior en la carpeta nueva** antes de iniciar contenedores. Este ZIP omite `.env` a propósito. No difundás su contenido.
3. Si es primera instalación y no existe `.env`, abrí PowerShell en la carpeta nueva y ejecutá:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\setup-docker.ps1
```

> El script **no modifica** `.env` si ya existe. Si lo generás de cero, el modo de correo inicial es `LocalOutbox`. Para enviar OTP de verdad, conservá o configurá tus variables `EMAIL_MODE=Smtp` y `SMTP_*` de Gmail en tu propio `.env`. **No cambies** `POSTGRES_PASSWORD` sobre una base de datos ya inicializada.

4. Levantá la actualización (renueva solo los volúmenes **anónimos** de dependencias; los volúmenes **con nombre** de PostgreSQL/Redis/Mongo se conservan):

```powershell
docker compose up -d --build --force-recreate --renew-anon-volumes
docker compose ps
curl.exe -i http://127.0.0.1:5000/api/health/ready
```

5. Abrí **http://127.0.0.1:5173**. Si hay error de login, revisá `docker compose logs --tail=100 backend`, **sin compartir secretos ni códigos OTP**.

### Activar respuestas de IA en GIO

1. Creá una API key de Groq en https://console.groq.com/keys y guardala SOLO en tu `.env` privado como `GROQ_API_KEY=...` y `GROQ_MODEL=openai/gpt-oss-20b`. No la pongás en el frontend ni en GitHub.
2. Recreá el backend para cargar la configuración: `docker compose up -d --build backend`.
3. Vite reenvía `/api/assistant/chat` al backend; por eso funciona desde localhost y desde la IP de red mientras ambos usen ese mismo servidor.

Si ejecutás el backend directamente con .NET, guardá la llave con `dotnet user-secrets set --project backend/CastroFallas.MiniQuote.Api.csproj "Ai:Groq:ApiKey" "TU_API_KEY"` y reiniciá el backend. Sin llave o sin backend disponible, GIO muestra orientación local y avisa que no pudo consultar la IA. Las consultas de IA se procesan en Groq. No ingresés datos confidenciales ni OTP. Límites por instancia: 3 consultas/minuto y 70/día (además de 5/minuto por IP); los límites de tokens del proveedor se aplican aparte.

**No ejecutes `docker compose down -v`**, porque puede destruir los datos de los volúmenes con nombre. El mismo `name: castrofallas` en Compose permite reutilizar esos volúmenes al usar la misma instalación de Docker.

## Contratos incorporados desde GitHub

- JWT OTP y roles: `docs/JWT-OTP-ROLES.md`.
- CRUD administrativo de itinerarios: `docs/ITINERARIOS-CRUD-ADMIN.md`.
- Integración de frontend y WebSockets: `frontend/INSTRUCCIONES_INTEGRACION.md` y `frontend/docs/CONTRATO_WEBSOCKETS.md`.

## Verificaciones

```powershell
python scripts/verify-integration.py
cd frontend
npm ci
npm run build
cd ..
```

Con Docker corriendo, el script `python scripts/smoke-local.py` comprueba un flujo de login OTP **con LocalOutbox**, usando datos ficticios sembrados con `docker compose exec postgres psql -U postgres -d login -f /tmp/SeedLocal.sql`. **No ejecutar el smoke de LocalOutbox contra una configuración SMTP real** sin adaptar el procedimiento.

## Estado funcional y límites

- Cotizador: integración del guardado a PostgreSQL, sujeta a que Docker/backend/DB estén funcionando.
- Contacto rápido: abre un `mailto:`, no almacena en PostgreSQL.
- Itinerarios: el backend ofrece consulta para clientes y CRUD administrativo con JWT. La pantalla personalizada del frontend todavía muestra sus datos locales; la conexión de esa interfaz con el CRUD queda pendiente.
- Tracking: consulta registros PostgreSQL expresamente autorizados para visualización pública; el globo sigue siendo ilustrativo y no hay GPS en vivo. La muestra ficticia solo se carga en Development. Noticias: contenido gestionado por CMS.
- Esta entrega **no** incluye credenciales privadas, secretos, bases de datos locales ni archivos generados de `node_modules`.

Más detalles técnicos en `INTEGRACION.md`. La interfaz requiere verificar licencia de la librería `3d-world-map` antes de publicarla comercialmente.

## Cotizaciones estructuradas por modalidad (propuesta en rama)

La API recibe solicitudes autenticadas de clientes y guarda las cotizaciones en `quote_requests`, `quote_contacts` y **cuatro tablas de detalle separadas**: `quote_land_details`, `quote_air_details`, `quote_maritime_details` y `quote_multimodal_details`. No se ofrecen rutas de edición ni borrado; la base de datos conserva cotizaciones históricas. El frontend usa JSON estructurado y ya no inventa `weightKg = 1`.

Contrato, migración y pruebas: [docs/COTIZACIONES-ESQUEMA-V2.md](docs/COTIZACIONES-ESQUEMA-V2.md).

## Integración de login y administración (rama de correcciones)

El login nuevo solicita **solo correo registrado**, y el backend deduce el rol desde `usuarios.tipo_acceso` (`cliente` -> `client`, `usuario` -> `admin`). Se admiten cuentas empresariales, no solo Gmail. La web mantiene OTP por SMTP o LocalOutbox en Development y JWT revocable HttpOnly. Los cuatro tipos de cotización de PR #6 y el CRUD de itinerarios PR #5 se conservan. La opción multimodal vuelve a la nueva interfaz.

En el panel de administración, usuarios, noticias y multimedia se gestionan mediante API protegida y persistencia PostgreSQL. El contenido publicado se muestra en la página Noticias desde `GET /api/content/news`. La previsualización de desarrollo no otorga permisos del servidor. Guía detallada y pruebas: [docs/INTEGRACION-LOGIN-ADMIN-2026.md](docs/INTEGRACION-LOGIN-ADMIN-2026.md).

**Requiere ejecutar y validar migración en base de pruebas antes de fusionar.** El SQL es aditivo y no borra cotizaciones existentes. Nunca usar `docker compose down -v` para actualizar.
