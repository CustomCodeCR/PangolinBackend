# Correo OTP: plantilla visual (rama experimental)

## Alcance

- Cambia solamente la presentación del correo generado por `AuthService.SendMailAsync`.
- El OTP **sigue siendo de seis dígitos**, vence a los cinco minutos y se valida exclusivamente en el backend con el flujo existente.
- El HTML usa estilos en línea, estructura de tablas para correo y una adaptación de ancho reducido.
- Se conserva una alternativa `text/plain` para SMTP y `LocalOutbox`, y un cuerpo HTML en Microsoft Graph.
- El botón **Iniciar sesión** enlaza a `https://www.logisticacastrofallas.com/bienvenidos`. No agrega OTP, identificadores del reto, tokens ni correo del usuario a la URL.
- No se agrega botón falso de copiar: los dígitos son texto seleccionable. Gmail/Outlook no admiten JavaScript para escribir en el portapapeles.
- Se utiliza el ícono corporativo público existente `/favicon.png`. Algunos clientes bloquean imágenes remotas, por lo que el contenido y el código deben seguir siendo legibles sin imágenes.
- El sombreado decorativo del lado derecho es progresivo: los lectores sin soporte de degradados muestran fondo blanco.

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

El programa imprime la ruta del archivo HTML, generado en la carpeta temporal del equipo. Abrir ese archivo en un navegador permite una **aproximación del diseño**, pero no reproduce las limitaciones de Gmail u Outlook.

## Prueba real del formato MIME (Development)

1. Usar `Email:Mode=LocalOutbox` (en Docker: `EMAIL_MODE=LocalOutbox`) y una cuenta de prueba habilitada.
2. Solicitar un OTP desde `/bienvenidos`.
3. Abrir el `.eml` generado en `backend/local-outbox`. Verificar las partes MIME `text/plain` y `text/html`, que el código coincida entre ambas y que no tenga enlaces con datos del OTP.
4. Revisar el correo en lectores de escritorio y celular; si la imagen no carga, el código y el acceso deben seguir visibles.

**No usar una cuenta ni un código real de producción en capturas o reportes.**
`LocalOutbox` está permitido solo en Development. Probar SMTP y Graph con proveedores reales exige credenciales configuradas y un entorno autorizado; la CI únicamente simula las peticiones Graph con respuestas locales.

## Checklist antes de fusionar

- [ ] Pruebas automáticas verdes en la PR
- [ ] Revisión visual aprobada en escritorio y móvil
- [ ] Confirmar el archivo gráfico definitivo con el diseñador, si se requiere fidelidad exacta a la referencia
- [ ] Verificar .eml multipart y experiencia con imágenes bloqueadas
- [ ] Probar envío real cuando el proveedor de correo esté disponible
