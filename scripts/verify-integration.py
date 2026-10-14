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
check(all(route in login for route in ['/api/auth/request-otp', '/api/auth/verify-otp', '/api/auth/me']), 'Login OTP y sesión enlazados')
check('quoteAccess' in rootvue and '/api/auth/me' in rootvue and 'QuoteApp v-else' in rootvue, 'Formulario protegido por comprobación de sesión')
check('/api/auth/logout' in header and 'sessionUser' in header, 'Cabecera muestra estado de sesión y logout')
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
    check(all(x in d['custom']['quote'] for x in ('checkingSession','loginRequired','goToLogin','sessionExpired')) and 'logout' in d['custom']['header'], f'Traducciones integradas: {language}')
check(not (root/'.env').exists(), 'El proyecto entregable no contiene .env privado')
check('vue-i18n' in json.loads(read('frontend/package.json'))['dependencies'], 'Dependencias originales del rediseño conservadas')
check('embla-carousel' in json.loads(read('frontend/package.json'))['dependencies'], 'Carrusel de noticias incorporado con su dependencia')
check('node_modules/embla-carousel' in json.loads(read('frontend/package-lock.json'))['packages'], 'Lockfile actualizado para carrusel')
check("if(path==='/servicios') return 'services'" in rootvue and '<Services v-else-if' in rootvue, 'Nueva página Servicios registrada y conservada con autenticación')
check("url: '/servicios'" in header and '/api/auth/logout' in header, 'Menú actualizado sin perder logout')
check('EmblaCarousel' in read('frontend/src/pages/News.vue') and 'news-article-modal' in read('frontend/src/pages/News.vue'), 'Nueva página Noticias y modal disponible')
check((root/'frontend/src/pages/Services.vue').is_file(), 'Página Servicios incluida')
check('selectTransport' in read('frontend/src/pages/Itinerary.vue'), 'Mejoras de transporte incorporadas')
schema = read('backend/Database/AuthSchema.sql')
check('CREATE TABLE IF NOT EXISTS public.itinerarios' in schema and
      'ADD COLUMN IF NOT EXISTS closing DATE NULL' in schema,
      'Itinerarios provisionales con closing sin eliminar registros')
check('isGuest' in header and "localStorage.getItem('castrofallas-guest-mode')" in header and
      'isAuthenticated = computed(() => !!sessionUser.value)' in header,
      'Modo invitado nuevo no sustituye la sesión del backend')
check('button v-else type="button" class="nav-user-icon"' in header and
      'logout()' in header,
      'Icono de perfil de rediseño 8 con logout real')
check('localOutbox' not in login and 'news-editorial-hero__sidebar' in read('frontend/src/style.css'),
      'Estilos nuevos y login sin aviso incorrecto de LocalOutbox')
check('5500' in read('frontend/src/pages/News.vue'), 'Carrusel más rápido de frontend 8 conservado')
check('VITE_API_PROXY_TARGET' in read('frontend/vite.config.ts'), 'Proxy Docker conservado')
print('Comprobaciones estáticas de integración finalizadas.')
