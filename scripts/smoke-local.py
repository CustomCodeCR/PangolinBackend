#!/usr/bin/env python3
"""Prueba E2E local: OTP .eml -> cookie -> cotización -> logout.
Solo ejecutarlo con Development:ApplySchema=true, Email:Mode=LocalOutbox y SeedLocal.sql aplicado.
No muestra el código OTP en consola ni lo envía fuera del equipo.
"""
import base64
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
import http.cookiejar
import json
import re
import time

ROOT = Path(__file__).resolve().parent.parent
OUTBOX = ROOT / 'backend' / 'local-outbox'
BASE = 'http://127.0.0.1:5000'


def call(opener, route, data=None):
    headers = {'Accept': 'application/json'}
    if data is not None:
        data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = Request(BASE + route, data=data, headers=headers)
    try:
        with opener.open(req, timeout=15) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw)
        except ValueError:
            payload = {'error': raw[:500].decode('utf8', 'replace')}
        return exc.code, payload


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def latest_otp(email, since):
    # Solo buscar archivos nuevos dirigidos a la cuenta de DEMO.
    for file in sorted(OUTBOX.glob('otp-*.eml'), key=lambda p: p.stat().st_mtime, reverse=True):
        if file.stat().st_mtime < since - 2:
            continue
        message = BytesParser(policy=policy.default).parsebytes(file.read_bytes())
        if email.lower() not in str(message['to']).lower():
            continue
        part = message.get_body(preferencelist=('plain',)) or message
        body = part.get_content()
        match = re.search(r'\b\d{6}\b', body)
        if match:
            return match.group()
    return None


def main():
    jar = http.cookiejar.CookieJar()
    browser = build_opener(HTTPCookieProcessor(jar))
    status, ready = call(browser, '/api/health/ready')
    require(status == 200, f'Esquema/API no listo: {status} {ready}')
    require(ready.get('emailMode', '').lower() == 'localoutbox', 'Activar modo LocalOutbox en Development.')
    email = 'demo.usuario@castrofallas.test'
    moment = time.time()
    status, started = call(browser, '/api/auth/request-otp', {
        'tipoAcceso': 'usuario', 'correo': email
    })
    require(status == 200, f'Solicitud OTP HTTP {status}: {started}')
    otp = latest_otp(email, moment)
    require(otp is not None, 'No se encontró OTP nuevo en backend/local-outbox')
    status, result = call(browser, '/api/auth/verify-otp', {
        'challengeId': started['challengeId'], 'codigo': otp
    })
    require(status == 200, f'Verificación HTTP {status}: {result}')
    require(result.get('user', {}).get('role') == 'admin', 'El OTP de usuario debe producir role=admin.')
    # La cookie contiene un JWT compacto (no se muestra el token en consola).
    cookies = [c for c in jar if c.name == 'cf_session']
    require(len(cookies) == 1, 'No se emitió la cookie de sesión.')
    jwt = cookies[0].value
    segments = jwt.split('.')
    require(len(segments) == 3, 'La cookie no contiene un JWT.')
    payload = json.loads(base64.urlsafe_b64decode(segments[1] + '=' * (-len(segments[1]) % 4)))
    require(payload.get('role') == 'admin', 'El JWT no incluye role=admin.')
    require(payload.get('sub') and payload.get('client_id'), 'El JWT carece de identidad.')
    require(payload.get('exp'), 'El JWT carece de expiración.')
    require(payload.get('iss') == 'pangolin-backend' and payload.get('aud') == 'pangolin-api',
            'Emisor/audiencia JWT inesperados.')

    # Modificar el payload conserva una firma inválida que debe rechazarse.
    changed = dict(payload)
    changed['role'] = 'client'
    changed_segment = base64.urlsafe_b64encode(json.dumps(changed).encode()).decode().rstrip('=')
    forged = segments[0] + '.' + changed_segment + '.' + segments[2]
    forged_request = Request(BASE + '/api/auth/me', headers={'Cookie': 'cf_session=' + forged})
    try:
        with build_opener().open(forged_request, timeout=15) as response:
            forged_status = response.status
    except HTTPError as exc:
        forged_status = exc.code
    require(forged_status == 401, 'JWT con payload alterado obtuvo acceso.')

    status, me = call(browser, '/api/auth/me')
    require(status == 200 and me.get('correo') == email and me.get('role') == 'admin', f'Cookie/JWT incorrecta: {status} {me}')
    status, quote = call(browser, '/api/quotes', {
        'serviceType': 'Maritime', 'origin': 'Miami', 'destination': 'San José',
        'cargoType': 'Carga general', 'weightKg': 100, 'pieces': 1
    })
    require(status == 201 and quote.get('id'), f'Cotización HTTP {status}: {quote}')
    status, saved = call(browser, '/api/quotes/' + quote['id'])
    require(status == 200 and saved.get('id') == quote['id'], f'Consulta de cotización: {status} {saved}')
    status, _ = call(browser, '/api/auth/logout', {})
    require(status == 204, f'Logout: {status}')
    status, _ = call(browser, '/api/auth/me')
    require(status == 401, f'Sesión no revocada: {status}')
    print('OK: OTP, JWT, roles, rechazo de firma alterada y revocación (PostgreSQL).')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        raise SystemExit(f'Prueba incompleta: {exc}')
