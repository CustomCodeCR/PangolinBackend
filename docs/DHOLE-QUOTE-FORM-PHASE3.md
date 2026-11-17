# Integración opt-in de Cotizaciones con Dhole — fase 3 (código en revisión)

## Contexto

Los siete catálogos GET y las proyecciones de POL, POE, POD, Incoterms, FCL y FTL ya tienen cliente backend con caché y pruebas offline. El último intento de probar Dhole real en el Docker local **no llegó a realizar consultas** porque el disco de Windows estaba lleno (0 bytes libres) y BuildKit pasó a estado de solo lectura. No atribuir ese fallo al proveedor ni al backend. El usuario está liberando espacio y autorizó expresamente continuar en GitHub sin depender de su Docker.

## Mecanismo de activación seguro

Los nuevos flujos están **apagados por defecto**. Hay tres requisitos simultáneos:

- `DholeCatalogs:Enabled=true`: habilita el cliente de catálogos GET, configurado con `DholeCatalogs:ApiKey`.
- `DholeCatalogs:FormEnabled=true`: permite al wizard considerar catálogos Dhole.
- `DholeCatalogs:SubmissionEnabled=true`: activa la validación de envíos nuevos desde Dhole.

No configurar esos valores en producción aún; deben verificarse el contrato y una prueba real aislada. Los secretos permanecen únicamente en el servidor, nunca en frontend, GitHub o logs compartidos.

Si cualquiera de los dos últimos flags está desactivado, `GET /api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL` devuelve un 404 con `code: dhole_form_disabled`. El wizard reconoce **solo ese 404** como autorización para seguir usando su catálogo local histórico. Errores 502, 503, respuestas inesperadas, datos ausentes o catálogos caducos NO generan fallback silencioso: el wizard muestra un error y no pasa al siguiente paso.

## Qué cambia técnicamente cuando se active

El wizard conserva la apariencia visual, cuatro pasos, combobox de ubicaciones, selectores de equipo, campos de paquetes y traducciones. Al pasar al paso de ruta:

1. Solicita al backend las opciones proyectadas para `mode` y `shipmentType` concretos.
2. Recibe UUID Dhole con roles estrictos: `origin` de POL, `destination` de POE; POD es opcional en FCL, requerido en LCL y permite todas las modalidades del catálogo POD. Los tipos `AIR_LCL` y `FTL/LTL` no muestran POD.
3. Recibe Incoterms por `value`, no por `slug`, y tamaños FCL con tipos filtrados por la combinación que Dhole publica. Por ejemplo, 45 pies muestra High Cube y nunca conserva Dry Van como selección incompatible. El equipo 48HC marcado exclusivamente `Multimodal` sigue siendo válido en el flujo marítimo según lo acordado.
4. Para FTL muestra los tamaños Dhole, sin mantener una opción 40 pies retirada del origen. Usa nombres visibles (`24 pies / 5 TON`, `26 pies / 7 TON`, `48 pies`, `53 pies`) y `Furgón` como tipo porque no existe otra API de tipo FTL entre las siete.
5. El formulario envía `catalogSource:"dhole"` con UUID externos cuando usa Dhole. Las solicitudes que no incluyen la marca siguen siendo legadas **solo mientras el rollout dinámico esté desactivado**. Con `FormEnabled` y `SubmissionEnabled` activos simultáneamente, el POST rechaza con HTTP 409 una solicitud nueva sin `catalogSource: dhole`: así nadie puede eludir la fuente vigente enviando un equipo antiguo o un UUID local manualmente. Esto no modifica solicitudes históricas.
6. El POST de backend **verifica todo nuevamente contra una copia fresca del proveedor**, por rol, modalidad, incoterm y tamaño/tipo en conjunto. No confía en el array enviado por el navegador; rechaza selecciones retiradas. No usa UUID Dhole en consultas a `official_quote_locations` local.
7. La nueva cotización se guarda en la misma tabla interna; los campos `origin_name`, `destination_name` y `form_json` conservan una fotografía de los datos. **No envía una solicitud de tarifa ni ninguna escritura a Dhole.**

No requiere migraciones de tablas. No se eliminan ni modifican solicitudes existentes ni volúmenes.

## Pendientes antes de activar

- Confirmar GET real desde backend autorizado tras recuperar el espacio de Docker, sin exponer credenciales, y revisar diferencias frente a las respuestas consultadas en PowerShell.
- CI completo de backend, frontend, scripts contractuales y test de formularios. Corregir cualquier fallo atribuible a esta PR.
- Probar flujos marítimos FCL/LCL, aéreos AIR_LCL y terrestres FTL/LTL; probar cambios de tipo, conmutación entre modos, respuestas 404/502/503, 429 y coherencia de selección si Dhole cambia.
- **GIO** y cualquier consumidor heredado siguen usando la fuente local hasta que su contrato sea actualizado. Esto es una etapa de transición protegida: no exigir Dhole globalmente hasta adaptar GIO.
- La decisión sobre `LOOSE`, `PALLET`, `ULD` continúa pendiente; no hay nuevos campos aéreos.

La PR #250 permanece **en borrador** y no debe fusionarse ni desplegarse en producción.
