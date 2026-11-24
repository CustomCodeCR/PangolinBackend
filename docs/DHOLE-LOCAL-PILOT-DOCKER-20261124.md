# Docker local — piloto único de cotizaciones

## Etapa 1: solo captura, SIN POST
Trabajar en la rama de la PR #274 desde el repositorio local, con Docker Desktop y .env privado habitual. Verificar git status antes de cambiar ramas. La clave GET existente debe estar configurada; no compartirla. El launcher habitual admite una nueva opción:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -BindIp 127.0.0.1 -StageDholePilot
```
Esta opción carga el overlay de catálogos existentes y el overlay stage; guarda la copia original y la cola con idempotencia. El backend aplica el esquema local de desarrollo existente. No activa POST, worker, ni correo de confirmación. Abrir http://127.0.0.1:5173/cotizaciones. Crear una sola solicitud ficticia marcada PRUEBA TÉCNICA — NO COTIZAR con correo controlado por el operador. Revisar el UUID local y los datos en Administración. No usar un tercero real.

## Etapa 2: preparada pero NO autorizada todavía
El overlay compose.dhole-pilot-send.yaml exige UUID exacto, fecha de expiración UTC y clave POST privada. No forma parte del launcher habitual. Requiere los archivos base e híbridos, preview y stage. Antes de habilitarlo: CI verde, permiso explícito para un POST real, revisión de contacto, fecha UTC válida elegida para el piloto (sin límite fijo de diciembre), credencial POST rotada y Graph configurado. La configuración se limita a ese UUID, jamás al backlog. El propietario delegó la decisión de moneda el 24/11: el overlay de envío usa revisión comercial manual, conservando importe y moneda originales en observaciones y el servicio Seguro de carga. Para el único piloto LCL se puede incluir un importe ficticio en CRC o EUR y comprobar que Pricing lo recibe sin tratarlo como USD ni calcular un seguro erróneo. La cotización sigue marcada NO COTIZAR; no pedir una tarifa real. No activar con claves copiadas en chat ni con destinatarios no controlados. Los comandos de activación se entregan solo tras autorización del piloto.

## Detener y entregar
Volver a ejecutar launcher con -StageDholePilot para restablecer flags OFF (recrear backend). No eliminar volúmenes, ni reintentar InFlight/Unconfirmed. Comprobar recepción en Pricing por UUID y pesos/dimensiones, además de mensaje y email. API de lectura extra queda diferida; AcceptedByProvider no afirma verificación GET independiente. Producción: deploy/docker-compose.images.yml ya acepta parámetros separados y default OFF. Usar el release normal y migración SQL con respaldo antes de activar, nunca copiar el overlay piloto al servidor.

No se ha ejecutado Docker local desde el asistente. Los archivos preparan el procedimiento, no prueban el entorno local ni otorgan autorización para el POST.
