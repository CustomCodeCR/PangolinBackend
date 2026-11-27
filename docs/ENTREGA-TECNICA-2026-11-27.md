# Entrega técnica de Pangolin — Grupo Castro Fallas

**Fecha de corte:** 27 de noviembre de 2026  
**Destinatario:** responsables de TI, desarrollo, operaciones y Pricing.  
**Objeto:** facilitar la continuidad de la web al finalizar la práctica, sin depender del equipo saliente.

## 1. Resumen ejecutivo

El equipo de práctica confirma que los requerimientos solicitados para la web están terminados. Las últimas comprobaciones disponibles de producción, Docker local y SEO fueron satisfactorias. Se recomienda conservar la release en funcionamiento y evitar despliegues de cierre sin necesidad operativa.

Permanecen asuntos de mantenimiento y continuidad, en especial el traslado de Groq a una cuenta corporativa, la rotación coordinada de credenciales expuestas y la revisión de privilegios PostgreSQL sujeta a autorización. No se garantiza ausencia de defectos o vulnerabilidades; la aceptación formal y la asignación de responsables corresponden a la empresa.

## 2. Arquitectura y repositorio

- Repositorio: https://github.com/CustomCodeCR/PangolinBackend.
- main: rama de producción, último commit observado 4ff4d22566c24bb8d3a52652aa2f54642a70d542; release observada sha-4ff4d22566c2.
- main-2: desarrollo y validación. Al inicio de esta documentación: 3dc74e94ddaad5e1ef8eadb73aabeaecda9fd1ed, con checker SEO corregido (#366) y guía Groq (#367) adicionales a main.
- Producción usa imágenes GHCR, backend .NET, frontend Vue y Nuxt SSR, gateway Nginx y Traefik. Se reutilizan servicios de infraestructura de Dhole; no administrar sus contenedores como parte de Pangolin.
- Argos: proyecto Docker Compose pangolin-production, configuración instalada en /home/actions-runner/pangolin-release, entorno privado compartido /opt/dhole/.env. Confirmar estas rutas y estado antes de cualquier intervención.
- Docker local usa .env y compose.yaml, con overlay MinIO opcional. No copiar entorno, licencia ni volúmenes locales a producción.
- El workflow .github/workflows/pangolin-images.yml puede desplegar al actualizar main. Requiere revisión de CI, aprobación de ventana, recuperación y control de impacto. No es necesario desplegar los documentos de entrega.

## 3. Funcionalidades y evidencias disponibles

| Área | Evidencia de cierre disponible |
| --- | --- |
| Sitio público / SSR | Páginas principales y SEO técnico aprobados en comprobaciones previas; última prueba operativa pendiente de registro de cierre. |
| SEO | Script corregido: 175 aserciones de robots.txt, auditoría HTTP 20/20 en producción y Docker, CI #366 5/5. Inicio, Nosotros, Servicios y Noticias indexadas según Search Console. |
| Autenticación y OTP | Flujos incluidos en revisiones previas; Graph configurado en backend. No se ejecuta un nuevo OTP en el chequeo de cierre de solo lectura. |
| Cotizaciones, GIO y tracking | Integraciones revisadas, claves presentes; #327/#328/#329 incorporadas previamente. Reconciliación automática depende del endpoint de verificación pendiente; no repetir POST ambiguo. |
| MinIO / multimedia | Endpoint interno de Dhole, variables Storage configuradas; imagen dhole/minio:community-2025-09-07. No depende de la licencia local. Custodia IAM por confirmar. |
| Seguridad | Auditorías exactas #339, #345, #365 completadas. Respaldo de 12 artefactos descargado; custodia empresarial pendiente de confirmación. Última auditoría comunicada sin hallazgos críticos ni altos, no garantía de seguridad futura. |
| Transferencia Groq | #367 fusionada a main-2, CI 3/3; cambio real de cuenta no ejecutado. |

## 4. Inventario de dependencias y accesos

Registrar responsables nominados en el gestor interno de TI, no en GitHub. Confirmación de titularidad empresarial de Graph/Azure, MongoDB, Cloudflare, Search Console y acceso administrativo GitHub proporcionada por el equipo de práctica; no auditada directamente en cada consola.

| Dependencia | Estado observado o confirmado | Custodio sugerido |
| --- | --- | --- |
| Groq (GIO y traducciones) | Configurado; cuenta personal identificada | TI, responsable de IA |
| Microsoft Graph / Azure | Tenant, cliente, secreto y remitente configurados | TI, administrador Microsoft 365 |
| SMTP / Instagram | Contraseña SMTP y token Instagram vacíos en backend | TI, marketing cuando aplique |
| Dhole Tracking / Catálogos / POST | Claves configuradas; verificación sin clave | Equipo Dhole / Pricing |
| MongoDB / Redis | Configuración presente | Infraestructura |
| PostgreSQL | Servicio compartido, rol/base de Pangolin | DBA |
| MinIO | Endpoint y credenciales configurados | Administrador almacenamiento |
| OTP / JWT | Secretos configurados | Seguridad TI |
| GitHub / GHCR / runner | Repositorio organización, workflow con GITHUB_TOKEN y runner dhole | Administrador organización / operaciones |
| Cloudflare / Search Console | Control empresarial confirmado por equipo | Administrador DNS / SEO |

No se ha comprobado la validez de cada clave ni los permisos detallados. La presencia de una variable no demuestra la activación o correcto funcionamiento de la integración. No compartir valores reales en tickets, capturas, PR ni chats. Priorizar rotación de credenciales expuestas, sin interrumpir otros consumidores.

## 5. Documentos operativos

- [Registro de pendientes técnicos](PENDIENTES-TECNICOS-ENTREGA.md): prioridades, responsables sugeridos y criterios de cierre.
- [Transferencia Groq y MinIO](GIO-GROQ-HANDOVER.md): sustitución de clave, preflight, validación y recuperación.
- [Despliegue controlado y recuperación](main2-main-production-runbook.md): autorización, preflight, respaldo y riesgos.
- [Despliegue GHCR](DESPLIEGUE-IMAGENES-GHCR.md): configuración del entorno compartido; contrastar sus instrucciones históricas con la release instalada y el runbook vigente.
- [Plantilla de producción](../deploy/pangolin.env.example) y [plantilla local](../.env.example): referencias de variables, no valores reales.
- [README](../README.md): inicio de desarrollo.

## 6. Estado de PR y evidencia de auditoría

- #327, #328, #329: cerradas por incorporación previa, sin fusionar ramas antiguas ni borrarlas.
- #361 y #362: experimentos SSR/hidratación no aprobados; conservar como referencia, no fusionar.
- #339, #345, #365: auditorías temporales, no fusionar. Mantener hasta confirmar custodia corporativa del respaldo.

Conservar ZIP de auditoría en ubicación empresarial de acceso restringido. Runs de referencia: [#339](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/45715077029), [#345](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/45846148788), [#365](https://github.com/CustomCodeCR/PangolinBackend/actions/runs/45903497480). Los artefactos vencen el 2 y 3 de diciembre de 2026; no usar GitHub Actions como único archivo histórico.

## 7. Última comprobación de producción (solo lectura)

Ejecutar por operador autorizado en Argos; no imprime .env, payloads, cookies ni credenciales. No reinicia ni modifica contenedores, no realiza consultas SQL ni POST.

```bash
sudo cat /home/actions-runner/pangolin-release/current-tag
sudo docker ps --filter label=com.docker.compose.project=pangolin-production \
  --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
for path in /api/health/ready / /nosotros /servicios /noticias; do
  printf '%s: ' "$path"
  curl -sS --max-time 15 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:8180$path"
done
```

Esperado: tag aprobado, cuatro servicios activos y HTTP 200 en esas rutas. Un resultado distinto requiere investigación, no reinicio automático. La comprobación no acredita autenticación, correo, Groq, tracking, escritura de medios ni POST comercial.

Desde PowerShell local con main-2 actualizado, verificar el diagnóstico público:

```powershell
node .\frontend\nuxt\scripts\check-indexing-http.mjs --robots-self-test
node .\frontend\nuxt\scripts\check-indexing-http.mjs https://www.logisticacastrofallas.com
```

Registrar fecha, operador, versión y resultados sanitizados. No crear cotizaciones reales para esta entrega.

## 8. Aceptación y continuidad

- [ ] TI recibe guía operativa y registro de pendientes.
- [ ] TI confirma acceso administrativo y custodia de credenciales.
- [ ] TI conserva y verifica el ZIP de auditoría.
- [ ] Operador registra última comprobación de producción.
- [ ] Se asignan responsable y fecha para transferencia Groq y rotación de credenciales expuestas.
- [ ] Se reconoce que cambios en PostgreSQL, Dhole y despliegue requieren aprobación independiente.

Estos campos son para completar por la empresa. El documento no declara una aceptación ya realizada ni una ejecución de las tareas pendientes.
