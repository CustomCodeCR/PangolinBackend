# Pangolin en AlmaLinux usando la infraestructura existente de Dhole

## Regla permanente
El servidor AlmaLinux NO recibe codigo fuente de Pangolin, Dockerfiles, `npm` o `dotnet`. GitHub Actions (runner `ubuntu-latest`) construye las imagenes frontend/backend y las publica en GHCR. El runner de servidor (`self-hosted, linux, x64, dhole`) solo descarga un archivo temporal de configuracion Compose, obtiene imagenes Docker, inicializa SQL desde la imagen de backend y ejecuta contenedores.

## Infraestructura identificada en Dhole
Archivo privado EXISTENTE: `/opt/dhole/.env`.
- PostgreSQL existente: `POSTGRES_HOST=postgres`, `POSTGRES_PORT=5432`, usuario admin `POSTGRES_USER` y contrasena `POSTGRES_PASSWORD`.
- Redis existente: `REDIS_CONNECTION_STRING=redis:6379`.
- Mongo existente: `MONGO_CONNECTION_STRING`, base separada `pangolin_logs`.
- MinIO existente: contenedor `minio`, `http://minio:9000` en la red Docker `dhole`.
- Traefik compartido, `DHOLE_NETWORK=dhole`, `TRAEFIK_ROUTER_PREFIX=prod`.
- Dominio actualmente usado por Fennec: `FENNEC_HOST`, `FENNEC_WWW_HOST` y `FENNEC_PUBLIC_URL`.

No se despliega otra instancia permanente de PostgreSQL ni de Redis. El workflow crea una base llamada **pangolin** en el PostgreSQL ya existente. Crea el rol PostgreSQL **pangolin**, propietario de esta base (sin privilegios sobre las bases Dhole), y establece un password nuevo e independiente. El esquema Pangolin utiliza tablas propias dentro de `pangolin`, no en `dhole_auth`, `dhole_pricing` ni otras DB. El puerto 5432 sigue siendo interno a Docker.

## Paso 1: agregar las variables Pangolin a /opt/dhole/.env
Abrir el archivo existente:
```bash
sudo cp -p /opt/dhole/.env /opt/dhole/.env.bak
sudo vim /opt/dhole/.env
```
Al FINAL del .env, pegar el anexo de [deploy/pangolin.env.example](../deploy/pangolin.env.example). No copiar las contrasenas de ejemplo a produccion.

Generar claves exclusivas Pangolin (NO compartir la salida ni subir los valores a GitHub):
```bash
openssl rand -hex 24    # PANGOLIN_POSTGRES_PASSWORD, 48 hex
openssl rand -hex 32    # PANGOLIN_AUTH_OTP_PEPPER, 64 hex
openssl rand -hex 32    # PANGOLIN_AUTH_JWT_SIGNING_KEY, 64 hex
```
Para el correo configurar `PANGOLIN_EMAIL_MODE=Graph` y `PANGOLIN_GRAPH_TENANT_ID`, `PANGOLIN_GRAPH_CLIENT_ID`, `PANGOLIN_GRAPH_CLIENT_SECRET`, `PANGOLIN_GRAPH_FROM`. Reutilizar el tenant de Microsoft 365 esta permitido si la aplicacion tiene consentimiento `Mail.Send` y permisos al buzon de salida; la clave de Graph que se expuso debe rotarse antes de instalar. No reutilizar claves JWT/Dhole ni SMTP de extraccion.

MinIO: si necesitas multimedia con persistencia S3, establecer `PANGOLIN_S3_ENDPOINT=http://minio:9000`, `PANGOLIN_S3_ACCESS_KEY`, `PANGOLIN_S3_SECRET_KEY` y un bucket existente/creado (`PANGOLIN_S3_BUCKET`). Usar usuario IAM de Pangolin y permiso de solo el bucket autorizado; **no usar MINIO_ROOT_USER / MINIO_ROOT_PASSWORD**. Si no esta configurado, dejar `PANGOLIN_S3_ENDPOINT` vacio para iniciar sin S3.

`PANGOLIN_TRAEFIK_ENABLED=false` al principio para conservar la pagina de Fennec hasta el corte.

El runner ya utiliza `/opt/dhole/.env` en otros servicios de Dhole, por tanto tiene que poder leer este archivo. Mantener permisos restringidos y nunca usar `cat` del entorno ni `docker compose config` sin `--quiet` en los logs.

## Paso 2: comprobar la infraestructura compartida
En AlmaLinux, solo para diagnosticar (sin mostrar secretos):
```bash
docker network inspect dhole >/dev/null
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E '(^NAMES|postgres|redis|minio|traefik)'
sudo ss -lntp | grep ':8180 ' || true
```
El runner necesita acceso a la red `dhole` y que los hosts `postgres`, `redis` y `minio` sean accesibles desde ella cuando se configuren sus funciones.

## Paso 3: GitHub Actions (backend, frontend y base)
Abrir [PangolinBackend Actions](https://github.com/CustomCodeCR/PangolinBackend/actions/workflows/pangolin-images.yml).
En `main`, el workflow publica imagenes:
- `ghcr.io/customcodecr/pangolinbackend/backend:sha-<commit>`
- `ghcr.io/customcodecr/pangolinbackend/frontend:sha-<commit>`

El trabajo de despliegue ejecuta:
1. Descarga **solo** `deploy/docker-compose.images.yml` como artefacto temporal; no hace checkout del codigo.
2. Comprueba variables Pangolin en el `/opt/dhole/.env` existente, sin imprimir secretos.
3. Comprueba que no haya dos routers para el mismo dominio.
4. Hace `docker pull` de frontend/backend y del cliente PostgreSQL temporal `postgres:16-alpine` si es necesario.
5. Conecta el contenedor cliente temporal a la red `dhole`, usa las credenciales admin **solo para crear** rol y DB cuando no existen; los siguientes despliegues NO destruyen la DB.
6. Ejecuta los esquemas SQL incluidos **dentro de la imagen** de backend, solo si la DB tiene esquema publico vacio. Usa una transaccion y rechaza bases parcialmente migradas.
7. Levanta las imagenes backend y frontend con `docker compose up -d --no-build --no-deps`.
8. Prueba `http://127.0.0.1:8180/api/health/ready`.

`main` tiene despliegue automatico al actualizar backend/frontend/deploy/workflow. Si faltan los secretos Pangolin en el .env, fallara el PRECHECK sin tocar la base ni detener Fennec. Tambien existe ejecucion manual con `deploy=true` e `image_tag` opcional para rollback.

## Paso 4: verificar antes del cambio Fennec -> Pangolin
```bash
docker ps --filter label=com.docker.compose.project=pangolin-production
curl -i http://127.0.0.1:8180/api/health/ready
curl -I http://127.0.0.1:8180/home/
```
Antes de abrir el dominio real verificar login OTP, correo Graph, permisos de usuarios, CMS (noticias/comentarios), cotizaciones e itinerarios, cookies Secure, SignalR y S3 si se configura. La UI localhost no equivale a una prueba completa HTTPS.

## Paso 5: publicar Pangolin en WWW sin interrumpir Fennec

Destino solicitado: `https://www.logisticacastrofallas.com` = Pangolin.
El dominio sin WWW (`https://logisticacastrofallas.com`) permanece en Fennec de momento.

1. El Compose incluye SOLO el router `prod-pangolin-www` y NO contiene un router Pangolin para el dominio raiz.
2. Su regla es `Host(\`www.logisticacastrofallas.com\`)`, con prioridad `1000`, mayor que la regla combinada raiz/www del router anterior de Fennec.
3. Ya no hay middleware que redirija WWW al dominio sin WWW.
4. El backend Pangolin valida `Security__PublicOrigin=https://www.logisticacastrofallas.com`, imprescindible para formularios y POST desde el nuevo host.
5. GitHub Actions activa Traefik para Pangolin usando `PANGOLIN_TRAEFIK_ENABLED=true` en su entorno de despliegue; NO exige editar ni exponer el .env. Se verifica el endpoint `/api/health/ready` tanto por `localhost:8180` como a traves del Traefik del servidor con cabecera `Host: www.logisticacastrofallas.com`.
6. Comprobar tambien el resultado externo de Cloudflare (DNS, HTTPS, reglas de redireccion o cache). Si hay una regla de Cloudflare `www -> apex`, quitarla para que WWW pueda llegar al router de Pangolin.

No es necesario detener Fennec, ni reiniciar Dhole, ni borrar datos para este corte solo de WWW. Evitar desplegar automaticamente Fennec al WWW despues del cambio; la prioridad 1000 impide que su regla combinada lo recupere mientras el router Pangolin este activo.

Si en el futuro se quiere reemplazar TAMBIEN el dominio raiz, se hara un cambio independiente con su propio control de riesgo.

## Recuperacion
- Para revertir solo WWW, deshabilitar el router Pangolin y verificar que Fennec vuelva a resolver tanto raiz como WWW. No eliminar ni reiniciar las bases.
- Para rollback del codigo (no de SQL), ejecutar Action con `image_tag=sha-<commit-previo>`.
- La base de datos `pangolin` es independiente, pero comparte servidor PostgreSQL: sigue siendo obligatorio hacer respaldos y vigilar recursos.
- El bucket S3, el correo y los catalogos oficiales no quedan validados solo porque el estado HTTP sea 200.
