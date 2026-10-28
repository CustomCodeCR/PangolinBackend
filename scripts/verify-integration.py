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
check('${FRONTEND_BIND_IP:-127.0.0.1}:${FRONTEND_HOST_PORT' in compose and
      all(x in compose for x in ['127.0.0.1:${BACKEND_HOST_PORT', '127.0.0.1:${POSTGRES_HOST_PORT']),
      'Frontend LAN opt-in; backend y PostgreSQL permanecen limitados a loopback')
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
check('EmblaCarousel' in read('frontend/src/pages/News.vue') and ('news-article-modal' in read('frontend/src/pages/News.vue') or ('news-article-page' in read('frontend/src/pages/News.vue') and 'articlePath' in read('frontend/src/pages/News.vue'))), 'Página de Noticias conserva carrusel y lectura de artículos (modal o página completa)')
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
# La infraestructura en tiempo real no debe aceptar notificaciones inventadas por navegadores.
hub = read('backend/Services/Realtime/ContentUpdatesHub.cs')
publisher = read('backend/Services/Realtime/ContentUpdatesPublisher.cs')
signalr_client = read('frontend/src/services/signalr.ts')
check('app.MapHub<ContentUpdatesHub>' in program and 'AddSignalR(' in program and
      'Context.GetHttpContext()' in hub and 'SendCoreAsync("DataChanged"' in publisher,
      'Backend aloja SignalR y solo envía notificaciones desde .NET')
check("withUrl('/api/hubs/updates'" in signalr_client and
      'onreconnected(refreshAfterGap)' in signalr_client and
      'connectSignalR()' in read('frontend/src/main.ts') and
      'ws: true' in read('frontend/vite.config.ts'),
      'Frontend usa SignalR con reconexión y proxy WebSockets')

quote_post = program.split('app.MapPost("/api/quotes"', 1)[1].split('app.MapGet("/api/quotes/mine"', 1)[0]
quote_mine = program.split('app.MapGet("/api/quotes/mine"', 1)[1].split('app.MapGet("/api/quotes/{id:guid}"', 1)[0]
check('.RequireAuthorization("registered")' in quote_post and
      '.RequireAuthorization("registered")' in quote_mine and
      'x.UsuarioId == user.UsuarioId' in quote_mine and
      'IsOwnedByAdminAsync' in program,
      'Cotizaciones de administradores: acceso registrado y privacidad por usuario')
check("role === 'cliente' || role === 'administrador'" in rootvue and
      "authState.user?.role !== 'administrador'" in app,
      'El cotizador funciona para clientes y administradores autenticados')
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
check('.theme-toggle:hover{transform:scale(1.10)}' in shared_mobile_styles
      and 'Hover sutil en móvil: 5% frente al 10% de escritorio.' in shared_mobile_styles
      and '.site-header .header-settings__panel .theme-toggle:is(:hover, :active, :focus-visible)' in shared_mobile_styles
      and 'transform: scale(1.05) !important;' in shared_mobile_styles
      and 'transform-origin: left center;' in shared_mobile_styles,
      'El selector de tema mantiene hover sutil en responsive sin cambiar escritorio')
check('Alinear la flecha del idioma al centro del texto' not in shared_mobile_styles
      and '<svg viewBox="0 0 16 16"' in read('frontend/src/components/LanguageSwitcher.vue') and '<path d="m4 6 4 4 4-4"' in read('frontend/src/components/LanguageSwitcher.vue')
      and '.language-switcher__chevron::after' not in shared_mobile_styles,
      'Flecha del idioma conserva el diseño original')
check("import { Anchor } from '@lucide/vue'" in app
      and '<Anchor :size="26" :stroke-width="2.4" />' in app
      and '<span class="quote-choice-icon" aria-hidden="true">⚓</span>' not in app
      and 'Los cuatro pictogramas de las tarjetas de cotización' in shared_mobile_styles
      and '.quote-choice-card .quote-choice-icon svg *' in shared_mobile_styles
      and 'stroke: #fff !important;' in shared_mobile_styles
      and 'fill: none !important;' in shared_mobile_styles,
      'Cuatro íconos de cotización blancos, sin emoji azul y con SVG monócromo')
legal_page = read('frontend/src/pages/Legal.vue')
check('type LegalDocument = { title: string; sections: LegalSection[] }' in legal_page
      and 'class="legal-draft"' not in legal_page
      and 'content.draft' not in legal_page
      and all(marker not in legal_page for marker in [
          'Borrador para revisión', 'Working draft', 'Este borrador', 'This draft'])
      and legal_page.count('"sections": [') == 8
      and all(title in legal_page for title in [
          'Política de privacidad', 'Términos y condiciones',
          'Política de cookies y almacenamiento local', 'Créditos y licencias',
          'Privacy Policy', 'Terms and Conditions of Use',
          'Cookie and Local Storage Policy', 'Credits and Licenses'])
      and legal_page.count('3-101-035767') >= 2
      and legal_page.count('comercial@castrofallas.com') >= 2
      and 'cf_session' in legal_page
      and '<section v-for="(section, index) in content.sections"' in legal_page
      and '.legal-draft' not in shared_mobile_styles
      and legal_page.count('/licenses/globe-third-party-notices.txt') >= 2
      and (root / 'frontend/public/licenses/globe-third-party-notices.txt').is_file(),
      'Páginas legales ES/EN: 4 documentos por idioma, identidad, cookies y avisos de terceros')
check('class="container quote-access-status quote-access-status--blocked"' in rootvue
      and rootvue.count('class="container quote-access-status quote-access-status--blocked"') == (3 if 'trackingSessionRequiredHelp' in rootvue else 2)
      and ('trackingSessionRequiredHelp' not in rootvue or "page==='tracking' && trackingAccess !== 'allowed'" in rootvue)
      and '.quote-flow-page>.site-footer{margin-top:auto}' in shared_mobile_styles
      and '@media (max-width: 800px)' in shared_mobile_styles
      and '.quote-flow-page > .quote-access-status--blocked' in shared_mobile_styles
      and 'padding-bottom: clamp(40px, 7vh, 64px);' in shared_mobile_styles,
      'Cotizaciones y rastreo sin sesión conservan aviso, acceso al login y espacio antes del footer en móvil')
check('<IconSymbol glyph="←" :size="20" />' in login
      and '<span aria-hidden="true">←</span>' not in login
      and '.login-visual .login-guest-back .lucide-symbol {' in shared_mobile_styles
      and 'flex: 0 0 20px;' in shared_mobile_styles
      and '.login-visual .login-guest-back .lucide-symbol svg { display: block; }' in shared_mobile_styles,
      'Flecha del botón Volver usa SVG centrado en una caja de 20 píxeles')
admin_manager = read('frontend/src/pages/ContentManager.vue')
admin_final_styles = admin_manager.split('/* Fidelidad visual al frontend 19/10', 1)[-1]
check('class="manager-heading"' in admin_manager
      and 'class="manager-tabs manager-subtabs"' in admin_manager
      and 'padding:clamp(20px,2.8vw,34px);' in admin_final_styles
      and 'border:1px solid var(--manager-line); border-radius:18px;' in admin_final_styles
      and 'background:var(--admin-surface); box-shadow:none; overflow:hidden;' in admin_final_styles
      and 'padding:6px clamp(12px,1.8vw,20px);' in admin_final_styles
      and 'border:1px solid var(--manager-line); border-radius:16px;' in admin_final_styles
      and '.is-embedded .manager-heading{padding:20px 16px;border-radius:16px}' in admin_final_styles
      and '.is-embedded .manager-tabs{gap:6px 12px;padding:6px 8px;border-radius:14px}' in admin_final_styles,
      'Administración mantiene contenido separado de bordes y esquinas redondeadas en escritorio y móvil')
admin_css = read('frontend/src/style.css')
admin_colors = admin_css.split('/* Administracion: mismo fondo carbon/rojo vino de Itinerario 01.', 1)[-1]
check('html.theme-dark .app-site.administration-page .content-manager.is-embedded :is(' in admin_colors
      and all('.' + part in admin_colors for part in [
          'manager-heading', 'manager-notice', 'manager-preview-note',
          'manager-tabs', 'manager-form', 'manager-list', 'manager-users-card'
      ])
      and 'background-color: #211b20 !important;' in admin_colors
      and 'rgba(145, 9, 43, .38)' in admin_colors
      and 'linear-gradient(110deg, #321d25 0%, #211b20 70%) !important;' in admin_colors
      and 'content: "" !important;' in admin_colors
      and 'z-index: -1 !important;' in admin_colors
      and 'rgba(214, 14, 52, .37)' in admin_colors
      and 'rgba(178, 11, 45, .23)' in admin_colors
      and 'animation: itinerary-red-sweep 9s ease-in-out infinite alternate !important;' in admin_colors
      and 'prefers-reduced-motion: reduce' in admin_colors
      and 'animation: none !important;' in admin_colors
      and 'filter: none !important;' in admin_colors
      and 'filter: blur(' not in admin_colors
      and '-webkit-backdrop-filter: none !important;' in admin_colors
      and '.app-site.administration-page .site-header .site-brand img {' in admin_colors
      and '<SiteMedia slot-key="shared.logo.media" fallback="/images/logo.png"' in read('frontend/src/components/SiteHeader.vue'),
      'Administración replica ola roja animada de Itinerarios, sin desenfoque y conservando logo compartido')
itinerary_inputs = admin_css
check('html.theme-dark .itinerary-form-line input,html.theme-dark .itinerary-form-line select{border-color:#3b465f;background:#121a30;color:#fff}' in itinerary_inputs
      and 'html.theme-dark .itinerary-form-line input::placeholder{color:#acb1bd}' in itinerary_inputs
      and 'background-color: #121a30 !important;' in admin_colors
      and 'border-color: #3b465f !important;' in admin_colors
      and 'color: #acb1bd !important;' in admin_colors
      and 'background-color: #1c2335 !important;' in admin_colors
      and 'color: #aeb5c4 !important;' in admin_colors
      and '.manager-users-table select {' in admin_colors
      and '.manager-form :is(input, select, textarea),' in admin_colors
      and 'border-color: #b20c2a !important;' in admin_colors,
      'Campos de Administracion igualan colores reales de Itinerarios y conservan accesibilidad')
editor_visual = read('frontend/src/pages/SiteVisualEditor.vue')
editor_admin_theme = editor_visual.split('/* Editor visual dentro de Administración: misma superficie carbón-vino y', 1)[-1]
check('html.theme-dark .app-site.administration-page .visual-editor {' in editor_admin_theme
      and 'background-color: #211b20 !important;' in editor_admin_theme
      and 'linear-gradient(110deg, #321d25 0%, #211b20 70%) !important;' in editor_admin_theme
      and 'animation: itinerary-red-sweep 9s ease-in-out infinite alternate;' in editor_admin_theme
      and 'filter: none;' in editor_admin_theme
      and 'backdrop-filter: none;' in editor_admin_theme
      and '-webkit-backdrop-filter: none;' in editor_admin_theme
      and 'filter: blur(' not in editor_admin_theme
      and 'prefers-reduced-motion: reduce' in editor_admin_theme
      and 'animation: none;' in editor_admin_theme
      and '.visual-editor__context,' in editor_admin_theme
      and '.visual-editor__preview-empty, .visual-editor__empty' in editor_admin_theme
      and 'background: #30252a !important;' in editor_admin_theme
      and 'background: #121a30 !important;' in editor_admin_theme
      and 'border-color: #3b465f !important;' in editor_admin_theme
      and 'background: #b20d30 !important;' in editor_admin_theme
      and 'src="hero.webp"' not in editor_admin_theme,
      'Editor visual en Administración iguala carbón y ola sin alterar imágenes ni funcionalidad')
manager_mobile = read('frontend/src/pages/ContentManager.vue')
icon_symbol = read('frontend/src/components/IconSymbol.vue')
check('<span class="manager-tab-label">Contenido</span>' in manager_mobile
      and '<span class="manager-tab-label">Gestión de usuarios</span>' in manager_mobile
      and '<span class="manager-tab-count">{{ users.length }}</span>' in manager_mobile
      and '.is-embedded .manager-tabs:not(.manager-subtabs) {' in manager_mobile
      and 'grid-template-rows:32px minmax(36px,auto) 24px;' in manager_mobile
      and '.is-embedded .manager-tabs:not(.manager-subtabs) > button::after' in manager_mobile
      and 'grid-template-columns:repeat(2,minmax(0,1fr));' in manager_mobile,
      'Administración móvil mantiene Contenido y Usuarios en dos columnas')
check('<IconSymbol glyph="message-circle" :size="19" /> <span class="manager-tab-label">Comentarios</span>' in manager_mobile
      and "'message-circle': MessageCircle" in icon_symbol
      and '<span class="manager-tab-label">Cotizaciones</span> <span>{{ quotesTotal }}</span>' in manager_mobile
      and '<span class="manager-tab-label">Editor visual</span> <span>0</span>' in manager_mobile
      and 'manager-subtabs--with-quotes' in manager_mobile
      and '.is-embedded .manager-tabs.manager-subtabs {' in manager_mobile
      and 'grid-template-columns:clamp(28px,8vw,34px) minmax(0,1fr) auto;' in manager_mobile
      and '.is-embedded .manager-tabs.manager-subtabs:not(.manager-subtabs--with-quotes) > button.manager-editor-visual-tab {' in manager_mobile
      and '.is-embedded .manager-tabs.manager-subtabs > button .lucide-symbol {' in manager_mobile
      and 'async function loadComments()' in manager_mobile
      and "'comments-admin'" in manager_mobile,
      'Administración conserva CRUD de Comentarios y distribuye seis pestañas en móvil')

check('@media (min-width:651px) {' in manager_mobile
      and '.content-manager.is-embedded .manager-tabs.manager-subtabs {' in manager_mobile
      and 'grid-template-columns:repeat(6,max-content);' in manager_mobile
      and 'justify-content:space-between;' in manager_mobile
      and 'overflow-x:hidden;' in manager_mobile
      and '@media (min-width:651px) and (max-width:1250px) {' in manager_mobile
      and 'grid-template-columns:repeat(6,minmax(0,1fr));' in manager_mobile
      and '.content-manager.is-embedded .manager-tabs.manager-subtabs > button {' in manager_mobile
      and 'grid-template-rows:32px minmax(30px,auto) 24px;' in manager_mobile,
      'Administración mantiene espacios uniformes y sin desplazamiento horizontal en escritorio')

mobile_drawer_css = read('frontend/src/style.css')
drawer_fix = mobile_drawer_css.split('/* Mobile side drawer: account/settings controls share one short row.', 1)[-1]
drawer_fix = drawer_fix.split('/* Móvil: mismo rojo sólido', 1)[0]
mobile_header = read('frontend/src/components/SiteHeader.vue')
smoke_chrome = read('scripts/smoke-browser-live.py')
check('grid-template-columns: repeat(2, minmax(0, 1fr)) !important;' in drawer_fix
      and 'grid-column: 1 / -1;' in drawer_fix
      and 'grid-row: 2;' in drawer_fix
      and 'width: calc(100% - 16px) !important;' in drawer_fix
      and 'max-width: calc(100% - 16px) !important;' in drawer_fix
      and '.header-profile--open' in drawer_fix
      and '.header-settings--open' in drawer_fix
      and 'grid-template-columns: max-content 38px minmax(170px, 220px)' not in mobile_drawer_css
      and 'class="header-profile__panel"' in mobile_header
      and 'class="header-settings__panel"' in mobile_header
      and 'check_drawer_panel(".header-profile__panel")' in smoke_chrome
      and 'check_drawer_panel(".header-settings__panel")' in smoke_chrome,
      'Menú móvil mantiene Cuenta y Configuración dentro de los bordes del drawer')
check('localOutbox' not in login and 'news-editorial-hero__sidebar' in read('frontend/src/style.css'),
      'Estilos nuevos y login sin aviso incorrecto de LocalOutbox')
check('5500' in read('frontend/src/pages/News.vue'), 'Carrusel más rápido de frontend 8 conservado')
check('VITE_API_PROXY_TARGET' in read('frontend/vite.config.ts'), 'Proxy Docker conservado')
# Verifica coordenadas ilustrativas y correspondencias con el catálogo oficial de Cotizaciones.
import subprocess
subprocess.run([sys.executable, str(root / 'scripts/verify-tracking-ports.py')], check=True)
# Contracto de producción: se debe respetar lo que ya funciona en main.
prod_workflow = read('.github/workflows/pangolin-images.yml')
prod_compose = read('deploy/docker-compose.images.yml')
news_migration = read('backend/Database/CmsNewsMetadataMigration.sql')
check('VITE_OFFICIAL_QUOTES_ENABLED=true' in prod_workflow
      and 'Features__OfficialQuotesEnabled: "true"' in prod_compose
      and all(name in prod_workflow for name in (
          '/app/Database/OfficialQuotesSchema.sql',
          '/app/Database/OfficialQuotesVerifiedLocations.sql',
          '/app/Database/OfficialQuotesVideoLocations.sql',
          'ready_roles', 'required_tables')),
      'Produccion preserva cotizaciones oficiales habilitadas y el catalogo aprobado de main')
check('Security__AdditionalPublicOrigin:' in prod_compose
      and 'PANGOLIN_TRAEFIK_ENABLED: "true"' in prod_workflow
      and 'Cross-site POST Origin correctly rejected.' in prod_workflow,
      'Produccion conserva dominio WWW, validacion Origin y dominio raiz independiente')
check('pg_dump -Fc' in prod_workflow
      and 'pg_restore --list' in prod_workflow
      and 'pg_restore --list' in prod_workflow.split('Apply additive CMS news metadata migration')[0]
      and prod_workflow.index('pg_dump -Fc') < prod_workflow.index('Initialize base schema')
      and prod_workflow.index('Apply additive CMS news metadata migration') < prod_workflow.index('Deploy backend and frontend'),
      'Backup privado validado precede a cualquier migracion y al reinicio de produccion')
check(all(token in news_migration for token in (
          'ADD COLUMN IF NOT EXISTS author VARCHAR(160)',
          'ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ',
          'WHERE published = TRUE AND published_at IS NULL',
          "SET LOCAL lock_timeout = '5s'"))
      and 'CmsNewsMetadataMigration.sql' in prod_workflow
      and 'scripts/test-cms-news-migration.py' in read('.github/workflows/integration-check.yml'),
      'Migracion CMS aditiva, idempotente, probada por CI y aplicada antes de reiniciar')
check('DholeTracking__Enabled: "${PANGOLIN_DHOLE_TRACKING_ENABLED:-false}"' in prod_compose
      and 'DholeTracking__ApiKey: "${PANGOLIN_DHOLE_TRACKING_API_KEY:-}"' in prod_compose
      and 'PANGOLIN_DHOLE_TRACKING_API_KEY' in prod_workflow
      and 'Production tracking enabled without private API key' in prod_workflow,
      'Dynamics desactivado por defecto, secreto privado y guardia de despliegue')

print('Comprobaciones estáticas de integración finalizadas.')
