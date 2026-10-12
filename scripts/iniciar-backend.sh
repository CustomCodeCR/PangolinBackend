#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
export ASPNETCORE_ENVIRONMENT=Development
exec dotnet run --urls 'http://127.0.0.1:5000'
