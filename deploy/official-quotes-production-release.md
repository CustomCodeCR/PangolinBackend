# Activación de cotizaciones oficiales en producción

Alcance: el frontend de Pangolin para `www.logisticacastrofallas.com` y su backend/BD `pangolin`. No modifica el dominio raíz (Fennec) ni sus datos.

## Antes de fusionar a `main`

1. Verificar que el PR incluya únicamente los cambios de activación, preparación de esquema/catálogo y pruebas. Revisar los resultados de `Backend and frontend integration` (build + smoke).
2. **Hacer y verificar un respaldo restaurable de la base `pangolin` en el servidor** antes de iniciar la primera migración. No almacenar el respaldo ni secretos en GitHub. Confirmar con operaciones cómo restaurarlo.
3. Confirmar con el equipo que el catálogo parcial de los videos del 21 de octubre y las 13 ubicaciones terrestres verificadas son suficientes para habilitar solicitudes reales. No son un catálogo mundial definitivo.
4. Revisar roles: los administradores autenticados pueden consultar y revisar cotizaciones; la autorización especial requiere un permiso explícito. Los clientes autenticados pueden crear solicitudes, pero no acceder al listado administrativo.
5. Programar el cambio para una ventana de despliegue supervisada. Un push a `main` dispara el flujo de producción.

## Cambios de despliegue

- El frontend se construye con `VITE_OFFICIAL_QUOTES_ENABLED=true`; el backend recibe `Features__OfficialQuotesEnabled=true`.
- En instalaciones nuevas se aplica `AuthSchema.sql`. En existentes, antes de migrar, se valida la presencia del esquema base. Si faltan tablas básicas, se cancela.
- Se ejecutan `OfficialQuotesSchema.sql`, `OfficialQuotesVerifiedLocations.sql` y `OfficialQuotesVideoLocations.sql` en una transacción con error fatal si falla cualquier operación. Son operaciones aditivas: `CREATE TABLE IF NOT EXISTS` e `INSERT ... ON CONFLICT DO NOTHING`.
- **No** se carga `OfficialQuotesDevelopmentLocations.sql`, que contiene ubicaciones ficticias.
- Se verifica la existencia de las cinco tablas del módulo y de 12 combinaciones de origen/destino/POD por modalidad. Un fallo impide actualizar los contenedores.
- Tras el despliegue se comprueba la salud y que las rutas protegidas de la API del módulo y del administrador exijan autenticación.

## Validación de negocio tras el despliegue

- Iniciar sesión como cliente y comprobar `/cotizaciones` para FCL, LCL, aéreo, FTL y LTL, incluyendo origen y destino válidos.
- Crear una solicitud **de prueba identificada como tal** con un usuario autorizado. Confirmar que aparece en Administración → Contenido → Cotizaciones y que la revisión registra historial. Evitar datos personales reales de prueba.
- Comprobar la accesibilidad de `/administracion` para admin y el bloqueo para un usuario cliente.
- Verificar que noticias, itinerarios, comentarios, seguimiento y login mantienen su funcionamiento, sin alteraciones visuales inesperadas.
- Verificar `https://www.logisticacastrofallas.com`; el dominio sin `www` conserva el sitio heredado hasta otro cambio acordado.

## Reversión

Si el cotizador nuevo presenta fallos, detener el cambio y desplegar el último tag inmutable de imágenes confirmado como saludable mediante el `workflow_dispatch` existente. El cotizador V2 permanece en el código; las tablas oficiales nuevas **no se eliminan** al volver a imágenes antiguas. No intentar una reversión de la BD sin un procedimiento y respaldo validados.

**Pendiente antes de fusionar:** revisión de base real, respaldo restaurable y QA manual. GitHub Actions no confirma por sí solo esos pasos.
