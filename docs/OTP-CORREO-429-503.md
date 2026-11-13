# OTP: errores de correo (503) y enfriamiento (429)

## Hallazgo
La pantalla de acceso mostraba `[email_unavailable] (ref. ...)`
ante un fallo del proveedor Microsoft Graph/SMTP. El segundo clic
sobre «Enviar código» durante el minuto de protección generaba un 429.
Estos son dos errores diferentes, aunque una caída del proveedor puede
hacerlos aparecer seguidos.

El backend aplica simultáneamente:
- Límite por dirección de conexión en `Program.cs`: 20 solicitudes/minuto
  para `auth` (también usado al verificar OTP). La mejora segura de
  identificación por proxy se trabaja aparte en PR #202.
- Cuota por correo normalizado, cuyo identificador se guarda solo como
  SHA-256 en PostgreSQL: **2 solicitudes seguidas y máximo 4 cada 15 min**, con pausa de 60 s después de cada pareja.
- Código OTP de 6 dígitos, válido 5 minutos, con máximo 5 intentos
  para verificar; token JWT y autorización sin cambios.

## Cambios
- El 429 de la cuota por correo devuelve `code=otp_rate_limited` y un
  `Retry-After` calculado según `otp_rate_limits`: se permiten dos intentos
  consecutivos, luego una espera de 60 segundos desde el segundo; tras el
  cuarto en la ventana se espera hasta que se cumplan 15 minutos desde el primero.
- El 503 de entrega devuelve `code=email_unavailable`, conserva
  `traceId` para diagnóstico del servidor, y establece `Retry-After`
  **solo si realmente hay una espera**: tras el primer fallo puede
  intentarse otra vez inmediatamente, tras el segundo debe esperarse
  el tiempo anunciado. No se permite evadir el límite antiabuso. Los errores de espera del proveedor se
  consideran errores de entrega salvo que el navegador haya cancelado
  su propia solicitud.
- Vue interpreta 429 y 503 de envío, muestra textos claros ES/EN,
  icono y **una sola cuenta regresiva visible** (en la tarjeta de error o,
  si no hay error activo tras F5, bajo el correo). El botón mantiene un texto
  de espera sin repetir segundos y permanece deshabilitado durante el periodo,
  y conserva el enfriamiento dentro de `sessionStorage` por cuenta
  (marcador opaco con sal aleatoria de la pestaña, sin guardar el correo,
  OTP, sesión ni credenciales). Cambiar de correo no bloquea otro usuario;
  volver al mismo conserva el tiempo restante. El backend siempre valida
  los límites independientemente de la interfaz.
- Otros errores 5xx muestran un texto genérico: nunca concatenar
  identificadores técnicos ni trazas en la interfaz.
- El OTP previamente válido NO se invalida cuando fracasa un nuevo
  envío. La nueva solicitud fallida queda marcada como usada.
  Solo después de que el transportista de correo acepta el nuevo
  mensaje se invalidan los OTP anteriores. La entrega al buzón
  no puede garantizarse simplemente porque Graph acepte la petición.

## Pruebas de QA sin bombardear el proveedor

1. Revisar GitHub CI: compilar .NET y Vue, ejecutar
   `node frontend/scripts/test-frontend-merge.cjs`.
2. En Docker **local** y una cuenta **de prueba**, simular un 503
   `email_unavailable` en una respuesta de `/api/auth/request-otp`
   usando DevTools > Sources > Snippets; no enviar solicitudes a
   Microsoft. Responder HTTP 503 con JSON
   `{"code":"email_unavailable"}` **sin** encabezado `Retry-After`
   para el primer intento: el mensaje debe permitir reintentar de inmediato.
   Después simular otro 503 **con** `Retry-After: 30`: el contador
   debe bloquear la solicitud durante el tiempo indicado. Confirmar
   textos sin códigos internos y estilos claro/oscuro/móvil/inglés.
3. Simular un 429 local con `Retry-After: 70` y confirmar el texto
   «Esperá un momento», el contador y que F5 no lo reinicia.
   Confirmar que al terminar se habilita el botón, sin enviar
   un OTP real durante el periodo de prueba.
4. En entorno aislado, con `LocalOutbox` y cuenta ficticia, verificar
   máximo 4 solicitudes en 15 min, dos seguidas y pausa de 60 s tras
   la segunda. El smoke local también comprueba `Retry-After` de la segunda
   solicitud exitosa y del tercer intento rechazado, e invalida el primer
   OTP **solo tras la aceptación del segundo envío**; comprobar también expiración
   OTP y rechazo de códigos reutilizados. No cambiar límites reales.
5. Verificar que `/api/auth/verify-otp` mantiene 5 intentos por
   challenge, que un OTP previo es válido si el nuevo envío
   falla, y que solo el nuevo OTP permanece válido al enviar con éxito.
   **Aún pendiente:** prueba automatizada aislada de fallo real del transportista
   sobre un OTP previo vigente; no simular errores ni enviar ráfagas contra Graph.
6. Asegurar que no se cambió `Email:Mode` de producción ni se publicó
   correo, token o código OTP en los logs.

No afecta Fennec, Dhole, Cloudflare, Argos ni el proveedor de correo
hasta que exista un merge y despliegue expresamente autorizados.
