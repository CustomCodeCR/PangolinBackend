# Auditoría SEO: metadatos por ruta, indexabilidad y HTTP 404

## Alcance de esta PR (sin despliegue)
- Compartir la configuración de títulos, descripciones y robots entre Vue y el build.
- Generar una copia HTML de entrada por cada ruta del frontend; así el HEAD inicial contiene metadatos adecuados incluso antes de ejecutar JavaScript.
- Las páginas privadas tienen noindex desde el HTML inicial; las públicas usan canonical del dominio previsto al preparar el build.
- En localhost e IP LAN el cliente elimina el canonical para evitar apuntar a las IP de prueba.
- Nginx sirve rutas conocidas desde sus HTML y devuelve 404 real para URLs desconocidas.
- Una URL no reconocida muestra página 404 en Vue también, aunque Vite dev/preview pueden seguir respondiendo HTTP 200 por su fallback.
- El pipeline CI verifica el HTML generado tras compilar.

## Probar desde main/branch (Mac u otro equipo)
```sh
cd frontend
npm ci
npm run build
npm run seo:check
npm run preview -- --host 0.0.0.0 --port 4173
```
Comprobar /, /servicios, /noticias, /nosotros y /tracking. El DOM de localhost/LAN no debe incluir canonical. El HTML bajo dist/servicios/index.html sí debe incluir el canonical de producción y metadatos de Servicios.

## Confirmar el HTTP 404 real
El fallback de Vite no equivale al de Nginx. Para confirmar el 404 del servidor final, construir el contenedor frontend (con backend API configurado si hace falta), abrir una ruta inexistente y verificar la respuesta:
```sh
curl -i http://localhost:PUERTO/no-existe
```
Debe indicar HTTP 404 y un HTML con noindex.

## Límites que permanecen
Este cambio NO es SSR: los títulos y robots se preparan en el HTML inicial, pero el contenido de Vue y el CMS requieren JavaScript para renderizarse. La indexabilidad de noticias publicadas individualmente y prerenderizar el contenido completo son fases posteriores. Tampoco se ha hecho despliegue ni comprobación real de Google Search Console. Las URLs son las del frontend nuevo, no las del sitio web público anterior.

Ninguna página nueva de marketing, estadísticas no verificadas ni cambios visuales forman parte de esta PR.
