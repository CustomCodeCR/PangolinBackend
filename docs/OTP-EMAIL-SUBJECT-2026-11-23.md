# OTP en asunto del correo — propuesta sujeta a aprobación

## Problema detectado

El asunto `Código de acceso | Castro Fallas · DCF7AB6D` puede parecer un segundo código de acceso, sobre todo en la notificación de Gmail. Sin embargo, el sufijo de ocho caracteres es una referencia aleatoria para evitar que Gmail agrupe solicitudes distintas en una misma conversación; **no** sirve para iniciar sesión.

## Propuesta de la PR

Mostrar **el mismo OTP real de seis dígitos** al final del asunto, por ejemplo `Código de acceso | Castro Fallas · 004219` (código **ficticio**). El OTP de seis dígitos se conserva con sus ceros iniciales. Se elimina la referencia aleatoria de ocho caracteres.

El cuerpo HTML y la alternativa de texto ya contienen el OTP; se conservan intactos. El botón de acceso sigue transportando solamente el identificador opaco del desafío en el fragmento de URL, nunca el código. La validez de **cinco minutos**, validación de un solo uso y las limitaciones de intentos no cambian. SMTP, Microsoft Graph y LocalOutbox utilizan un mismo asunto, generado desde el OTP del desafío.

## Decisión de seguridad necesaria antes de fusionar

**Advertencia importante:** el asunto puede exponerse en la pantalla bloqueada de un teléfono, la lista de notificaciones, clientes de correo compartidos y registros de cabeceras del proveedor. Un tercero podría ver el OTP de un solo uso durante sus cinco minutos de validez **sin abrir el mensaje**, debilitando la privacidad que ofrecía el asunto anterior. Es una decisión de producto deliberada para facilitar la lectura desde notificaciones, **no** una mejora de seguridad.

Esta PR permanece **draft** para revisión; no se fusionará automáticamente a `main-2`, y nunca a `main` ni se enviarán correos reales como prueba sin autorización.

## Pruebas

- El asunto tiene exactamente el OTP que aparece en HTML/texto, sin sufijo falso, y conserva ceros iniciales.
- Los seis dígitos deben validarse. Las entradas inválidas se rechazan.
- Enlace del botón, expiración, plantilla responsiva y adjuntos CID sin cambios.
- `tests/OtpEmailTemplateHarness` y pruebas de envíos Graph/SMTP/LocalOutbox por GitHub Actions; nunca usar OTP reales en capturas ni reportes.
