import { createI18n } from 'vue-i18n'
import es from '@legacy/locales/es.json'
import en from '@legacy/locales/en.json'

// Se crea una instancia por aplicación/request; jamás se comparte locale de un
// visitante con otro en el renderizado del servidor.
export default defineNuxtPlugin(nuxtApp => {
  const i18n = createI18n({
    legacy: false,
    locale: 'es',
    fallbackLocale: 'es',
    messages: { es, en }
  })
  nuxtApp.vueApp.use(i18n)
  if (import.meta.client) {
    nuxtApp.hook('app:mounted', () => {
      const saved = localStorage.getItem('user-locale')
      if (saved === 'en') {
        i18n.global.locale.value = 'en'
        document.documentElement.lang = 'en'
      }
    })
  }
})
