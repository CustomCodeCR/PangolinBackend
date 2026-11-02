# GIO: flujos logísticos conversacionales

> Rama propuesta: \`feat/gio-logistica-conversacional-main2\`. Esta implementación no cambia \`main-2\` ni despliega producción hasta revisar la PR.

## Alcance

El componente \`AssistantBot.vue\` conserva sus respuestas informativas y muestra cuatro accesos:
1. Solicitar cotización.
2. Consultar mi embarque.
3. Buscar itinerarios.
4. Servicios y contacto.

Los tres primeros inician \`GioOperations.vue\`, cargado de forma diferida para no penalizar el arranque del sitio. Se admiten español e inglés y una detección prudente de solicitudes por texto libre.

## Confirmaciones, catálogos y ventana ajustable

- Las respuestas de escritura libre se muestran nuevamente con **«Sí, continuar»** y **«No, corregir»** antes de avanzar. Los datos inferidos del mensaje inicial también se confirman y pueden corregirse. Las opciones seleccionables explícitas no necesitan una segunda interpretación de IA.
- Origen, destino y POD de cotizaciones no aceptan texto libre como ubicación definitiva. El visitante busca y **selecciona una opción real y activa** de `GET /api/assistant/quote-locations`. Este endpoint público es de solo lectura, limitado por IP, devuelve únicamente ubicaciones del catálogo habilitadas para el tipo y rol, y excluye códigos de desarrollo `DEV-`. La creación sigue protegida por sesión y validaciones de `POST /api/quotes/official`.
- En itinerarios el origen y el destino provienen de `GET /api/assistant/itinerary-locations`, que exige sesión. Los destinos se filtran por el origen elegido; la búsqueda final sigue verificándose contra itinerarios existentes.
- No se envía una cotización al corregir una ubicación durante la revisión: se vuelve al resumen para que el cliente presione otra vez **Confirmar y enviar**.
- La ventana de GIO dispone de tamaños **compacto (tamaño original), mediano y grande** en escritorio. Los controles respetan el ancho/alto disponible y en dispositivos móviles permanece el panel de pantalla completa. La tarjeta de resumen aprovecha más columnas en la vista amplia.

## Revisión del catálogo y experiencia de entrada (PR #137)
- **No mostrar códigos de importación** como `VIDEO-SEA-003`, `VID-LAND-01` o `DEV-*` a clientes. GIO muestra solo el nombre; no se presentan supuestos códigos UN/LOCODE/IATA sin una fuente oficial que los verifique.
- **Sugerencias siempre visibles**: durante la selección de origen/destino/POD la lista se ancla en una zona con scroll propio inmediatamente encima del campo de búsqueda, fuera del scroll de conversación. El comportamiento se prueba en el tamaño compacto y en móvil.
- **Opciones del cotizador oficial**: el catálogo de tamaños y tipos de equipo se mantiene en `frontend/src/lib/officialQuoteOptions.ts`, compartido entre `OfficialQuoteWizard.vue` y `GioOperations.vue`. Por ejemplo, FCL admite tamaños 20/40/45/48 pies y tipos Dry Van/High Cube/Open Top/Open Side/Tank/Flat Rack/NOR; FTL admite opciones de furgón. No se aceptan valores arbitrarios en estos campos.
- **Los campos que el cotizador realmente permite escribir**, como descripción de mercancía, contacto o instrucciones EXW, siguen siendo texto, con límites y confirmación antes de pasar al siguiente paso. La validación técnica no puede certificar automáticamente la veracidad comercial de una descripción; la persona debe confirmarla.
- **Después de enviar**: un administrador recibe un botón a `/administracion?tab=cotizaciones`, mientras el cliente recibe `/cotizaciones`. El servidor sigue aplicando la autorización correspondiente.
- El flujo valida de nuevo los valores de borradores recuperados antes de permitir su envío. Las pruebas contemplan usuario cliente, administrador, rechazo de ubicaciones no habilitadas, códigos internos ocultos, tamaños del panel y selección de equipo.

## Cotizaciones

- El visitante puede preparar el borrador paso por paso sin iniciar sesión.
- Se captura modalidad (marítima, aérea, terrestre), tipo FCL/LCL/AIR_LCL/FTL/LTL, origen, destino y POD cuando corresponda, Incoterm, fecha, mercancía, peligrosidad, equipo o bultos y contacto.
- El asistente valida campos y conserva valores de la primera petición que pueda identificar sin ambigüedad.
- El usuario revisa la tarjeta y puede editar campos concretos antes de confirmar.
- **El sistema no calcula tarifas.** El envío crea una solicitud con estado devuelto por la API oficial.
- La acción de crear solo se realiza tras confirmación y sesión válida. Los catálogos oficiales se consultan mediante \`GET /api/quotes/official/locations\` y el registro usa \`POST /api/quotes/official\`. No se omiten sus validaciones de backend.
- Cuando no existe una coincidencia exacta para una ubicación, el usuario debe elegir de entre las ubicaciones permitidas por el catálogo. Si el servicio o ruta no está disponible, puede abrir el formulario completo.
- Al necesitar autenticación, se guarda temporalmente un borrador en \`sessionStorage\` durante 30 minutos; al regresar a la misma pestaña, se reabre GIO y se selecciona Cotización. Se elimina tras registrar la solicitud o cancelar.
- Si el usuario no sabe si la carga es peligrosa, se conserva expresamente esa incertidumbre en las observaciones de la solicitud.

**Límite funcional:** el flujo conversacional cubre una línea de equipo o de bultos y un servicio de transporte internacional. Para varias líneas, recolección, almacenamiento, servicios aduaneros y demás configuraciones avanzadas permanece el formulario oficial.

## Itinerarios

- Requiere autenticación real del backend.
- Aplica filtros de origen, destino, transporte y fecha inicial.
- Usa \`GET /api/itinerarios\`, hasta cinco tarjetas, con ETD, ETA y estado devueltos por la API; nunca inventa disponibilidad.
- Es una consulta, no una reserva ni modificación de itinerarios.

## Tracking / Dynamics: limitación de seguridad

La integración existente \`POST /api/tracking/dynamics/search\` protege la sesión, pero el número de referencia **no demuestra titularidad**. No hay una validación comprobada que relacione cada resultado con el \`ClienteId\` autorizado.

Por ello, la nueva interfaz conversacional **solo realiza esa consulta si el usuario tiene rol administrador**. Para clientes se muestra una explicación y el acceso a la página de tracking existente, sin exponer resultados mediante GIO.

**Para habilitar tracking conversacional de clientes:** agregar primero en el backend una comprobación confiable de propiedad/autorización basada en la referencia y la relación real de Dynamics con la empresa/cliente. No confiar en una restricción de frontend como sustituto del control de API. Revisar asimismo el permiso de la ruta de tracking actual.

## Validación

El workflow \`.github/workflows/gio-main2-check.yml\` verifica:
- Compilación .NET 10 y Vue/TypeScript.
- Contratos de integración existentes.
- Navegación básica de páginas en Chrome.
- Ejecución de \`frontend/scripts/smoke-gio-workflows.cjs\` con APIs simuladas: confirmación explícita de una cotización, autenticación, guardado único, edición de contacto, selección de ubicaciones, consulta de itinerarios y ausencia de lookup de Dynamics para clientes.

### Pruebas manuales indispensables antes de fusionar

- Cuenta de cliente real con \`Features:OfficialQuotesEnabled\` habilitada, catálogos de origen/destino y permisos de empresa correctos.
- Marítimo FCL y LCL con POD; aéreo AIR_LCL; terrestre FTL/LTL; EXW; carga peligrosa y estibabilidad.
- Verificación de que el registro aparece en administración y conserva exactamente los datos de la ficha.
- Usuario sin sesión que inicia, autentica y retoma una cotización desde el borrador en la misma pestaña.
- Mensaje inicial con varios datos, edición de campos, ausencia de coincidencias, errores de API, doble clic, cambio de idioma, modo claro/oscuro y móvil.
- Administrador autorizado con la integración Dynamics habilitada; cliente sin filtrado de titularidad debe continuar bloqueado en GIO.
- Revisar visualmente con contenido real y navegador móvil, sin modificar la web pública.

No fusionar ni desplegar solamente por el resultado de los mocks: la verificación end-to-end con catálogos y autorizaciones reales es un paso diferente.
