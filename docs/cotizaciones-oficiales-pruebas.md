# Catálogo temporal para pruebas del formulario oficial

El formulario de cuatro pasos necesita dos ubicaciones distintas por modalidad para probar el guardado.
El catálogo oficial **no ha sido recibido todavía**. No se inventan puertos ni destinos reales.

En entornos `Development` con `Development:ApplySchema=true`, se ejecuta
`backend/Database/OfficialQuotesDevelopmentLocations.sql` al iniciar el backend.

El script es idempotente, no borra datos y crea seis lugares ficticios:

| Modalidad | Origen | Destino |
| --- | --- | --- |
| Marítimo | PRUEBA - Puerto de origen | PRUEBA - Puerto de destino |
| Aéreo | PRUEBA - Aeropuerto de origen | PRUEBA - Aeropuerto de destino |
| Terrestre | PRUEBA - Origen terrestre | PRUEBA - Destino terrestre |

Los códigos `DEV-*` son exclusivamente de prueba. Solo deben usarse para validar el flujo.
La autorización administrativa no conecta ni envía datos a Dhole.

Cuando se reciba el catálogo oficial, deberán sustituirse las ubicaciones temporales en el
ambiente de desarrollo antes de hacer pruebas de aceptación. No eliminar solicitudes
existentes ni modificar catálogos reales sin respaldo y aprobación.
