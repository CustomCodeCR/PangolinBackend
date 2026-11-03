import serviceGuides from '../seo/service-landings.json'
export default defineNuxtConfig({
  compatibilityDate: '2026-07-01',
  ssr: true,
  devtools: { enabled: false },
  srcDir: 'app/',
  css: ['~/assets/main.css'],
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
