# Ejecución manual de una cotización LCL ficticia — PR #274

**Solo después de que todos los checks del último commit estén verdes.** Esta guía **no autoriza otras cotizaciones**, no fusiona ramas y no modifica Docker de producción. La autorización específica se recibió en el chat el 23/11/2026, condicionada al resultado de CI. No se debe reenviar una petición cuyo resultado sea incierto.

## Preparación en PowerShell (Windows)

1. Entrar a la copia del repositorio, asegurarse de que el árbol está limpio (`git status --short`), traer la rama `feat/dhole-approved-submission-outbox-20261120` con `git fetch origin` y `git switch ...`, y actualizar con `git pull --ff-only`. **No cambiar ramas si hay modificaciones locales sin guardar.** No es necesario reconstruir Docker.
2. Confirmar que funcionan `node --version` (Node 22 recomendado) y `dotnet --version` (.NET SDK 10). Esta herramienta de consola no está enlazada al servidor web.
3. Guardar el archivo previamente facilitado en el chat `dhole_lcl_manual_evidence_20261120.json` **fuera del repositorio**, por ejemplo en Downloads. Contiene los 5 IDs revisados: servicio INT_TRANSPORT, CIF, Shanghai POL, Limón/Moin POE, Moín POD. **No pegar ninguna API Key en el JSON.**
4. **Justo antes de enviar**, comprobar visualmente que los cinco registros aún están activos en Dhole (la confirmación puede caducar). El siguiente comando **solo prepara** dos archivos privados en el directorio temporal del usuario, sin POST:

```powershell
$evidencia = Join-Path $HOME 'Downloads\dhole_lcl_manual_evidence_20261120.json'
node scripts/dhole-one-shot-prepare.mjs $evidencia
```

Escribir la frase de confirmación solicitada. Copiar las dos rutas impresas (review y approval) a las variables:

```powershell
$review = 'RUTA_COMPLETA_DE_review.json'
$approval = 'RUTA_COMPLETA_DE_approval.json'
dotnet run --project tools/DholeOneShotQuote/DholeOneShotQuote.csproj -- preview $review
```

La salida de preview muestra huella SHA-256 sin realizar HTTP. Los archivos compactos están vinculados al mismo UUID; la aprobación dura cinco minutos desde su creación. **No modificar manualmente ninguno de esos dos archivos.**

5. Si CI está verde, el JSON es correcto, el usuario ya dio la autorización específica y el responsable de Pricing estará disponible para revisar, introducir la clave únicamente en tu PowerShell local:

```powershell
$secure = Read-Host 'Dhole API Key privada con permiso POST' -AsSecureString
$env:DHOLE_ONE_SHOT_API_KEY = [System.Net.NetworkCredential]::new('', $secure).Password
Remove-Variable secure
dotnet run --project tools/DholeOneShotQuote/DholeOneShotQuote.csproj -- send $review $approval
Remove-Item Env:DHOLE_ONE_SHOT_API_KEY
```

La herramienta requiere además escribir de forma interactiva **CONFIRMO UN POST REAL A DHOLE**. No utiliza redirecciones, nunca reintenta automáticamente, incluye `X-Api-Key` solo en la solicitud HTTPS fija y reserva el marcador de intento **antes** de conectarse. Un reintento con el mismo UUID y directorio es bloqueado localmente; la idempotencia global de Dhole sigue pendiente de verificación. Si se pasa de los cinco minutos, **no editar las marcas de tiempo**: volver a comprobar catálogos y preparar una nueva autorización, siempre sin reintentar una petición ya enviada o incierta.

6. Reportar **solo el código de salida genérico**: `HttpAcceptedUnverified`, `Rejected`, `Unconfirmed`, `InvalidPayload`, etc., sin compartir ninguna credencial, ruta sensible, cabecera ni cuerpo de respuesta. Aunque salga `HttpAcceptedUnverified`, el responsable de Pricing debe confirmar que la solicitud existe y que el contacto ficticio se conserva y es visible solo a personal autorizado.

## Si no se dispone de .NET 10

**No ejecutar instrucciones improvisadas** ni desactivar controles. Se puede elaborar una alternativa en contenedor efímero de desarrollo aislado en otra revisión; no necesita desplegar ni modificar producción. No colocar el secreto en un comando ni en un archivo de Compose.

## Registro del resultado

- Una sola cotización ficticia, prioridad Green, LCL Shanghai → Limón/Moin (POE) y Moín (POD), Incoterm CIF, 3 cajas de 10 kg **en total**, sin importe comercial sin moneda.
- El POST es independiente de la aprobación cotidiana de usuarios reales y no cambia los defaults CLIENTE GENERICO / Castro Fallas.
- Si el resultado es `Unconfirmed`, `Rejected`, 429, 5xx o timeout: consultar Dhole/Pricing **antes** de crear una nueva solicitud; no reintentar por iniciativa propia.
- La PR permanece draft; cualquier fusión posterior requerirá aprobación por separado.

**Nota:** esta guía depende de que el usuario pueda acceder al Dhole oficial con su cuenta propia y disponga **localmente** de la clave con permisos de POST. La conectividad no está disponible en el chat.
