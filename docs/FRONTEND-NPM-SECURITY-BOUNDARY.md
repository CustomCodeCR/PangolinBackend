# Revisión del alcance de vulnerabilidades npm en frontend (17-11-2026)

Relacionado con [#248](https://github.com/CustomCodeCR/PangolinBackend/issues/248).

## Hallazgo verificable

El audit completo \`npm audit --prefix frontend --audit-level=high\`
detectó 4 avisos de severidad alta y 3 moderados, en el árbol
\`vite\` / \`fdir\` / \`tinyglobby\` / \`picomatch\` y
\`vue-tsc\` / \`@vue/language-core\` / \`minimatch\`.

En \`frontend/package-lock.json\` de \`main-2\` se observó:

| Paquete | Versión | Instalación | Dependencia de |
|---|---|---|---|
| picomatch | 4.0.7 | dev-only | Vite, tinyglobby |
| minimatch | 9.0.9 | dev-only | @vue/language-core |

Las fichas oficiales consultadas:
- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf):
  hasta picomatch 4.0.7 afectado; sin versión corregida publicada
  a fecha de esta revisión.
- [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249):
  minimatch 7.0.0 a versiones anteriores a 11.0.1 afectadas;
  forzar minimatch 11 sobre \`@vue/language-core@2.2.12\` supone
  un salto mayor incompatible **hasta que se pruebe**.

## Alcance y medidas de control

Los Dockerfiles utilizados para el build separan herramientas de desarrollo
de los artefactos finales:
- SPA Vue: build con npm; imagen final Nginx que copia \`dist\` y configuración.
- Nuxt SSR: build con npm; imagen final Node que copia solo \`.output\`.

\`scripts/check-frontend-dev-runtime-boundary.py\` verifica:
1. Que cada instancia de estos paquetes del lockfile sea \`dev:true\`.
2. Que no sean dependencias directas de runtime en el frontend.
3. Que el stage final Vue y el stage final Nuxt no copien \`node_modules\`
   ni instalen dependencias por comandos de package manager.
4. Que cualquier cambio en la lista de \`COPY\` falle hasta revisión.

El workflow \`frontend-runtime-dependency-boundary.yml\` ejecuta estas
comprobaciones y un **segundo** audit
\`npm audit --prefix frontend --omit=dev --audit-level=high\`.
**Esto no sustituye** el audit original sin \`--omit=dev\`:
se mantiene intacto y puede seguir fallando.

## Límites importantes

- El test estático no demuestra que una dependencia vulnerable no se
  incluya dentro de un bundle ni protege la estación del desarrollador,
  los procesos de CI ni la cadena de suministro del build.
- El audit de runtime detecta otras vulnerabilidades en paquetes
  de producción; que pase no implica que el audit completo esté resuelto.
- No cambiar umbrales, omitir resultados, ni aplicar \`npm audit fix --force\`
  para ocultar una advertencia.
- No se cambian \`package.json\`, \`package-lock.json\`, Dockerfiles,
  CMS, Nuxt runtime, Fennec ni producción en esta PR.

## Remediación pendiente y criterios de cierre

1. Monitorizar versiones upstream de picomatch y correcciones publicadas.
2. Probar en **rama separada** una actualización compatible de Vue language
   tools / vue-tsc que elimine o actualice la dependencia minimatch; generar
   el lockfile desde npm, no editar su integridad manualmente.
3. Validar \`npm ci\`, \`npm audit\` completo, TypeScript, Vite, Nuxt SSR,
   backend/.NET, autenticación, cotizaciones y CMS.
4. Fusionar solo tras evaluación del riesgo, CI satisfactorio y revisión humana;
   mantener producción intacta hasta autorización.

**Estado:** contención y prueba de alcance; NO declara vulnerabilidades corregidas.
