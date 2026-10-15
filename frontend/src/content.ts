export type ServiceKey = 'Air' | 'Land' | 'Maritime' | 'Multimodal'
export const services: {key:ServiceKey;title:string;label:string;description:string;detail:string;photo:string;icon:string}[] = [
  {key:'Air',title:'Carga aérea',label:'AÉREO',description:'Velocidad y coordinación para cargas que necesitan llegar a tiempo.',detail:'Coordinamos alternativas de transporte aéreo y el acompañamiento aduanero de tu operación.',photo:'/images/air-freight.webp',icon:'✈'},
  {key:'Land',title:'Transporte terrestre',label:'TERRESTRE',description:'Conectamos rutas terrestres con soluciones prácticas y seguras.',detail:'Planificamos el movimiento de tu mercancía y la documentación necesaria para cada trayecto.',photo:'/images/truck.webp',icon:'➜'},
  {key:'Maritime',title:'Carga marítima',label:'MARÍTIMO',description:'Alternativas marítimas para conectar tus operaciones internacionales.',detail:'Gestionamos logística para contenedores y embarques consolidados según las necesidades de tu negocio.',photo:'/images/ship.webp',icon:'⚓'},
  {key:'Multimodal',title:'Transporte multimodal',label:'MULTIMODAL',description:'Soluciones que integran varios medios de transporte en una sola operación.',detail:'Coordinamos conexiones aéreas, marítimas y terrestres para mover tu carga de origen a destino con una gestión logística integrada.',photo:'/images/cover-logistics.jpeg',icon:'↗'},
]
export const homeNews = [
  {category:'LOGÍSTICA',title:'Conexiones internacionales',image:'/images/news-ports.webp'},
  {category:'INNOVACIÓN',title:'Tecnología en los almacenes',image:'/images/news-ai.webp'},
  {category:'OPERACIONES',title:'El futuro de la logística',image:'/images/news-warehouse.webp'},
]
export const news = [
  {category:'NOTICIAS',title:'Aviones con problemas aduaneros',description:'Espacio reservado para una nota sobre el transporte aéreo y los procedimientos aduaneros. Contenido de demostración.',image:'/images/air-freight.webp'},
  {category:'REPORTES',title:'Nuevos costos de tarifas en Zona Libre',description:'Espacio reservado para un reporte de tarifas. Las cifras y condiciones deben verificarse antes de su publicación.',image:'/images/cover-logistics.jpeg'},
  {category:'REPORTES',title:'Actualizaciones de tarifas y comercio internacional',description:'Espacio reservado para reportes del sector logístico y aduanero. Publicación pendiente.',image:'/images/services-warehouse.webp'},
  {category:'LOGÍSTICA',title:'Puertos regionales agilizan el flujo de contenedores',description:'Información de demostración: las terminales de la región prueban nuevos procesos de coordinación para reducir esperas y mejorar la planificación de carga. Datos y fechas pendientes de verificación.',image:'/images/about-operations-enhanced.jpg'},
  {category:'INNOVACIÓN',title:'La automatización transforma los centros de distribución',description:'Información de demostración: herramientas de inventario y clasificación buscan dar mayor visibilidad a cada etapa de la operación. El impacto y las cifras de esta nota son ilustrativos y deben verificarse antes de publicar.',image:'/images/hero.webp'},
]
export const faqs = [
  {q:'¿Qué servicios ofrece Grupo Castro Fallas?',a:'El diseño presenta soluciones de logística, gestión aduanera y transporte internacional aéreo, marítimo y terrestre. Podemos ayudarte a preparar una solicitud para tu operación.'},
  {q:'¿Cómo puedo solicitar una cotización?',a:'En “Cotizaciones”, completa los detalles de la carga y selecciona “Enviar a Pricing”. En esta demostración, la solicitud se registra mediante la API existente; no se envía un correo automáticamente.'},
  {q:'¿Cómo puedo rastrear mi carga?',a:'La sección “Consulta tu embarque” incluye por ahora una visualización 3D demostrativa. El rastreo de embarques real requerirá definir una fuente de datos e integrarla.'},
  {q:'¿Manejan FCL y LCL?',a:'FCL se refiere a contenedor completo y LCL a carga consolidada. Para confirmar disponibilidad y condiciones de estos servicios, es necesario consultar al equipo comercial.'},
]
