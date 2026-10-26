# Rastreo Dhole / Microsoft Dynamics (vista de administración)

Primera fase de integración, creada desde `main-2`. No reemplaza el rastreo de demostración ni habilita el acceso público a los embarques de clientes.

## Alcance

- `POST /api/tracking/dynamics/search`, protegido por la política JWT `admin` (con sesión PostgreSQL vigente), rate limit `tracking` y `Cache-Control: no-store`.
- Consulta de solo lectura al gateway de Dhole usando una API Key del servidor, nunca del navegador.
- Busca por `IDTRA` (`idtra`), `BCF` (`bcf`), `CONTAINER` (`contenedor`) o `PO` (`po`), siempre con `connectionCode: principal`.
- Host fijo HTTPS, sin redirecciones HTTP, rutas de consulta en una lista explícita, timeout de 12 segundos, respuesta limitada a 1 MiB.
- Proyección de campos de seguimiento solamente: título, estado, origen, destino, modo, puertos, ETD/ETA, buque, contenedor, BCF y última modificación. No devuelve el JSON completo de Dynamics ni IDs internos.
- Hasta 25 elementos por consulta; `truncated=true` indica resultados parciales.
- `/api/tracking/demo`, los datos ficticios, el globo de demostración y el globo de `/home` permanecen intactos.

## Configuración local (SIN subir claves a GitHub)

En el `.env` **privado** del proyecto, agregar:

```dotenv
DHOLE_TRACKING_ENABLED=true
DHOLE_TRACKING_API_KEY=PEGAR_AQUI_CLAVE_NUEVA_PRIVADA
```

Esa clave debe ser válida, estar vigente y tener permiso de lectura para las cuatro consultas. La clave compartida anteriormente en un chat debe permanecer revocada. **Nunca** subir `.env`, imprimir la clave en logs ni usar variables `VITE_` para ella.

Levantar desarrollo:

```powershell
docker compose -f compose.yaml up -d --build
docker compose -f compose.yaml ps
```

Si se requiere MinIO, utilizar adicionalmente `-f compose.minio.yaml`, con sus propios secretos privados configurados. No usar `down -v`.

Ingresar a `http://localhost:5173/tracking` con una sesión autenticada de **administrador real**. La vista "Rastreo Dynamics · Vista previa de administración" se muestra bajo el formulario DEMO.

Para entornos diferentes de este compose, configurar `DholeTracking__Enabled=true` y `DholeTracking__ApiKey` mediante el almacén de secretos del despliegue. El valor por defecto es **deshabilitado**.

## Contrato

```http
POST /api/tracking/dynamics/search
Content-Type: application/json
Cookie: <sesión válida de administrador>

{"type":"IDTRA","reference":"12725"}
```

Respuesta esquemática (los campos pueden ser `null`):

```json
{
  "source": "dynamics",
  "referenceType": "IDTRA",
  "referenceCode": "12725",
  "records": [
    {
      "title": "IDTRA999.12725",
      "status": "Booking Listo",
      "origin": "China",
      "destination": "San José, Costa Rica",
      "mode": "MARITIMO",
      "portOfLoading": "Qingdao, China",
      "portOfEntry": "Pto. Caldera, Costa Rica",
      "etd": "2026-11-13T06:00:00Z",
      "eta": "2026-12-23T06:00:00Z",
      "vessel": "MAERSK ENSENADA",
      "container": "MRSU3779246",
      "bcf": "GCF2026-00515",
      "updatedAtUtc": "2026-10-23T16:14:17Z"
    }
  ],
  "truncated": false
}
```

El ejemplo anterior proviene de una consulta de prueba anterior y **no** es una consulta en vivo. No usarlo como prueba de la API después de los cambios del proveedor. No hay datos GPS ni porcentaje de avance real.

## Pruebas antes de aprobar la PR

1. `dotnet build backend/CastroFallas.MiniQuote.Api.csproj` y `npm --prefix frontend run build`.
2. Como visitante: endpoint devuelve 401. Como usuario cliente: 403. Ambos sin acceso a datos ni a la clave.
3. Como administrador con `DHOLE_TRACKING_ENABLED=false`: endpoint devuelve 503 y el formulario DEMO conserva su funcionamiento.
4. Como administrador con clave válida y flag activo: consultar cada una de las cuatro referencias autorizadas. Validar resultados, múltiples registros y resultados vacíos.
5. Verificar 400 para tipo desconocido, cadenas vacías o no admitidas; 429 por exceso de consultas; 502/504 ante fallo/timeout de Dhole sin filtrar errores del proveedor.
6. Inspeccionar pestaña Network del navegador: **no debe aparecer el encabezado X-Dhole-Api-Key**, ni la respuesta completa de Dynamics. No registrar secretos en consola o capturas.
7. Confirmar diseño de escritorio y móvil, idioma español e inglés, modos claro/oscuro y que el globo HOME continúa sin cambios.
8. Confirmar que una consulta al endpoint nunca crea, actualiza ni elimina registros Dynamics o PostgreSQL.

## Pendiente para siguiente fase

- Acordar cómo autorizar por cliente/embarque antes de exponer el buscador fuera de administración. Conocer una referencia **no** concede permiso para ver datos de otro cliente.
- Confirmar con operaciones la equivalencia de BL/HBL respecto al BCF. En esta fase el tipo BCF aparece explícitamente en el panel admin; los campos BL/HBL DEMO no se reinterpretan.
- Georreferenciar puertos mediante un catálogo validado y representar solo una ruta geográfica ilustrativa. No simular GPS, posición de barco ni porcentaje de recorrido a partir de fechas.
- Validar las cuatro consultas reparadas contra Dhole con una clave nueva. Este trabajo **no** prueba credenciales reales ni interactúa con el servidor Dynamics.
- Si se necesita enviar cotizaciones o escribir en Dynamics, se requiere otra interfaz aprobada; estos endpoints se usan exclusivamente para consulta.
