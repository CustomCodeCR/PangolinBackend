# Fase 5 — GIO cotizaciones con catálogo Dhole (opt-in)

La integración de GIO usa **el mismo endpoint y contrato normalizado** que el wizard, no consultas adicionales directas al proveedor. La API Key permanece en backend y no hay POST a Dhole.

## Contrato

En `frontend/src/components/GioOperations.vue`, cuando GIO prepara una nueva cotización con `mode` y `shipmentType`:
- Consulta `GET /api/quotes/official/dhole-options?mode=...&shipmentType=...` mediante `frontend/src/lib/dholeQuoteForm.ts`.
- Si el backend devuelve `404` con `code=dhole_form_disabled`, GIO conserva el catálogo local existente, incluidas las solicitudes antiguas.
- Si devuelve datos Dhole, GIO ofrece Incoterms, POL/POE/POD y equipos FCL/FTL **por las mismas reglas que el wizard**. En el paso de tipo de equipo, las opciones dependen del tamaño seleccionado; cambiar el tamaño borra un tipo incompatible.
- No se agregan campos aéreos: `LOOSE`, `PALLET`, `ULD` permanecen pendientes de consulta.
- Cada UUID recibido por el navegador corresponde a la ubicación dentro de su catálogo y rol. Un borrador restaurado o dato previo con UUID local no puede reutilizarse como UUID externo: se vuelve a seleccionar la ubicación.
- Enviar la solicitud agrega `catalogSource: "dhole"` **solo cuando está activo y fue consultado el contrato Dhole**. Con la integración desactivada, envía `catalogSource: null`.
- El backend revalida al enviar contra un catálogo fresco que coincida con origen, destino, POD, modalidad, Incoterm, tamaño y tipo. Los UUID externos no se convierten en IDs de PostgreSQL por semejanza de nombres.

## Separación de funciones

Se cambiaron las preguntas y opciones de **cotización GIO**. **No se modificaron** el flujo de rastreo (tracking) ni el flujo de búsqueda de Itinerarios del asistente. Estos mantienen sus controles de autorización y consulta de rutas publicadas. Las listas de ubicación de la página pública de Itinerarios sí tienen una ruta Dhole distinta y opcional.

## Pruebas

`frontend/scripts/smoke-gio-workflows.cjs` ahora admite `GIO_DHOLE_MOCK=1` para simular el endpoint Dhole con **UUID externos distintos de los IDs locales**. Con el flag sin configurar, devuelve explícitamente `dhole_form_disabled` y comprueba el flujo legado.

El workflow `.github/workflows/gio-main2-check.yml` ejecuta ambos modos, con un navegador Chrome y backend falso. Comprueba los envíos invitados/administrador, confirmación antes de POST, almacenamiento de recibos y que las respuestas utilicen `catalogSource` y los UUID esperados.

Pruebas del backend comprueban los cinco tipos de envío, Incoterms activos y equipos válidos. El registro `official_quote_requests.origin_name/destination_name` tiene límite `VARCHAR(180)`; el backend comprueba esta longitud antes del guardado. Si existieran nombres activos más largos, exigirían una migración de esquema revisada, no un truncamiento silencioso.

## Bloqueos para el despliegue

1. Obtener CI **verde** de la PR #250 para la compilación .NET, Vue y ambos smoke de GIO. Una auditoría npm no relacionada puede reportar vulnerabilidades preexistentes; no confundirla con regresión de Dhole.
2. Verificar desde Docker local recuperado el consumo real de los siete GET Dhole y sus metadatos; la prueba previa falló **antes** de conectar porque el volumen de Docker estaba lleno.
3. Revisar un conjunto de cotizaciones reales de prueba y las búsquedas de Itinerarios; confirmar con negocio los equipos aéreos `LOOSE`, `PALLET`, `ULD` sin agregar campos antes de esa definición.
4. No activar ninguno de los flags en producción ni fusionar la PR en borrador antes de completar la revisión.

La prueba no ejecuta el POST `solicitar-tarifa` de Dhole. El POST de cotizaciones es solo a nuestra propia base de datos y sigue limitado por la validación interna.

## Correcciones de catálogo y POD (18/11/2026)

- En toda cotización marítima FCL o LCL, **GIO pregunta obligatoriamente por POD** después del destino POE. El valor elegido es un UUID distinto del de origen/destino y se conserva en `podLocationId` del POST. No se ofrece omitirlo; el backend rechaza los envíos que carezcan de POD.
- Los catálogos extensos no pierden entradas: anteriormente el componente aplicaba `.slice(0, 30)` a las sugerencias visibles, dejando solo los primeros 30 «A» a la vista. Ahora presenta **todos los registros coincidentes de una sola vez dentro de una lista con scroll**, sin botón «Mostrar más», y mantiene búsqueda global por nombre o código (sin distinguir acentos ni mayúsculas). El contador muestra el total filtrado. En particular, permite recorrer los 854 orígenes y 851 destinos aéreos.
- La nueva prueba de Chrome prepara 854 POL y 851 POE (tamaños equivalentes a los conteos reales del origen aéreo). Busca opciones de Zúrich al final del catálogo y comprueba que no se pierdan; también recorre FCL y verifica el POD enviado en GIO, tanto con fuente Dhole como en compatibilidad local.
- No se han modificado los filtros históricos de rastreo, los itinerarios guardados ni la clave API en navegador. Los cambios siguen únicamente en la PR #250 hasta que CI y revisión local estén aprobados.

- La etiqueta del POD en el formulario oficial conserva el asterisco `*`, igual que otros campos obligatorios; se quitó la aclaración redundante «(requerido)». La regla sigue vigente en frontend y backend.
