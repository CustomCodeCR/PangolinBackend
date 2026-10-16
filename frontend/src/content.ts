export type ServiceKey = 'Air' | 'Land' | 'Maritime' | 'Multimodal'
export const services: {key:ServiceKey;title:string;label:string;description:string;detail:string;photo:string;icon:string}[] = [
  {key:'Air',title:'Carga aérea',label:'AÉREO',description:'Velocidad y coordinación para cargas que necesitan llegar a tiempo.',detail:'Coordinamos alternativas de transporte aéreo y el acompañamiento aduanero de tu operación.',photo:'/images/air-freight.webp',icon:'✈'},
  {key:'Land',title:'Transporte terrestre',label:'TERRESTRE',description:'Conectamos rutas terrestres con soluciones prácticas y seguras.',detail:'Planificamos el movimiento de tu mercancía y la documentación necesaria para cada trayecto.',photo:'/images/truck.webp',icon:'➜'},
  {key:'Maritime',title:'Carga marítima',label:'MARÍTIMO',description:'Alternativas marítimas para conectar tus operaciones internacionales.',detail:'Gestionamos logística para contenedores y embarques consolidados según las necesidades de tu negocio.',photo:'/images/ship.webp',icon:'⚓'},
  {key:'Multimodal',title:'Transporte multimodal',label:'MULTIMODAL',description:'Soluciones que integran varios medios de transporte en una sola operación.',detail:'Coordinamos conexiones aéreas, marítimas y terrestres para mover tu carga de origen a destino con una gestión logística integrada.',photo:'/images/cover-logistics.jpeg',icon:'↗'},
]
export const faqs = [
  {q:'¿Qué servicios ofrece Grupo Castro Fallas?',a:'El diseño presenta soluciones de logística, gestión aduanera y transporte internacional aéreo, marítimo y terrestre. Podemos ayudarte a preparar una solicitud para tu operación.'},
  {q:'¿Cómo puedo solicitar una cotización?',a:'En “Cotizaciones”, completa los detalles de la carga y selecciona “Enviar a Pricing”. En esta demostración, la solicitud se registra mediante la API existente; no se envía un correo automáticamente.'},
  {q:'¿Cómo puedo rastrear mi carga?',a:'La sección “Consulta tu embarque” incluye por ahora una visualización 3D demostrativa. El rastreo de embarques real requerirá definir una fuente de datos e integrarla.'},
  {q:'¿Manejan FCL y LCL?',a:'FCL se refiere a contenedor completo y LCL a carga consolidada. Para confirmar disponibilidad y condiciones de estos servicios, es necesario consultar al equipo comercial.'},
]
