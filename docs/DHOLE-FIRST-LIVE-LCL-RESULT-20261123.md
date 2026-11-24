# Primer POST real autorizado a Dhole — resultado y hallazgo de la línea de carga

**Fecha:** 2026-11-23. **PR:** #274, borrador; sin fusión a main-2 ni habilitación de envíos automáticos.

## Resultado observado

- Se ejecutó **un solo intento de POST** desde el equipo del usuario después de la aprobación específica. La consola informó `HttpAcceptedUnverified`: HTTP exitoso, sin confirmación de creación desde la respuesta.
- Las capturas posteriores de la lista de Pricing y del resumen de la solicitud **sí demuestran la creación visible de la solicitud ficticia**: cliente `CLIENTE GENERICO`, ejecutivo `Castro Fallas`, prioridad Green/Regular, modalidad marítima LCL, servicio Transporte Internacional, Incoterm CIF, POL Shanghai, POE Limón/Moin y POD Moín. La descripción persistida contiene la etiqueta del solicitante y nombre/correo/teléfono **ficticios**.
- La captura se tomó desde un usuario autenticado en Pricing. Esto **no demuestra** que otros roles carezcan de acceso a la descripción; se debe validar la política de permisos antes de activar solicitudes reales de clientes.
- La pantalla muestra `Pendiente`. No se ha hecho ningún intento adicional, modificación en producción, finalización de tarifa ni confirmación de deduplicación real.

## Defecto detectado por las capturas

La solicitud original llevaba **3 cajas**, **10 kg totales**, y medidas de **20 × 12 × 8 cm** por caja. No obstante, el resumen de Pricing mostró **1 × Unidad sin clasificar (histórica)**, peso de 10 kg sobre una sola unidad, dimensiones **0 × 0 × 0 cm** y volumen físico no registrado.

El componente real de Dhole `src/modules/pricing/components/PricingSellerHandoffPreview.vue` interpreta las líneas de `sellerContext.consolidatedCargoLines` así:

- `quantity` es la cantidad de unidades.
- `unitType` está restringido a `Pallet`, `Loose`, `Box` u `Other`.
- `length`, `width`, `height` son las medidas por unidad; `weightKg` es el **peso por unidad**.
- `isStackable` es un booleano.
- Las claves antiguas `packages`, `lengthCm`, `widthCm`, `heightCm` no se interpretan como cantidad/medidas de esa pantalla. No se debe confundir el almacenamiento exitoso de JSON con un mapeo comercial correcto.

## Corrección preparada **solo** en PR #274

- El adaptador exige ahora tipo de unidad explícito, sin adivinarlo de la descripción, y estibabilidad confirmada.
- Convierte los datos del sitio a `quantity=3`, `unitType=Box`, `length=20`, `width=12`, `height=8`, `isStackable=false`, `weightKg=10/3` **por unidad** y mantiene `form_cargoWeightKg=10` **total**.
- El validador público rechaza las claves antiguas y comprueba que la suma de pesos y cantidades coincide con el formulario; el preflight LCL y el ejecutor aislado rechazan el defecto específico.
- Se agregaron pruebas de regresión en JavaScript y C# con datos enteramente ficticios. Solo verifican el **contrato local**; ninguna prueba automatizada hace POST a Dhole.
- La opción de `preview` y la herramienta de preparación siguen sin red, y `send` requiere un artefacto autorizado nuevo y controles adicionales. La autorización anterior se usó para **un** intento: **no reutilizarla ni enviar de nuevo**.

## Estado comercial de la solicitud ya creada

El responsable de Pricing debe tratar los detalles de cantidad, tipo y dimensiones de esta **solicitud ficticia** como incorrectos. **No continuar a una cotización comercial basándose en el detalle erróneo**. Se puede conservar como evidencia de integración y marcarla o cancelarla de acuerdo con el procedimiento interno del equipo, sin editar ni eliminar nada automáticamente.

El CBM cobrable de **1 CBM** puede ser coherente con el mínimo comercial de la interfaz; sin embargo, que muestre ese mínimo **no significa que las medidas originales se hayan preservado**.

## Cierre pendiente

1. CI verde en el último commit de la PR #274 para la corrección y los contratos sintéticos.
2. Revisar permisos de lectura de la descripción con personal de Pricing.
3. Mapear `unitType` del formulario real de Castro Fallas antes de habilitar solicitudes automáticas; si no se conoce, **bloquear**, no inventar.
4. No ejecutar segundo POST con la autorización consumida. Una nueva prueba real exige decisión y aprobación independientes.

**No enviar de nuevo ni fusionar PR #274 por el resultado exitoso inicial.**
