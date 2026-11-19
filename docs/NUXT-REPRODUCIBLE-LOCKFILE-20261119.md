# Instalaciones Nuxt reproducibles — evaluación del issue #253

Se incorporó el `frontend/nuxt/package-lock.json` **sin regenerar ni actualizar paquetes**:
fue recuperado del artefacto `nuxt-dependency-graph` de
[Nuxt SSR CI #44581684900](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44581684900),
ejecución que compiló exitosamente en Ubuntu y Docker Alpine.

- SHA-256 del archivo: `7add7eeeddd5e14c36f379733d74b7ef1824ac888aecf2795ef2312450335df6`
- Git blob SHA: `9a9f2f9193c8c985d2ea3635d30fee157b2b75a1`
- `lockfileVersion`: 3; 632 entradas de paquete
- Incluye bindings Linux x64 de GNU y musl de Rollup y Rolldown.

## Qué cambia

Las instalaciones de Nuxt en el Dockerfile Alpine, el pipeline SSR Ubuntu
y la prueba aislada SSR de imágenes del CMS usan `npm ci --no-audit --no-fund`
en lugar de `npm install --no-audit --no-fund`. El lockfile deja de ignorarse.

`npm ci` utiliza el mismo conjunto versionado y falla si el manifiesto y
el lockfile no coinciden; el lockfile no se modifica durante la instalación.
Los scripts de diagnóstico de la PR #268 siguen registrando versiones reales
en Ubuntu y Docker.

**No cambian** versiones declaradas en `package.json`, código de UI, textos,
metadatos, imágenes, funcionalidades ni el contenedor de producción.

## Validación obligatoria

- CI completo de frontend/backend y auditorías de seguridad.
- Construcción SSR Ubuntu y Docker Alpine con `npm ci`.
- Pruebas HTTP SSR, sitemap, imágenes, páginas retiradas y datos estructurados.
- Gateway híbrido, navegación Chrome, login, cotizaciones, CMS y vídeo.
- Comprobación aislada de imágenes responsivas CMS.
- Huella de versiones Nuxt/Nitro/Rollup/Vite coincidente entre Ubuntu y Alpine,
  salvo diferencias propias de plataforma.

Un build exitoso demuestra que la migración a `npm ci` **es compatible con
la ejecución probada**, pero no garantiza que nunca vuelva a aparecer el
`RollupError` del issue #253. El issue solo debería cerrarse tras comprobar
estabilidad en ejecuciones repetidas.
