# Entrada principal híbrida de main-2 (desarrollo)

**Alcance:** únicamente Docker Compose local de **main-2**. No modifica producción ni la rama main. Nuxt 4 SSR sirve las páginas públicas; el Vue compilado original sirve las rutas privadas, con la API .NET compartida. Los dos orígenes se reúnen en Nginx.

| URL en la computadora anfitriona | Función |
| --- | --- |
| http://127.0.0.1:5173/ | Gateway híbrido principal al arrancar con el lanzador |
| http://127.0.0.1:8083/ | Gateway alternativo, idénticas rutas y servicios |
| http://127.0.0.1:5174/ | Vue/Vite original con recarga para desarrollo |
| http://127.0.0.1:8082/ | Vista Nuxt directa; no sirve rutas privadas |

Con `-BindIp 192.168.1.26` en Windows, las dos URLs del gateway serán `http://192.168.1.26:5173/` y `http://192.168.1.26:8083/`; Vite permanece limitado a localhost. La IP es solo un ejemplo: debe existir realmente en la PC. No uses `0.0.0.0` ni expongas estos puertos a Internet. Limita el acceso con el firewall a tu red de confianza.

## Primer uso desde Windows (PowerShell)

Desde la carpeta del repositorio, con Docker Desktop en ejecución y tu `.env` existente:

```powershell
git fetch origin
git switch main-2
git pull --ff-only origin main-2
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -Action up -BindIp 192.168.1.26
```

Para una vista únicamente local omite `-BindIp` (usa `127.0.0.1`).

Consultar estado de los servicios:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -Action status -BindIp 192.168.1.26
```

**Reversión segura:** si falla la nueva entrada, parar solo el gateway y devolver Vite a su puerto legacy (respetando los valores originales de `.env`):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -Action rollback -BindIp 192.168.1.26
```

Este procedimiento no elimina bases de datos, secretos, volúmenes ni contenedores de backend.

## macOS / Linux

```bash
bash scripts/start-main2-hybrid.sh up 127.0.0.1
bash scripts/start-main2-hybrid.sh status 127.0.0.1
bash scripts/start-main2-hybrid.sh rollback 127.0.0.1
```

Usa una IPv4 privada propia en el segundo argumento solo si necesitás compartir el gateway por LAN.

## Por qué se usa un lanzador

- `compose.yaml` **sigue igual**: `docker compose up` a secas mantiene Vite por defecto en 5173 para no romper a otros desarrolladores.
- El lanzador ejecuta el mismo proyecto `castrofallas` de Docker, pero aplica cuatro archivos Compose y mueve el puerto de host de Vite a 5174 antes de publicar 5173 en Nginx.
- Para actualizar instalaciones anteriores, recrea **solo los dos contenedores Nginx** con `--force-recreate --no-deps`. Cada uno publica un único puerto; esto evita el problema observado en Docker Desktop Windows con dos publicaciones al mismo puerto interno. Comprueba las publicaciones reales de 5173 y 8083. No borra datos.
- `compose.main2-hybrid.yaml` añade un servicio Nginx separado `nuxt-main2-gateway` para 5173; `nuxt-local-gateway` sigue usando 8083. Comparten exactamente el mismo Nginx y conectan a los mismos Nuxt, Vue y backend. No duplican bases de datos ni sesiones.
- El backend y los volúmenes de PostgreSQL/Redis/Mongo no se recrean desde cero ni se borran. Nunca uses `docker compose down -v`.
- Si alguien usa comandos Compose manuales después del arranque, debe mantener las mismas variables y los cuatro `-f`. Lo más sencillo es usar los comandos `-Action status` y `-Action rollback` del lanzador.
- Las rutas /administracion, /tracking, /cotizaciones, /itinerario y /bienvenidos siguen en Vue por diseño. El 8082 directo entrega 404 en esas rutas.

## Checklist antes de considerarlo acceso principal del equipo

1. `/servicios/transporte-maritimo` en 5173 y 8083 debe mostrar HTML SSR, imágenes y FAQ.
2. Login / OTP, cotizaciones, tracking y edición de itinerarios deben conservar sesión y permisos reales en 5173.
3. Revisar menú y logo en escritorio y móvil, claro/oscuro, en Chrome, Safari y Edge si aplica.
4. Una PC distinta en la misma LAN debe abrir `http://IP_DEL_ANFITRION:5173/` si el firewall habilita solo la red privada. Si no abre, revisar IP, adaptador, firewall, Docker Desktop y que las PC estén en la misma LAN.
5. Ejecutar `bash scripts/test-nuxt-local-gateway.sh` en entorno CI con Chrome, junto a `python3 scripts/test-main2-hybrid-compose.py`.
6. Comprobar la reversión sin alterar los volúmenes de datos.

La dirección 5173 es la **entrada recomendada de desarrollo main-2 mediante el lanzador**. No se ha sustituido ni desplegado el gateway HTTPS de `www.logisticacastrofallas.com`.
