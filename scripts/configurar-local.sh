#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v dotnet >/dev/null || { echo 'Falta .NET SDK 10 (comando dotnet)' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'Falta openssl para generar un secreto OTP' >&2; exit 1; }

printf 'Host PostgreSQL [127.0.0.1]: '
read -r DB_HOST
DB_HOST=${DB_HOST:-127.0.0.1}
printf 'Puerto PostgreSQL [5432]: '
read -r DB_PORT
DB_PORT=${DB_PORT:-5432}
printf 'Base de datos [login]: '
read -r DB_NAME
DB_NAME=${DB_NAME:-login}
printf 'Usuario PostgreSQL [postgres]: '
read -r DB_USER
DB_USER=${DB_USER:-postgres}
printf 'Contraseña PostgreSQL (no se mostrará): '
read -rs DB_PASSWORD
printf '\n'

PROJECT=backend/CastroFallas.MiniQuote.Api.csproj
# User Secrets está habilitado en el .csproj; los secretos se quedan fuera de Git.
dotnet user-secrets set --project "$PROJECT" 'ConnectionStrings:Postgres' \
  "Host=$DB_HOST;Port=$DB_PORT;Database=$DB_NAME;Username=$DB_USER;Password=$DB_PASSWORD" >/dev/null
unset DB_PASSWORD

# Rotar intencionalmente el pepper porque la versión antigua podía haberse compartido.
# Las solicitudes OTP pendientes dejan de ser válidas; los nuevos códigos sí funcionarán.
OTP_PEPPER="$(openssl rand -hex 32)"
dotnet user-secrets set --project "$PROJECT" 'Auth:OtpPepper' "$OTP_PEPPER" >/dev/null
unset OTP_PEPPER
echo 'Se generó un nuevo Auth:OtpPepper (los OTP anteriores ya no se podrán verificar).'

echo 'Configuración privada guardada. No se cambió ni eliminó ninguna base de datos.'
echo 'Ahora ejecutá ./scripts/iniciar-backend.sh'
