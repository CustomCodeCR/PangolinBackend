import serviceGuides from '../seo/service-landings.json'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const legacySource = resolve(dirname(fileURLToPath(import.meta.url)), '../src')
export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  ssr: true,
  devtools: { enabled: false },
  app: {
    head: {
      link: [{ rel: 'icon', type: 'image/png', sizes: '192x192', href: '/favicon.png' }]
    }
  },
  srcDir: 'app/',
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
      routes: ['/', '/nosotros', '/servicios', ...Object.keys(serviceGuides)]
    }
  },
  routeRules: {
    '/': { prerender: true },
    '/nosotros': { prerender: true },
    '/servicios': { prerender: true },
    '/servicios/**': { prerender: true },
    '/noticias': { swr: 300 },
    '/noticias/**': { swr: 300 },
    // Las rutas privadas siguen en la SPA actual y no deben enviarse a este servicio.
    '/administracion/**': { ssr: false },
    '/cotizaciones/**': { ssr: false },
    '/tracking': { ssr: false },
    '/itinerario': { ssr: false }
  }
})
