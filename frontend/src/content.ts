export type ServiceKey = 'Air' | 'Land' | 'Maritime' | 'Multimodal'
export const services: {key:ServiceKey;title:string;label:string;description:string;detail:string;photo:string;icon:string}[] = [
  {key:'Air',title:'Carga aérea',label:'AÉREO',description:'Velocidad y coordinación para cargas que necesitan llegar a tiempo.',detail:'Coordinamos alternativas de transporte aéreo y el acompañamiento aduanero de tu operación.',photo:'/images/air-freight.webp',icon:'✈'},
  {key:'Land',title:'Transporte terrestre',label:'TERRESTRE',description:'Conectamos rutas terrestres con soluciones prácticas y seguras.',detail:'Planificamos el movimiento de tu mercancía y la documentación necesaria para cada trayecto.',photo:'/images/truck.webp',icon:'➜'},
  {key:'Maritime',title:'Carga marítima',label:'MARÍTIMO',description:'Alternativas marítimas para conectar tus operaciones internacionales.',detail:'Gestionamos logística para contenedores y embarques consolidados según las necesidades de tu negocio.',photo:'/images/ship.webp',icon:'⚓'},
  {key:'Multimodal',title:'Transporte multimodal',label:'MULTIMODAL',description:'Soluciones que integran varios medios de transporte en una sola operación.',detail:'Coordinamos conexiones aéreas, marítimas y terrestres para mover tu carga de origen a destino con una gestión logística integrada.',photo:'/images/cover-logistics.jpeg',icon:'↗'},
]
export const faqs = [
  {q:'¿Qué servicios ofrece Grupo Castro Fallas?',a:'Ofrecemos soluciones logísticas integrales que incluyen transporte marítimo, aéreo y terrestre, gestión aduanera, almacenamiento fiscal y general, transporte internacional y servicios especializados para facilitar las operaciones de importación y exportación.'},
  {q:'¿Cómo puedo solicitar una cotización?',a:'Puedes solicitar una cotización desde nuestra sección de cotizaciones en el sitio web. Completa la información de tu carga, incluyendo el origen, destino y características del envío, para que nuestro equipo pueda evaluar tus necesidades y ofrecerte una solución adecuada.'},
  {q:'¿Cómo puedo rastrear mi carga?',a:'Puedes consultar el estado de tu envío mediante la sección de rastreo de nuestro sitio web, utilizando la información de seguimiento correspondiente a tu operación. Si necesitas asistencia adicional, nuestro equipo estará disponible para ayudarte.'},
  {q:'¿Manejan FCL y LCL?',a:'Sí. Ofrecemos transporte marítimo FCL (contenedor completo) y LCL (carga consolidada), brindando alternativas flexibles según el volumen de tu mercancía, tus necesidades logísticas y los requerimientos de tu operación.'},
]
