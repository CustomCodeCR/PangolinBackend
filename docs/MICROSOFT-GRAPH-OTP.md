# OTP por Microsoft Graph (PangolinBackend)

## Objetivo
Enviar OTP como `tracking@grupocastrofallas.com` sin SMTP AUTH básico y
sin desactivar Security Defaults. El frontend, JWT, PostgreSQL y el contrato de
`POST /api/auth/request-otp` siguen iguales. Se conserva SMTP como fallback
configurable para otros entornos y LocalOutbox solo en Development.

## 1. Registrar aplicación en Microsoft Entra (administrador)
- En `https://entra.microsoft.com/` → Entra ID → App registrations → New registration.
- Nombre: `PangolinBackend-Mail`. Solo cuentas de este directorio. Sin Redirect URI.
- Copiar Application (client) ID y Directory (tenant) ID.
- Certificates & secrets: crear credencial de aplicación con vencimiento corto
  o gestionar posteriormente certificado; guardar el valor en un gestor de secretos,
  **nunca en código ni GitHub**.
- En Enterprise applications → PangolinBackend-Mail → Properties, copiar el
  **Object ID de Enterprise application/service principal**. No utilizar el
  Object ID de App registrations para `New-ServicePrincipal`.
- **No conceder Mail.Send de tipo Application con consentimiento de administrador
  en Entra**: esa concesión no tiene ámbito y daría acceso a otros buzones.
  Para este caso la autorización viene de Exchange RBAC for Applications.

## 2. Autorizar SOLO el buzón en Exchange Online
En PowerShell 7 de Linux (`pwsh`) con una cuenta con permisos suficientes:

```powershell
Connect-ExchangeOnline -Device

# Reemplazar por los IDs reales obtenidos de Entra.
$appId = "CLIENT_ID_DE_PANGOLIN"
$spObjectId = "OBJECT_ID_DE_ENTERPRISE_APPLICATION"

# Confirmar el UPN del buzón antes de establecer el filtro.
Get-Mailbox -Identity tracking@grupocastrofallas.com |
  Format-List UserPrincipalName,PrimarySmtpAddress

New-ServicePrincipal -AppId $appId -ObjectId $spObjectId -DisplayName "PangolinBackend-Mail"
New-ManagementScope -Name "Pangolin-Tracking-Only" -RecipientRestrictionFilter "UserPrincipalName -eq 'tracking@grupocastrofallas.com'"
New-ManagementRoleAssignment -Name "Pangolin-MailSend-Tracking" -App $spObjectId -Role "Application Mail.Send" -CustomResourceScope "Pangolin-Tracking-Only"

Test-ServicePrincipalAuthorization -Identity $spObjectId -Resource tracking@grupocastrofallas.com |
  Format-Table RoleName,GrantedPermissions,AllowedResourceScope,InScope -AutoSize
```

El resultado para `Application Mail.Send` debe indicar `InScope = True`.
Probar además un buzón diferente (si está autorizado) y confirmar `InScope = False`.
El test no evalúa permisos amplios que pudieran haberse concedido en Entra;
comprobar que la aplicación **no tiene** permiso `Mail.Send` de tipo
Application concedido globalmente en ese portal.

Las asignaciones de Exchange pueden tardar hasta 30 minutos–2 horas en
propagarse, según actividad y cachés. No desplegar producción hasta probar.

## 3. Configuración del backend
En el `.env` privado de Pangolin (o variables del servidor de producción):

```dotenv
EMAIL_MODE=Graph
GRAPH_TENANT_ID=<DIRECTORY_TENANT_ID>
GRAPH_CLIENT_ID=<APPLICATION_CLIENT_ID>
GRAPH_CLIENT_SECRET=<VALOR_PRIVADO_CREADO_EN_ENTRA>
GRAPH_FROM=tracking@grupocastrofallas.com
```

El `compose.yaml` de desarrollo mapea estas variables a:
`Email__Mode`, `Graph__TenantId`, `Graph__ClientId`,
`Graph__ClientSecret`, `Graph__From`. Para despliegues diferentes de
`compose.yaml`, definir esos mismos valores en la configuración .NET
de la instancia. Nunca dejar credenciales en el repositorio ni publicarlas
en logs o capturas.

## 4. Verificación
- Revisar que la aplicación obtenga tokens para
  `https://graph.microsoft.com/.default`.
- Solicitar OTP desde el frontend existente; el destinatario debe recibir el
  correo desde `tracking@grupocastrofallas.com`.
- El backend considera éxito HTTP `202 Accepted`, que significa aceptación de
  Graph pero **no** garantiza entrega; verificar recepción con una prueba real.
- Confirmar expiración de 5 minutos, máximo de intentos y sesión JWT sin cambios.
- Ante errores, consultar eventos del backend y permisos Exchange; no
  registrar OTP, tokens, contraseña de aplicación ni encabezados Authorization.
- Regresar temporalmente a SMTP es posible configurando `EMAIL_MODE=Smtp`,
  pero Microsoft 365 con Security Defaults no acepta SMTP AUTH básico.

Documentación oficial:
- https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac
- https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
