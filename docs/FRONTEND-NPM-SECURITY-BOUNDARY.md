# Revisión del alcance de vulnerabilidades npm en frontend (17-11-2026)

Relacionado con [#248](https://github.com/CustomCodeCR/PangolinBackend/issues/248).

## Hallazgo verificable

El audit completo `npm audit --prefix frontend --audit-level=high`
detectó 4 avisos de severidad alta y 3 moderados, en el árbol
`vite` / `fdir` / `tinyglobby` / `picomatch` y
`vue-tsc` / `@vue/language-core` / `minimatch`.

En `frontend/package-lock.json` de `main-2` se observó:

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
  forzar minimatch 11 sobre `@vue/language-core@2.2.12` supone
  un salto mayor incompatible **hasta que se pruebe**.

## Alcance y medidas de control

Los Dockerfiles utilizados para el build separan herramientas de desarrollo
de los artefactos finales:
- SPA Vue: build con npm; imagen final Nginx que copia `dist` y configuración.
- Nuxt SSR: build con npm; imagen final Node que copia solo `.output`.

`scripts/check-frontend-dev-runtime-boundary.py` verifica:
1. Que cada instancia de estos paquetes del lockfile sea `dev:true`.
2. Que no sean dependencias directas de runtime en el frontend.
3. Que el stage final Vue y el stage final Nuxt no copien `node_modules`
   ni instalen dependencias por comandos de package manager.
4. Que cualquier cambio en la lista de `COPY` falle hasta revisión.

El workflow `frontend-runtime-dependency-boundary.yml` ejecuta estas
comprobaciones y un **segundo** audit
`npm audit --prefix frontend --omit=dev --audit-level=high`.
**Esto no sustituye** el audit original sin `--omit=dev`:
se mantiene intacto y puede seguir fallando.

## Límites importantes

- El test estático no demuestra que una dependencia vulnerable no se
  incluya dentro de un bundle ni protege la estación del desarrollador,
  los procesos de CI ni la cadena de suministro del build.
- El audit de runtime detecta otras vulnerabilidades en paquetes
  de producción; que pase no implica que el audit completo esté resuelto.
- No cambiar umbrales, omitir resultados, ni aplicar `npm audit fix --force`
  para ocultar una advertencia.
- No se cambian `package.json`, `package-lock.json`, Dockerfiles,
  CMS, Nuxt runtime, Fennec ni producción en esta PR.

## Remediación pendiente y criterios de cierre

1. Monitorizar versiones upstream de picomatch y correcciones publicadas.
2. Probar en **rama separada** una actualización compatible de Vue language
   tools / vue-tsc que elimine o actualice la dependencia minimatch; generar
   el lockfile desde npm, no editar su integridad manualmente.
3. Validar `npm ci`, `npm audit` completo, TypeScript, Vite, Nuxt SSR,
   backend/.NET, autenticación, cotizaciones y CMS.
4. Fusionar solo tras evaluación del riesgo, CI satisfactorio y revisión humana;
   mantener producción intacta hasta autorización.

**Estado:** contención y prueba de alcance; NO declara vulnerabilidades corregidas.

---

## Evaluación de riesgo residual para decisión humana (17-11-2026)

### Evidencia y alcance

| Riesgo | Evidencia | Estado |
|---|---|---|
| ReDoS de picomatch | [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), CVE-2026-112366: `<=4.0.7` afectado, **sin versión corregida** al 17/11 | **Abierto (alto según proveedor)** |
| DoS de minimatch | [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), CVE-2026-118764: corregido en `11.0.1` | Candidato corregido en **PR #251**; no fusionado |
| Auditoría npm completa | [CI de #249](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44182244963): 4 high + 3 moderate | **Falla; no se omitió ni silenciaron vulnerabilidades** |
| Prueba `npm audit fix` | [CI #44182244813](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44182244813): copia temporal del lockfile, 0 cambios, exit 1 | No hay arreglo automático aplicable demostrado |
| PR #251 | [CI #44178322591](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/44178322591): 8 checks successful, audit falla con **4 high**, sin alertas minimatch | Evidencia de remediación **parcial**, no de seguridad total |
| Frontera build/runtime | Guardia de Dockerfiles + lockfile y `npm audit --omit=dev`: [PR #249](https://github.com/CustomCodeCR/PangolinBackend/pull/249) | Exposición reducida, **no eliminada** |

Las **4 high** de la auditoría de npm son los nodos
`picomatch`, `fdir`, `tinyglobby` y `vite` propagados
desde el mismo aviso de `picomatch`; no son cuatro CVEs
distintas según esa ejecución. Las **3 moderate** se propagan
en el árbol de `minimatch`.

### Modelo de amenaza y riesgo

- El comportamiento vulnerable de `picomatch` es ReDoS al evaluar un
  **patrón glob controlado por un atacante**, capaz de bloquear
  el event loop de Node. La mera existencia del paquete no demuestra
  que visitantes de WWW puedan enviarle ese tipo de patrón.
- En el proyecto revisado, los paquetes señalados son **dev-only**
  en el lockfile. La imagen SPA publica `dist` con Nginx; la
  imagen Nuxt lleva `.output`, no un `node_modules` del build.
  Esto reduce la probabilidad de exposición directa del paquete,
  pero **no** demuestra formalmente ausencia de código vulnerable
  dentro de bundles generados o del servidor `.output`.
- Los procesos **CI**, equipos de desarrollo, plugins de Vite
  y cualquier pipeline que acepte rutas, globs o configuración
  de origen no confiable siguen siendo superficies a investigar.
  No se ha realizado una prueba de explotación end-to-end contra
  entradas reales ni un análisis de composición exhaustivo de bundles.
- No se identificó durante esta revisión una ruta pública
  demostrada que suministre globs de usuarios a `picomatch`.
  **Esto es ausencia de evidencia**, no garantía de seguridad.
- El aviso oficial sigue clasificando `picomatch` como **alto**.
  No rebajar automáticamente su severidad a "baja" solo por
  la separación de etapas Docker.

### Controles recomendados mientras se espera una corrección

1. Mantener la auditoría **completa** activa en cada PR y registrar
   las cuatro alertas altas hasta que desaparezcan mediante una
   versión corregida y pruebas reproducibles.
2. Limitar quién puede modificar workflows, manifiestos y
   configuraciones de build; evitar ejecutar globs de origen
   externo o no validado en tareas CI.
3. No instalar overrides no oficiales ni cambios de versión forzados
   que aparenten eliminar una CVE sin una corrección verificable.
4. Mantener `minimatch@11.0.1` como **remediación separada** en #251,
   sujeta a revisión del salto mayor y regresión funcional.
5. Cuando exista un release upstream corregido de `picomatch`,
   probarlo en otra rama con `npm ci`, audit completo, TypeScript/Vite,
   Nuxt SSR, Chrome, CMS real aislado, auth, cotizaciones y Docker.
6. Si por alguna razón se necesita avanzar antes, exigir evaluación
   explícita del responsable técnico/de seguridad, del alcance de
   entradas controlables, del nivel de exposición y de la fecha de
   reevaluación. **Este documento no constituye esa aceptación.**

### Puertas de decisión

| Acción | Estado técnico | Decisión necesaria |
|---|---|---|
| Integrar #251 (`minimatch`) | Pruebas de compatibilidad favorables; 4 high restantes | Revisión humana del override mayor, del diff/CI y de la excepción de audit si se considera |
| Integrar #249 (guardias) | Guardias aprobadas, audit completo falla de forma esperada | Aprobar alcance y política de checks sin declarar CVE resuelta |
| Integrar #246/#247 (WebP) | QA/Chrome/MinIO aprobados en ramas aisladas, audit sigue fallando | Aprobación visual/editorial, decisión formal de seguridad y plan de rollout |
| Activar flags WebP en WWW | **No autorizado por esta evaluación** | Validar backups de staging autorizado, rollback coordinado (frontend primero) y ventana de monitoreo |
| Cerrar issue #248 | **No corresponde aún** | Versión corregida, pruebas de compatibilidad y audit completo sin hallazgos |

**Conclusión:** el trabajo de mitigación está preparado, pero hay
**riesgo residual abierto**. No existe aprobación para fusionar
PR, aceptar una vulnerabilidad alta o desplegar por el hecho de que
la mayoría de los tests funcionales hayan aprobado.
