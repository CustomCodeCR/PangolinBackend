# Dhole: cotización LCL completa para revisión offline

**Evidencia del 20/11/2026; PR #274 en borrador. No se envían datos a Dhole.**

## Identificadores observados en el Dhole oficial

| Rol | Nombre | Código | Estado |
| --- | --- | --- | --- |
| Servicio | Transporte Internacional | INT_TRANSPORT | Activo |
| Incoterm | CIF | INC-2026-006 (value CIF, slug cfi) | Activo |
| POL marítimo CY | Shanghai, China | POL-2026-074 | Activo |
| POE marítimo CY | Limón/Moin, Costa Rica | POE-2026-002 | Activo |
| POD marítimo SD | Moín, Costa Rica | POD-2026-020 | Activo |

Los cinco UUID fueron compartidos por el usuario mediante JSON de catálogos autenticados. **No están fijados en el código**, y los tests solo usan UUID ficticios. POE y POD son catálogos distintos; no se debe alterar la clasificación CY/SD ni intercambiar identificadores.

## Cómo generar un borrador plano sin conexión

El programa scripts/dhole-lcl-manual-preflight.mjs acepta un JSON privado de cinco registros, con claves service, incoterm, pol, poe y pod. Cada registro lleva id, catalogGroupSlug, code, name, value, isActive y metadataJson para rutas/servicio.

Comando:

    node scripts/dhole-lcl-manual-preflight.mjs /ruta/privada/cinco-registros.json /ruta/privada/lcl-review.json

La salida debe ser un archivo nuevo, creado con permisos privados. **No subirla al repositorio ni usarla como POST.** El script lee el archivo local, no consulta APIs ni utiliza credenciales.

El ejemplo contiene prioridad Green, modalidad LCL/Maritime, Spot provisional, carga ficticia para 2026-12-18, tres cajas de repuestos con 10 kg de peso total por línea. **No incluye valor comercial ni moneda**, porque el ejemplo anterior contemplaba un importe de 1600 sin moneda verificada; no se ha seleccionado seguro de carga. El texto de carga incorpora un bloque de contacto: Persona de Prueba, prueba@example.invalid y +506 0000-0000. La simulación de autorización sirve solo al adaptador offline, **no equivale a la aprobación de un administrador real**.

El mapeo guarda el UUID de servicio en form_serviceIds (nunca el de rateTermItemIds), POL en form_originId, POE en form_destinationId/poeId y POD en form_podId/podId. Los valores fijos de Dhole CLIENTE GENERICO y Castro Fallas se respetan **sin transmitir ningún campo que los sobrescriba**.

El resultado siempre incluye readyForSending=false, remoteSubmissionPermitted=false y noTransport=true, además de bloqueos explícitos. **El cuerpo plano no lleva `form_cargoValue` ni `form_currencyId`; no inventamos importe ni divisa.** Valida estado activo, código, rol, país, terminal, modalidad, UUID distintos y coherencia de campos, contactos y pesos.

## Antes de una prueba auténtica con POST

1. Confirmar de nuevo la vigencia de los cinco UUID y que Pricing admite el recorrido concreto.
2. Revisar en Dhole si el texto completo de descripción se guarda y visualiza con acceso restringido, y si los valores Spot/Maritime y unidades son compatibles.
3. Solicitar autorización específica para un solo POST con contactos completamente ficticios, verificando la respuesta y la deduplicación; no hacerlo desde el flujo normal del cliente.
4. Conectar el transporte desactivado a un orquestador controlado en una fase separada, previa revisión y aprobación.

**No depende de las dos nuevas APIs GET para esta revisión manual; tampoco garantiza la vigencia automática del catálogo ni autoriza envíos a producción.**
