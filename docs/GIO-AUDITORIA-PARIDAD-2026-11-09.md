# Auditoría de paridad: GIO y Cotizaciones oficiales
**Fecha:** 2026-11-09 · **Destino:** `main-2`

## Objetivo
Verificar que GIO recolecte información válida sin saltarse las restricciones del cotizador ni mostrar datos privados, incluso con entradas mal formadas, sesiones distintas o errores de API.

## Contratos verificados en código y cubiertos por smoke de navegador
| Caso | Resultado esperado |
| --- | --- |
| Invitado: cotización completa | Debe permitir crearla una sola vez tras confirmar el resumen; conserva recibo detallado de la sesión actual |
| Administrador: cotización | Debe conducir a la solicitud exacta en Administración, no al recibo público |
| Modalidades y tipos | Maritime/FCL-LCL, Air/AIR_LCL, Land/FTL-LTL, iguales al formulario |
| Tamaños/tipos de equipo | Opciones compartidas con el formulario, sin texto libre |
| Servicios oficiales | Mismo catálogo compartido de 13 servicios; selección múltiple; mínimo uno |
| Almacenamiento | Días de almacenamiento entre 1 y 36500 |
| Transporte entrega/recolección | Se requieren direcciones al marcar dichos servicios |
| HTTP directo | Rechaza servicios inexistentes, además de las validaciones previas |
| Origen, destino y POD | Selección desde catálogo oficial, sin destinos inventados ni iguales |
| Fechas de carga | Rechaza pasado, fechas inexistentes y entradas mal formadas |
| Corrección de un campo | Pide confirmación y permite regresar sin enviar |
| Email y medidas | Rechaza email incorrecto, cantidades no positivas y pesos inconsistentes |
| Fallo transitorio HTTP 503 al guardar | Retiene resumen editable y permite reintentar sin registrar una cotización fallida |
| Invitado e itinerarios | Lectura pública sin acceder a operaciones privadas |
| Tracking de un cliente | Exige una sesión de cliente o administrador y una referencia válida; **no** exige que el embarque pertenezca a la empresa autenticada. Solo administradores reciben campos comerciales restringidos |
| Recibo claro/oscuro | Verificar contraste de botones y valores contra tarjetas |
| Apariencia de la ventana de GIO | Comprueba tamaños compacto, mediano y ampliado |

### Política de acceso a tracking confirmada (2026-11-10)

- Decisión del producto: **cualquier cliente autenticado puede consultar un embarque si conoce su referencia**, independientemente de la empresa titular. Los administradores también tienen acceso.
- No se exige verificación de titularidad por `ClienteId` ni `UsuarioId`: así funciona `POST /api/tracking/dynamics/search` con la política `registered` (roles `client` y `admin`).
- Sin iniciar sesión, la ruta de búsqueda permanece protegida. Continúan las validaciones de formato y limitación de solicitudes.
- Los datos logísticos de la respuesta se exponen a cualquier cuenta autenticada que conozca la referencia. Los campos comerciales adicionales permanecen restringidos a administradores.
- Esta decisión implica que **conocer la referencia permite ver determinados datos de un embarque ajeno**. Si más adelante se requiere confidencialidad por empresa, habrá que implantar un control de titularidad antes de consultar o devolver resultados.
- El smoke automatizado utiliza un backend falso; la conexión real con Dynamics/Dhole y los permisos del proveedor requieren verificación autorizada independiente.

La prueba automatizada del navegador está en `frontend/scripts/smoke-gio-workflows.cjs`, con Chrome/Chromium y API falsa. No usa credenciales, embarques o cotizaciones reales.

## Diferencias con el cotizador completo que siguen pendientes
- GIO permite **una** línea de equipo o bultos; el formulario admite varias líneas independientes de cada clase (hasta 25).
- GIO fija unidades de carga no equipada en `cm` y `kg`; el formulario permite elegir otras unidades.
- GIO no pregunta algunos campos opcionales del formulario: CABYS, valor de carga, peso o bultos declarados, observaciones, manejo en destino y algunas banderas (por ejemplo, sobrepeso).
- GIO confirma datos paso a paso, pero su extracción inicial desde lenguaje natural sigue limitada a expresiones reconocibles; no se debe tratar como comprensión garantizada de todo texto.
- El recibo público detallado depende de un traspaso de la misma pestaña mediante `sessionStorage`. No existe lectura pública de cotizaciones por ID, deliberadamente por privacidad. Tras expirar el traspaso o abrirlo en otra pestaña no se pueden reconstruir todos los datos desde la referencia.
- Las pruebas con mock no demuestran la disponibilidad ni exactitud de Dynamics, Dhole, autenticación o la base de datos de producción. Requieren comprobación controlada en el entorno autorizado.

## Comprobación local
Desde la carpeta del repositorio, con dependencias de desarrollo y Chrome instalados:
```powershell
node frontend/scripts/test-frontend-merge.cjs
node frontend/scripts/smoke-gio-workflows.cjs
```

No realizar cotizaciones de prueba contra producción: el smoke usa un servidor falso y datos ficticios.
