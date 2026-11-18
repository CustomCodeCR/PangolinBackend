# Prueba Docker aislada: siete catálogos GET de Dhole

## Alcance

Este procedimiento se ejecuta **en la computadora del desarrollador que tiene Docker Desktop y la clave del proveedor**, no en el servidor de producción. Solo crea el proyecto `cf-dhole-catalog-smoke` con **un backend** y puerto **127.0.0.1:5517**. No levanta PostgreSQL, Redis, MongoDB, frontend, ni usa `compose.yaml` o `compose.production.yaml`.

La API .NET se ejecuta en `ASPNETCORE_ENVIRONMENT=Production` (solo para evitar migraciones automáticas de Development), con un connection string ficticio y sin realizar ningún acceso a la base de datos. El script únicamente llama el health check y los siete endpoints GET; no manda POST.

## En Windows PowerShell

1. Abrir Docker Desktop y PowerShell.
2. Ir a la carpeta raíz del repositorio de trabajo, no a `C:\Windows\system32`.
3. Descargar la rama nueva de implementación sin tocar `main-2`:

   ```powershell
   git fetch origin
   git switch --track origin/feat/dhole-catalog-backend-20261117
   ```

   Si la rama local ya existe: `git switch feat/dhole-catalog-backend-20261117` seguido de `git pull --ff-only`.

4. Ejecutar:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-dhole-catalog-docker.ps1
   ```

5. Cuando PowerShell lo solicite, pegar **directamente en el prompt oculto** la clave `X-Api-Key`. No enviar claves por chat, pantallazos, GitHub ni logs.
6. El script genera credenciales JWT/OTP ficticias solo para el contenedor de pruebas, construye la imagen, inicia el backend y consulta estos siete catálogos: `incoterms`, `pod`, `poe`, `pol`, `container-sizes`, `container-types`, `truck-sizes`. Devuelve tabla con **conteo, sin listas ni secretos**.
7. Tanto si funciona como si falla, detiene **solo** el proyecto `cf-dhole-catalog-smoke` y elimina el archivo secreto temporal `.env.dhole-catalog-smoke` (ignorado por Git). El backend no queda corriendo, pero es posible que Docker conserve la imagen de prueba.

**Precaución:** durante la ejecución, Docker almacena la clave como variable de entorno del contenedor y usuarios con acceso administrativo a Docker podrían verla. Ejecutar únicamente en una máquina local confiable. No ejecutar `docker inspect` ni `docker compose config` y publicar el resultado, ya que revelarían variables de entorno. No compartir `.env.dhole-catalog-smoke`.

## Si algo falla

Enviar solamente el mensaje y las líneas finales del log **después de revisar que no incluyan datos sensibles**. Como el script muestra solo nombres de catálogos, conteos y estados, no hace falta pegar datos individuales ni la clave.

Un error 502 indica que el backend aislado **no pudo obtener o procesar** una respuesta Dhole y no confirma por sí solo qué ocurrió (DNS, firewall, credencial, datos o proveedor). La primera prueba real podría revelar diferencias de esquema que los tests simulados no detectaron.

## Comprobación de CI

El workflow de la PR `dhole-catalogs.yml` también levanta el backend con clave **totalmente ficticia**. No llama un catálogo permitido en Dhole: comprueba solo que `/api/health` responda, que un catálogo desconocido devuelva 404 y que la previsualización administrativa exija autenticación (401). Esta prueba CI **no sustituye** el smoke local autenticado.

La conexión real permanece desactivada por defecto en todo despliegue, salvo que se configuren expresamente `DholeCatalogs:Enabled=true` y la clave privada del backend.


## Resultado verificado — Docker local, 18 de noviembre de 2026

El desarrollador ejecutó `powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\test-dhole-catalog-docker.ps1` en su Docker Desktop local, después de recuperar el espacio del disco. El registro de consola confirma:

| Catálogo | Registros normalizados | `stale` |
| --- | ---: | --- |
| `incoterms` | 11 | `false` |
| `pod` | 24 | `false` |
| `poe` | 947 | `false` |
| `pol` | 1063 | `false` |
| `container-sizes` | 4 | `false` |
| `container-types` | 18 | `false` |
| `truck-sizes` | 4 | `false` |

El `dotnet publish` de la imagen terminó sin errores y Docker inició el backend. Las siete consultas **GET** devolvieron `stale=false`, sin POST al proveedor. El script informó que eliminó el contenedor y la red de prueba, así como el archivo temporal de credenciales. No se ha expuesto ni almacenado una API Key en el repositorio.

**Conclusión:** ya está superado el bloqueo de conexión real GET. El resultado anterior de POL (1062) queda actualizado a **1063** para esta ejecución; un cambio de conteo no prueba por sí solo que haya un error. Esto prueba conectividad y parsing de los siete feeds, **no todavía** las reglas de filtrado por modalidad/rol ni el formulario de envío completo bajo catálogos reales. Antes del merge falta revisar las opciones proyectadas, probar los recorridos de cotización y GIO, y actualizar la rama con `main-2` sin perder cambios concurrentes.
