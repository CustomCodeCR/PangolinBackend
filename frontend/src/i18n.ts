import { createI18n } from 'vue-i18n'
import es from './locales/es.json'
import en from './locales/en.json'

const savedLocale = localStorage.getItem('user-locale')
const initialLocale = savedLocale === 'en' ? 'en' : 'es'

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'es',
  messages: { es, en }
})

document.documentElement.lang = initialLocale

export default i18n
