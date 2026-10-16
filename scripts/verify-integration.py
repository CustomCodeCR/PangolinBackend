#!/usr/bin/env python3
"""Comprobaciones estáticas del ensamblado (no sustituye tests E2E en Docker)."""
from pathlib import Path
from html.parser import HTMLParser
import json
import re
import sys

root = Path(__file__).resolve().parents[1]

def read(path):
    return (root / path).read_text(encoding='utf-8')

def check(ok, description):
    if not ok:
        raise AssertionError(description)
    print('OK', description)

login = read('frontend/src/pages/Login.vue')
rootvue = read('frontend/src/Root.vue')
header = read('frontend/src/components/SiteHeader.vue')
app = read('frontend/src/App.vue')
program = read('backend/Program.cs')
service = read('backend/Services/Auth/AuthService.cs')
compose = read('compose.yaml')

check('login-screen' in login and 'LanguageSwitcher' in login, 'Pantalla visual e idioma del rediseño')
check(all(route in login for route in ['/api/auth/request-otp', '/api/auth/verify-otp'])
      and 'refreshSession' in login and 'authState' in read('frontend/src/services/auth.ts'),
      'Login de correo único verifica OTP y obtiene el rol del servidor')
check('quoteAccess' in rootvue and 'refreshSession()' in rootvue and 'QuoteApp v-else' in rootvue, 'Formulario protegido por comprobación de sesión')
check('logoutSession' in header and 'sessionUser' in header
      and '/api/auth/logout' in read('frontend/src/services/auth.ts'),
      'Cabecera muestra estado de sesión y logout real')
check("fetch('/api/quotes'" in app and 'sessionExpired' in app, 'Cotizador del rediseño conectado a API')
check(all(ep in program for ep in ['/api/auth/request-otp', '/api/auth/verify-otp', '/api/auth/logout', '/api/auth/me', '/api/quotes']), 'Endpoints de auth y cotizaciones en backend')
check('GetIdentityAsync(http, ct)' in program and 'user.ClienteId' in program, 'Cotizaciones autorizadas en servidor y por cliente')
check(all(x in service for x in ['HMACSHA256', 'FixedTimeEquals', 'HttpOnly = true', 'FOR UPDATE']), 'Backend OTP mantiene controles fundamentales')
check(all(x in compose for x in ['postgres:', 'redis:', 'mongo:', 'backend:', 'frontend:']), 'Compose incluye 5 servicios')
check(all(x in compose for x in ['127.0.0.1:${FRONTEND_HOST_PORT', '127.0.0.1:${BACKEND_HOST_PORT', '127.0.0.1:${POSTGRES_HOST_PORT']), 'Puertos host de desarrollo limitados a loopback')
check((root/'backend/Database/AuthSchema.sql').is_file(), 'Esquema de login disponible')
check((root/'frontend/public/images/logo.png').is_file(), 'Activos gráficos del rediseño disponibles')
for language in ('es', 'en'):
    d=json.loads(read(f'frontend/src/locales/{language}.json'))
    check(all(x in d['custom']['quote'] for x in ('checkingSession','loginRequired','goToLogin','sessionExpired')) and all(k in d['custom']['header'] for k in ('profile', 'accountName', 'accountRole', 'accountEmail', 'roleAdmin', 'roleClient', 'logout')), f'Traducciones integradas: {language}')
check('.env' in read('.gitignore').splitlines(), 'Git excluye .env local; no se inspeccionan secretos')
check('vue-i18n' in json.loads(read('frontend/package.json'))['dependencies'], 'Dependencias originales del rediseño conservadas')
check('embla-carousel' in json.loads(read('frontend/package.json'))['dependencies'], 'Carrusel de noticias incorporado con su dependencia')
check('node_modules/embla-carousel' in json.loads(read('frontend/package-lock.json'))['packages'], 'Lockfile actualizado para carrusel')
check("if(path==='/servicios') return 'services'" in rootvue and '<Services v-else-if' in rootvue, 'Nueva página Servicios registrada y conservada con autenticación')
check("url: '/servicios'" in header and 'logoutSession' in header, 'Menú actualizado sin perder logout')
check('EmblaCarousel' in read('frontend/src/pages/News.vue') and 'news-article-modal' in read('frontend/src/pages/News.vue'), 'Nueva página Noticias y modal disponible')
check((root/'frontend/src/pages/Services.vue').is_file(), 'Página Servicios incluida')
check('selectTransport' in read('frontend/src/pages/Itinerary.vue'), 'Mejoras de transporte incorporadas')
# Protección frente a las regresiones introducidas por la integración del frontend.
itinerary = read('frontend/src/pages/Itinerary.vue')
date_inputs = re.findall(r'<input\s+v-model="item\.(closing|etd|eta)"\s+type="date"', itinerary)
check(len(date_inputs) == 3 and set(date_inputs) == {'closing', 'etd', 'eta'}
      and not any(stale in itinerary for stale in
                  ('closingDesde', 'closingHasta', 'etdDesde', 'etdHasta', 'etaDesde', 'etaHasta')),
      'Itinerarios: exactamente un Closing, ETD y ETA; no hay fechas duplicadas')
check("['closing', 'etd', 'eta'] as const" in itinerary and
      "filters.set(key, f[key])" in itinerary and
      all(exact in program for exact in ('DateOnly? closing', 'DateOnly? etd', 'DateOnly? eta')),
      'Itinerarios: el frontend envía filtros de fecha exacta compatibles con la API')
responsive_css = read('frontend/src/style.css')
check(all(rule in responsive_css.split('/* Corregir fondo superior del menú móvil en Noticias */')[-1] for rule in (
      '.app-site.news-page .news-editorial-hero',
      '> .site-header.site-header--overlay.site-header--menu-open',
      'position: absolute !important;',
      'top: 0 !important;',
      'background: #9f0921 !important;'
      )) and responsive_css.count('/* Corregir fondo superior del menú móvil en Noticias */') == 1,
      'Noticias: menú móvil rojo arranca al borde superior, sin franja de fotografía')

menu_css = responsive_css.split('/* NAV MÓVIL: al abrir hamburguesa', 1)[1].split(
    '/* Keep the mobile settings popover', 1)[0]
check(all(css in menu_css for css in
          ('display: grid;', 'grid-template-rows: 72px auto;',
           '.site-header.site-header--menu-open .site-brand',
           '.site-header.site-header--menu-open .menu-toggle',
           '.site-header.site-header--menu-open .main-nav.main-nav--open',
           'grid-row: 2;')),
      'Nav móvil: logo/botón en primera fila, enlaces en segunda, estructura estable')

schema = read('backend/Database/AuthSchema.sql')
check(all(f'CREATE TABLE IF NOT EXISTS {table}' in schema for table in
          ('quote_contacts', 'quote_land_details', 'quote_air_details',
           'quote_maritime_details', 'quote_multimodal_details')),
      'Cotizaciones estructuradas en cuatro tablas independientes y contacto')
check(all(f'{mode}: {{' in app for mode in ('land', 'air', 'maritime', 'multimodal')),
      'Frontend envía los cuatro detalles con clave propia')
check('land: {' in app and 'weightKg: 1' not in app
      and 'maritime: {' in app and 'multimodal: {' in app,
      'Frontend no inventa peso y envía detalles por modalidad')
check('app.MapGet("/api/quotes/mine"' in program and
      '.RequireAuthorization("client")' in program,
      'Cotizaciones propias y creación restringida a clientes')
check("role === 'cliente'" in rootvue and "quoteAccess === 'forbidden'" in rootvue,
      'El cotizador se muestra únicamente a clientes autenticados')
check(all(x in schema for x in ('CREATE TABLE IF NOT EXISTS public.cms_news',
                                   'CREATE TABLE IF NOT EXISTS public.cms_media',
                                   'CREATE TABLE IF NOT EXISTS auth_admin_user_audit')),
      'Persistencia CMS y auditoría de cambios de usuarios')
check(all(x in program for x in ('app.MapAdminUsers()', 'app.MapManagedContent()')),
      'Endpoints nuevos conectados al backend')
check(all(x in read('frontend/src/pages/ContentManager.vue') for x in
          ('/api/admin/users', '/api/admin/content/news', '/api/admin/content/media')),
      'Panel administra usuarios, noticias y multimedia mediante la API')
check("fetch('/api/content/news'" in read('frontend/src/pages/News.vue'),
      'Noticias públicas publicadas desde PostgreSQL')
check('multimodal: {' in app and 'cargo.entryCountry' in app and
      "mode.value === 'multimodal'" in app,
      'Modalidad multimodal recuperada en el nuevo diseño')
check('automaticRole' in service and 'user.TipoAcceso' in service,
      'OTP por correo infiere rol desde PostgreSQL')
check('CREATE TABLE IF NOT EXISTS public.itinerarios' in schema and
      'ADD COLUMN IF NOT EXISTS closing DATE NULL' in schema,
      'Itinerarios provisionales con closing sin eliminar registros')
check("currentRole() === 'administrador'" in header and
      'isAuthenticated = computed(() => !!sessionUser.value)' in header and
      'previewRole' in read('frontend/src/services/auth.ts'),
      'El menú administra rol real y previsualización sin privilegios API')
check('class="nav-user-icon header-profile__trigger"' in header
      and '@click.stop="toggleProfile"' in header and '@click="logout"' in header
      and 'sessionUser.nombre?.trim()' in header and 'sessionUser.correo' in header
      and 'roleLabel' in header and 'handleOutsideClick' in header
      and 'handleEscapeKey' in header,
      'Icono de usuario abre perfil con nombre, rol, correo y cierre de sesión explícito')
profile_styles = read('frontend/src/components/SiteHeader.vue')
check('const profileTheme = computed(() => darkMode.value ?' in profile_styles
      and ':style="profileTheme"' in profile_styles
      and "'--profile-bg': 'rgba(10,18,40,.48)'" in profile_styles
      and "'--profile-bg': 'rgba(255,255,255,.64)'" in profile_styles
      and "'--profile-ink': '#ffffff'" in profile_styles
      and 'background: var(--profile-bg, rgba(255,255,255,.64))' in profile_styles
      and 'backdrop-filter: blur(12px)' in profile_styles
      and '.header-account-tools .nav-user-icon.header-profile__trigger' in profile_styles
      and 'background: #ffffff12;' in profile_styles
      and 'width: 40px;' in profile_styles,
      'Perfil hereda vidrio traslúcido, contraste reactivo y estilo del botón Configuración')
shared_mobile_styles = read('frontend/src/style.css')
check('Shared mobile layout for the account and settings popovers' in shared_mobile_styles
      and '.site-header.site-header--menu-open .header-settings--open .header-settings__panel' in shared_mobile_styles
      and '.site-header.site-header--menu-open .header-profile--open .header-profile__panel' in shared_mobile_styles
      and 'grid-row: 2 !important;' in shared_mobile_styles
      and 'grid-column: 1 / -1 !important;' in shared_mobile_styles
      and 'grid-template-columns: 38px 38px !important;' in shared_mobile_styles,
      'Perfil y Configuración se abren en una fila inferior centrada en pantallas móviles')
check('.theme-toggle:hover{transform:scale(1.12)}' in shared_mobile_styles
      and 'En menú responsive no ampliar el botón de tema' in shared_mobile_styles
      and '.site-header .header-settings__panel .theme-toggle:is(:hover, :active, :focus-visible)' in shared_mobile_styles
      and 'transform: none !important;' in shared_mobile_styles,
      'El hover de tema no amplía el botón en responsive y conserva escritorio')
check('Alinear la flecha del idioma al centro del texto' in shared_mobile_styles
      and '.site-header .header-settings__panel .language-switcher__chevron::after' in shared_mobile_styles
      and 'align-self: center;' in shared_mobile_styles
      and 'font-size: 0;' in shared_mobile_styles
      and 'transform: translateY(-2px) rotate(45deg);' in shared_mobile_styles,
      'Flecha del selector de idioma centrada verticalmente en ajustes móviles')
check('localOutbox' not in login and 'news-editorial-hero__sidebar' in read('frontend/src/style.css'),
      'Estilos nuevos y login sin aviso incorrecto de LocalOutbox')
check('5500' in read('frontend/src/pages/News.vue'), 'Carrusel más rápido de frontend 8 conservado')
check('VITE_API_PROXY_TARGET' in read('frontend/vite.config.ts'), 'Proxy Docker conservado')
print('Comprobaciones estáticas de integración finalizadas.')
