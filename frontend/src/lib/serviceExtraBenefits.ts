export interface ServiceExtraBenefit { title?: string; body: string; icon?: string }

// Supplement only service pages whose benefits do not fill the 2×2 grid.
// Keep the original benefits and editorial/SEO source data unchanged.
// Each addition is grounded in that service's own description, scope or FAQ;
// these describe coordination/evaluation rather than guaranteed availability.
export const extraBenefitsByRoute: Record<string, Record<'es' | 'en', ServiceExtraBenefit[]>> = {
  '/servicios/almacenamiento-fiscal': {
    es: [
      { body: 'Revisión de los registros y controles de mercancías según el depósito autorizado y el servicio acordado.', icon: '▰' }
    ],
    en: [
      { body: 'Review of cargo records and controls according to the authorized warehouse and agreed service.', icon: '▰' }
    ]
  },
  '/servicios/bodegaje-general': {
    es: [
      { body: 'Planificación de entradas, salidas y registros de inventario según el servicio contratado.', icon: '▤' }
    ],
    en: [
      { body: 'Planning of inbound, outbound and inventory records according to the contracted service.', icon: '▤' }
    ]
  },
  '/servicios/agenciamiento-aduanal': {
    es: [
      { body: 'Revisión de clasificación conocida, permisos y certificaciones aplicables a la mercancía.', icon: '▤' }
    ],
    en: [
      { body: 'Review of known cargo classification, permits and applicable certificates.', icon: '▤' }
    ]
  },
  '/servicios/consolidadora-de-carga': {
    es: [
      { body: 'Evaluación de compatibilidad, frecuencia de salida y capacidad disponible para cada consolidación.', icon: 'container-open' }
    ],
    en: [
      { body: 'Assessment of cargo compatibility, departure frequency and available consolidation capacity.', icon: 'container-open' }
    ]
  },
  '/servicios/transporte-maritimo': {
    es: [
      { title: 'Importación y exportación', body: 'Revisión de opciones marítimas de entrada o salida según la ruta solicitada.', icon: '⚓' },
      { title: 'Condiciones del embarque', body: 'Modalidad, fechas y alcance sujetos a confirmación durante la cotización.', icon: 'container-open' }
    ],
    en: [
      { title: 'Imports and exports', body: 'Review of inbound and outbound ocean options for the requested route.', icon: '⚓' },
      { title: 'Shipment terms', body: 'Mode, dates and scope are confirmed during the quotation process.', icon: 'container-open' }
    ]
  },
  '/servicios/transporte-terrestre': {
    es: [
      { title: 'Características de la carga', body: 'Evaluación de peso, dimensiones y necesidades particulares del traslado.', icon: '▰' },
      { title: 'Opciones regionales', body: 'Revisión de rutas y disponibilidad internacional antes de confirmar el servicio.', icon: 'truck' }
    ],
    en: [
      { title: 'Cargo characteristics', body: 'Assessment of weight, dimensions and specific transport requirements.', icon: '▰' },
      { title: 'Regional options', body: 'Review of international routes and availability before confirming the service.', icon: 'truck' }
    ]
  },
  '/servicios/transporte-aereo': {
    es: [
      { title: 'Fechas requeridas', body: 'Revisión de la fecha solicitada al evaluar alternativas de transporte aéreo.', icon: '◷' },
      { title: 'Disponibilidad y condiciones', body: 'Confirmación de las opciones aéreas aplicables antes de coordinar el envío.', icon: '✈' }
    ],
    en: [
      { title: 'Required dates', body: 'Review of the requested date when evaluating air freight alternatives.', icon: '◷' },
      { title: 'Availability and terms', body: 'Confirmation of suitable air freight options before arranging shipment.', icon: '✈' }
    ]
  },
  '/servicios/transporte-internacional': {
    es: [
      { title: 'Revisión de rutas', body: 'Se analizan trayectos y disponibilidad según la modalidad solicitada.', icon: '⌖' },
      { title: 'Próximos pasos', body: 'Orientación para continuar con la evaluación y coordinación del envío.', icon: 'container-open' }
    ],
    en: [
      { title: 'Route review', body: 'Routes and availability are considered for the requested transport mode.', icon: '⌖' },
      { title: 'Next steps', body: 'Guidance to continue shipment assessment and coordination.', icon: 'container-open' }
    ]
  },
  '/servicios/transporte-local': {
    es: [
      { title: 'Puntos de recolección y entrega', body: 'Se revisan los lugares solicitados según la cobertura disponible.', icon: '⌖' },
      { title: 'Coordinación con Neriteka', body: 'Evaluación del alcance según la carga y la fecha requerida.', icon: 'truck' }
    ],
    en: [
      { title: 'Pickup and delivery points', body: 'Review of requested locations based on available coverage.', icon: '⌖' },
      { title: 'Coordination with Neriteka', body: 'Scope assessment based on cargo details and required date.', icon: 'truck' }
    ]
  },
  '/servicios/transporte-panama-costa-rica': {
    es: [
      { title: 'Cruce fronterizo', body: 'Revisión documental de los requisitos aplicables al traslado entre ambos países.', icon: '▤' },
      { title: 'Ruta y alcance', body: 'Evaluación del recorrido y sus condiciones antes de coordinar el embarque.', icon: 'truck' }
    ],
    en: [
      { title: 'Border crossing', body: 'Document review of requirements for freight moving between the two countries.', icon: '▤' },
      { title: 'Route and scope', body: 'Assessment of the route and its terms before coordinating the shipment.', icon: 'truck' }
    ]
  }
}

