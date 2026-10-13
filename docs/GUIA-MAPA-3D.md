# Portada 3D - Castro Fallas

El proyecto tiene frontend Vue 3/Vite, backend .NET y Docker Compose. No se reemplazó el formulario original.

- `/`: portada con globo interactivo `3d-world-map`.
- `/cotizaciones`: formulario de cotizaciones original.

## Ejecución en VS Code (Windows PowerShell)

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Abrir el enlace local que muestra Vite. Para probar el formulario completo, se requiere además el backend y las bases de datos del proyecto.

## Docker Compose

Desde la carpeta raíz del proyecto:

```powershell
docker compose up -d --build
```

Abrir `http://localhost:8080/` y pulsar **Ir a cotizaciones**.

## Archivos nuevos

- `frontend/src/Home.vue`: portada provisional 3D.
- `frontend/src/Root.vue`: selección de la portada o el formulario mediante la URL.
- `frontend/src/main.ts`: ahora carga `Root.vue`.

`frontend/src/App.vue` conserva el formulario original.

## Importante: licencia

`3d-world-map` usa el motor CanvasGlobe, y el propio paquete exige licencia comercial para uso público en producción. Esta portada es una prueba provisional; revisar licencia antes de publicarla. Si disponen de clave, incorporarla mediante `licenseKey` en las opciones de `createGlobe`.

El repositorio adjunto ya incluía `3d-world-map` en `frontend/package.json`. No hay que pegar un `script` CDN en `index.html` porque el frontend Vue/Vite hace la importación directamente.
