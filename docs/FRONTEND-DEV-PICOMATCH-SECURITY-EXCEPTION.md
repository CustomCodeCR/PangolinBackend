# Excepción de seguridad temporal y acotada — picomatch / CVE-2026-112366

**Estado al 18 de noviembre de 2026: vulnerabilidad NO corregida en origen; excepción de riesgo documentada, no una reparación del paquete.**

## Evidencia

- Aviso oficial [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), ReDoS de gravedad **alta** en picomatch hasta **4.0.7**; no se ha publicado versión corregida.
- `frontend/package-lock.json` contiene `picomatch@4.0.7` como dependencia de desarrollo de `vite@6.4.4` y herramientas `fdir` / `tinyglobby`. `npm audit` agrupa cuatro avisos altos, todos derivados del mismo GHSA.
- Ejecutamos `npm audit fix --package-lock-only --ignore-scripts --no-fund` de forma aislada. Terminó sin cambios y **siguieron las cuatro alertas**. No lo confundimos con una corrección.
- Comprobación en [GitHub Actions](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44350808414): `npm audit --prefix frontend --omit=dev --audit-level=high` pasó y `npm ls --omit=dev picomatch` confirmó que no figura en el árbol de ejecución.
- `frontend/Dockerfile` compila con Node/Vite en una etapa y copia únicamente `dist` a la imagen final **nginx:alpine**. Por tanto, este hallazgo corresponde a herramientas de **compilación y desarrollo**, no a una dependencia enviada al servidor Nginx de producción.

## Control temporal en CI

En `scripts/audit-frontend-deps.cjs`:

1. Audita el árbol **completo** de npm usando JSON, incluidos paquetes `dev`.
2. Exige **cero alertas altas/críticas** entre dependencias de producción (sin excepciones).
3. Autoriza temporalmente **solo** la cadena de cuatro paquetes de desarrollo `picomatch`, `fdir`, `tinyglobby`, `vite` y únicamente cuando todos proceden del aviso exacto `GHSA-fc5q-39xc-vjpf`.
4. Falla CI si aparece un nuevo aviso alto/crítico, una gravedad crítica, cambio de origen, cambio del grafo o un paquete marcado como no exclusivamente dev.
5. Publica advertencias explícitas; **no declara vulnerabilidad corregida** ni silencia riesgos nuevos.

**Riesgo restante:** un entorno de desarrollo/CI podría ejecutar `picomatch` con expresiones glob maliciosas si alguna fuente no confiable consiguiera controlar esos patrones. Evitar patrones procedentes de solicitudes o usuarios en las herramientas de build mientras no exista parche.

## Eliminación de la excepción

Issue de seguimiento **[#255](https://github.com/CustomCodeCR/PangolinBackend/issues/255)**. En cuanto exista versión corregida:

- Actualizar `picomatch` y transitivas de forma compatible, regenerar lockfile y validar `npm ci`, `npm run build`, GIO/Chrome, Nuxt SSR y backend.
- Eliminar la excepción de `scripts/audit-frontend-deps.cjs` y restaurar `npm audit --prefix frontend --audit-level=high` como requisito estricto.
- Cerrar #255 únicamente después de obtener auditoría completa en verde.

La excepción está motivada por **ausencia de parche publicado** y alcance dev-only verificado, no por considerar segura la vulnerabilidad. Se mantiene visible para seguimiento.
