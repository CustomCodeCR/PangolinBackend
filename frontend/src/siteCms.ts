import { reactive } from 'vue'

export interface SiteSlotDefinition { page: string; pageLabel: string; key: string; type: 'media' | 'text'; label: string; help: string; fallback: string }
export interface PublishedSiteSlot { key: string; textEs?: string | null; textEn?: string | null; mediaSrc?: string | null; mediaKind?: string | null }
export interface EditableSiteSlot { key: string; draftEs?: string | null; draftEn?: string | null; draftMediaId?: string | null; publishedEs?: string | null; publishedEn?: string | null; publishedMediaId?: string | null; updatedAt?: string; publishedAt?: string | null }

export const siteSlotCatalog: SiteSlotDefinition[] = [
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.media",
    "type": "media",
    "label": "Portada principal",
    "help": "Fondo de bienvenida, formato horizontal ancho",
    "fallback": "/images/hero.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.title1",
    "type": "text",
    "label": "Título principal, línea 1",
    "help": "Texto destacado de la portada",
    "fallback": "phrases.p000"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.title2",
    "type": "text",
    "label": "Título principal, línea 2",
    "help": "Segunda línea del título",
    "fallback": "phrases.p001"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.intro",
    "type": "text",
    "label": "Introducción de portada",
    "help": "Párrafo debajo del título",
    "fallback": "phrases.p002"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.heading1",
    "type": "text",
    "label": "Servicios, título 1",
    "help": "Encabezado de servicios",
    "fallback": "phrases.p009"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.heading2",
    "type": "text",
    "label": "Servicios, título 2",
    "help": "Segunda parte del encabezado",
    "fallback": "phrases.p010"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.intro",
    "type": "text",
    "label": "Introducción de servicios",
    "help": "Descripción del catálogo de transporte",
    "fallback": "phrases.p011"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.media",
    "type": "media",
    "label": "Servicio Aéreo",
    "help": "Foto del acordeón de servicios",
    "fallback": "/images/air-freight.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.title",
    "type": "text",
    "label": "Servicio Aéreo, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Air.title"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.detail",
    "type": "text",
    "label": "Servicio Aéreo, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Air.detail"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.air.media",
    "type": "media",
    "label": "Servicio Aéreo",
    "help": "Imagen del panel de servicio",
    "fallback": "/images/air-freight.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.media",
    "type": "media",
    "label": "Servicio Marítimo",
    "help": "Foto del acordeón de servicios",
    "fallback": "/images/ship.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.title",
    "type": "text",
    "label": "Servicio Marítimo, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Maritime.title"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.detail",
    "type": "text",
    "label": "Servicio Marítimo, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Maritime.detail"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.maritime.media",
    "type": "media",
    "label": "Servicio Marítimo",
    "help": "Imagen del panel de servicio",
    "fallback": "/images/ship.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.media",
    "type": "media",
    "label": "Servicio Terrestre",
    "help": "Foto del acordeón de servicios",
    "fallback": "/images/truck.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.title",
    "type": "text",
    "label": "Servicio Terrestre, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Land.title"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.detail",
    "type": "text",
    "label": "Servicio Terrestre, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Land.detail"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.land.media",
    "type": "media",
    "label": "Servicio Terrestre",
    "help": "Imagen del panel de servicio",
    "fallback": "/images/truck.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.media",
    "type": "media",
    "label": "Servicio Multimodal",
    "help": "Foto del acordeón de servicios",
    "fallback": "/images/cover-logistics.jpeg"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.title",
    "type": "text",
    "label": "Servicio Multimodal, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Multimodal.title"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.detail",
    "type": "text",
    "label": "Servicio Multimodal, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Multimodal.detail"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.multimodal.media",
    "type": "media",
    "label": "Servicio Multimodal",
    "help": "Imagen del panel de servicio",
    "fallback": "/images/cover-logistics.jpeg"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.about.media",
    "type": "media",
    "label": "Presentación de la empresa",
    "help": "Imagen de la sección Sobre nosotros",
    "fallback": "/images/about-operations-enhanced.jpg"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.about.intro",
    "type": "text",
    "label": "Sobre nosotros, descripción",
    "help": "Texto de introducción a la empresa",
    "fallback": "custom.about.introduction"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.tracking.media",
    "type": "media",
    "label": "Tarjeta de seguimiento",
    "help": "Fondo de la tarjeta de Tracking",
    "fallback": "/images/tracking-red.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.media",
    "type": "media",
    "label": "Tarjeta de cotizaciones",
    "help": "Fondo de cotizar en línea",
    "fallback": "/images/services-crane.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.heading1",
    "type": "text",
    "label": "Cotización, encabezado 1",
    "help": "Llamada a la acción",
    "fallback": "phrases.p036"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.heading2",
    "type": "text",
    "label": "Cotización, encabezado 2",
    "help": "Llamada a la acción, segunda línea",
    "fallback": "phrases.p037"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading1",
    "type": "text",
    "label": "Soluciones digitales, título 1",
    "help": "Primera parte del encabezado",
    "fallback": "phrases.p027"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading2",
    "type": "text",
    "label": "Soluciones digitales, título 2",
    "help": "Segunda parte del encabezado",
    "fallback": "phrases.p028"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading3",
    "type": "text",
    "label": "Soluciones digitales, título 3",
    "help": "Parte final destacada",
    "fallback": "phrases.p029"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.intro",
    "type": "text",
    "label": "Soluciones digitales, introducción",
    "help": "Descripción de las herramientas digitales",
    "fallback": "phrases.p063"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.media",
    "type": "media",
    "label": "Preguntas frecuentes, fondo",
    "help": "Imagen de fondo de FAQ",
    "fallback": "/images/operation.webp"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.heading1",
    "type": "text",
    "label": "Preguntas frecuentes, título 1",
    "help": "Primera parte del título",
    "fallback": "phrases.p032"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.heading2",
    "type": "text",
    "label": "Preguntas frecuentes, título 2",
    "help": "Segunda parte del título",
    "fallback": "phrases.p033"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.hero.media",
    "type": "media",
    "label": "Portada de Sobre nosotros",
    "help": "Fondo de la portada interior",
    "fallback": "/images/hero.webp"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.hero.title",
    "type": "text",
    "label": "Título de la portada",
    "help": "Encabezado Sobre nosotros",
    "fallback": "custom.about.title"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.operations.media",
    "type": "media",
    "label": "Fotografía de operaciones",
    "help": "Imagen junto a la introducción",
    "fallback": "/images/about-operations-enhanced.jpg"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.intro",
    "type": "text",
    "label": "Nuestra historia",
    "help": "Texto junto a la foto de operaciones",
    "fallback": "custom.about.introduction"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.heading",
    "type": "text",
    "label": "Nuestros valores, título",
    "help": "Encabezado de la sección de valores",
    "fallback": "custom.about.valuesTitle"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.media",
    "type": "media",
    "label": "Portada de servicios",
    "help": "Fondo principal de la página Servicios",
    "fallback": "/images/hero.webp"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.heading1",
    "type": "text",
    "label": "Portada de Servicios, título 1",
    "help": "Primera línea de portada",
    "fallback": "phrases.p009"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.heading2",
    "type": "text",
    "label": "Portada de Servicios, título 2",
    "help": "Segunda línea de portada",
    "fallback": "phrases.p010"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.intro",
    "type": "text",
    "label": "Portada de Servicios, descripción",
    "help": "Párrafo bajo el título",
    "fallback": "phrases.p011"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.heading1",
    "type": "text",
    "label": "Complementarios, título 1",
    "help": "Primer título",
    "fallback": "phrases.p049"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.heading2",
    "type": "text",
    "label": "Complementarios, título 2",
    "help": "Segundo título",
    "fallback": "phrases.p050"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.intro",
    "type": "text",
    "label": "Complementarios, introducción",
    "help": "Descripción de los servicios extra",
    "fallback": "phrases.p051"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.media",
    "type": "media",
    "label": "Servicio complementario, aduanas",
    "help": "Foto de servicios de aduanas",
    "fallback": "/images/services-crane.webp"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.title",
    "type": "text",
    "label": "Servicio aduanal, título",
    "help": "Título de la primera tarjeta",
    "fallback": "phrases.p053"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.intro",
    "type": "text",
    "label": "Servicio aduanal, descripción",
    "help": "Texto de la primera tarjeta",
    "fallback": "phrases.p054"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.media",
    "type": "media",
    "label": "Servicio complementario, almacén",
    "help": "Foto de almacén",
    "fallback": "/images/warehouse-person.webp"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.title",
    "type": "text",
    "label": "Servicio almacén, título",
    "help": "Título de la segunda tarjeta",
    "fallback": "phrases.p057"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.intro",
    "type": "text",
    "label": "Servicio almacén, descripción",
    "help": "Texto de la segunda tarjeta",
    "fallback": "phrases.p058"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.tracking.media",
    "type": "media",
    "label": "Seguimiento digital",
    "help": "Imagen del acceso a tracking",
    "fallback": "/images/tracking-red.webp"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.quote.media",
    "type": "media",
    "label": "Cotización digital",
    "help": "Imagen del acceso a cotizaciones",
    "fallback": "/images/services-crane.webp"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.media",
    "type": "media",
    "label": "Imagen del login",
    "help": "Fondo de la pantalla de acceso",
    "fallback": "/images/hero.webp"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title1",
    "type": "text",
    "label": "Login, título línea 1",
    "help": "Titular a la izquierda",
    "fallback": "custom.login.visualTitle1"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title2",
    "type": "text",
    "label": "Login, título línea 2",
    "help": "Titular a la izquierda",
    "fallback": "custom.login.visualTitle2"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title3",
    "type": "text",
    "label": "Login, título línea 3",
    "help": "Última línea destacada",
    "fallback": "custom.login.visualTitle3"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.intro",
    "type": "text",
    "label": "Login, introducción",
    "help": "Descripción de la plataforma",
    "fallback": "custom.login.visualIntro"
  },
  {
    "page": "shared",
    "pageLabel": "Identidad",
    "key": "shared.logo.media",
    "type": "media",
    "label": "Logo de la empresa",
    "help": "Aparece en header y footer. Cambiar con precaución.",
    "fallback": "/images/logo.png"
  }
]

const published = reactive<Record<string, PublishedSiteSlot>>({})
let pending: Promise<void> | null = null
export function loadPublishedSiteCms(): Promise<void> {
  if (pending) return pending
  pending = fetch('/api/content/site', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('No se pudo cargar el contenido del sitio')
    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('Respuesta CMS inválida')
    for (const key of Object.keys(published)) delete published[key]
    for (const item of data as PublishedSiteSlot[]) if (typeof item.key === 'string') published[item.key] = item
  }).catch(() => { /* Fallback a imágenes/textos originales del frontend. */ })
  return pending
}
export function siteText(key: string, fallback: string, locale: string): string {
  const entry = published[key]
  const value = locale === 'en' ? entry?.textEn : entry?.textEs
  return value?.trim() || fallback
}
export function siteVisual(key: string, fallback: string): {src: string; kind: string} {
  const entry = published[key]
  return {src: entry?.mediaSrc || fallback, kind: entry?.mediaKind || 'Imagen'}
}
export function siteCssImage(key: string, fallback: string): string {
  const visual = siteVisual(key, fallback)
  return visual.kind.startsWith('Video') ? 'none' : `url(${JSON.stringify(visual.src)})`
}
