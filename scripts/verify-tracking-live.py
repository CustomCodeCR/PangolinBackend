#!/usr/bin/env python3
"""Smoke de /api/tracking/search contra API + PostgreSQL de desarrollo.

Uso: python scripts/verify-tracking-live.py [http://127.0.0.1:5000]
Requiere Development:ApplySchema=true y una DB de pruebas. No modifica datos.
"""
import json
import sys
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5000").rstrip("/")


def get(params):
    url = base + "/api/tracking/search?" + urlencode(params)
    try:
        with urlopen(url, timeout=10) as response:
            return response.status, json.load(response), response.headers
    except HTTPError as err:
        return err.code, json.load(err), err.headers


status, body, headers = get({"kind": "BL", "reference": "demo-bl-2026-001"})
assert status == 200, f"La muestra no está disponible (HTTP {status}): {body}"
assert body["isDemo"] is True and body["status"] == "in_transit", body
assert body["reference"] == "DEMO-BL-2026-001", body
assert isinstance(body["events"], list) and len(body["events"]) >= 1, body
assert headers.get("Cache-Control") == "no-store", headers
assert not any(k in body for k in ("clientId", "customerName", "email", "documents")), body
print("OK: demo pública desde PostgreSQL, sin datos privados y sin caché")

status, body, _ = get({"kind": "BL", "reference": "NO-EXISTE-2026-XYZ"})
assert status == 404, f"Esperado HTTP 404: {status} {body}"
print("OK: referencia no encontrada devuelve 404")

status, body, _ = get({"kind": "HBL", "reference": "DEMO-HBL-PRIVATE-001"})
assert status == 404, f"Un embarque privado se expuso: {status} {body}"
print("OK: registro privado devuelve el mismo 404")

status, body, _ = get({"kind": "BL", "reference": "abc"})
assert status == 400, f"Esperado HTTP 400: {status} {body}"
print("OK: validación de referencias")

status, body, _ = get({"kind": "INVALID", "reference": "DEMO-BL-2026-001"})
assert status == 400, f"Esperado HTTP 400: {status} {body}"
print("OK: tipo no permitido")
