# Auditoría de campos — Cotizador oficial, GIO y contrato Pricing de Dhole

Fecha de revisión: 2026-11-23. Rama: `feat/dhole-approved-submission-outbox-20261120` (PR #274, borrador). **Sin despliegue, fusiones, credenciales nuevas ni POST real a Dhole.**

## Fuentes de esta auditoría

- Contrato externo versionado: `scripts/contracts/dhole-solicitar-tarifa-published-20261120.json` (103 entradas planas, únicamente `priority` declarada obligatoria en el Gateway; **no significa que una tarifa útil necesite solo prioridad**).
- Validación y persistencia: `backend/Models/OfficialQuoteModels.cs`, `backend/Endpoints/OfficialQuoteEndpoints.cs` y `DholeQuoteSelectionValidator`.
- Captura real: `frontend/src/pages/OfficialQuoteWizard.vue` y `frontend/src/components/GioOperations.vue`.
- Mapping de Pricing y estado de sus GET: `docs/DHOLE-CATALOG-PRODUCTION-CROSSWALK-20261120.md`, `docs/DHOLE-LOOKUPS-READONLY-PREVIEW.md`.
- Preparación sin envío: `backend/Services/DholeOfficialQuoteDraftBuilder.cs` y `DholeOfficialQuoteFlatPreviewBuilder.cs`.

## Matriz de campos introducidos por el usuario

| Dato | Cotizador oficial | GIO | Validación del servidor / salida a Dhole |
| --- | --- | --- | --- |
| Modalidad y tipo | 3 modalidades / FCL-LCL, AIR_LCL, FTL-LTL | Iguales | Combinaciones exactas; proyección `Fcl/Lcl/Air/Ftl/Ltl` |
| Origen POL y destino POE | Selector por rol | Selector por rol | UUID vigente por rol y modalidad, nunca cadena libre ni UUID local |
| POD marítimo | Obligatorio en FCL y LCL | Obligatorio en FCL y LCL | UUID del catálogo POD; sin POD en Air/Land |
| Incoterm | Lista del GET activo si Dhole habilitado; local histórico con flag apagado | La misma | Comparación de `value` único; UUID dinámico para el POST |
| Fecha carga lista | Fecha ≥ hoy en Costa Rica | Fecha ≥ hoy en Costa Rica | Fecha real, revisada de nuevo al enviar |
| Servicios | Selección múltiple | Selección múltiple | 12 opciones locales con código de Pricing confirmado en evidencia del 20/11; `Transporte nacional` retirado |
| EXW | Condición fiscal/nacionalizada y dirección | Ambas preguntas | Obligatorios solo si se elige EXW |
| Almacenamiento | Días fiscales | Días fiscales | 1 a 36500 al elegir `Almacenamiento` |
| Entrega/recolección | Dirección por servicio | Dirección por servicio | La dirección corresponde a `Transporte entrega` o `Transporte recolección`, respectivamente |
| Mercancía | Descripción | Descripción | Obligatoria, longitud máxima, más contacto identificado en descripción enviada |
| FCL/FTL equipos | Hasta 25 líneas; tamaño, tipo, cantidad, pesos por unidad | Línea inicial + 24 adicionales editables | Revalida tamaño/tipo frente a catálogo y pesos por unidad; FTL requiere **UUID de tipo**, no de tamaño |
| LCL/Air/LTL bultos | Hasta 25 líneas con cantidad, tipo, peso total de línea, dimensiones y estibabilidad | Línea inicial + 24 adicionales con peso **por bulto** | GIO convierte al peso total de línea al persistir; ambos terminan en peso **por unidad** para `sellerContext_consolidatedCargoLines` |
| Unidades | cm/m/in y kg/lb en formulario | cm/kg en GIO | Ambos se normalizan a cm/kg en borrador; GIO informa explícitamente su unidad |
| Carga peligrosa / no estibable / sobrepeso | Opciones del formulario | Pregunta peligrosa, estibabilidad por línea y sobrepeso en datos adicionales | Banderas guardadas y publicadas en vista preliminar cuando aplica |
| CABYS | Opcional | Opcional en datos adicionales | Se conserva y se proyecta a `form_cabysCode` si existe |
| Valor declarado | Opcional; **obligatorio y positivo para seguro de carga** | Igual | Debe incluir código de moneda ISO de 3 letras; **no se construye `form_currencyId` sin catálogo de divisas autorizado** |
| Moneda valor declarado | Si se declara valor, texto ISO 4217 (no un UUID) | Igual | Se almacena como código, no como ID de Pricing |
| Peso/bultos declarados | Opcionales (adicionales a la suma por líneas) | Iguales | Permanecen en Administración y el borrador; no sustituyen totales calculados por líneas |
| Observaciones | Opcionales | Opcionales, hasta 4000 caracteres | `form_cargoObservations` solo si hay texto |
| Manejo en destino | Texto opcional | Texto opcional | Permanece en Administración; **no se fuerza a `portHandlingMode` sin opciones verificadas** |
| Nombre, correo y teléfono | Obligatorios | Obligatorios | Se conservan; nunca se inventan `form_clientId`, vendedor o ejecutivo |

## Opciones verificadas y límites

1. **12 servicios:** de acuerdo con la evidencia oficial fechada (Pricing), los nombres públicos se asocian por **código**, no por coincidencia de nombre o UUID fijo. Los 12 valores locales se comparten entre GIO, wizard y backend. El GET `pricing-services` todavía no consta como API externa publicada para actualizaciones automáticas.
2. **FTL:** se ofrecen los cuatro tamaños históricos observados (`24 pies / 5 TON`, `26 pies / 7 TON`, `48 pies`, `53 pies`) y cuatro tipos (`Furgón seco`, `Plataforma / Carreta`, `Refrigerado`, `Furgón con cortina`). Su asociación tamaño/tipo con un **UUID de tipo activo** no se puede certificar sin `land-equipment-types`; el contrato local debe bloquear el POST si no hay resolución única validada.
3. **FCL:** el par tamaño/tipo se obtiene de las combinaciones publicadas, no de mezclar libremente todas las opciones.
4. **LCL/AIR_LCL/LTL:** `Box`, `Pallet`, `Loose` y `Other` son las unidades publicadas del contexto de mercancía consolidada. No se inventan opciones aéreas ULD no verificadas.
5. **Campos internos del contrato de 103 entradas:** `form_clientId`, `sellerUserId`, ejecutivo, tarifas manuales, importes, divisas internas, rutas Miami/SED, gestión de puertos, agentes, transportistas, `requestContext` y `sellerContext` calculados **no son todos campos de captura pública**. Algunos se derivan; otros requieren reglas de negocio y catálogos/credenciales que aún no se han recibido. No exponerlos como opciones sin respaldo.
6. El Gateway marca como obligatorio solo `priority`; la validación de negocio de BackendJJ exige origen/destino, modalidad, fecha, servicios, mercancía y contacto. **Eso no prueba que cada flujo interno y modalidad comercial de Pricing haya sido validado en vivo**.

## Bloqueos explícitos antes de cualquier envío automático

- Falta publicar/verificar los GET de `pricing-services` y `land-equipment-types` con `isActive`, `code`, UUID y metadatos de tamaño/tipo adecuados. El equipo Dhole quedó en entregarlos (no crear endpoints desde esta PR).
- Para valores declarados y seguro hace falta un catálogo de moneda con mapeo código ISO → `form_currencyId` activo y único; mientras no exista, no enviar importes ni inventar IDs.
- Confirmar el contrato de `portHandlingMode`, cargoCondition, servicios especiales, cargos Miami/SED y opciones comerciales antes de tratarlos como solicitables en el frontend.
- Verificar comportamiento real de Pricing ante respuestas 2xx, IDs externos y datos de mercancía LCL; la primera prueba previa necesitó corrección de cantidades/tipos/medidas y no autoriza un nuevo POST.

## Criterio de liberación

No dar la integración por completa hasta que las pruebas de navegador de GIO y del formulario, build .NET/Vue, harness del borrador de cinco modalidades y PostgreSQL desechable terminen verdes; luego, **revisión de negocio** de casos reales (incluidos seguros, múltiples líneas, EXW, almacenamiento, transporte entrega/recolección), y aprobación independiente de cualquier publicación/activación. El outbox/dispatcher de esta PR se mantienen **apagados** y sin POST a Dhole.
