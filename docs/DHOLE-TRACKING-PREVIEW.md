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

## Globo
Cuando ambos puertos están en el catálogo de `frontend/src/lib/trackingRoute.ts`,
`WorldGlobe` dibuja un arco ilustrativo. Si no se reconocen ambos extremos,
mantiene la vista predeterminada y muestra un aviso.
No se muestran posiciones GPS, trayectos marítimos verificados ni porcentajes inventados.
El globo de inicio `/home` no cambia.

## Correspondencia de puertos con Cotizaciones

El frontend reconoce puertos mediante `frontend/src/lib/trackingPorts.json`. Cada entrada
con `quoteCatalogName` usa exactamente un nombre marítimo verificado en
`backend/Database/OfficialQuotesVideoLocations.sql`; `scripts/verify-tracking-ports.py`
comprueba que los nombres siguen presentes. Las coordenadas y las variantes
de nombres de Dynamics viven solo en el registro geográfico ilustrativo.
No se altera el esquema ni las opciones autorizadas de Cotizaciones.

Balboa, Cristóbal, Puerto Caldera, Busan y Callao son coincidencias con Cotizaciones.
Shenzhen figura como referencia geográfica adicional para Dynamics porque no está
en el catálogo parcial de Cotizaciones. Su punto se ubica aproximadamente en la
zona de Shekou, Shenzhen; el registro no permite identificar la terminal exacta
del embarque. Nunca indicar GPS, posición del buque o itinerario marítimo real.
Solo hay coordenadas para un subconjunto limitado de puertos: un origen o destino
no reconocido conserva el globo predeterminado.

## Pruebas para la PR
- Confirmar que una sesión ausente no puede consultar el endpoint.
- Probar con cliente y administrador: IDTRA, BCF, contenedor y PO autorizados.
- Verificar múltiples resultados, códigos inválidos, ausencia de resultados y fallos de proveedor.
- Probar el globo con puertos reconocidos y desconocidos.
- Validar responsive, traducciones, modo oscuro y que no se filtre ninguna credencial.
- Ejecutar compilación del frontend y backend y revisar la CI.

El endpoint anterior `/api/tracking/demo` queda solo para pruebas de desarrollo.
No existe una segunda consulta pública anónima. No se deben eliminar volúmenes de bases de datos.
