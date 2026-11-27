import serviceGuides from '../seo/service-landings.json'
import servicePages from '../seo/service-pages.json'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const legacySource = resolve(dirname(fileURLToPath(import.meta.url)), '../src')
export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  ssr: true,
  devtools: { enabled: false },
  srcDir: 'app/',
  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      link: [{ rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon.png' }],
      meta: [{ name: 'msvalidate.01', content: '3B7ADBDA75E127B245F7E653F3021EE8' }]
    }
  },
  // Reutilizar exactamente las hojas de estilo del sitio actual.
  css: ['@legacy/style.css', '@legacy/styles/frontend6-refinements.css'],
  alias: { '@legacy': legacySource },
  vite: {
    resolve: { dedupe: ['vue', 'vue-i18n'] },
    server: { fs: { allow: [resolve(legacySource, '..')] } }
  },
  runtimeConfig: {
    cmsApiBase: process.env.NUXT_CMS_API_BASE || 'http://backend:5000',
    public: { siteUrl: process.env.NUXT_PUBLIC_SITE_URL || 'https://www.logisticacastrofallas.com' }
  },
  nitro: {
    prerender: {
      routes: ['/', '/nosotros', '/servicios', '/privacidad', '/terminos', '/cookies', '/licencias', ...Object.keys(serviceGuides), ...servicePages.map(page => '/servicios/' + page.slug)]
    }
  },
  routeRules: {
    // Safety net when a request reaches Nuxt without passing through the
    // production gateway, which already redirects /home to the canonical root.
    // Keep this alias out of the sitemap and preserve the current local host.
    '/home': { redirect: { to: '/', statusCode: 301 } },
    '/home/': { redirect: { to: '/', statusCode: 301 } },
    '/': { prerender: true },
    '/nosotros': { prerender: true },
    '/servicios': { prerender: true },
    '/servicios/**': { prerender: true },
    // Reduce temporary stale listings after publication without disabling cache.
    '/noticias': { swr: 120 },
    // Individual articles must not cache successful HTML; deleting a post must
    // never leave a cached HTTP 200 while the client shows "Noticia no disponible".
    '/noticias/**': { swr: false },
    // Las rutas privadas siguen en la SPA actual y no deben enviarse a este servicio.
    '/administracion/**': { ssr: false },
    '/cotizaciones/**': { ssr: false },
    '/tracking': { ssr: false },
    '/itinerario': { ssr: false }
  }
})
