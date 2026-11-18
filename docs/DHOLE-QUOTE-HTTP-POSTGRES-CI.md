# Dhole: prueba HTTP de persistencia real contra PostgreSQL aislado (18/11/2026)

## Resultado

**APROBADO** el job `Real HTTP POST into disposable PostgreSQL, simulated Dhole` de GitHub Actions, ejecución [44328898331](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44328898331), al commit `230d6f2`.

El arnés de pruebas `tests/DholeQuoteHttpHarness` arranca las rutas auténticas de `backend/Program.cs` mediante `WebApplicationFactory`/`TestServer`. En esa ejecución:

- `GET /api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL` retornó **200** y el conjunto dinámico de POL, POE, Incoterms y tamaños/tipos de equipo a partir de **fixtures artificiales** de Dhole.
- `POST /api/quotes/official` de una solicitud válida retornó **201 Created**.
- El arnés consultó la base PostgreSQL 16 aislada por SQL y confirmó fila en `official_quote_requests`, nombre de origen y destino, estado `Received`, autorización `Pending` y `cliente_id`/`usuario_id` nulos para invitado.
- El campo `form_json` conservó exactamente `catalogSource: "dhole"`, UUID externos de POL/POE y equipo validado `20 pies / Dry Van`.
- Las solicitudes con UUID de POE como POL, un tipo de equipo ausente, Incoterm inactivo y sin `catalogSource` se rechazaron (400/409) y **no dejaron filas**.
- El cliente HTTP saliente sustituyó exclusivamente el nombre `DholeCatalogs` por un `HttpMessageHandler` simulado; bloquea cualquier otro destino, host o método. No se hicieron peticiones a Dhole real, a Graph ni a producción.

## Seguridad de la ejecución

El job crea mediante un contenedor de servicio **PostgreSQL desechable** en GitHub Actions. Solo acepta un DSN de prueba con host loopback, base `dhole_quote_e2e` y usuario `ci_dhole`, y exige `CI=true`. El JWT y la API Key son **cadenas ficticias**, no secretos de usuario. El servidor de la aplicación se ejecuta en memoria y habilita las opciones de Dhole y `Features:OfficialQuotesEnabled` **solo dentro del proceso del arnés**.

No ejecutar el arnés en un ordenador o contra una base ajena al contenedor de CI. En entornos normales, la integración continúa **apagada por defecto**.

El job de integración no sustituye la evidencia de conexión real que aportó la prueba Docker local del usuario, en [`DHOLE-CATALOG-DOCKER-SMOKE.md`](DHOLE-CATALOG-DOCKER-SMOKE.md). Esa prueba validó 7/7 GET y las cinco modalidades de Cotizaciones y seis filtros de Itinerarios con datos reales, sin POST.

## Pendiente para fusionar/activar

- La prueba E2E de CI verifica la **ruta HTTP y persistencia reales con catálogo simulado**. No prueba una cotización completa con Dhole real y un origen/destino elegido en pantalla con navegador.
- Revisar los checks ajenos a la ruta Dhole: auditoría npm de dependencias, compilación de Nuxt SSR y regresiones en los dos formularios.
- Los cambios siguen en la PR #250 en borrador, no fusionados, sin habilitar flags de Dhole en producción.
