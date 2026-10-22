#!/usr/bin/env python3
"""Smoke del endpoint DEMO de Docker local (sin consultar embarques reales)."""
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = "http://127.0.0.1:5000/api/tracking/demo"


def request(kind, reference):
    url = BASE + "?" + urlencode({"type": kind, "reference": reference})
    try:
        with urlopen(url, timeout=5) as resp:
            return resp.status, json.load(resp)
    except HTTPError as exc:
        return exc.code, json.load(exc)


def main():
    cases = [
        ("BL", "BL-TEST-001", "in_transit"),
        ("HBL", "HBL-TEST-002", "arrived"),
        ("IDTRA", "IDTRA-TEST-003", "planned"),
        ("CONTAINER", "CONT-TEST-004", "delivered"),
        ("PO", "PO-TEST-005", "in_transit"),
    ]
    for kind, reference, status in cases:
        code, data = request(kind, reference)
        assert code == 200 and data["demo"] is True, (reference, code, data)
        assert data["status"] == status and data["referenceCode"] == reference
        assert -90 <= data["origin"]["lat"] <= 90
        assert -180 <= data["destination"]["lon"] <= 180
        assert 0 <= data["progressPercent"] <= 100
        assert data["etd"] and data["eta"]
        print("OK", reference, data["status"])
    for kind, reference, expected in [
        ("BL", "NO-EXISTE-999", 404),
        ("BL", "X" * 65, 400),
        ("NOPE", "BL-TEST-001", 400),
    ]:
        code, _ = request(kind, reference)
        assert code == expected, (reference, code, expected)
    print("Tracking demo: smoke OK")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, URLError, TimeoutError) as exc:
        print("FAIL", exc, file=sys.stderr)
        raise SystemExit(1) from exc
