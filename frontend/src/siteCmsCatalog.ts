import type { SiteSlotDefinition } from './siteCms'
import serviceGuides from '../seo/service-landings.json'
import servicePages from '../seo/service-pages.json'
import serviceFaqs from '../seo/service-faqs.json'
import { extraBenefitsByRoute } from './lib/serviceExtraBenefits'

export const siteSlotCatalog: SiteSlotDefinition[] = [
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.intro",
    "type": "text",
    "label": "Nuestra historia, párrafo",
    "help": "Texto introductorio junto a la foto de operaciones, dentro de /nosotros.",
    "fallback": "custom.about.introduction",
    "section": "Nuestra historia"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.operations.media",
    "type": "media",
    "label": "Fotografía de operaciones",
    "help": "Foto junto a la introducción de la empresa, bajo la portada de /nosotros.",
    "fallback": "/images/about-operations-enhanced.jpg",
    "section": "Nuestra historia"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.hero.media",
    "type": "media",
    "label": "Portada de Sobre nosotros",
    "help": "Portada panorámica real de /nosotros, que utiliza la fotografía de operaciones. Puede ser distinta de la foto en el bloque inferior.",
    "fallback": "/images/about-operations-enhanced.jpg",
    "section": "Portada"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.hero.title",
    "type": "text",
    "label": "Título de la portada",
    "help": "Encabezado Sobre nosotros",
    "fallback": "custom.about.title",
    "section": "Portada"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.0",
    "type": "text",
    "label": "Tarjeta de valor 1",
    "help": "Sobre nosotros → Valores corporativos → tarjeta 1.",
    "fallback": "custom.about.values.0",
    "section": "Valores corporativos"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.1",
    "type": "text",
    "label": "Tarjeta de valor 2",
    "help": "Sobre nosotros → Valores corporativos → tarjeta 2.",
    "fallback": "custom.about.values.1",
    "section": "Valores corporativos"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.2",
    "type": "text",
    "label": "Tarjeta de valor 3",
    "help": "Sobre nosotros → Valores corporativos → tarjeta 3.",
    "fallback": "custom.about.values.2",
    "section": "Valores corporativos"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.3",
    "type": "text",
    "label": "Tarjeta de valor 4",
    "help": "Sobre nosotros → Valores corporativos → tarjeta 4.",
    "fallback": "custom.about.values.3",
    "section": "Valores corporativos"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.4",
    "type": "text",
    "label": "Tarjeta de valor 5",
    "help": "Sobre nosotros → Valores corporativos → tarjeta 5.",
    "fallback": "custom.about.values.4",
    "section": "Valores corporativos"
  },
  {
    "page": "about",
    "pageLabel": "Sobre nosotros",
    "key": "about.values.heading",
    "type": "text",
    "label": "Nuestros valores, título",
    "help": "Encabezado de la sección de valores",
    "fallback": "custom.about.valuesTitle",
    "section": "Valores corporativos"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.intro",
    "type": "text",
    "label": "Accesos digitales, explicación",
    "help": "Texto bajo «Gestionar tu carga fácilmente», encima de las tarjetas Seguimiento y Cotizaciones. No pertenece a las tarjetas de experiencia.",
    "fallback": "phrases.p063",
    "section": "Accesos digitales"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.media",
    "type": "media",
    "label": "Tarjeta de cotizaciones",
    "help": "Fondo de la tarjeta «Solicitar cotización» en Servicios digitales de Inicio.",
    "fallback": "/images/services-crane.webp",
    "section": "Accesos digitales"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.tracking.media",
    "type": "media",
    "label": "Tarjeta de seguimiento",
    "help": "Fondo de la tarjeta «Seguimiento» en la sección Servicios digitales de Inicio.",
    "fallback": "/images/tracking-red.webp",
    "section": "Accesos digitales"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading1",
    "type": "text",
    "label": "Título de experiencia, línea 1",
    "help": "Primera línea del encabezado «Experiencia para mover tu negocio». Está encima de las tarjetas de beneficios.",
    "fallback": "phrases.p027",
    "section": "Encabezado de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading2",
    "type": "text",
    "label": "Título de experiencia, línea 2",
    "help": "Segunda línea del encabezado «Experiencia para mover tu negocio».",
    "fallback": "phrases.p028",
    "section": "Encabezado de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.heading3",
    "type": "text",
    "label": "Título de experiencia, palabra final",
    "help": "Palabra destacada al final del título «Experiencia para mover tu negocio».",
    "fallback": "phrases.p029",
    "section": "Encabezado de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.heading1",
    "type": "text",
    "label": "Cotización, encabezado 1",
    "help": "Llamada a la acción",
    "fallback": "phrases.p036",
    "section": "Llamado a cotizar"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.quote.heading2",
    "type": "text",
    "label": "Cotización, encabezado 2",
    "help": "Llamada a la acción, segunda línea",
    "fallback": "phrases.p037",
    "section": "Llamado a cotizar"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.intro",
    "type": "text",
    "label": "Introducción de portada",
    "help": "Párrafo debajo del título",
    "fallback": "phrases.p002",
    "section": "Portada principal"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.media",
    "type": "media",
    "label": "Portada principal",
    "help": "Imagen o video detrás del título de bienvenida, arriba de Inicio. No cambia otras portadas.",
    "fallback": "/images/hero.webp",
    "section": "Portada principal"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.title1",
    "type": "text",
    "label": "Título principal, línea 1",
    "help": "Texto destacado de la portada",
    "fallback": "phrases.p000",
    "section": "Portada principal"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.hero.title2",
    "type": "text",
    "label": "Título principal, línea 2",
    "help": "Segunda línea del título",
    "fallback": "phrases.p001",
    "section": "Portada principal"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.0.a",
    "type": "text",
    "label": "Respuesta: ¿Qué servicios ofrece Grupo Castro Fallas?",
    "help": "Inicio → Preguntas frecuentes → elemento 1.",
    "fallback": "content.faqs.0.a",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.0.q",
    "type": "text",
    "label": "Pregunta: ¿Qué servicios ofrece Grupo Castro Fallas?",
    "help": "Inicio → Preguntas frecuentes → elemento 1.",
    "fallback": "content.faqs.0.q",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.1.a",
    "type": "text",
    "label": "Respuesta: ¿Cómo solicitar una cotización?",
    "help": "Inicio → Preguntas frecuentes → elemento 2.",
    "fallback": "content.faqs.1.a",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.1.q",
    "type": "text",
    "label": "Pregunta: ¿Cómo solicitar una cotización?",
    "help": "Inicio → Preguntas frecuentes → elemento 2.",
    "fallback": "content.faqs.1.q",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.2.a",
    "type": "text",
    "label": "Respuesta: ¿Cómo rastrear mi carga?",
    "help": "Inicio → Preguntas frecuentes → elemento 3.",
    "fallback": "content.faqs.2.a",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.2.q",
    "type": "text",
    "label": "Pregunta: ¿Cómo rastrear mi carga?",
    "help": "Inicio → Preguntas frecuentes → elemento 3.",
    "fallback": "content.faqs.2.q",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.3.a",
    "type": "text",
    "label": "Respuesta: ¿Manejan FCL y LCL?",
    "help": "Inicio → Preguntas frecuentes → elemento 4.",
    "fallback": "content.faqs.3.a",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.3.q",
    "type": "text",
    "label": "Pregunta: ¿Manejan FCL y LCL?",
    "help": "Inicio → Preguntas frecuentes → elemento 4.",
    "fallback": "content.faqs.3.q",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.heading1",
    "type": "text",
    "label": "Preguntas frecuentes, etiqueta superior",
    "help": "Texto pequeño sobre el título grande de preguntas frecuentes.",
    "fallback": "phrases.p032",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.heading2",
    "type": "text",
    "label": "Preguntas frecuentes, primera línea",
    "help": "Primera línea del título grande «Información útil para tu operación».",
    "fallback": "phrases.p033",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.faq.heading3",
    "type": "text",
    "label": "Preguntas frecuentes, segunda línea",
    "help": "Segunda línea del título grande «Información útil para tu operación».",
    "fallback": "phrases.p034",
    "section": "Preguntas frecuentes"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.about.intro",
    "type": "text",
    "label": "Presentación, párrafo",
    "help": "Párrafo de la sección Sobre nosotros en Inicio, junto a la fotografía.",
    "fallback": "custom.about.introduction",
    "section": "Presentación de la empresa"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.about.media",
    "type": "media",
    "label": "Presentación de la empresa",
    "help": "Fotografía grande junto al bloque «Sobre nosotros» en Inicio.",
    "fallback": "/images/about-operations-enhanced.jpg",
    "section": "Presentación de la empresa"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.detail",
    "type": "text",
    "label": "Servicio Aéreo, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Air.detail",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.media",
    "type": "media",
    "label": "Servicio Aéreo",
    "help": "Imagen de la tarjeta desplegable Aéreo y su ventana de detalles en Inicio.",
    "fallback": "/images/air-freight.webp",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.air.title",
    "type": "text",
    "label": "Servicio Aéreo, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Air.title",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.heading1",
    "type": "text",
    "label": "Servicios, título 1",
    "help": "Encabezado de servicios",
    "fallback": "phrases.p009",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.heading2",
    "type": "text",
    "label": "Servicios, título 2",
    "help": "Segunda parte del encabezado",
    "fallback": "phrases.p010",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.intro",
    "type": "text",
    "label": "Introducción de servicios",
    "help": "Descripción del catálogo de transporte",
    "fallback": "phrases.p011",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.detail",
    "type": "text",
    "label": "Servicio Terrestre, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Land.detail",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.media",
    "type": "media",
    "label": "Servicio Terrestre",
    "help": "Imagen de la tarjeta desplegable Terrestre y su ventana de detalles en Inicio.",
    "fallback": "/images/truck.webp",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.land.title",
    "type": "text",
    "label": "Servicio Terrestre, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Land.title",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.detail",
    "type": "text",
    "label": "Servicio Marítimo, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Maritime.detail",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.media",
    "type": "media",
    "label": "Servicio Marítimo",
    "help": "Imagen de la tarjeta desplegable Marítimo y su ventana de detalles en Inicio.",
    "fallback": "/images/ship.webp",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.maritime.title",
    "type": "text",
    "label": "Servicio Marítimo, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Maritime.title",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.detail",
    "type": "text",
    "label": "Servicio Multimodal, descripción",
    "help": "Texto de detalle del servicio",
    "fallback": "content.services.Multimodal.detail",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.media",
    "type": "media",
    "label": "Servicio Multimodal",
    "help": "Imagen de la tarjeta desplegable Multimodal y su ventana de detalles en Inicio.",
    "fallback": "/images/cover-logistics.jpeg",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.services.multimodal.title",
    "type": "text",
    "label": "Servicio Multimodal, título",
    "help": "Título dentro de la tarjeta",
    "fallback": "content.services.Multimodal.title",
    "section": "Servicios de transporte"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.0.subtitle",
    "type": "text",
    "label": "Tarjeta «Logística + Aduanas», descripción",
    "help": "Inicio → Experiencia → tarjeta 1, Logística + Aduanas. No tiene fotografía de fondo.",
    "fallback": "content.promises.0.subtitle",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.0.title",
    "type": "text",
    "label": "Tarjeta «Logística + Aduanas», título",
    "help": "Inicio → Experiencia → tarjeta 1, Logística + Aduanas. No tiene fotografía de fondo.",
    "fallback": "content.promises.0.title",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.1.subtitle",
    "type": "text",
    "label": "Tarjeta «Conexiones internacionales», descripción",
    "help": "Inicio → Experiencia → tarjeta 2, Conexiones internacionales. No tiene fotografía de fondo.",
    "fallback": "content.promises.1.subtitle",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.1.title",
    "type": "text",
    "label": "Tarjeta «Conexiones internacionales», título",
    "help": "Inicio → Experiencia → tarjeta 2, Conexiones internacionales. No tiene fotografía de fondo.",
    "fallback": "content.promises.1.title",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.2.subtitle",
    "type": "text",
    "label": "Tarjeta «Atención cercana», descripción",
    "help": "Inicio → Experiencia → tarjeta 3, Atención cercana. No tiene fotografía de fondo.",
    "fallback": "content.promises.2.subtitle",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "home",
    "pageLabel": "Inicio",
    "key": "home.digital.card.2.title",
    "type": "text",
    "label": "Tarjeta «Atención cercana», título",
    "help": "Inicio → Experiencia → tarjeta 3, Atención cercana. No tiene fotografía de fondo.",
    "fallback": "content.promises.2.title",
    "section": "Tarjetas de experiencia"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.intro",
    "type": "text",
    "label": "Login, introducción",
    "help": "Descripción de la plataforma",
    "fallback": "custom.login.visualIntro",
    "section": "Pantalla de acceso"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.media",
    "type": "media",
    "label": "Imagen del login",
    "help": "Fondo de la columna izquierda del acceso en /bienvenidos.",
    "fallback": "/images/hero.webp",
    "section": "Pantalla de acceso"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title1",
    "type": "text",
    "label": "Login, título línea 1",
    "help": "Titular a la izquierda",
    "fallback": "custom.login.visualTitle1",
    "section": "Pantalla de acceso"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title2",
    "type": "text",
    "label": "Login, título línea 2",
    "help": "Titular a la izquierda",
    "fallback": "custom.login.visualTitle2",
    "section": "Pantalla de acceso"
  },
  {
    "page": "login",
    "pageLabel": "Acceso",
    "key": "login.hero.title3",
    "type": "text",
    "label": "Login, título línea 3",
    "help": "Última línea destacada",
    "fallback": "custom.login.visualTitle3",
    "section": "Pantalla de acceso"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.quote.media",
    "type": "media",
    "label": "Cotización digital",
    "help": "Fondo de la tarjeta Cotizaciones digitales al final de /servicios.",
    "fallback": "/images/services-crane.webp",
    "section": "Accesos digitales"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.tracking.media",
    "type": "media",
    "label": "Seguimiento digital",
    "help": "Fondo de la tarjeta Seguimiento digital al final de /servicios.",
    "fallback": "/images/tracking-red.webp",
    "section": "Accesos digitales"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.catalog.heading1",
    "type": "text",
    "label": "Título de catálogo, primera parte",
    "help": "Sección bajo la portada, antes de las cuatro pestañas aéreo, terrestre, marítimo y multimodal.",
    "fallback": "phrases.p009",
    "section": "Catálogo de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.catalog.heading2",
    "type": "text",
    "label": "Título de catálogo, parte destacada",
    "help": "Sección bajo la portada, antes de las cuatro pestañas aéreo, terrestre, marítimo y multimodal.",
    "fallback": "phrases.p010",
    "section": "Catálogo de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.catalog.intro",
    "type": "text",
    "label": "Descripción del catálogo de servicios",
    "help": "Sección bajo la portada, antes de las cuatro pestañas aéreo, terrestre, marítimo y multimodal.",
    "fallback": "phrases.p011",
    "section": "Catálogo de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.air.detail",
    "type": "text",
    "label": "Transporte aéreo: descripción",
    "help": "Servicios → Catálogo de transporte → pestaña aéreo.",
    "fallback": "content.services.Air.detail",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.air.media",
    "type": "media",
    "label": "Transporte aéreo: imagen/video",
    "help": "Servicios → Catálogo de transporte → pestaña aéreo y ventana de detalles.",
    "fallback": "/images/air-freight.webp",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.air.title",
    "type": "text",
    "label": "Transporte aéreo: título",
    "help": "Servicios → Catálogo de transporte → pestaña aéreo.",
    "fallback": "content.services.Air.title",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.land.detail",
    "type": "text",
    "label": "Transporte terrestre: descripción",
    "help": "Servicios → Catálogo de transporte → pestaña terrestre.",
    "fallback": "content.services.Land.detail",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.land.media",
    "type": "media",
    "label": "Transporte terrestre: imagen/video",
    "help": "Servicios → Catálogo de transporte → pestaña terrestre y ventana de detalles.",
    "fallback": "/images/truck.webp",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.land.title",
    "type": "text",
    "label": "Transporte terrestre: título",
    "help": "Servicios → Catálogo de transporte → pestaña terrestre.",
    "fallback": "content.services.Land.title",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.maritime.detail",
    "type": "text",
    "label": "Transporte marítimo: descripción",
    "help": "Servicios → Catálogo de transporte → pestaña marítimo.",
    "fallback": "content.services.Maritime.detail",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.maritime.media",
    "type": "media",
    "label": "Transporte marítimo: imagen/video",
    "help": "Servicios → Catálogo de transporte → pestaña marítimo y ventana de detalles.",
    "fallback": "/images/ship.webp",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.maritime.title",
    "type": "text",
    "label": "Transporte marítimo: título",
    "help": "Servicios → Catálogo de transporte → pestaña marítimo.",
    "fallback": "content.services.Maritime.title",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.multimodal.detail",
    "type": "text",
    "label": "Transporte multimodal: descripción",
    "help": "Servicios → Catálogo de transporte → pestaña multimodal.",
    "fallback": "content.services.Multimodal.detail",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.multimodal.media",
    "type": "media",
    "label": "Transporte multimodal: imagen/video",
    "help": "Servicios → Catálogo de transporte → pestaña multimodal y ventana de detalles.",
    "fallback": "/images/cover-logistics.jpeg",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.multimodal.title",
    "type": "text",
    "label": "Transporte multimodal: título",
    "help": "Servicios → Catálogo de transporte → pestaña multimodal.",
    "fallback": "content.services.Multimodal.title",
    "section": "Pestañas de transporte"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.heading1",
    "type": "text",
    "label": "Portada de Servicios, título 1",
    "help": "Primera línea del título grande de la portada de /servicios.",
    "fallback": "phrases.p009",
    "section": "Portada"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.heading2",
    "type": "text",
    "label": "Portada de Servicios, título 2",
    "help": "Segunda parte del título grande de la portada de /servicios.",
    "fallback": "phrases.p010",
    "section": "Portada"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.intro",
    "type": "text",
    "label": "Portada de Servicios, párrafo",
    "help": "Texto breve bajo el título principal de la portada de /servicios.",
    "fallback": "phrases.p011",
    "section": "Portada"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.hero.media",
    "type": "media",
    "label": "Portada de servicios",
    "help": "Imagen panorámica de la portada de /servicios, detrás del título.",
    "fallback": "/images/services-crane.webp",
    "section": "Portada"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.intro",
    "type": "text",
    "label": "Servicio aduanal, descripción",
    "help": "Texto de la primera tarjeta",
    "fallback": "phrases.p054",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.media",
    "type": "media",
    "label": "Servicio complementario, aduanas",
    "help": "Fotografía de la primera tarjeta de Servicios complementarios en /servicios.",
    "fallback": "/images/services-crane.webp",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.customs.title",
    "type": "text",
    "label": "Servicio aduanal, título",
    "help": "Título de la primera tarjeta",
    "fallback": "phrases.p053",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.heading1",
    "type": "text",
    "label": "Complementarios, título 1",
    "help": "Primer título",
    "fallback": "phrases.p049",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.heading2",
    "type": "text",
    "label": "Complementarios, título 2",
    "help": "Segundo título",
    "fallback": "phrases.p050",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.intro",
    "type": "text",
    "label": "Complementarios, introducción",
    "help": "Descripción de los servicios extra",
    "fallback": "phrases.p051",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.intro",
    "type": "text",
    "label": "Servicio almacén, descripción",
    "help": "Texto de la segunda tarjeta",
    "fallback": "phrases.p058",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.media",
    "type": "media",
    "label": "Servicio complementario, almacén",
    "help": "Fotografía de la segunda tarjeta, almacén/operaciones, en /servicios.",
    "fallback": "/images/warehouse-person.webp",
    "section": "Servicios complementarios"
  },
  {
    "page": "services",
    "pageLabel": "Servicios",
    "key": "services.complementary.warehouse.title",
    "type": "text",
    "label": "Servicio almacén, título",
    "help": "Título de la segunda tarjeta",
    "fallback": "phrases.p057",
    "section": "Servicios complementarios"
  },
  {
    "page": "shared",
    "pageLabel": "Identidad",
    "key": "shared.logo.media",
    "type": "media",
    "label": "Logo de la empresa",
    "help": "Logo corporativo compartido por la cabecera, el pie de página y el acceso. Cambia en los tres lugares.",
    "fallback": "/images/logo.png",
    "section": "Identidad de marca"
  }
]


// Catálogo sincronizado con el sitio actual. Ocultar una ubicación obsoleta
// no elimina sus registros históricos ni archivos almacenados en el CMS.
const retiredKeys = new Set(['home.digital.card.0.title','home.digital.card.0.subtitle',
  'home.digital.card.1.title','home.digital.card.1.subtitle',
  'home.digital.card.2.title','home.digital.card.2.subtitle'])
for (let i=siteSlotCatalog.length-1;i>=0;i--)
  if (retiredKeys.has(siteSlotCatalog[i].key)) siteSlotCatalog.splice(i,1)

const additional: SiteSlotDefinition[]=[]
const addText=(page:string,pageLabel:string,key:string,section:string,label:string,es:string,en:string) =>
  additional.push({page,pageLabel,key,section,label,type:'text',fallback:es,originalEs:es,originalEn:en,
    help:'Texto visible en esta sección. Se edita por idioma.'})
const addTranslation=(page:string,pageLabel:string,key:string,section:string,label:string,fallback:string) =>
  additional.push({page,pageLabel,key,section,label,type:'text',fallback,
    help:'Texto visible de esta sección. Idiomas español e inglés.'})
const addMedia=(page:string,pageLabel:string,key:string,section:string,label:string,fallback:string,fallbackKind:'Imagen'|'Video'='Imagen') =>
  additional.push({page,pageLabel,key,section,label,type:'media',fallback,fallbackKind,
    help:'Imagen o video de esta ubicación. Cambiarlo no modifica los otros espacios.'})

// Nueva sección de Nosotros: portada, misión, visión, valores, galería y capacidades.
const aboutFields: Array<[string,string,string,string,string]> = [
  ['who','Presentación','Antetítulo','QUIÉNES SOMOS','WHO WE ARE'],
  ['heading','Presentación','Título','Castro Fallas Logística Internacional','Castro Fallas International Logistics'],
  ['historyAction','Presentación','Botón de historia','Conocer nuestra historia','Discover our history'],
  ['imageLabel','Presentación','Etiqueta de foto','OPERACIONES EN COSTA RICA','OPERATIONS IN COSTA RICA'],
  ['missionTag','Misión y visión','Antetítulo de misión','NUESTRO PROPÓSITO','OUR PURPOSE'],
  ['mission','Misión y visión','Título de misión','Misión','Mission'],
  ['missionBody','Misión y visión','Texto de misión','Brindar soluciones logísticas integrales, seguras y eficientes, que faciliten el comercio nacional e internacional de nuestros clientes, con un servicio de alto valor y confianza.','To offer integrated, safe and efficient logistics solutions that support our clients’ domestic and international trade, with valuable and trustworthy service.'],
  ['visionTag','Misión y visión','Antetítulo de visión','HACIA DÓNDE VAMOS','OUR DIRECTION'],
  ['vision','Misión y visión','Título de visión','Visión','Vision'],
  ['visionBody','Misión y visión','Texto de visión','Ser la empresa líder en soluciones logísticas en la región, reconocida por nuestra experiencia, confiabilidad, innovación y compromiso con la excelencia en el servicio.','To become a leading logistics solutions provider in the region, recognized for experience, reliability, innovation and commitment to excellent service.'],
  ['culture','Valores','Antetítulo','NUESTRA CULTURA','OUR CULTURE'],
  ['servicesTag','Capacidades','Antetítulo','LO QUE HACEMOS','WHAT WE DO'],
  ['capabilitiesTitle','Capacidades','Título','Nuestras capacidades','Our capabilities'],
  ['serviceAction','Capacidades','Botón ver servicios','Conocer servicios','Explore our services'],
  ['quoteAction','Capacidades','Botón de cotización','Solicitar cotización','Request a quote']
]
aboutFields.forEach(([field,section,label,es,en])=>addText('about','Sobre nosotros','about.copy.'+field,section,label,es,en))
const valueDetails: Array<[string,string]> = [
  ['Asumimos nuestros compromisos con responsabilidad y orientación a resultados.','We take ownership of every commitment and work toward dependable results.'],
  ['Actuamos con transparencia y respeto en cada relación comercial.','We act transparently and responsibly in every business relationship.'],
  ['Sumamos conocimientos y capacidades para atender mejor cada operación.','Different perspectives and skills come together to serve our customers.'],
  ['Nuestra trayectoria nos ayuda a anticipar desafíos y acompañar cada proceso.','Our experience helps us anticipate challenges and guide each operation.'],
  ['Buscamos procesos confiables y la mejora continua de nuestros servicios.','We pursue reliable processes and continuous improvement in our services.']
]
valueDetails.forEach(([es,en],i)=>addText('about','Sobre nosotros','about.valueDetails.'+i,'Valores','Valor '+(i+1)+': descripción',es,en))
const capabilityTitles: Array<[string,string]> = [
  ['Logística','Logistics'],['Aduanas','Customs'],['Transporte internacional','International transport'],['Importación','Imports'],['Exportación','Exports']
]
const capabilityBodies: Array<[string,string]> = [
  ['Soluciones coordinadas para la cadena de suministro.','Coordinated solutions across the supply chain.'],
  ['Apoyo en trámites y documentación aduanera.','Support with customs procedures and documentation.'],
  ['Transporte de carga en rutas nacionales e internacionales.','Cargo transportation across national and international routes.'],
  ['Coordinación de operaciones de ingreso de mercancías.','Coordination of incoming cargo operations.'],
  ['Acompañamiento para enviar tu carga a otros mercados.','Support for exporting and moving cargo to other markets.']
]
capabilityTitles.forEach(([es,en],i)=>{
  addText('about','Sobre nosotros','about.capability.'+i+'.title','Capacidades','Capacidad '+(i+1)+': título',es,en)
  addText('about','Sobre nosotros','about.capability.'+i+'.detail','Capacidades','Capacidad '+(i+1)+': texto',capabilityBodies[i][0],capabilityBodies[i][1])
})
;['/images/services-warehouse.webp','/images/truck.webp','/images/warehouse-person.webp'].forEach((src,i)=>
  addMedia('about','Sobre nosotros','about.gallery.'+i+'.media','Galería','Foto '+(i+1),src))

// Inicio: nuevos títulos de rastreo, indicadores, noticias y accesos.
const homeExtra: Array<[string,string,string,string]> = [
  ['home.tracking.heading1','Rastreo','Título 1','phrases.p021'],
  ['home.tracking.heading2','Rastreo','Título 2','phrases.p022'],
  ['home.tracking.intro','Rastreo','Descripción','phrases.p023'],
  ['home.access.heading1','Accesos digitales','Título 1','phrases.p061'],
  ['home.access.heading2','Accesos digitales','Título 2','phrases.p062'],
  ['home.access.tracking','Accesos digitales','Tarjeta rastreo','custom.home.trackingTitle'],
  ['home.access.quote','Accesos digitales','Tarjeta cotización','custom.home.quoteCardTitle'],
  ['home.news.heading','Noticias','Encabezado','custom.home.newsHeader']
]
homeExtra.forEach(([key,section,label,fallback])=>addTranslation('home','Inicio',key,section,label,fallback))
for(let i=0;i<4;i++)addTranslation('home','Inicio','home.stats.'+i+'.label','Indicadores','Indicador '+(i+1),'custom.home.stats.'+i)

// Servicios: contenido de FAQ, accesos y nuevo directorio de rutas.
const servicesExtra: Array<[string,string,string,string,string]> = [
 ['services.faq.heading','Preguntas frecuentes','Título','Más sobre nuestros servicios','More about our services'],
 ['services.directory.heading','Directorio','Título','Conocé cada solución en detalle','Explore each service in detail'],
 ['services.directory.intro','Directorio','Descripción','Todo lo que tu carga necesita, desde el primer movimiento hasta su destino.','Everything your cargo needs, from its first move to its destination.'],
 ['services.directory.transport.title','Directorio','Grupo transporte','Transporte de carga','Freight transportation'],
 ['services.directory.logistics.title','Directorio','Grupo logística','Logística y aduanas','Logistics and customs']
]
servicesExtra.forEach(([key,section,label,es,en])=>addText('services','Servicios',key,section,label,es,en))
;([
 ['services.access.heading1','Título digital 1','phrases.p061'],
 ['services.access.heading2','Título digital 2','phrases.p062'],
 ['services.access.intro','Descripción digital','phrases.p063'],
 ['services.access.tracking','Tarjeta rastreo','custom.home.trackingTitle'],
 ['services.access.quote','Tarjeta cotización','custom.home.quoteCardTitle']
] as Array<[string,string,string]>).forEach(([key,label,fallback])=>addTranslation('services','Servicios',key,'Accesos digitales',label,fallback))
serviceFaqs.servicios.forEach((item,i)=>{
  addText('services','Servicios','services.faq.'+i+'.q','Preguntas frecuentes','Pregunta '+(i+1),item.question.es,item.question.en)
  addText('services','Servicios','services.faq.'+i+'.a','Preguntas frecuentes','Respuesta '+(i+1),item.answer.es,item.answer.en)
})

// Cada servicio individual tiene su propio texto y medios. Los nombres estables
// usan el slug real de la ruta, nunca el índice de una tarjeta de navegación.
const detailPage='details', detailLabel='Servicios individuales'
const detailText=(slug:string,name:string,field:string,section:string,label:string,es:string,en:string)=>
  addText(detailPage,detailLabel,'service.'+slug+'.'+field,name+' · '+section,label,es,en)
const detailMedia=(slug:string,name:string,field:string,section:string,label:string,src:string,kind:'Imagen'|'Video'='Imagen')=>
  addMedia(detailPage,detailLabel,'service.'+slug+'.'+field,name+' · '+section,label,src,kind)
const defaultVideo=(slug:string):string=>
  slug==='transporte-aereo'?'/videos/service-air.mp4':
  ['transporte-terrestre','transporte-local','transporte-panama-costa-rica'].includes(slug)?'/videos/service-road.mp4':
  ['almacenamiento-fiscal','bodegaje-general'].includes(slug)?'/videos/service-warehouse.mp4':'/videos/service-maritime.mp4'
const guideImages:Record<string,string>={
  'almacenamiento-fiscal':'/images/services-warehouse.webp',
  'bodegaje-general':'/images/warehouse-person.webp',
  'agenciamiento-aduanal':'/images/operation.webp',
  'consolidadora-de-carga':'/images/ship.webp'
}
for(const [route,guide] of Object.entries(serviceGuides)){
  const slug=route.split('/').pop() || ''
  const name=guide.es.label
  const guideLocations:Record<string,[string,string]>={
    'almacenamiento-fiscal':['Almacenamiento fiscal en Costa Rica','Fiscal warehousing in Costa Rica'],
    'bodegaje-general':['Bodegaje general en Costa Rica','General warehousing in Costa Rica'],
    'agenciamiento-aduanal':['Gestiones aduanales en Costa Rica','Customs coordination in Costa Rica'],
    'consolidadora-de-carga':['Coordinación de carga consolidada','Consolidated cargo coordination']
  }
  const place=guideLocations[slug] || ['Servicios logísticos en Costa Rica','Logistics services in Costa Rica']
  detailText(slug,name,'eyebrow','Portada','Antetítulo','SOLUCIONES LOGÍSTICAS','LOGISTICS SERVICES')
  detailText(slug,name,'location','Portada','Ubicación',place[0],place[1])
  detailText(slug,name,'ctaLabel','Portada','Botón de consulta','Consultar este servicio','Ask about this service')
  detailMedia(slug,name,'hero.media','Portada','Imagen de portada y explicación',guideImages[slug]||'/images/hero.webp')
  detailMedia(slug,name,'story.media','Beneficios','Video o imagen de beneficios',defaultVideo(slug),'Video')
  ;([
    ['label','Nombre',guide.es.label,guide.en.label],
    ['title','Título',guide.es.title,guide.en.title],
    ['intro','Introducción',guide.es.intro,guide.en.intro],
    ['heading','Título de explicación',guide.es.heading,guide.en.heading],
    ['body','Explicación',guide.es.body,guide.en.body],
    ['answer','Resumen',guide.es.answer,guide.en.answer],
    ['quoteHeading','Título de cotización',guide.es.quoteHeading,guide.en.quoteHeading],
    ['quoteIntro','Texto de cotización',guide.es.quoteIntro,guide.en.quoteIntro],
    ['scopeNote','Alcance',guide.es.scopeNote,guide.en.scopeNote]
  ] as Array<[string,string,string,string]>).forEach(([field,label,es,en])=>
    detailText(slug,name,field,field.startsWith('quote')||field==='scopeNote'?'Cotización':'Portada y explicación',label,es,en))
  guide.es.points.forEach((es,i)=>detailText(slug,name,'point.'+i+'.body','Beneficios','Beneficio '+(i+1),es,guide.en.points[i]))
  guide.es.quoteItems.forEach((es,i)=>detailText(slug,name,'quoteItem.'+i,'Cotización','Requisito '+(i+1),es,guide.en.quoteItems[i]))
  guide.es.faq.forEach((item,i)=>{
    detailText(slug,name,'faq.'+i+'.q','Preguntas frecuentes','Pregunta '+(i+1),item.q,guide.en.faq[i].q)
    detailText(slug,name,'faq.'+i+'.a','Preguntas frecuentes','Respuesta '+(i+1),item.a,guide.en.faq[i].a)
  })
}
for(const service of servicePages){
  const slug=service.slug,name=service.title.es
  detailMedia(slug,name,'hero.media','Portada','Imagen de portada y explicación',service.image)
  detailMedia(slug,name,'story.media','Beneficios','Video o imagen de beneficios',defaultVideo(slug),'Video')
  ;([
    ['label','Nombre',service.title.es,service.title.en],
    ['title','Título',service.title.es,service.title.en],
    ['eyebrow','Antetítulo',service.eyebrow.es,service.eyebrow.en],
    ['intro','Introducción',service.lead.es,service.lead.en],
    ['location','Ubicación',service.location.es,service.location.en],
    ['ctaLabel','Botón de cotización',service.quoteLabel.es,service.quoteLabel.en]
  ] as Array<[string,string,string,string]>).forEach(([field,label,es,en])=>detailText(slug,name,field,'Portada',label,es,en))
  detailText(slug,name,'heading','Explicación','Título',
    'Una operación clara desde el primer paso.','A clear operation from the first step.')
  detailText(slug,name,'body','Explicación','Descripción',
    'Antes de coordinar, se revisan las características de la carga, los puntos de salida y entrega, y la fecha requerida. El alcance, las condiciones y la disponibilidad se confirman para cada operación.',
    'Before coordination, the cargo characteristics, pickup and delivery points, and required date are reviewed. Scope, terms and availability are confirmed for each operation.')
  detailText(slug,name,'answer','Explicación','Resumen',
    'Compartir una descripción clara de la carga y los datos de la ruta ayuda al equipo a orientar la revisión y definir los siguientes pasos.',
    'A clear cargo description and route details help the team assess the request and outline the next steps.')
  service.sections.forEach((item,i)=>{
    detailText(slug,name,'point.'+i+'.title','Beneficios','Beneficio '+(i+1)+': título',item.title.es,item.title.en)
    detailText(slug,name,'point.'+i+'.body','Beneficios','Beneficio '+(i+1)+': descripción',item.body.es,item.body.en)
  })
  // Tarjetas adicionales (3 y 4) con valores predeterminados compartidos con la página.
  const extraBenefits = extraBenefitsByRoute['/servicios/' + slug]
  if (extraBenefits) {
    const missing = Math.max(0, 4 - service.sections.length)
    for (let i=0; i<Math.min(missing,extraBenefits.es.length,extraBenefits.en.length); i++) {
      const position = service.sections.length + i
      const es = extraBenefits.es[i], en = extraBenefits.en[i]
      if (es.title && en.title)
        detailText(slug,name,'point.'+position+'.title','Beneficios','Beneficio '+(position+1)+': título',es.title,en.title)
      detailText(slug,name,'point.'+position+'.body','Beneficios','Beneficio '+(position+1)+': descripción',es.body,en.body)
    }
  }
  const faqs=serviceFaqs[slug as keyof typeof serviceFaqs]
  if(faqs)faqs.forEach((item,i)=>{
    detailText(slug,name,'faq.'+i+'.q','Preguntas frecuentes','Pregunta '+(i+1),item.question.es,item.question.en)
    detailText(slug,name,'faq.'+i+'.a','Preguntas frecuentes','Respuesta '+(i+1),item.answer.es,item.answer.en)
  })
}
siteSlotCatalog.push(...additional)
