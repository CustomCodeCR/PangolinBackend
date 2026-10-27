#!/usr/bin/env python3
"""Validate illustrative tracking ports against official quote port names.

Only quote-backed entries are cross-checked. Other entries remain explicit,
limited geographic fallbacks for Dynamics, not additional official quote choices.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
catalog = json.loads((ROOT / "frontend/src/lib/trackingPorts.json").read_text(encoding="utf-8"))
quotes_sql = (ROOT / "backend/Database/OfficialQuotesVideoLocations.sql").read_text(encoding="utf-8")
route_ts = (ROOT / "frontend/src/lib/trackingRoute.ts").read_text(encoding="utf-8")

quote_ports = set(re.findall(r"'seaport','([^']+)'", quotes_sql))
assert quote_ports, "Official maritime quote locations not found"
assert "import trackingPorts from './trackingPorts.json'" in route_ts, "Tracking must read the shared mapping"
assert "quoteCatalogName" in route_ts, "Tracking must consume the quote-backed canonical names"
assert "portOfLoading" in route_ts and "portOfEntry" in route_ts

def normalize(value: str) -> str:
    import unicodedata
    value = ''.join(ch for ch in unicodedata.normalize("NFD", value.lower()) if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[.,/()\-]", " ", value)).strip()

seen = set()
canonical_quotes = set()
for entry in catalog:
    name = entry["name"]
    normalized_name = normalize(name)
    assert normalized_name and normalized_name not in seen, f"Duplicate geographic point: {name}"
    seen.add(normalized_name)
    assert isinstance(entry["aliases"], list)
    assert isinstance(entry["lat"], (int, float)) and -90 <= entry["lat"] <= 90
    assert isinstance(entry["lon"], (int, float)) and -180 <= entry["lon"] <= 180
    quote_name = entry.get("quoteCatalogName")
    if quote_name is not None:
        assert quote_name in quote_ports, f"Not a verified official maritime quote port: {quote_name}"
        assert quote_name not in canonical_quotes, f"Duplicate quote mapping: {quote_name}"
        canonical_quotes.add(quote_name)

def locate(value: str):
    value = normalize(value)
    for port in catalog:
        names = [port["name"], port.get("quoteCatalogName"), *port["aliases"]]
        if any(n and f" {normalize(n)} " in f" {value} " for n in names):
            return port["name"]
    return None

assert locate("Shenzhen, China") == "Shenzhen, China"
assert locate("Pto. Balboa, Panamá") == "Balboa, Panamá"
assert locate("Puerto Balboa, Panama") == "Balboa, Panamá"
assert locate("Cristobal, Panama") == "Cristóbal, Panamá"
assert locate("Puerto Caldera, Costa Rica") == "Puerto Caldera, Costa Rica"
assert locate("Busan, Corea del Sur") == "Busan, Corea del Sur"
assert locate("Callao, Perú") == "Callao, Perú"
assert locate("País desconocido") is None
assert locate("China") is None, "An entire country must not be treated as a known port"
assert locate("Panamá") is None, "An entire country must not be treated as a known port"

print(f"OK tracking geographic registry: {len(catalog)} coordinates, {len(canonical_quotes)} backed by official quote port names")
print("OK IDTRA 12753 illustrative route: Shenzhen, China -> Balboa, Panamá")
