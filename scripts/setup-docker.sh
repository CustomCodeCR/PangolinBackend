#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -e "$root/.env" ]; then
  echo '.env ya existe; no se modifica.'
  exit 0
fi
command -v openssl >/dev/null || { echo 'Se necesita openssl para generar secretos.' >&2; exit 1; }
umask 077
pgpassword="$(openssl rand -hex 24)"
pepper="$(openssl rand -hex 32)"
jwt_key="$(openssl rand -hex 32)"
sed -e "s/CAMBIAR_PASSWORD_GENERADO/$pgpassword/g" \
    -e "s/CAMBIAR_SECRETO_GENERADO_DE_64_CARACTERES/$pepper/g" \
    -e "s/CAMBIAR_JWT_HEX_DE_64_CARACTERES/$jwt_key/g" \
    "$root/.env.example" > "$root/.env"
echo '.env creado con secretos aleatorios (no subir a GitHub).'
