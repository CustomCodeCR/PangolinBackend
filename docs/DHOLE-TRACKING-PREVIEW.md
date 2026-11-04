# Rastreo de embarques por Dhole / Dynamics

La funcionalidad de `/tracking` utiliza los datos de Dynamics a través del backend Pangolin.
Se conserva el diseño previo, el selector, la guía y el globo de la página.

## Acceso
Para acceder a los detalles se exige una sesión real de rol **cliente o administrador**.
El formulario llama a `POST /api/tracking/dynamics/search`, protegido por la política `registered` de ASP.NET Core.
La API Key de Dhole solo existe en la configuración privada del backend.

La empresa ha solicitado que una persona con cuenta pueda ver un registro al introducir su referencia.
Advertencia: conocer una referencia no garantiza la titularidad del embarque. Antes de producción, operaciones y seguridad deben ratificar qué campos están autorizados a mostrarse bajo esta regla.

## Identificadores y resultados
IDTRA, PO, BCF y CONTENEDOR usan respectivamente las cuatro consultas existentes.
Las opciones BL y HBL se traducen provisionalmente a BCF, conforme al uso indicado para el formulario.
La interfaz permite elegir entre varios resultados y muestra estado, origen, destino, puertos, fechas, medio de transporte y referencias del embarque.

## Detalles ampliados para IDTRA, BCF, PO y contenedor

Las cuatro búsquedas usan el mismo endpoint autenticado y conservan el selector de
coincidencias (BCF puede devolver múltiples embarques).
La vista presenta estado para el cliente, incoterm, equipo y fechas adicionales cuando
Dynamics proporciona valores; preserva el resumen, traducciones, responsive y globo ilustrativo.

**Autorización:** conocer una referencia no acredita la titularidad del embarque.
El backend limita PO, mercancía, bultos, sello, facturas, remitente e instrucciones del
cliente al rol administrativo. Antes de exponerlos a clientes se requiere autorización
de operaciones y verificación de propiedad del embarque. No devuelve JSON crudo ni
códigos de opción, ETag o incidentid.

El bloque de detalles omite null, campos vacíos y marcadores sin datos como " / / ".
El valor "0" no se interpreta automáticamente como ausencia de dato. Se mantiene ETD/ETA
estructurado aunque el texto de estado del cliente describa otra fecha.

## Globo
El globo usa las coordenadas ilustrativas de `frontend/src/lib/trackingPorts.json`,
que se resuelven en `frontend/src/lib/trackingRoute.ts`. Los nombres marcados como
`quoteCatalogName` corresponden a ubicaciones marítimas presentes en
`backend/Database/OfficialQuotesVideoLocations.sql`, el catálogo parcial de
Cotizaciones obtenido de los videos. Las variantes de Dynamics se reconocen sin
distinguir tildes, mayúsculas ni abreviaturas como «Pto.».

Por ejemplo, **IDTRA 12753** presenta origen «China», puerto de salida
«Shenzhen, China», puerto de entrada «Pto. Balboa, Panamá» y destino «Panamá».
El mapa utiliza los **dos puertos identificables** y representa la trayectoria
ilustrativa Shenzhen → Balboa. «China» y «Panamá» por sí solos no se convierten
en puntos inventados. Se conservan las escalas intermedias explícitamente
proporcionadas por Dynamics, cuando están reconocidas en el catálogo.

El punto aproximado de Shenzhen corresponde a la zona portuaria de Shekou;
no confirma la terminal del embarque. El registro base contiene Qingdao,
Caldera, Mundra, Cristóbal, San José, Balboa, Shenzhen, Busan y Callao.

Se incorpora además `frontend/src/lib/trackingQuoteCoordinates.json` con
**185 entradas** de Cotizaciones georreferenciadas con puntos de referencia
de ciudad (no terminales portuarias ni GPS). La base del mapa y el catálogo
ampliado identifican **190 de los 217 registros** del catálogo parcial
`OfficialQuotesVideoLocations.sql`. Quedan **27 registros pendientes** por
ambigüedad del nombre, ausencia de un centroide inequívoco o necesidad de
verificación del terminal. No se les asignan coordenadas inventadas. Los
registros repetidos por modalidad se cuentan según su presencia en Cotizaciones.

**Origen y licencia de la geografía:** los centroides de ciudad provienen de
[World Countries, States & Cities Database de Santiago Restrepo](https://github.com/srestre/world-countries-cities-db),
que deriva de la base `dr5hn/countries-states-cities-database`. Los datos
están disponibles bajo la [Open Database License (ODbL) v1.0](https://opendatacommons.org/licenses/odbl/1-0/);
las coordenadas adaptadas de `trackingQuoteCoordinates.json` están sujetas
a esa misma licencia. Los nombres de Cotizaciones corresponden al catálogo
propio del proyecto y no cambian. Las coordenadas ilustrativas se basan en
ciudades, no en instalaciones específicas, y deben validarse operativamente
si se requiere precisión de terminal.

Cuando quedan menos de dos puntos reconocidos, el globo muestra su vista
predeterminada con aviso de ruta no disponible.

La animación conserva un único vehículo y una estela que siguen el recorrido
ilustrativo, no posiciones GPS, trayectos verificados ni porcentajes de avance
reales. Ni la base de Cotizaciones ni las consultas de Dynamics se modifican.
El globo de inicio `/home` no cambia.

## Pruebas para la PR
- Confirmar que una sesión ausente no puede consultar el endpoint.
- Probar con cliente y administrador: IDTRA, BCF, contenedor y PO autorizados.
- Verificar múltiples resultados, códigos inválidos, ausencia de resultados y fallos de proveedor.
- Probar el globo con puertos reconocidos y desconocidos.
- Validar responsive, traducciones, modo oscuro y que no se filtre ninguna credencial.
- Ejecutar compilación del frontend y backend y revisar la CI.

El endpoint anterior `/api/tracking/demo` queda solo para pruebas de desarrollo.
No existe una segunda consulta pública anónima. No se deben eliminar volúmenes de bases de datos.
