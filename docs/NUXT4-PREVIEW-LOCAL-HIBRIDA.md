# Vista local híbrida Nuxt 4 + Vue (PR #141)

La vista `localhost:8082` se sirve exclusivamente desde Nuxt: las rutas privadas de login, cotizaciones, tracking, itinerario y administración no están allí y muestran 404. Esto es esperado y **no** elimina esas funciones. Para probar el recorrido completo desde un solo origen, esta PR incorpora un gateway opcional, exclusivamente local, en `localhost:8083`.

## PowerShell, desde la carpeta del proyecto

```powershell
git fetch origin
git switch feat/nuxt4-migration-seo-safety-139
git pull --ff-only origin feat/nuxt4-migration-seo-safety-139
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml up -d --build backend frontend frontend-nuxt nuxt-local-gateway
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml ps
```

Navegar a:

- **http://localhost:8083/**: prueba híbrida (páginas públicas en Nuxt, rutas privadas en Vue y API en .NET).
- http://localhost:8082/: solo Nuxt público. Los 404 de rutas privadas aquí son normales.
- http://localhost:5173/: frontend original Vue/Vite, referencia visual.

El nuevo Nginx enruta `/api/public-news` a Nitro, `/api/*` al backend .NET, y las rutas autenticadas y recursos de desarrollo de Vue a Vite. Los demás enlaces se entregan desde Nuxt. Así se puede navegar entre servicios y cotizaciones sin cambiar de puerto, aunque las páginas privadas todavía no hayan sido migradas.

## Seguridad y limpieza

- No desplegar este gateway local en producción. No elimina ni recrea volúmenes deliberadamente.
- Por defecto solo publica `127.0.0.1:8083`. Para ver la preview desde otro equipo de una LAN privada y de confianza se puede definir `NUXT_LOCAL_GATEWAY_BIND_IP=0.0.0.0`, evitando redes públicas y credenciales reales por HTTP.
- Para detener solo el gateway local:

```powershell
docker compose -f compose.yaml -f compose.nuxt-preview.yaml -f compose.nuxt-local-hybrid.yaml stop nuxt-local-gateway
```

La configuración de producción `deploy/nuxt-hybrid-gateway.conf` sigue siendo independiente y no cambia de puertos ni de proveedores por esta prueba.

## Revisión visual propuesta

1. Abrir Servicios, entrar a un transporte y volver a abrir el menú. La página debe mostrarse resaltada y la categoría Transportes expandida.
2. En pantalla amplia, pasar por Transportes para desplegar el submenú lateral. En ventanas pequeñas, pulsar Transportes para abrirlo debajo, desplazando solo el menú.
3. Abrir Configuración y cambiar idioma, con las dos opciones completas dentro de la misma tarjeta.
4. Probar modo claro y oscuro, móvil y escritorio; confirmar que el menú nunca tape la selección sin opción de desplazarse.
5. Desde `8083`, comprobar login/cotizaciones sin 404 y los permisos de la sesión. No usar cuentas reales de producción sin HTTPS.
