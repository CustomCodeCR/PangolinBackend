# Diagnóstico reproducible de Nuxt/Rollup en Docker Alpine

Relacionado con [#253](https://github.com/CustomCodeCR/PangolinBackend/issues/253).

## Problema confirmado

El 18-11-2026 falló dos veces `Build Nuxt Alpine Docker image` en
[Actions #44324279681](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44324279681):
`RollupError: Code is nested too deeply` en `nuxt/dist/runtime/server/renderer/error-template.js`.
En otra ejecución se completó la compilación Alpine sin cambiar
`frontend/nuxt/Dockerfile` ni las dependencias.

**No hay evidencia todavía de que CSS, nuestro código Vue o una versión concreta
de Rollup sea la causa.** Nuxt instala con `npm install`, y su
`package-lock.json` todavía no está versionado, de modo que dos instalaciones
pueden resolver grafos de dependencias diferentes.

## Evidencia añadida

`frontend/nuxt/scripts/report-build-deps.mjs` registra:

- Node.js, arquitectura y plataforma.
- Versiones, ubicaciones y huella de las principales dependencias de Nuxt,
  Nitro, Vite, Rollup, Vue y binarios nativos de compilación.
- Un archivo local `.build-diagnostics/nuxt-deps.json`.

Se ejecuta inmediatamente después de `npm install` tanto en el job SSR
Ubuntu como **dentro de `node:22-alpine`**. El log de `docker build`
imprime las versiones de Alpine, incluso si `npm run build` falla después.
El job SSR adjunta durante 14 días el lockfile generado en Ubuntu y su
`nuxt-deps.json`.

Los paquetes nativos opcionales de Linux GNU y Alpine musl pueden diferir
normalmente; distinguirlos de cambios en versiones generales de Nuxt/Nitro/
Rollup/Vite. No compartir secretos ni cargar un `.env` en los artefactos.

## Próximos pasos

1. Si vuelve a fallar Alpine, comparar su lista de versiones con la huella
   guardada por Ubuntu en la misma ejecución y con un build exitoso anterior.
2. Aislar diferencias con una reproducción repetible en CI antes de cambiar
   versiones o instalar overrides.
3. Probar **en otra PR** un `package-lock.json` Nuxt generado mediante npm,
   versionado y `npm ci` en Ubuntu y Alpine, conservando soporte musl.
4. Validar compilación SSR/HTTP, Docker Alpine, gateway híbrido, Chrome,
   cotizaciones, login, CMS, imágenes y los demás checks.
5. Cerrar #253 solo con evidencia de build reproducible; una única ejecución
   en verde no demuestra que la intermitencia desapareció.

Este trabajo no altera el runtime Node del contenedor final, la web visible,
metadatos, fotografías, APIs ni producción.
