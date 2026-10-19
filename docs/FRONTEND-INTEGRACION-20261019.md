# Integración segura del frontend — 19/10/2026

Rama: `feature/integracion-frontend-20261019` · PR #21 en borrador.

## Principio
La base de integración es `main` (`21740d198`), **no** el ZIP aislado. Se conservan backend .NET 10, OTP/JWT, PostgreSQL, CMS, MinIO, SignalR, cotizaciones, itinerarios y Docker. No hay SQL nuevo ni modificación de volúmenes.

## Implementación incorporada
- Tracking: búsqueda visual por BL, HBL, IDTRA, contenedor y PO, español/inglés, estados de error y consulta sin inventar movimientos. Enlaces de contacto.
- Guía interactiva `driver.js` **opcional** y no automática (mejor usabilidad y accesibilidad).
- Globo 3D con selección de oficinas y datos suministrados en la entrega frontend. **Direcciones, horarios y correos deben contrastarse con la empresa antes de publicarse**.
- Noticias: URLs `/noticias?article=<id>`, navegación desde Home, actualizaciones SignalR, control de carruseles vacíos.
- Iconos y retoques de panel administrativo manteniendo la pestaña Editor visual, MinIO y CRUD.
- Diseño GIO en modos claro y oscuro y consideración de movimiento reducido.
- Verificaciones CI que previenen retrocesos accidentales en contratos.

## No importado indiscriminadamente
- Reemplazo de `main.ts`/WebSocket legado: incompatible con SignalR. El backend usa `/api/hubs/updates`.
- Modelo antiguo de noticias y contenido precargado: incompatible con CMS sin semillas.
- Reemplazo de Admin/ContentManager: omite CMS visual, carga S3 y modelo `body` de noticias.
- Overrides de previsualización de roles que eviten consultar sesión real: conservar seguridad del servidor.
- Cambios extensos de CSS o textos que puedan romper responsive/catálogos CMS: requieren revisión visual dedicada.

## Pruebas automáticas
`cd frontend && npm ci && npm run build && node scripts/test-frontend-merge.cjs`.
En CI se compilan .NET y Vue y se ejecutan guards de integración.

## Checklist manual antes de fusionar
1. En Docker usando la **rama** de la PR y un respaldo previo, ejecutar `docker compose -f compose.yaml -f compose.minio.yaml up -d --build`. Nunca `down -v`.
2. Validar login correo/OTP y sesiones cliente/admin/visitante.
3. Crear noticias borrador y publicadas; verificar que noticias no publicadas no salen en la web ni en enlaces directos.
4. Con 0, 1 y varias noticias, verificar Home, carrusel y `/noticias?article=<id>`.
5. Publicar una noticia desde otro navegador y confirmar actualización sin F5 por SignalR.
6. Editar imágenes/textos en Editor visual, guardar borrador, publicar y restaurar.
7. Subir un archivo a MinIO y comprobar que el CMS lo referencia sin borrar otros archivos.
8. Probar CRUD de itinerarios incluyendo Closing, ETD, ETA y estados.
9. Probar las cuatro cotizaciones, permisos entre cuentas y pictogramas blancos existentes.
10. Abrir Tracking, probar los cinco tipos de referencia, cierre del aviso, guía y puntos del globo. La búsqueda no ofrece movimientos reales.
11. Verificar iPhone/Android pequeño, tablet y escritorio, teclado, modo oscuro y `prefers-reduced-motion`.
12. Verificar conexión LAN solo en red privada y funcionamiento de SignalR en otra computadora.

**No marcar la PR como lista ni fusionarla hasta completar las pruebas manuales y validar los datos del mapa con la empresa.**
