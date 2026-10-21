#!/usr/bin/env python3
"""Preflight configuration check; never prints any secret values."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import urlsplit


def read_env(path: Path) -> tuple[dict[str, str], list[str]]:
    values: dict[str, str] = {}
    problems: list[str] = []
    if not path.is_file():
        return values, [f"No existe {path}; crear desde .env.production.example en el servidor."]
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            problems.append(f"Línea {number}: falta =.")
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            problems.append(f"Línea {number}: clave no válida.")
            continue
        if key in values:
            problems.append(f"Línea {number}: clave duplicada: {key}.")
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        values[key] = value
    return values, problems


def check(values: dict[str, str]) -> list[str]:
    errors: list[str] = []
    pg = values.get("POSTGRES_PASSWORD", "")
    if len(pg) < 20 or any(x in pg.upper() for x in ("REEMPLAZAR", "CAMBIAR", "PASSWORD", "EXAMPLE")):
        errors.append("POSTGRES_PASSWORD: usar contraseña aleatoria de al menos 20 caracteres.")
    for key in ("AUTH_OTP_PEPPER", "AUTH_JWT_SIGNING_KEY"):
        if not re.fullmatch(r"[0-9a-fA-F]{64}", values.get(key, "")):
            errors.append(f"{key}: debe contener exactamente 64 caracteres hexadecimales aleatorios.")
    if values.get("AUTH_OTP_PEPPER") == values.get("AUTH_JWT_SIGNING_KEY"):
        errors.append("OTP pepper y firma JWT deben ser distintos.")
    public = values.get("PUBLIC_ORIGIN", "")
    try:
        uri = urlsplit(public)
        if uri.scheme != "https" or not uri.hostname or uri.username or uri.password or uri.path not in ("", "/") or uri.query or uri.fragment:
            raise ValueError()
        if uri.hostname in ("localhost", "127.0.0.1", "::1"):
            raise ValueError()
    except (ValueError, TypeError):
        errors.append("PUBLIC_ORIGIN: indicar origen HTTPS real (https://dominio, sin rutas).")
    port = values.get("PRODUCTION_HTTP_PORT", "8080")
    if not port.isdigit() or not 1024 <= int(port) <= 65535:
        errors.append("PRODUCTION_HTTP_PORT: usar puerto local entre 1024 y 65535.")
    mode = values.get("EMAIL_MODE", "")
    if mode == "Smtp":
        for key in ("SMTP_HOST", "SMTP_FROM", "SMTP_USERNAME", "SMTP_PASSWORD"):
            if not values.get(key):
                errors.append(f"{key}: obligatorio con EMAIL_MODE=Smtp.")
        if values.get("SMTP_TLS", "StartTls") not in ("StartTls", "SslOnConnect"):
            errors.append("SMTP_TLS: el SMTP público debe usar StartTls o SslOnConnect.")
    elif mode == "Graph":
        for key in ("GRAPH_TENANT_ID", "GRAPH_CLIENT_ID", "GRAPH_CLIENT_SECRET", "GRAPH_FROM"):
            if not values.get(key):
                errors.append(f"{key}: obligatorio con EMAIL_MODE=Graph.")
    else:
        errors.append("EMAIL_MODE: elegir Smtp o Graph; LocalOutbox está prohibido en producción.")
    if values.get("S3_ENDPOINT"):
        for key in ("S3_ACCESS_KEY", "S3_SECRET_KEY", "S3_BUCKET"):
            if not values.get(key):
                errors.append(f"{key}: obligatorio cuando se habilita S3_ENDPOINT.")
    if values.get("MONGO_CONNECTION_STRING") and not values["MONGO_CONNECTION_STRING"].startswith(("mongodb://", "mongodb+srv://")):
        errors.append("MONGO_CONNECTION_STRING: URI MongoDB no válida.")
    return errors


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env.production")
    values, syntax_errors = read_env(path)
    errors = syntax_errors + check(values)
    if errors:
        print("PREPARACIÓN INCOMPLETA:")
        for error in errors:
            print(" - " + error)
        return 1
    print("Configuración de producción validada (sin mostrar secretos).")
    print("Aún faltan pruebas reales: correo OTP, esquema PostgreSQL, TLS, restauración y smoke E2E.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
