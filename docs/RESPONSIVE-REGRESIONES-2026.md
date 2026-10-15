# Restauración del menú móvil e itinerarios (octubre de 2026)

## Referencia

Se usó el ZIP aportado por el equipo: **`PangolinBackend-cambiosAntiCagada2.zip`**, en particular su `RESPONSIVE-AUDITORIA.md`, `frontend/src/style.css` y `frontend/src/components/SiteHeader.vue`. No se copió el backend ni se revirtió el diseño completo.

La integración de rediseño reemplazó el menú abierto de dos filas CSS Grid por una estructura con `flex-wrap` y `width:100%`. Eso permitió que la cabecera, los enlaces y el panel rojo se desplazaran en distintas rutas y anchuras.

## Solución

- `frontend/src/responsive-regressions.css` se carga **después** del `style.css` actual. Restaura la cuadrícula del header del ZIP, con la primera fila de 72px para logo y hamburguesa, y una segunda fila para navegación.
- Se mantiene la lógica actual de Vue para admin/cliente, JWT, idiomas, sesión y panel de configuración. No se reemplaza `SiteHeader.vue` por el antiguo.
- En `/itinerario` los tres rangos (Closing, ETD, ETA) se presentan como grupos claramente rotulados **Desde** y **Hasta**. Se mantienen los parámetros `closingDesde/closingHasta`, `etdDesde/etdHasta`, `etaDesde/etaHasta`, la validación de fechas y paginación.
- Se restauran las traducciones `dateFrom` y `dateTo` en ES/EN. Ya no deberían aparecer IDs técnicos en pantalla.
- `scripts/verify-integration.py` incluye comprobaciones estáticas que alertan de futuras regresiones.

## Validación sugerida antes de fusionar

1. Esperar a que pasen las acciones de GitHub: `frontend` (`vue-tsc`/Vite), `backend` y `verify-integration`.
2. Ejecutar localmente con Docker sin tocar datos: `docker compose up -d --build --force-recreate frontend`.
3. En Chrome, revisar `/home`, `/noticias`, `/servicios`, `/itinerario` con 320, 390, 768 y 1024 píxeles. Abrir/cerrar la hamburguesa, tocar Carga internacional, abrir Configuración y comprobar que el logo y el botón se mantienen en la primera fila y que los enlaces ocupan una fila independiente.
4. En `/itinerario`, comprobar traducciones ES y EN, modalidad terrestre/marítima, fechas Desde/Hasta, validación de intervalos, búsqueda y navegación de resultados.
5. Verificar Chrome con zoom de 150–200 % y varios tamaños verticales. Esta rama no garantiza pruebas pixel-perfect en dispositivos físicos; esas deben hacerse antes de producción.

No se modificaron SQL, tablas, datos, roles, APIs de cotización ni endpoints de itinerarios.
