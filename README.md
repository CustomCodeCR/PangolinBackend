# Castro Fallas — Rediseño 8 + Docker GitHub

Esta entrega es la fusión de **`castrofallas-rediseno 8.zip` (interfaz principal)** con **`castrofallas-unificado-actualizado (2).zip` (API, autenticación, PostgreSQL y Docker)**. Está pensada para desarrollo local, **no** para producción directamente.

## Contenido de la integración

- Frontend Vue 3 + Vite: se conservan los estilos y cambios recientes de la entrega 8, incluidos navegación, modo invitado, noticias, servicios, itinerarios, cotizador, traducciones ES/EN, modo oscuro e imágenes.
- Autenticación en .NET 10: OTP con correo SMTP o LocalOutbox según `.env`, cookie HTTP-only, `/api/auth/me`, `/api/auth/logout`, rate limiting y sesiones en PostgreSQL.
- El menú nuevo usa el servidor para comprobar sesión. El ícono de usuario sirve para cerrar sesión; el modo invitado solo modifica la navegación **pública**, nunca otorga permiso para cotizar.
- `/cotizaciones` comprueba la sesión y `POST /api/quotes` exige autenticación también en el servidor. Los registros quedan en `login.quote_requests`, vinculados a cliente/usuario.
- PostgreSQL `login` almacena `clientes`, `usuarios`, OTP, sesiones y cotizaciones. Redis y MongoDB son opcionales/auxiliares para caché y auditoría.
- Se incorpora al esquema de desarrollo la tabla provisional `public.itinerarios` con `pol`, `pod`, `closing`, `etd`, `eta`, `carrier`, `vessel`, `voyage`, `transporte`, `modalidad`, `id`, `created_at`. **La página de itinerarios todavía no guarda datos mediante la API**. El SQL es idempotente y preserva una tabla existente, añadiendo `closing` si falta.

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

**No ejecutes `docker compose down -v`**, porque puede destruir los datos de los volúmenes con nombre. El mismo `name: castrofallas` en Compose permite reutilizar esos volúmenes al usar la misma instalación de Docker.

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
- Itinerarios: la pantalla consulta `GET /api/itinerarios` con sesión cliente/admin válida; no hay endpoint para crear o editar. La API admite rangos inclusivos `closingDesde`/`closingHasta`, `etdDesde`/`etdHasta`, `etaDesde`/`etaHasta` y conserva los parámetros de fecha exacta `closing`, `etd` y `eta`. Para paginar se envían `page` (desde 1) y `pageSize` (1–100, por defecto 20); la respuesta es `{ items, total, page, pageSize, totalPages }`, ordenada por ETD e ID. Los rangos invertidos y páginas inválidas producen HTTP 400.
- Tracking y noticias: interfaz visual, no conexión a un sistema de seguimiento o feed de noticias real.
- Esta entrega **no** incluye credenciales privadas, secretos, bases de datos locales ni archivos generados de `node_modules`.

Más detalles técnicos en `INTEGRACION.md`. La interfaz requiere verificar licencia de la librería `3d-world-map` antes de publicarla comercialmente.
