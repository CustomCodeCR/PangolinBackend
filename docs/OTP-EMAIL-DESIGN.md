# Correo OTP: plantilla visual (rama experimental)

## Alcance

- Cambia solamente la presentación del correo generado por `AuthService.SendMailAsync`.
- El OTP **sigue siendo de seis dígitos**, vence a los cinco minutos y se valida exclusivamente en el backend con el flujo existente.
- El HTML usa estilos en línea, estructura de tablas para correo y una adaptación de ancho reducido.
- Se conserva una alternativa `text/plain` para SMTP y `LocalOutbox`, y un cuerpo HTML en Microsoft Graph.
- El botón **Iniciar sesión** enlaza a `https://www.logisticacastrofallas.com/bienvenidos`. No agrega OTP, identificadores del reto, tokens ni correo del usuario a la URL.
- No se agrega botón falso de copiar: los dígitos son texto seleccionable. Gmail/Outlook no admiten JavaScript para escribir en el portapapeles.
- Se utiliza una G roja transparente recortada a partir de la referencia del diseñador y un globo rojo difuminado. Ambas imágenes viajan dentro del correo como recursos con Content-ID (CID).
- SMTP y LocalOutbox generan MIME multipart/related con PNG y JPEG. Microsoft Graph adjunta los mismos recursos mediante fileAttachment con isInline=true.
- Ya no se depende del favicon público ni de URLs externas para cargar las imágenes.

## Prueba sin enviar correos

Desde la raíz del repositorio (requiere SDK .NET 10):

```sh
dotnet run --project tests/OtpEmailTemplateHarness/OtpEmailTemplateHarness.csproj -c Release
dotnet run --project tests/GraphEmailSenderHarness/GraphEmailSenderHarness.csproj -c Release
```

Generar una vista previa HTML local con el OTP ficticio `482913`:

```sh
dotnet run --project tests/OtpEmailTemplateHarness/OtpEmailTemplateHarness.csproj -c Release -- --preview
```

El HTML generado directamente utiliza referencias CID que no resuelven en el navegador. Para comprobar correctamente las imágenes debe abrirse un archivo .eml con el siguiente script de vista previa.

## Prueba real del formato MIME (Development)

1. Usar `Email:Mode=LocalOutbox` (en Docker: `EMAIL_MODE=LocalOutbox`) y una cuenta de prueba habilitada.
2. Solicitar un OTP desde `/bienvenidos`.
3. Abrir el `.eml` generado en `backend/local-outbox`. Verificar sus partes de texto y HTML y los recursos CID asociados.
4. Ejecutar `python scripts/preview-otp-email.py` desde la raíz. El script abre el correo más reciente y resuelve las imágenes CID dentro del HTML de vista previa, sin enviar correos.
5. Borrar `backend/local-outbox/vista-previa-otp.html` después de revisar, ya que contiene un código OTP de prueba. Comprobar también clientes reales de correo, donde las imágenes pueden bloquearse.

**No usar una cuenta ni un código real de producción en capturas o reportes.**
`LocalOutbox` está permitido solo en Development. Probar SMTP y Graph con proveedores reales exige credenciales configuradas y un entorno autorizado; la CI únicamente simula las peticiones Graph con respuestas locales.

## Checklist antes de fusionar

- [ ] Pruebas automáticas verdes en la PR
- [ ] Revisión visual aprobada en escritorio y móvil
- [ ] Confirmar el archivo gráfico definitivo con el diseñador, si se requiere fidelidad exacta a la referencia
- [ ] Verificar .eml multipart y experiencia con imágenes bloqueadas
- [ ] Probar envío real cuando el proveedor de correo esté disponible
