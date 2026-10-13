# Castro Fallas — auditoría y mejora responsive

Fecha: 12 de octubre de 2026  
Origen: `castrofallas-unificado-rediseno8` (Rediseño 8).  
Alcance: **solo frontend / presentación**. No se modificaron endpoints, OTP, SMTP, datos, PostgreSQL, Redis, MongoDB, Docker, esquema SQL ni permisos de sesión.

## Correcciones aplicadas

1. **Anchos y contención:** corregidos porcentajes de columnas que sumaban 100 % más `gap` en Tracking y Experiencia. Elementos de grid/flex pueden contraerse sin desbordar; textos y campos largos se ajustan de forma fluida. Se evita esconder contenido vertical debido a un `overflow: hidden` global.
2. **Cabecera:** el menú colapsa antes (1080 px de viewport CSS) cuando los enlaces, idiomas o zoom ya no caben. El panel móvil ocupa el ancho disponible y puede desplazarse verticalmente si la pantalla es corta. Menú de itinerarios y configuración adaptados al panel móvil.
3. **Portada / secciones de home:** altura adaptable y espaciado seguro en portátiles bajos, móviles y zoom; botones y títulos permiten saltos de línea. Noticias laterales y la sección de Tracking evitan anchuras mayores a su contenedor.
4. **Servicios:** el acordeón horizontal del inicio cambia a tarjetas apiladas en teléfonos de hasta 680 px, manteniendo la selección, las fotografías y la expansión. Las tarjetas ya no dependen de deslizar horizontalmente para ver una tarjeta abierta. Se conservó el showcase de la página Servicios.
5. **Noticias:** sidebar, títulos, tarjetas y separador inferior adaptativos. La fila informativa inferior pasa al flujo de la cuadrícula en tablet y móvil, en lugar de ocupar una posición absoluta susceptible a superposiciones. Modal con desplazamiento vertical y altura máxima ligada a `100dvh`.
6. **Itinerarios:** en ancho reducido, los campos se muestran en una sola columna con controles táctiles legibles. Rutas largas admiten saltos de línea y los resultados se mantienen en su tarjeta. No se modificaron los campos ni el comportamiento de la búsqueda de demostración.
7. **Cotizaciones:** opciones y formulario con distribución fluida; indicadores de pasos, formularios y CTA admiten textos largos. Los controles tienen un tamaño de fuente que evita el zoom automático de Safari al enfocarlos en móviles.
8. **Login:** dos paneles en desktop y columna adaptable en móvil. La leyenda inferior ya no está absolutamente posicionada encima de los textos cuando la pantalla es pequeña. El botón flotante de volver arriba no se muestra en la pantalla de login.
9. **Nosotros / footer:** introducción en una columna en celulares, imagen con proporción estable y texto más legible; footer de una columna en teléfonos estrechos.
10. **Accesibilidad visual:** contornos de foco visibles, botones y títulos que admiten saltos, soporte para safe areas y reducción de animación cuando así lo pide el sistema.
11. **Volver arriba:** solo se muestra cuando el visitante ha avanzado más de un 3 % de la página. En celulares es más pequeño y respeta el área segura de pantalla.

## Validaciones efectuadas

| Validación | Resultado |
|---|---|
| `vue-tsc -b` (tipado Vue/TypeScript) | Correcto |
| `python scripts/verify-integration.py` | Correcto |
| CSS analizado mediante `tinycss2` | Sin errores de sintaxis de hoja de estilo |
| Comparación binaria de los 18 archivos existentes del backend con Rediseño 8 | Idénticos |
| Renderizado del frontend Vue en Chromium con viewports 320, 390, 768, 1024 y 1440 px | Sin desbordamiento horizontal global en las ocho rutas probadas |
| Auditoría sintética de contenedores y grids, 42 escenarios de 320 a 1440 px (incluida ventana de 900 × 500) | Sin desbordamientos de los contenedores analizados |
| Menú responsive, cambio de Servicio, resultados de itinerario y modal de Noticias | Interacciones comprobadas en navegador de pruebas |

**Limitaciones:** Para el renderizado en Chromium se usó una compilación temporal de los componentes Vue porque las dependencias nativas de Linux necesarias para `vite build` no estaban disponibles en el entorno. El globo 3D fue sustituido por un módulo de prueba y las imágenes externas al documento de pruebas no pudieron cargarse desde el origen aislado. No se ejecutó Docker ni el backend .NET aquí. Por tanto, las comprobaciones confirman diseño básico, ajustes de layout e interacciones simuladas, pero **no garantizan pixel-perfect en todos los navegadores o zoom reales**. Hay que verificar visualmente en Chrome/Edge, Safari de iPhone y un dispositivo Android antes de publicar.

## Archivos cambiados con respecto a Rediseño 8

- `frontend/src/style.css` — nueva sección final «RESPONSIVE HARDENING» con reglas agrupadas por anchura/altura.
- `frontend/src/Root.vue` — no mostrar el acceso flotante «volver arriba» en login.
- `frontend/src/components/ScrollProgressButton.vue` — mostrar el botón solo después de avanzar por la página.
- `README.md`, `RESPONSIVE-AUDITORIA.md` — documentación.

## Actualizar una instalación Docker existente sin tocar su base de datos

**Recomendado:** no arrancar este ZIP como un proyecto Docker distinto si ya tienes una base de datos en los volúmenes de la carpeta anterior. Docker Compose normalmente toma el nombre del proyecto de la carpeta; al cambiarlo podría crear **volúmenes nuevos** y aparentar que faltan usuarios/cotizaciones (aunque los anteriores sigan existiendo).

1. Haz una copia de seguridad de tu proyecto en funcionamiento.
2. Descomprime esta entrega en una carpeta temporal.
3. Copia **solo** los tres archivos de `frontend/src/` indicados arriba a sus rutas equivalentes en la carpeta Docker que ya funciona. No sustituyas `.env`, `compose.yaml`, carpetas de `backend/` ni volúmenes de PostgreSQL.
4. En PowerShell, desde tu carpeta Docker habitual, ejecuta:
   ```powershell
   docker compose up -d --build --force-recreate frontend
   docker compose ps
   ```
5. Abre `http://localhost:5173` y fuerza la recarga con `Ctrl + F5`.
6. Revisa escritorio (100 %), portátil (125 %), teléfono (375–390 px), teléfono estrecho (320 px), tablet (768–1024 px) y Chrome con 150–200 % de zoom. Comprueba el menú, las noticias, formularios y tarjetas.

Esta actualización **no agrega** guardado al formulario provisional de itinerarios, ni cambia cómo se envían las cotizaciones o los mensajes de contacto.
