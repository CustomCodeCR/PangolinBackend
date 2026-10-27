#!/usr/bin/env python3
"""Prueba E2E local: OTP .eml -> cookie -> cuatro cotizaciones -> logout.
Solo ejecutarlo con Development:ApplySchema=true, Email:Mode=LocalOutbox y SeedLocal.sql aplicado.
No muestra el código OTP en consola ni lo envía fuera del equipo.
"""
import base64
from email import policy
from email.parser import BytesParser
from pathlib import Path
from uuid import uuid4
from urllib.request import Request, build_opener, HTTPCookieProcessor
from urllib.error import HTTPError
import http.cookiejar
import json
import os
import subprocess
import re
import time

ROOT = Path(__file__).resolve().parent.parent
OUTBOX = ROOT / 'backend' / 'local-outbox'
BASE = 'http://127.0.0.1:5000'


def call(opener, route, data=None, method=None):
    headers = {'Accept': 'application/json'}
    if data is not None:
        data = json.dumps(data).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = Request(BASE + route, data=data, headers=headers, method=method)
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
    # Un correo inexistente no debe abrir el paso de verificación OTP.
    fake_email = 'sin-registro-' + uuid4().hex + '@example.invalid'
    status, unavailable = call(browser, '/api/auth/request-otp', {'correo': fake_email})
    require(status == 404 and unavailable.get('code') == 'account_unavailable',
            f'Correo sin registro debe recibir aviso antes del OTP: {status} {unavailable}')
    require('challengeId' not in unavailable,
            'No debe generarse un desafío OTP para correos no registrados.')

    email = 'demo.usuario@castrofallas.test'
    moment = time.time()
    status, started = call(browser, '/api/auth/request-otp', {
        'correo': email  # Nuevo formulario: solo correo; rol desde PostgreSQL
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
    # Prueba de extremo a extremo del Hub (opt-in para no exigir Node al correr
    # este smoke manualmente sin dependencias npm). Nunca imprimir la cookie.
    if os.environ.get('SIGNALR_SMOKE') == '1':
        status, slots = call(browser, '/api/admin/content/site')
        require(status == 200 and isinstance(slots, list), 'No se pudo preparar prueba SignalR.')
        occupied = {row.get('key') for row in slots}
        slot = next((key for key in ('login.hero.title3', 'about.values.heading', 'home.digital.card.2.subtitle')
                     if key not in occupied), None)
        require(slot is not None, 'No hay ubicación de prueba vacía para SignalR.')
        env = dict(os.environ)
        env['SIGNALR_TEST_COOKIE'] = 'cf_session=' + jwt
        env['SIGNALR_TEST_SLOT'] = slot
        subprocess.run(['node', 'frontend/scripts/test-signalr-integration.cjs'],
                       cwd=ROOT, env=env, check=True, timeout=35)
    # Los administradores también pueden cotizar, sin ver solicitudes de otros.
    status, admin_quote = call(browser, '/api/quotes', {
        'serviceType': 'Maritime', 'origin': 'Miami', 'destination': 'San José',
        'cargoType': 'Carga general', 'weightKg': 100, 'pieces': 1
    })
    require(status == 201 and admin_quote.get('id'),
            f'Admin no pudo crear su propia cotización: {status} {admin_quote}')
    admin_quote_id = admin_quote['id']
    status, admin_mine = call(browser, '/api/quotes/mine?page=1&pageSize=20')
    require(status == 200 and any(q.get('id') == admin_quote_id for q in admin_mine.get('items', [])),
            'El administrador no ve su cotización recién creada.')
    status, admin_detail = call(browser, '/api/quotes/' + admin_quote_id)
    require(status == 200 and admin_detail.get('id') == admin_quote_id,
            'El administrador no puede consultar el detalle de su cotización.')
    # El nuevo panel lista cuentas reales y audita cambios, sin permitir invitado.
    status, listing = call(browser, '/api/admin/users?page=1&pageSize=100')
    require(status == 200 and isinstance(listing.get('users'), list),
            f'Listado de usuarios admin: {status} {listing}')
    target = next((u for u in listing['users'] if u.get('correo') == 'demo.cliente@castrofallas.test'), None)
    require(target and target.get('role') == 'cliente', 'No aparece el cliente de demostración.')
    user_route = '/api/admin/users/' + target['id']
    status, invalid = call(browser, user_route, {'role': 'invitado', 'activo': True}, 'PATCH')
    require(status == 400, f'Se permitió convertir usuario en invitado: {status} {invalid}')
    status, selfChange = call(browser, '/api/admin/users/' + me['usuarioId'],
                              {'role': 'cliente', 'activo': True}, 'PATCH')
    require(status == 409, f'Un administrador pudo cambiar su propia cuenta: {status} {selfChange}')
    # DELETE must never remove a live account or the current administrator.
    status, denied_active = call(browser, user_route, method='DELETE')
    require(status == 409, f'Se permitió borrar cuenta activa: {status} {denied_active}')
    status, denied_self = call(browser, '/api/admin/users/' + me['usuarioId'], method='DELETE')
    require(status == 409, f'Se permitió borrar la propia cuenta administradora: {status} {denied_self}')

    # Delete only an isolated throwaway account, never the seeded demo users.
    deleted_email = 'smoke-eliminar-' + uuid4().hex[:12] + '@castrofallas.test'
    status, disposable = call(browser, '/api/admin/users', {
        'nombre': 'Cuenta de eliminación controlada',
        'correo': deleted_email, 'role': 'cliente', 'codigoDynamics': ''
    })
    require(status == 201 and disposable.get('id'),
            f'No se pudo crear cuenta desechable: {status} {disposable}')
    delete_route = '/api/admin/users/' + disposable['id']
    status, denied_live_delete = call(browser, delete_route, method='DELETE')
    require(status == 409, 'La API permitió eliminar una cuenta nueva que seguía activa.')
    status, disabled_delete = call(browser, delete_route, {'role': 'cliente', 'activo': False}, 'PATCH')
    require(status == 200 and disabled_delete.get('activo') is False,
            'No se pudo guardar el estado desactivado de la cuenta desechable.')
    status, removed = call(browser, delete_route, method='DELETE')
    require(status == 204, f'La eliminación controlada no funcionó: {status} {removed}')
    status, removed_again = call(browser, delete_route, method='DELETE')
    require(status == 404, f'El usuario eliminado todavía admite DELETE: {status} {removed_again}')
    status, after_delete = call(browser, '/api/admin/users?page=1&pageSize=100')
    require(status == 200 and all(u.get('id') != disposable['id'] for u in after_delete.get('users', [])),
            'El usuario retirado permanece en el listado de Gestión.')
    status, denied_login = call(build_opener(), '/api/auth/request-otp', {'correo': deleted_email})
    require(status == 404 and denied_login.get('code') == 'account_unavailable',
            'El usuario retirado todavía puede solicitar un OTP.')
    print('OK Solo administradores eliminan cuentas guardadas como desactivadas, sin acceso posterior.')

    # Alterna una cuenta DEMO de forma temporal y garantiza restaurarla.
    try:
        status, disabled = call(browser, user_route, {'role': 'cliente', 'activo': False}, 'PATCH')
        require(status == 200 and disabled.get('activo') is False,
                f'No se pudo desactivar temporalmente demo cliente: {status} {disabled}')
    finally:
        status, restored = call(browser, user_route, {'role': 'cliente', 'activo': True}, 'PATCH')
        require(status == 200 and restored.get('activo') is True,
                f'No se pudo restaurar demo cliente: {status} {restored}')

    # La capacidad S3 debe consultarse desde el panel sin exponer credenciales.
    status, storage_status = call(browser, '/api/admin/content/media/storage-status')
    require(status == 200 and isinstance(storage_status.get('enabled'), bool),
            f'Estado de almacenamiento S3 inválido: {status} {storage_status}')

    # Editor visual: borradores jamás públicos, publicación visible y restauración segura.
    status, existing_slots = call(browser, '/api/admin/content/site')
    require(status == 200 and isinstance(existing_slots, list), 'No se consultaron las ubicaciones CMS.')
    used_keys = {item.get('key') for item in existing_slots}
    site_key = next((key for key in ('home.hero.title1', 'about.values.heading', 'login.hero.title1')
                     if key not in used_keys), None)
    require(site_key is not None, 'No hay ubicación vacía de prueba: se evita sobrescribir contenido real.')
    admin_route = '/api/admin/content/site/' + site_key
    status, public_before = call(build_opener(), '/api/content/site')
    require(status == 200 and isinstance(public_before, list), 'API pública CMS visual no disponible.')
    temporary = 'SMOKE SITE ' + uuid4().hex[:10]
    try:
        status, drafted = call(browser, admin_route,
                               {'textEs': temporary, 'textEn': 'SMOKE TEST', 'mediaId': None}, 'PUT')
        require(status == 200 and drafted.get('draftEs') == temporary,
                f'No se guardó borrador del CMS visual: {status} {drafted}')
        status, public_draft = call(build_opener(), '/api/content/site')
        require(status == 200 and all(row.get('textEs') != temporary for row in public_draft),
                'El CMS visual filtró texto borrador a una sesión pública.')
        status, invalid_slot = call(browser, '/api/admin/content/site/home.hero.media',
                                    {'textEs': 'no permitido', 'textEn': None, 'mediaId': None}, 'PUT')
        require(status == 400, f'Un espacio visual aceptó texto arbitrario: {status}')
        status, published = call(browser, admin_route + '/publish', method='POST')
        require(status == 200 and published.get('publishedEs') == temporary,
                f'No se publicó CMS visual: {status} {published}')
        status, public_site = call(build_opener(), '/api/content/site')
        require(status == 200 and any(row.get('key') == site_key and row.get('textEs') == temporary
                                      for row in public_site), 'No se ve el texto publicado del CMS visual.')
    finally:
        status, _ = call(browser, admin_route + '/restore', method='POST')
        require(status == 200, f'No se restauró el contenido visual predeterminado: {status}')

    # Comentarios: autorizar solo administradores, nunca filtrar borradores,
    # publicar/retirar/editar y eliminar sin dejar datos de prueba.
    visitor = build_opener()
    prefix = 'SMOKE COMMENT ' + uuid4().hex[:10]
    draft = {'author': prefix, 'section': 'Principal',
             'message': 'Comentario de prueba privado', 'published': False}
    status, anonymous_public = call(visitor, '/api/content/comments')
    require(status == 200 and isinstance(anonymous_public, list),
            f'API pública de comentarios: {status} {anonymous_public}')
    status, _ = call(visitor, '/api/admin/content/comments')
    require(status == 401, f'Un visitante pudo consultar borradores: {status}')
    status, _ = call(visitor, '/api/admin/content/comments', draft)
    require(status == 401, f'Un visitante pudo crear comentarios: {status}')
    status, _ = call(browser, '/api/admin/content/comments',
                     dict(draft, author='  '))
    require(status == 400, f'Comentario sin autor fue aceptado: {status}')
    status, _ = call(browser, '/api/admin/content/comments',
                     dict(draft, message='x' * 1201))
    require(status == 400, f'Comentario demasiado largo fue aceptado: {status}')
    comment_id = None
    try:
        status, created = call(browser, '/api/admin/content/comments', draft)
        require(status == 201 and created.get('id') and created.get('published') is False,
                f'No se creó borrador: {status} {created}')
        comment_id = created['id']
        comment_route = '/api/admin/content/comments/' + comment_id
        status, all_admin_comments = call(browser, '/api/admin/content/comments')
        require(status == 200 and any(row.get('id') == comment_id and row.get('published') is False
                                      for row in all_admin_comments),
                'Un borrador no aparece en el panel administrativo.')
        status, listing = call(visitor, '/api/content/comments')
        require(status == 200 and all(row['id'] != comment_id for row in listing),
                'El borrador se filtró en la API pública.')
        status, approved = call(browser, comment_route,
                                dict(draft, message='Comentario de prueba público', published=True), 'PUT')
        require(status == 200 and approved.get('published') is True,
                f'No se publicó el comentario: {status} {approved}')
        status, listing = call(visitor, '/api/content/comments')
        require(status == 200 and any(row.get('id') == comment_id and
                                      row.get('message') == 'Comentario de prueba público'
                                      for row in listing),
                'El comentario publicado no es visible para visitantes.')
        status, hidden_comment = call(browser, comment_route, draft, 'PUT')
        require(status == 200 and hidden_comment.get('published') is False,
                f'No se retiró de publicación: {status} {hidden_comment}')
        status, listing = call(visitor, '/api/content/comments')
        require(status == 200 and all(row['id'] != comment_id for row in listing),
                'El comentario retirado sigue publicado.')
        status, _ = call(visitor, comment_route, draft, 'PUT')
        require(status == 401, 'Un visitante pudo editar comentarios.')
        status, _ = call(visitor, comment_route, method='DELETE')
        require(status == 401, 'Un visitante pudo eliminar comentarios.')
    finally:
        if comment_id:
            status, _ = call(browser, '/api/admin/content/comments/' + comment_id, method='DELETE')
            require(status == 204, f'No se limpió comentario temporal: {status}')

    # CMS real: publicación visible en otra sesión, edición, media y limpieza.
    news = {
        'title': 'SMOKE NEWS ' + uuid4().hex[:10], 'category': 'PRUEBAS',
        'description': 'Resumen temporal para probar PostgreSQL.',
        'body': 'Artículo completo temporal con varios detalles, distinto del resumen.',
        'image': '/images/cover-logistics.jpeg', 'published': True
    }
    media = {
        'name': 'SMOKE MEDIA ' + uuid4().hex[:10],
        'kind': 'Imagen', 'src': '/images/cover-logistics.jpeg'
    }
    news_id = None
    media_id = None
    link_id = None
    legacy_id = None
    try:
        status, created_news = call(browser, '/api/admin/content/news', news)
        require(status == 201 and created_news.get('id'), f'Crear noticia: {status} {created_news}')
        news_id = created_news['id']
        status, public_news = call(build_opener(), '/api/content/news')
        require(status == 200 and any(row['id'] == news_id and row.get('body') == news['body']
                                      for row in public_news),
                'La noticia publicada y su contenido no se ven en el sitio público.')
        status, hidden = call(browser, '/api/admin/content/news/' + news_id,
                              dict(news, published=False), 'PUT')
        require(status == 200 and hidden.get('published') is False,
                f'No se pudo ocultar noticia: {status} {hidden}')
        status, public_news = call(build_opener(), '/api/content/news')
        require(status == 200 and all(row['id'] != news_id for row in public_news),
                'Una noticia despublicada permanece visible.')
        status, created_media = call(browser, '/api/admin/content/media', media)
        require(status == 201 and created_media.get('id'), f'Crear multimedia: {status} {created_media}')
        media_id = created_media['id']
        # Compatibilidad: las instalaciones sin S3 aún aceptan imágenes Base64 anteriores.
        legacy_png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YmFxTYAAAAASUVORK5CYII='
        status, legacy_media = call(browser, '/api/admin/content/media',
                                    dict(media, name='SMOKE LEGACY', src=legacy_png))
        require(status == 201 and legacy_media.get('src') == legacy_png,
                f'La carga multimedia Base64 dejó de funcionar: {status} {legacy_media}')
        legacy_id = legacy_media['id']
        status, media_items = call(browser, '/api/admin/content/media')
        require(status == 200 and any(row['id'] == media_id for row in media_items),
                'El nuevo archivo multimedia no se guardó.')
        # Tipos diferenciados: enlaces HTTPS son válidos, javascript: y SVG base64 no.
        status, rejected = call(browser, '/api/admin/content/media',
                                dict(media, kind='Video (enlace)', src='javascript:alert(1)'))
        require(status == 400, f'Se aceptó un enlace multimedia inseguro: {status} {rejected}')
        status, rejected = call(browser, '/api/admin/content/media',
                                dict(media, src='data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='))
        require(status == 400, f'Se aceptó SVG como imagen: {status} {rejected}')
        status, linked = call(browser, '/api/admin/content/media',
                              dict(media, kind='Documento (enlace)', src='https://example.org/documento.pdf'))
        require(status == 201 and linked.get('id'), f'No se aceptó enlace HTTPS: {status} {linked}')
        link_id = linked['id']
    finally:
        if news_id:
            status, _ = call(browser, '/api/admin/content/news/' + news_id, method='DELETE')
            require(status == 204, f'No se limpió noticia de prueba: {status}')
        if media_id:
            status, _ = call(browser, '/api/admin/content/media/' + media_id, method='DELETE')
            require(status == 204, f'No se limpió multimedia de prueba: {status}')
        if link_id:
            status, _ = call(browser, '/api/admin/content/media/' + link_id, method='DELETE')
            require(status == 204, f'No se limpió el enlace de prueba: {status}')
        if legacy_id:
            status, _ = call(browser, '/api/admin/content/media/' + legacy_id, method='DELETE')
            require(status == 204, f'No se limpió imagen Base64 de prueba: {status}')

    # CRUD de itinerarios: escritura exclusiva para admin, lectura para usuarios registrados.
    pol = 'SMOKE-' + uuid4().hex[:10]
    itinerary = {
        'pol': pol, 'pod': 'San José', 'closing': '2026-10-10',
        'etd': '2026-10-12', 'eta': '2026-10-20',
        'status': 'planning', 'transport': 'maritime', 'modality': 'FCL',
        'carrier': 'Demo Carrier', 'vessel': 'Demo Vessel', 'voyage': 'V-100'
    }
    status, invalid = call(browser, '/api/admin/itinerarios',
                           dict(itinerary, eta='2026-10-01'))
    require(status == 400 and 'errors' in invalid,
            f'No se rechazó ETA anterior a ETD: {status} {invalid}')
    status, invalid = call(browser, '/api/admin/itinerarios',
                           dict(itinerary, transport='ground', modality='FCL'))
    require(status == 400, 'Se aceptó modalidad incompatible con transporte.')

    status, created = call(browser, '/api/admin/itinerarios', itinerary)
    require(status == 201 and created.get('id'), f'Crear itinerario: {status} {created}')
    item_id = created['id']
    item_route = '/api/itinerarios/' + item_id
    try:
        status, found = call(browser, item_route)
        require(status == 200 and found.get('pol') == pol and found.get('carrier') == 'Demo Carrier',
                f'Leer itinerario: {status} {found}')
        status, page = call(browser, '/api/itinerarios?pol=' + pol + '&page=1&pageSize=1')
        require(status == 200 and page.get('total') == 1 and
                len(page.get('items', [])) == 1 and page['items'][0].get('id') == item_id,
                f'Filtro/paginación itinerario: {status} {page}')
        change = dict(itinerary, status='transit', modality='LCL', voyage=None)
        status, modified = call(browser, '/api/admin/itinerarios/' + item_id, change, 'PUT')
        require(status == 200 and modified.get('status') == 'transit'
                and modified.get('modality') == 'LCL' and modified.get('voyage') is None
                and modified.get('id') == item_id,
                f'Actualizar itinerario: {status} {modified}')
        status, found = call(browser, item_route)
        require(status == 200 and found.get('status') == 'transit',
                'La actualización no se guardó en PostgreSQL.')
        status, removed = call(browser, '/api/admin/itinerarios/' + item_id, method='DELETE')
        require(status == 204, f'Eliminar itinerario: {status} {removed}')
        status, missing = call(browser, item_route)
        require(status == 404, 'El itinerario eliminado sigue visible.')
    finally:
        # Garantiza limpieza de la fila temporal si falló una aserción.
        call(browser, '/api/admin/itinerarios/' + item_id, method='DELETE')

    status, _ = call(browser, '/api/auth/logout', {})
    require(status == 204, f'Logout: {status}')
    status, _ = call(browser, '/api/auth/me')
    require(status == 401, f'Sesión no revocada: {status}')
    # Caso cliente: JWT con role=client y mismo mecanismo de sesión.
    client_jar = http.cookiejar.CookieJar()
    client_browser = build_opener(HTTPCookieProcessor(client_jar))
    client_email = 'demo.cliente@castrofallas.test'
    client_start = time.time()
    status, issued = call(client_browser, '/api/auth/request-otp', {
        'correo': client_email  # Cliente también utiliza correo sin elegir rol
    })
    require(status == 200, f'Solicitud OTP cliente HTTP {status}: {issued}')
    client_otp = latest_otp(client_email, client_start)
    require(client_otp is not None, 'No llegó OTP de prueba para cliente.')
    status, verified = call(client_browser, '/api/auth/verify-otp', {
        'challengeId': issued['challengeId'], 'codigo': client_otp
    })
    require(status == 200 and verified.get('user', {}).get('role') == 'client',
            f'El cliente no recibió role=client ({status}).')
    status, client_me = call(client_browser, '/api/auth/me')
    require(status == 200 and client_me.get('role') == 'client', 'JWT cliente no válido.')
    status, _ = call(client_browser, '/api/quotes/' + admin_quote_id)
    require(status == 404, 'Un cliente pudo acceder a la cotización privada de un administrador.')
    status, client_mine_before = call(client_browser, '/api/quotes/mine')
    require(status == 200 and all(q.get('id') != admin_quote_id
                                  for q in client_mine_before.get('items', [])),
            'La lista de clientes expone una cotización de administrador.')
    status, denied_users = call(client_browser, '/api/admin/users')
    require(status == 403, f'Cliente pudo listar cuentas: {status} {denied_users}')
    status, denied_delete = call(client_browser, '/api/admin/users/' + disposable['id'], method='DELETE')
    require(status == 403, f'Un cliente pudo intentar eliminar una cuenta: {status} {denied_delete}')
    status, denied_media = call(client_browser, '/api/admin/content/media')
    require(status == 403, f'Cliente pudo ver biblioteca privada: {status} {denied_media}')
    status, denied_comments = call(client_browser, '/api/admin/content/comments')
    require(status == 403, f'Cliente pudo ver comentarios privados: {status} {denied_comments}')
    status, denied_comment_creation = call(client_browser, '/api/admin/content/comments',
                                            {'author': 'Cliente', 'section': '', 'message': 'No permitido',
                                             'published': True})
    require(status == 403, f'Cliente pudo publicar comentario: {status} {denied_comment_creation}')
    status, page = call(client_browser, '/api/itinerarios?page=1&pageSize=1')
    require(status == 200 and 'items' in page, 'Cliente no puede leer itinerarios.')
    status, forbidden = call(client_browser, '/api/admin/itinerarios', itinerary)
    require(status == 403, f'Un cliente pudo crear itinerarios: {status} {forbidden}')
    fake_id = str(uuid4())
    status, _ = call(client_browser, '/api/admin/itinerarios/' + fake_id, itinerary, 'PUT')
    require(status == 403, 'Un cliente pudo editar itinerarios.')
    status, _ = call(client_browser, '/api/admin/itinerarios/' + fake_id, method='DELETE')
    require(status == 403, 'Un cliente pudo eliminar itinerarios.')
    # Cada modalidad escribe en su tabla propia y el GET devuelve los campos reales.
    common = {
        'origin': 'Miami', 'destination': 'Costa Rica',
        'contact': {
            'fullName': 'Prueba Cliente', 'company': 'Empresa Demo',
            'email': 'demo.cliente@castrofallas.test', 'phone': '8888-8888',
            'country': 'Costa Rica'
        }
    }
    shared = {
        'operation': 'Importación', 'incoterm': 'FOB',
        'nationalization': True, 'description': 'Equipo de prueba',
        'quantity': 2, 'dangerousGoods': False,
        'additionalDetails': 'Prueba automática'
    }
    samples = [
        ('Land', 'land', {
            'transportKind': 'FTL', 'equipment': 'Furgón', 'insured': True,
            'customerType': 'Empresa'
        }),
        ('Air', 'air', dict(shared, equipmentType='No aplica')),
        ('Maritime', 'maritime', dict(shared, shippingType='FCL', containerType='40HC')),
        ('Multimodal', 'multimodal', dict(shared, entryCountry='Panamá', containerType='40HC'))
    ]
    created = []
    for service_type, detail_name, detail in samples:
        payload = dict(common, serviceType=service_type, weightKg=125.5, **{detail_name: detail})
        status, quote = call(client_browser, '/api/quotes', payload)
        require(status == 201 and quote.get('id'), f'Crear {service_type}: {status} {quote}')
        created.append(quote['id'])
        require(quote.get(detail_name) is not None and quote.get('weightKg') == 125.5
                and quote.get('contact', {}).get('email') == common['contact']['email'],
                f'Campos guardados en {service_type}: {quote}')
        status, saved = call(client_browser, '/api/quotes/' + quote['id'])
        require(status == 200 and saved.get(detail_name) == quote.get(detail_name),
                f'Leer {service_type} persistido: {status} {saved}')
        for other in ('land', 'air', 'maritime', 'multimodal'):
            if other != detail_name:
                require(saved.get(other) is None, f'{service_type} tiene detalles ajenos de {other}')

    status, page = call(client_browser, '/api/quotes/mine?page=1&pageSize=20')
    require(status == 200 and all(i in [item['id'] for item in page.get('items', [])] for i in created),
            f'Listado del cliente incompleto: {status} {page}')
    status, invalid = call(client_browser, '/api/quotes',
        dict(common, serviceType='Multimodal', multimodal=dict(shared, containerType='40HC')))
    require(status == 400, f'Multimodal sin país de entrada aceptado: {status} {invalid}')
    status, invalid = call(client_browser, '/api/quotes',
        dict(common, serviceType='Air', maritime=dict(shared, shippingType='FCL', containerType='40HC')))
    require(status == 400, f'Modalidad cruzada aceptada: {status} {invalid}')
    status, _ = call(client_browser, '/api/quotes/' + created[0], {}, 'PUT')
    require(status == 405, f'La API permitió editar la cotización: {status}')
    status, _ = call(client_browser, '/api/quotes/' + created[0], method='DELETE')
    require(status == 405, f'La API permitió eliminar cotizaciones: {status}')

    status, _ = call(client_browser, '/api/auth/logout', {})
    require(status == 204, 'No se pudo cerrar sesión de cliente.')

    # Visitantes anónimos no reciben autenticación ni token.
    status, _ = call(build_opener(), '/api/auth/me')
    require(status == 401, 'Un invitado obtuvo una identidad autenticada.')
    status, _ = call(build_opener(), '/api/admin/itinerarios', itinerary)
    require(status == 401, 'Un invitado pudo crear itinerarios.')

    print('OK: login por correo, OTP/JWT, roles, usuarios admin, CMS, comentarios moderados, itinerarios y 4 cotizaciones.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        raise SystemExit(f'Prueba incompleta: {exc}')
