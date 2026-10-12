#!/usr/bin/env python3
"""Diagnóstico sin credenciales ni OTP: python3 scripts/check-local.py."""
import json
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

for label, url in [
    ('API', 'http://127.0.0.1:5000/api/health'),
    ('PostgreSQL + tablas', 'http://127.0.0.1:5000/api/health/ready'),
    ('Proxy de Vite', 'http://127.0.0.1:5173/api/health/ready'),
]:
    try:
        with urlopen(url, timeout=5) as resp:
            data = json.load(resp)
            print(f'{label}: HTTP {resp.status} {data}')
    except HTTPError as ex:
        print(f'{label}: HTTP {ex.code}: {ex.read(1200).decode("utf8", "replace")}')
    except URLError as ex:
        print(f'{label}: sin conexión ({ex.reason})')
