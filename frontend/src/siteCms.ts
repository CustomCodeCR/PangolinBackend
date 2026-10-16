import { reactive } from 'vue'

export interface SiteSlotDefinition { page: string; pageLabel: string; key: string; section: string; type: 'media' | 'text'; label: string; help: string; fallback: string }
export interface PublishedSiteSlot { key: string; textEs?: string | null; textEn?: string | null; mediaSrc?: string | null; mediaKind?: string | null }
export interface EditableSiteSlot { key: string; draftEs?: string | null; draftEn?: string | null; draftMediaId?: string | null; publishedEs?: string | null; publishedEn?: string | null; publishedMediaId?: string | null; updatedAt?: string; publishedAt?: string | null }

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
