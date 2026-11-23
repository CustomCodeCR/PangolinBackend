# Dhole PR #274 — fase 2: ejecutor aislado de una sola cotización

**Estado (2026-11-23): implementación de preparación y pruebas únicamente. No se ha efectuado un POST real.** Esta herramienta existe solo en la rama de la PR en borrador, **no en main-2 ni producción**.

## Propósito

Se creó `tools/DholeOneShotQuote` como programa de consola .NET 10 **separado** del servidor ASP.NET: no añade rutas, botones, workers, comandos Compose ni automatizaciones. Reutiliza el transporte de escritura existente, que emplea HTTPS fijo, clave privada, 12 segundos de timeout, sin redirecciones ni reintentos. El único uso actual autorizado es la opción **preview**, que no construye ni envía solicitudes HTTP.

```sh
dotnet run --project tools/DholeOneShotQuote/DholeOneShotQuote.csproj -- preview /ruta/privada/lcl-review.json
```

El archivo local `lcl-review.json` se genera a partir de los cinco registros manuales previamente suministrados usando `scripts/dhole-lcl-manual-preflight.mjs`. El comando de preview valida modalidad LCL, roles y UUID separados (POL/POE/POD), CIF, servicio único, contacto ficticio y las cantidades; muestra solo una huella SHA-256 sin revelar el JSON, el contacto completo ni secretos. La revisión todavía carece de confirmación de vigencia de catálogos en tiempo real.

## Prevención de un POST accidental

La opción de envío existe como preparación técnica, pero **rechaza expresamente** el archivo actual porque contiene `form_cargoObservations = "PRUEBA TECNICA FICTICIA. NO ENVIAR."`. Tampoco basta con definir una API Key o cambiar variables de entorno.

Para una **futura prueba real** se necesitará una nueva versión del cuerpo, revisada y autorizada, cuyo marcador sea exactamente `PRUEBA CONTROLADA AUTORIZADA. DATOS FICTICIOS.`, además de:

1. Un archivo de aprobación **local, fuera del repositorio**, con alcance `PR274_ONE_QUOTE_LCL_OFFICIAL_DHOLE`, propósito `CONTROLLED_TEST_WITH_FICTIONAL_CONTACT`, `operatorApproved=true`, SHA-256 idéntico al cuerpo aprobado y un **UUID de cotización nuevo**, distinto del UUID ficticio de la simulación. La identidad del nuevo UUID también debe coincidir exactamente con la `idempotencyKey` del JSON revisado; nunca se puede reutilizar la clave ficticia fija del preflight. La aprobación no puede reutilizarse.
2. Dos marcas UTC verificables en el archivo de aprobación (`approvedAtUtc` y `catalogsVerifiedAtUtc`) con una antigüedad máxima de cinco minutos. Estas fechas son declaraciones explícitas del operador, **no sustituyen una consulta real a los catálogos**.
3. Una clave privada en la variable de entorno local `DHOLE_ONE_SHOT_API_KEY`. Nunca escribir el secreto en el comando, el JSON, GitHub, documentación o registros de la herramienta.
4. Una consola interactiva (no procesos automatizados/CI) donde el operador escriba manualmente la frase de confirmación. El código reserva un archivo `.dhole-one-shot-<quote-uuid>.attempted` en el directorio local de aprobación **antes** de llamar a HTTP; si se detecta un intento previo para ese UUID en ese directorio, no continúa. Esto es una protección local, **no garantiza deduplicación global entre diferentes equipos o directorios**; el backend remoto deberá verificar su propia idempotencia. Las respuestas 2xx se reportan como **aceptación HTTP sin verificar creación**, y un timeout/5xx/429 como resultado **no confirmado**. No reintentar automáticamente.

La muestra LCL también rechaza `form_cargoValue` y `form_currencyId`: el valor **1600** se retiró porque nunca se identificó su moneda y no se solicitó seguro de carga. La fecha 2026-12-18, los pesos, la condición no estibable y la modalidad Spot se consideran **datos de laboratorio**, no instrucciones comerciales de un cliente.

**Importante:** el mero hecho de que el código permita definir estos parámetros no es autorización para enviar. Antes de la primera invocación de envío, confirmar de nuevo los cinco UUID, revisar cómo Dhole trata la descripción con contacto, revisar si acepta la ruta y los valores `Spot/Maritime`, y recibir una autorización **específica** para un único POST ficticio. Si no se cumplen todos los controles, la salida es bloqueo.

## Pruebas automatizadas

El workflow `.github/workflows/dhole-post-transport-preflight.yml` compila el programa, crea una revisión totalmente ficticia con identificadores sintéticos, ejecuta `preview` y comprueba que `send` **falla sin tocar la red** cuando recibe el archivo `NO ENVIAR` sin aprobación. La prueba HTTP existente sigue usando exclusivamente un `HttpMessageHandler` simulado. Los workflows no reciben una clave de Dhole.

## Próximas decisiones

Cuando el usuario autorice expresamente una prueba real, preparar un nuevo cuerpo de cotización y aprobación separada, verificar vigencia de catálogos, ejecutar **un único** POST desde un equipo autorizado y comprobar el resultado manualmente en Pricing. No fusionar esta PR ni activar el envío de todas las cotizaciones como parte del experimento.
