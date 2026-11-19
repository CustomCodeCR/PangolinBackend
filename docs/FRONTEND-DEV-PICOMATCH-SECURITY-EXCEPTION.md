# Excepción temporal de picomatch — retirada tras revocación del aviso

## Actualización del 19 de noviembre de 2026

GitHub retiró el 18 de noviembre de 2026 la alerta
[GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf),
indicando expresamente que **no se trata de un problema de seguridad**.

**Importante:** la retirada del aviso no significa que haya aparecido un parche.
`picomatch@4.0.7` continúa siendo la versión más reciente conocida a esta
fecha; no se inventan actualizaciones, overrides, excepciones nuevas ni
declaraciones de que se haya instalado una versión corregida.

## Cambio aplicado en el repositorio

La excepción para las cuatro alertas derivadas de ese único GHSA
(`picomatch`, `fdir`, `tinyglobby`, `vite`) se elimina de
`scripts/audit-frontend-deps.cjs`.

El workflow `Backend and frontend integration` vuelve a exigir:

```sh
npm audit --prefix frontend --audit-level=high
npm audit --prefix frontend --omit=dev --audit-level=high
```

Ambas auditorías **deben completarse sin alertas altas/críticas**; errores
de npm o de red hacen fallar CI. Las advertencias moderadas pueden seguir
siendo visibles, tal como permite el umbral anterior. No se desactivan
auditorías de dependencias de desarrollo y no se tocan dependencias.

## Verificación de cierre

- Confirmar que la alerta oficial sigue marcada **Withdrawn**, con fecha
  18-11-2026 y motivo "not a security issue".
- Exigir que el job `Audit frontend npm dependencies` pase con el auditor
  completo sin ninguna lista de excepciones.
- No declarar resuelta la incidencia #255 hasta comprobar una ejecución de CI
  con resultados favorables. Si el registro npm conserva temporalmente el
  aviso, **dejar la PR sin fusionar** y volver a comprobar, sin ocultar el fallo.

## Histórico

El control anterior, incorporado el 18-11, permitía exclusivamente la cadena
de cuatro paquetes de desarrollo mientras el aviso oficial estaba activo y
no existía parche upstream. Este documento se conserva para rastrear por qué
hubo una excepción y por qué se retiró. La separación entre dependencias de
build y runtime continúa comprobándose por
`scripts/check-frontend-dev-runtime-boundary.py`.
