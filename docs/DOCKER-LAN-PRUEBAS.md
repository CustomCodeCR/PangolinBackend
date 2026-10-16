# Acceso temporal por Wi-Fi al frontend de Docker

> Solo para **pruebas dentro de una red privada de confianza**. No es una
> configuración de producción ni para exponer el administrador en Internet.

## ¿Qué se cambia?

- `compose.yaml` mantiene `127.0.0.1:5173` por defecto; el frontend tiene
  ahora la variable optativa `FRONTEND_BIND_IP`.
- Solamente cambia el puerto **5173** publicado por Docker. PostgreSQL 5433,
  .NET directo 5000 y MinIO 9000/9001 siguen vinculados a `127.0.0.1`.
  Redis y Mongo ni siquiera publican un puerto host.
- OJO: aunque el puerto directo 5000 queda cerrado a la LAN, las peticiones
  `/api` (incluido SignalR) **sí pasan a .NET por el proxy del frontend**.
  Esto es necesario para que los navegadores externos funcionen.
  Las API mantienen autenticación, pero no se debe usar una red pública.
- No se toca `.env`, los secretos, el esquema SQL ni ningún volumen. Docker
  recrea contenedores de la app si lo requiere, pero conserva los datos.
  Jamás ejecutar `docker compose down -v`.

## Abrir temporalmente acceso desde PowerShell en Windows

Desde la carpeta del repositorio, con Docker Desktop y contenedores ya instalados:

```powershell
git status
git fetch origin
git switch feature/signalr-live-updates-20261016
git pull --ff-only origin feature/signalr-live-updates-20261016
$env:FRONTEND_BIND_IP = "0.0.0.0"
docker compose -f compose.yaml -f compose.minio.yaml config --services
docker compose -f compose.yaml -f compose.minio.yaml up -d --build
docker compose -f compose.yaml -f compose.minio.yaml ps
```

`config --services` solamente lista los servicios, no cambia datos. El
`up -d --build` crea/recrea servicios de aplicación según necesidad, sin
eliminar volúmenes. Al cambiar de rama se compilan también los endpoints
SignalR del backend.

En el PC que hospeda, ejecutar `ipconfig` y consultar **IPv4 de Wi-Fi**
(por ejemplo `192.168.1.50`, es solo un ejemplo). Desde el otro dispositivo
en la **misma red Wi-Fi**, abrir:

```text
http://192.168.1.50:5173/home
```

Para comprobar sin perder datos:

```powershell
docker compose -f compose.yaml -f compose.minio.yaml ps
curl.exe http://localhost:5000/api/health/ready
```

Se espera que Docker muestre algo parecido a `0.0.0.0:5173->5173/tcp`
para el frontend; los puertos de PostgreSQL, backend y MinIO continúan con
`127.0.0.1`.

En Windows, permitir tráfico **solo en perfil Privado** para el puerto TCP
5173, idealmente únicamente desde la subred local. No modificar reglas del
perfil Público ni abrir puertos del router. Algunas redes Wi-Fi con aislamiento
de clientes impiden conexiones entre dispositivos. Si aparece una advertencia
de Windows Defender Firewall, no habilitar acceso a redes públicas.

No introducir contraseñas ni OTP personales por HTTP desde una Wi-Fi
compartida o desconocida. Para acceso desde fuera de la LAN debe desplegarse
con HTTPS/WSS, dominio, proxy seguro y configuración de producción.

## Prueba simple de SignalR

Abrir Home en el PC y en un celular conectado al mismo Wi-Fi. Desde
Administración → Editor visual, editar una **ubicación de texto de prueba**.

1. Guardar borrador: Home del otro dispositivo no cambia.
2. Publicar: ambos navegadores cambian sin F5.
3. Restaurar original: ambos vuelven al texto anterior.

Si no funciona, revisar que esté usando la rama de SignalR, la dirección IPv4
correcta y que el firewall permita el puerto 5173 en la red Privada. El
navegador puede mostrar errores WebSocket de `/api/hubs/updates` si se perdió
la conexión; la reconexión intenta sincronizarse.

## Cerrar el acceso a la red (reversión inmediata)

**En el mismo PowerShell**, quitar la variable de la sesión y recrear solo el
frontend para que Docker vuelva a vincular el puerto a localhost:

```powershell
Remove-Item Env:\FRONTEND_BIND_IP -ErrorAction SilentlyContinue
docker compose -f compose.yaml -f compose.minio.yaml up -d --no-deps --force-recreate frontend
docker compose -f compose.yaml -f compose.minio.yaml ps
```

Esperar `127.0.0.1:5173->5173/tcp` en frontend. Si se abrió una regla
manual del Firewall para estas pruebas, eliminarla. El backend, MinIO y
las bases de datos no se detienen, se reinician ni se borran en este paso.

> Si se agregó `FRONTEND_BIND_IP` al archivo privado `.env` por cuenta
> propia, también hay que retirarla del archivo o el acceso seguirá habilitado
> al reabrir una consola.
