# Transferencia operativa de Groq (GIO) y comprobación de MinIO

Fecha: 27/11/2026. Destinatario: TI de Grupo Castro Fallas, operador autorizado de Argos.

## Objetivo y alcance

Migrar las credenciales Groq a una cuenta de la empresa sin modificar el código, publicar imágenes, cambiar el modelo innecesariamente ni intervenir en Dhole. El correo de registro de Groq no se configura en Pangolin: el backend consume una API key y un identificador de modelo. Mientras no se cambie el entorno del contenedor, permanece la configuración anterior; esto no garantiza disponibilidad, cuota o vigencia de la cuenta personal. No conservar una dependencia personal indefinida. Acordar un responsable, una fecha de transferencia y una política de facturación/cuotas. Si alguna credencial se ha expuesto, coordinar su rotación prioritaria; no reutilizarla como mecanismo de recuperación.

Groq es compartido por AssistantService, NewsTranslationService y TrackingStatusTranslationService. Revisar las condiciones de tratamiento de datos y acceso a la organización Groq con TI. No enviar datos personales, OTP ni datos comerciales confidenciales en las pruebas. No modificar claves de Dhole, Graph, JWT, PostgreSQL o MinIO como parte de este cambio. Las otras credenciales expuestas requieren un proceso de rotación independiente.

## 1. Preparar la cuenta corporativa

1. TI crea o utiliza una organización Groq controlada por la empresa, con responsables corporativos y recuperación de acceso. Entrar en https://console.groq.com/keys y generar una clave dedicada a Pangolin producción; conservarla en el gestor de secretos autorizado. Una clave de desarrollo distinta es recomendable.
2. Confirmar en la consola que el modelo actualmente usado sigue disponible y permitido en la organización. El valor por defecto en Compose es `openai/gpt-oss-20b`; conservar el modelo efectivo si es compatible. Verificar límites y facturación según la cuenta.
3. Acordar ventana de mantenimiento: recrear el backend puede interrumpir brevemente peticiones, SignalR, sesiones activas o procesamiento de cotizaciones en curso. Evitar trabajos comerciales en curso y coordinar con el responsable del worker/outbox. No alterar ni reprocesar solicitudes ambiguas. No ejecutar en paralelo con otro despliegue, cambio de .env o mantenimiento compartido.
4. No revocar una clave anterior no expuesta hasta verificar la transición y confirmar que ningún otro consumidor autorizado depende de ella. Si está expuesta, TI debe revocarla/rotarla con prioridad y aceptar una posible indisponibilidad controlada; no prolongar su uso por comodidad.

## 2. Variables existentes (no crear una segunda configuración)

| Entorno | Clave | Modelo |
| --- | --- | --- |
| Desarrollo, .env local | GROQ_API_KEY | GROQ_MODEL |
| Argos, /opt/dhole/.env | PANGOLIN_GROQ_API_KEY | PANGOLIN_GROQ_MODEL |

Producción se configura con el anexo `deploy/pangolin.env.example`, no con el .env.example local. No copiar ninguno de los ejemplos completos sobre el .env real. No introducir una segunda clave ni fallback automático a la cuenta personal. El modelo no es un secreto, la API key sí. No poner claves en GitHub, navegador, comandos, capturas, logs ni mensajes.

## 3. Argos: preflight y sustitución (solo TI y con autorización)

Este procedimiento corresponde al despliegue GHCR documentado en .github/workflows/pangolin-images.yml. Usa la configuración ya instalada y el tag actual, no archivos de desarrollo ni el HEAD de GitHub. Si la arquitectura, ruta, proyecto o configuración real han cambiado, detenerse y adaptar con el operador. No ejecutar una Action de publicación ni un rollback de imagen para cambiar la clave.

Primero comprobar de solo lectura, en Argos:

```bash
sudo cat /home/actions-runner/pangolin-release/current-tag
sudo docker ps --filter label=com.docker.compose.project=pangolin-production \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
curl -fsS --max-time 15 http://127.0.0.1:8180/api/health/ready >/dev/null
```

Confirmar que el proyecto está saludable y que TI tiene acceso al gestor de secretos. Obtener una copia de recuperación **solo de los dos valores Groq anteriores** en el gestor autorizado, si aún es lícito y seguro utilizarlos. Si se requiere un respaldo del .env compartido, que sea privado, cifrado según política y de acceso exclusivo a TI; nunca restaurarlo completo para esta operación, pues podría revertir secretos/configuraciones de otros servicios.

Con el editor autorizado de secretos, o `sudoedit /opt/dhole/.env` si lo permite la política de TI, sustituir únicamente la línea PANGOLIN_GROQ_API_KEY por la nueva clave. Mantener una sola definición de cada variable y el modelo anterior, salvo cambio expresamente aprobado. No pegar valores en la terminal. Guardar conservando permisos/propietario. No usar source sobre .env ni imprimirlo. Si no es posible conservar el formato o no se conoce el estado anterior, detenerse.

### Aplicar al backend sin cambiar imagen

El siguiente bloque valida el Compose y compara su entorno de backend con el contenedor activo, sin mostrar valores. Si detecta diferencias distintas de las dos variables Groq, un tag distinto o una imagen local diferente, aborta: no aplicar otros cambios inadvertidamente. Requiere Bash, Python 3 y Docker Compose v2 con --pull never. Ejecutar únicamente tras autorización y edición anterior; no ejecutarlo como diagnóstico. La validación no elimina la necesidad de coordinación exclusiva con despliegues y otros operadores.

```bash
sudo env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin HOME=/root bash <<'BASH'
set -Eeuo pipefail
set +x
umask 077
release=/home/actions-runner/pangolin-release
envfile=/opt/dhole/.env
test -r "$envfile"
test -r "$release/docker-compose.images.yml"
test -r "$release/nuxt-hybrid-gateway.conf"
export PANGOLIN_IMAGE_TAG="$(cat "$release/current-tag")"
[[ "$PANGOLIN_IMAGE_TAG" =~ ^sha-[0-9a-f]{12}$ ]]
export DHOLE_NETWORK=dhole
export PANGOLIN_TRAEFIK_ENABLED=true
export PANGOLIN_GATEWAY_CONFIG_PATH="$release/nuxt-hybrid-gateway.conf"
dc=(docker compose --env-file "$envfile" -f "$release/docker-compose.images.yml" -p pangolin-production)
ids="$(docker ps -q --filter label=com.docker.compose.project=pangolin-production --filter label=com.docker.compose.service=backend)"
[[ "$ids" =~ ^[0-9a-f]+$ ]]
# No imprimir el Compose renderizado ni docker inspect del entorno.
# Python captura el stdout y stderr de los comandos con valores sensibles.
python3 - "$ids" <<'PY'
import json, os, re, subprocess, sys
def capture(args):
    return subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
try:
    release = "/home/actions-runner/pangolin-release"
    dc = ["docker", "compose", "--env-file", "/opt/dhole/.env",
          "-f", release + "/docker-compose.images.yml", "-p", "pangolin-production"]
    config = json.loads(capture(dc + ["config", "--format", "json"]))
    backend = config["services"]["backend"]
    old = json.loads(capture(["docker", "inspect", sys.argv[1]]))[0]
    expected = "ghcr.io/customcodecr/pangolinbackend/backend:" + os.environ["PANGOLIN_IMAGE_TAG"]
    if backend["image"] != expected or old["Config"]["Image"] != expected:
        raise ValueError("image mismatch")
    image = json.loads(capture(["docker", "image", "inspect", expected]))[0]
    if image["Id"] != old["Image"]:
        raise ValueError("local image ID mismatch")
    actual = dict(item.split("=", 1) for item in old["Config"]["Env"])
    proposed = backend["environment"]
    allowed = {"Ai__Groq__ApiKey", "Ai__Groq__Model"}
    # Compare the union against the effective image defaults. Do not discard
    # runtime-only environment overrides when recreating the container.
    defaults = dict(item.split("=", 1) for item in image["Config"].get("Env", []))
    target = {**defaults, **proposed}
    if any(actual.get(k) != target.get(k) for k in (actual.keys() | target.keys()) - allowed):
        raise ValueError("unrelated environment drift")
    key = proposed.get("Ai__Groq__ApiKey", "")
    if not isinstance(key, str) or not key.strip():
        raise ValueError("empty Groq key")
    if not proposed.get("Ai__Groq__Model"):
        raise ValueError("empty Groq model")
    if key == actual.get("Ai__Groq__ApiKey") and proposed.get("Ai__Groq__Model") == actual.get("Ai__Groq__Model"):
        raise ValueError("no change")
except Exception:
    sys.exit("ABORTADO: preflight de entorno/imagen no conforme; revisar en privado con TI.")
print("PASS: imagen existente y entorno ajeno a Groq sin diferencias.")
PY
# Confirmación operativa: la ventana exclusiva y el alcance deben estar aprobados.
"${dc[@]}" up -d --no-deps --no-build --pull never --force-recreate backend
docker ps --filter label=com.docker.compose.project=pangolin-production \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
BASH
```

Este bloque no modifica la configuración de otros servicios ni ejecuta migraciones intencionalmente (Compose de producción fija Development__ApplySchema=false). No usar `docker compose down`, `down -v`, ni `restart backend` como sustituto de la recreación: restart no carga variables nuevas. El preflight compara entorno e imagen, no certifica todas las opciones de runtime; TI debe verificar que el Compose instalado sigue siendo el de la release activa y que no hay overrides manuales. No ejecutar si no coincide.

## 4. Validación posterior

- Confirmar contenedor backend activo con el mismo tag, sin reinicios repetidos. Verificar readiness por el gateway local (8180) y páginas públicas por HTTPS. Si aparece un 502 persistente, verificar DNS/upstreams: el Nginx legacy puede conservar la IP del backend anterior. No reiniciar servicios compartidos. Un eventual reinicio del frontend Pangolin requiere aprobación adicional, comprobación de su identidad y nueva prueba de disponibilidad.
- Consultar GIO con una pregunta pública sencilla y confirmar una respuesta de IA real, no solamente la orientación local de contingencia. Verificar ES/EN de forma moderada. Revisar en la organización Groq que se registró consumo de la nueva clave, cuando la consola lo permita. No imprimir logs crudos con secretos.
- Revisar traducción de un estado de tracking autorizado sin compartir referencias ni datos con terceros; utilizar un caso de prueba aprobado. Verificar traducción de noticias mediante una prueba autorizada en desarrollo con clave corporativa de prueba o en producción solo si existe un flujo no destructivo autorizado; no publicar/editar una noticia real para probar. No crear cotizaciones ni disparar POST de Dhole.
- Confirmar que login, lectura de noticias y medios existentes siguen operativos. Readiness por sí sola no prueba Groq ni MinIO. Registrar fecha, operador, tag, pruebas y resultado sin claves.
- Si todo funciona, cerrar transferencia, revocar la clave personal anterior y confirmar su retirada de entornos autorizados. Retirar respaldos temporales según política.

## 5. Recuperación

Ante errores de autenticación, modelo, cuota o servicio, revisar la consola corporativa y los diagnósticos sanitizados. Si el error es la nueva credencial, corregir el valor corporativo o usar una clave de recuperación corporativa autorizada; solo volver temporalmente a una clave anterior válida, no expuesta y autorizada si TI lo aprueba. Restaurar **solo** las dos variables Groq; no restaurar el .env completo. Repetir el preflight y la recreación del mismo backend con el tag actual (no revertir código, base de datos ni contenedores de terceros). Repetir pruebas. Si el contenedor no queda activo o el preflight falla, detenerse y escalar a TI; no saltarse las verificaciones. Una interrupción de IA puede activar orientación local de GIO, que no equivale a plena funcionalidad.

## 6. MinIO/S3: no trasladar la instalación local a Argos

- `compose.minio.yaml` es opcional para desarrollo; usa un contenedor, volumen y licencia local `docker-secrets/minio.license`. No subirlos, copiarlos ni borrar volúmenes.
- `deploy/docker-compose.images.yml` no crea MinIO de producción: reutiliza opcionalmente un servidor S3/MinIO, documentado como MinIO de Dhole en su red Docker. Las variables son PANGOLIN_S3_ENDPOINT, PANGOLIN_S3_ACCESS_KEY, PANGOLIN_S3_SECRET_KEY y PANGOLIN_S3_BUCKET. El endpoint vacío indica que no se ha configurado S3 mediante ese Compose.
- No inferir titularidad, licencia, bucket efectivo, disponibilidad ni autorización a partir del repositorio. TI debe confirmar quién administra el MinIO existente y si la identidad de aplicación es corporativa y restringida al bucket. No usar root, cambiar licencias, rotar credenciales compartidas ni cambiar endpoint/bucket como parte de Groq.

Comprobación de solo lectura en Argos (no muestra valores):

```bash
sudo docker ps --filter label=com.docker.compose.project=pangolin-production \
  --filter label=com.docker.compose.service=backend --format '{{.ID}}'
# Sustituir ID_BACKEND por el único ID anterior, no usar otro proyecto.
sudo docker exec ID_BACKEND sh -c '
  for name in Storage__Endpoint Storage__AccessKey Storage__SecretKey Storage__Bucket; do
    if [ -n "$(printenv "$name" 2>/dev/null)" ]; then
      printf "%s: configurado\n" "$name"
    else
      printf "%s: vacío\n" "$name"
    fi
  done
'
```

Si endpoint y credenciales están configurados, confirmar titularidad de IAM y licencia con TI, y verificar lectura de medios públicos existentes, sin escribir ni borrar objetos. Una rotación S3 requiere plan independiente con los responsables de MinIO, permisos de mínimo alcance, preservación de bucket/objetos, respaldo y validación de lectura/escritura autorizada. Si las credenciales o licencia de producción son personales, transferir con ese plan; no basta cambiar variables a otro bucket vacío. Si únicamente la licencia de desarrollo es personal, no hay que trasladarla al servidor.

## Referencias del repositorio

- `deploy/pangolin.env.example`, `.env.example`, `compose.minio.yaml`.
- `deploy/docker-compose.images.yml`, `.github/workflows/pangolin-images.yml`.
- `backend/Services/AssistantService.cs`, `NewsTranslationService.cs`, `TrackingStatusTranslationService.cs`.
- `docs/DESPLIEGUE-IMAGENES-GHCR.md`, `docs/main2-main-production-runbook.md`.

Este documento es una guía de transferencia futura, no evidencia de una ejecución en Argos ni de titularidad actual. Los comandos de cambio requieren autorización y revisión de TI en la fecha de transferencia.
