<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[]; links?: { label: string; href: string }[] }
type LegalDocument = { title: string; intro: string; sections: LegalSection[] }
const { locale } = useI18n({ useScope: 'global' })
const documentType = computed(() => {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/terminos' ? 'terms' : path === '/cookies' ? 'cookies' : path === '/licencias' ? 'licenses' : 'privacy'
})

const documents: Record<'es' | 'en', Record<'privacy' | 'terms' | 'cookies' | 'licenses', LegalDocument>> = {
  es: {
      "privacy": {
        "title": "Política de privacidad",
        "intro": "",
        "sections": [
          {
            "title": "Responsable del tratamiento",
            "paragraphs": [
              "Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio, es la entidad responsable del tratamiento de los datos personales que se reciben a través de este sitio web.",
              "Para consultas sobre protección de datos personales o para ejercer sus derechos, puede escribir a comercial@castrofallas.com o llamar al +506 2272-6772."
            ]
          },
          {
            "title": "Información que se recopila",
            "paragraphs": [
              "En el formulario de contacto y las solicitudes de cotización se recopilan los datos que la persona introduce, como nombre, empresa, país, teléfono, correo electrónico, consulta y detalles del servicio o de la carga.",
              "Según el formulario utilizado, los detalles de la cotización pueden incluir origen, destino, tipo de transporte, características de la mercancía, pesos, dimensiones, equipos, fechas, direcciones de recolección o entrega, y observaciones.",
              "Para acceder a las funciones que requieren una cuenta se utiliza una dirección de correo electrónico y un código temporal de verificación. El sitio también recibe los datos que el usuario facilita al consultar referencias de seguimiento de embarques.",
              "Cuando se utiliza el asistente virtual, se procesa el mensaje enviado y parte del contexto reciente de esa conversación para elaborar una respuesta."
            ]
          },
          {
            "title": "Para qué se utiliza la información",
            "paragraphs": [
              "Los datos recibidos se emplean para atender solicitudes de información, preparar y dar seguimiento a cotizaciones, habilitar el acceso de usuarios autorizados y consultar la información de seguimiento o itinerarios disponible para una cuenta.",
              "Los mensajes enviados al asistente se utilizan para responder a las consultas formuladas en esa herramienta.",
              "También se utilizan los datos técnicos necesarios para mantener las sesiones y el funcionamiento y seguridad del sitio."
            ]
          },
          {
            "title": "Acceso a la información y servicios tecnológicos",
            "paragraphs": [
              "La información de las solicitudes puede ser consultada por el personal autorizado encargado de atenderlas. Las cuentas y las funciones administrativas tienen restricciones de acceso según el perfil del usuario.",
              "El sitio utiliza servicios tecnológicos para la entrega de códigos de acceso por correo y para operar sus funciones digitales. La consulta de seguimiento se conecta con los sistemas de información empresarial utilizados para esa función.",
              "La información personal debe comunicarse a terceros únicamente cuando resulte necesario para atender la función solicitada o exista una obligación legal, con sujeción a las disposiciones aplicables."
            ]
          },
          {
            "title": "Conservación y seguridad",
            "paragraphs": [
              "Los datos se conservarán durante el período necesario para atender las solicitudes recibidas, administrar el acceso y cumplir las obligaciones legales aplicables. No se establece un plazo único para todas las categorías, porque su finalidad y las obligaciones correspondientes son distintas.",
              "Castro Fallas deberá aplicar medidas de seguridad y control de acceso adecuadas a la información personal que administra."
            ]
          },
          {
            "title": "Derechos de las personas titulares",
            "paragraphs": [
              "De acuerdo con la Ley N.º 8968, las personas tienen derecho a solicitar el acceso, la rectificación y la supresión de sus datos personales en los casos que procedan. Las solicitudes deben resolverse gratuitamente en el plazo legal de cinco días hábiles desde su recepción.",
              "La solicitud puede enviarse a comercial@castrofallas.com, indicando la información sobre la que se desea ejercer el derecho. Podrá requerirse información razonable para verificar la identidad de la persona solicitante.",
              "Cuando corresponda, también se podrán presentar reclamaciones ante la Agencia de Protección de Datos de los Habitantes (PRODHAB)."
            ]
          },
          {
            "title": "Cookies y preferencias del navegador",
            "paragraphs": [
              "Para la autenticación se utiliza una cookie de sesión y el sitio guarda determinadas preferencias en el almacenamiento local del navegador. Las tecnologías utilizadas y las opciones de eliminación se detallan en la Política de Cookies."
            ],
            "links": [
              {
                "label": "Política de Cookies",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Normativa y modificaciones",
            "paragraphs": [
              "El tratamiento de datos personales se sujeta a la Ley N.º 8968, su Reglamento y las demás disposiciones aplicables en Costa Rica.",
              "Cuando cambien las funciones de la web o las operaciones de tratamiento, esta política deberá actualizarse para que describa las prácticas efectivamente utilizadas."
            ]
          }
        ]
      },
      "terms": {
        "title": "Términos y condiciones de uso",
        "intro": "",
        "sections": [
          {
            "title": "Identificación del titular",
            "paragraphs": [
              "El presente sitio web es operado bajo el nombre comercial Castro Fallas por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio.",
              "Para consultas relacionadas con estos Términos y Condiciones, los usuarios podrán escribir al correo electrónico comercial@castrofallas.com o llamar al teléfono +506 2272-6772."
            ]
          },
          {
            "title": "Objeto y alcance",
            "paragraphs": [
              "Estas condiciones regulan el acceso y el uso de las páginas, formularios y funciones digitales del sitio de Castro Fallas.",
              "No sustituyen las cotizaciones aceptadas, los contratos ni las condiciones particulares acordadas para la prestación de servicios de transporte, logística o gestión aduanera."
            ]
          },
          {
            "title": "Uso del sitio",
            "paragraphs": [
              "El usuario debe utilizar las funciones del sitio de manera lícita y proporcionar datos veraces al completar solicitudes.",
              "Se prohíbe intentar acceder sin autorización a cuentas o información ajena, interferir con el funcionamiento del sitio o introducir contenidos perjudiciales."
            ]
          },
          {
            "title": "Acceso a las cuentas",
            "paragraphs": [
              "Determinadas funciones, como las solicitudes de cotización y la consulta de seguimiento e itinerarios, requieren una cuenta autorizada.",
              "El inicio de sesión se realiza mediante la verificación de un código temporal enviado al correo electrónico asociado a la cuenta. El usuario debe proteger su acceso y comunicar cualquier uso no autorizado del que tenga conocimiento."
            ]
          },
          {
            "title": "Solicitudes de cotización",
            "paragraphs": [
              "El sitio permite enviar solicitudes de cotización de servicios de transporte y logística mediante formularios que requieren información de contacto y de la operación solicitada.",
              "Enviar una solicitud no equivale por sí solo a aceptar una oferta, confirmar un precio, reservar un espacio de transporte ni contratar un servicio.",
              "La contratación y las condiciones concretas de la operación se establecerán en la propuesta o acuerdo que corresponda."
            ]
          },
          {
            "title": "Seguimiento, itinerarios y contenido informativo",
            "paragraphs": [
              "Los usuarios autorizados pueden acceder a las funciones de consulta de seguimiento e itinerarios disponibles en el sitio. Su información depende de los registros y fuentes consultados y no sustituye los documentos o confirmaciones correspondientes a cada embarque.",
              "Las noticias, descripciones de servicios y respuestas del asistente virtual tienen carácter informativo y no constituyen una cotización aceptada ni la confirmación de una operación."
            ]
          },
          {
            "title": "Propiedad intelectual",
            "paragraphs": [
              "Los contenidos, logotipos, fotografías, textos y demás elementos del sitio están sujetos a los derechos de propiedad intelectual de sus respectivos titulares. Su publicación no autoriza la reproducción o explotación comercial fuera de los casos permitidos por la ley o por las licencias aplicables.",
              "Los avisos sobre los componentes de terceros utilizados en el sitio se encuentran en Créditos y licencias."
            ],
            "links": [
              {
                "label": "Créditos y licencias",
                "href": "/licencias"
              }
            ]
          },
          {
            "title": "Responsabilidad y derechos legales",
            "paragraphs": [
              "La información disponible en las funciones digitales debe interpretarse según su alcance y las condiciones particulares de cada operación.",
              "Ninguna disposición de estos términos limita los derechos irrenunciables de los consumidores ni las responsabilidades que, conforme a la legislación aplicable, no puedan excluirse."
            ]
          },
          {
            "title": "Datos personales",
            "paragraphs": [
              "El tratamiento de la información proporcionada mediante los formularios y otras funciones del sitio se explica en la Política de Privacidad. El uso de cookies y preferencias del navegador se explica en la Política de Cookies."
            ],
            "links": [
              {
                "label": "Política de privacidad",
                "href": "/privacidad"
              },
              {
                "label": "Política de cookies",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Modificaciones y legislación aplicable",
            "paragraphs": [
              "Los cambios a estas condiciones se reflejarán en esta página mediante la actualización de su fecha. No modificarán retroactivamente obligaciones válidamente acordadas, salvo los casos permitidos por la ley.",
              "Estas condiciones se interpretan de conformidad con la legislación de Costa Rica. Las controversias se someterán a las autoridades competentes según el ordenamiento jurídico aplicable."
            ]
          }
        ]
      },
      "cookies": {
        "title": "Política de cookies y almacenamiento local",
        "intro": "",
        "sections": [
          {
            "title": "Responsable y contacto",
            "paragraphs": [
              "Este sitio web es operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio.",
              "Para consultas sobre este documento, escriba a comercial@castrofallas.com o llame al +506 2272-6772."
            ]
          },
          {
            "title": "Cookie de inicio de sesión",
            "paragraphs": [
              "Para mantener el acceso de los usuarios autenticados, el sitio utiliza una cookie propia denominada «cf_session». Su finalidad es reconocer la sesión autorizada y proteger el acceso a funciones que requieren autenticación.",
              "La cookie tiene una duración máxima configurada de ocho horas. Está marcada como HttpOnly y SameSite Strict; la configuración del atributo Secure depende del entorno del servidor."
            ]
          },
          {
            "title": "Preferencias guardadas en el navegador",
            "paragraphs": [
              "El sitio utiliza almacenamiento local del navegador para recordar el idioma seleccionado y la preferencia del tema visual. Este almacenamiento no es una cookie.",
              "Estas preferencias permanecen en el navegador hasta que se modifican o se eliminan los datos guardados por el usuario."
            ]
          },
          {
            "title": "Cómo eliminar estos datos",
            "paragraphs": [
              "El usuario puede eliminar las cookies y el almacenamiento local desde la configuración de privacidad de su navegador.",
              "Si elimina la cookie de sesión, deberá volver a iniciar sesión. Si elimina las preferencias guardadas, el sitio utilizará nuevamente sus valores predeterminados."
            ]
          },
          {
            "title": "Datos personales",
            "paragraphs": [
              "El uso de la cookie de sesión y el tratamiento de los datos asociados al acceso se sujetan a las disposiciones aplicables de protección de datos personales.",
              "Para conocer los derechos y los medios de contacto relacionados con información personal, consulte la Política de Privacidad."
            ],
            "links": [
              {
                "label": "Política de privacidad",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Actualización de la política",
            "paragraphs": [
              "Esta política describe las tecnologías identificadas en las funciones actuales del sitio. Deberá actualizarse cuando cambien las tecnologías efectivamente empleadas."
            ]
          }
        ]
      },
      "licenses": {
        "title": "Créditos y licencias",
        "intro": "",
        "sections": [
          {
            "title": "Titular del sitio",
            "paragraphs": [
              "El sitio web de Castro Fallas es operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767.",
              "Para consultas sobre este documento, escriba a comercial@castrofallas.com o llame al +506 2272-6772."
            ]
          },
          {
            "title": "Contenidos y signos distintivos",
            "paragraphs": [
              "El sitio contiene textos, fotografías, diseños, ilustraciones, nombres comerciales y logotipos. Los derechos sobre estos recursos corresponden a sus respectivos titulares.",
              "La disponibilidad pública de estos materiales en el sitio no constituye autorización para reproducirlos o utilizarlos comercialmente sin permiso, salvo en los casos admitidos por la legislación."
            ]
          },
          {
            "title": "Globo geográfico interactivo",
            "paragraphs": [
              "El globo geográfico presente en la web utiliza los componentes d3-geo, topojson-client y world-atlas. Se conservan los avisos correspondientes a sus licencias y a los titulares de derechos.",
              "Los datos geográficos utilizados por world-atlas proceden de Natural Earth y conservan sus condiciones de uso."
            ],
            "links": [
              {
                "label": "Avisos de licencias del globo",
                "href": "/licenses/globe-third-party-notices.txt"
              },
              {
                "label": "D3-Geo",
                "href": "https://github.com/d3/d3-geo"
              },
              {
                "label": "TopoJSON",
                "href": "https://github.com/topojson/topojson-client"
              },
              {
                "label": "World Atlas",
                "href": "https://github.com/topojson/world-atlas"
              },
              {
                "label": "Natural Earth",
                "href": "https://www.naturalearthdata.com/about/terms-of-use/"
              }
            ]
          },
          {
            "title": "Imágenes y recursos gráficos",
            "paragraphs": [
              "Las imágenes y los recursos gráficos que aparecen en la web están sujetos a los derechos y condiciones de uso establecidos por sus respectivos titulares. Cuando una licencia exija atribución, se deberá conservar el reconocimiento correspondiente."
            ]
          },
          {
            "title": "Uso de materiales por terceros",
            "paragraphs": [
              "La consulta del sitio no confiere derechos de explotación sobre sus textos, diseños, marcas o recursos de terceros. Cualquier utilización distinta de la permitida por la ley o por la licencia aplicable requiere autorización del titular correspondiente."
            ]
          },
          {
            "title": "Consultas sobre derechos de autor",
            "paragraphs": [
              "Para consultas o reclamaciones relacionadas con un contenido del sitio, escriba a comercial@castrofallas.com o llame al +506 2272-6772. La comunicación debe permitir identificar el material y el derecho que se considera afectado."
            ]
          },
          {
            "title": "Legislación aplicable",
            "paragraphs": [
              "La protección de los contenidos del sitio se rige por la legislación costarricense de propiedad intelectual y los instrumentos internacionales que resulten aplicables."
            ]
          }
        ]
      }
    },
  en: {
      "privacy": {
        "title": "Privacy Policy",
        "intro": "",
        "sections": [
          {
            "title": "Data controller",
            "paragraphs": [
              "Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located in Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio, is responsible for personal information received through this website.",
              "For inquiries about personal data or to exercise your rights, email comercial@castrofallas.com or call +506 2272-6772."
            ]
          },
          {
            "title": "Information collected",
            "paragraphs": [
              "The contact and quotation forms collect the information entered by users, such as name, company, country, telephone number, email address, inquiry, and details of the requested service or cargo.",
              "Depending on the form, quotation details may include origin, destination, transport type, cargo characteristics, weights, dimensions, equipment, dates, pickup or delivery addresses, and comments.",
              "Functions requiring an account use an email address and a temporary verification code. The website also receives shipment reference details entered by users in the tracking search.",
              "When the virtual assistant is used, the submitted message and part of the recent conversation context are processed to prepare a response."
            ]
          },
          {
            "title": "Purposes of processing",
            "paragraphs": [
              "The information received is used to respond to inquiries, prepare and follow up on quotations, enable access for authorized users, and consult tracking or itinerary information available to an account.",
              "Messages sent to the virtual assistant are used to answer the questions submitted through that feature.",
              "Technical data needed to maintain sessions and the website's operation and security is also used."
            ]
          },
          {
            "title": "Access to information and technology services",
            "paragraphs": [
              "Requests can be accessed by authorized personnel responsible for handling them. Account and administrative functions are subject to access restrictions according to user roles.",
              "The website uses technology services to deliver email verification codes and operate its digital features. The tracking search connects to business information systems used for that function.",
              "Personal data should be disclosed to third parties only as needed to fulfill the requested function or meet a legal obligation, subject to applicable requirements."
            ]
          },
          {
            "title": "Retention and security",
            "paragraphs": [
              "Information is retained for as long as needed to handle the requests received, administer access, and meet applicable legal obligations. A single retention period is not stated for all categories because their purposes and requirements differ.",
              "Castro Fallas must apply security and access-control measures appropriate to the personal information it manages."
            ]
          },
          {
            "title": "Data subject rights",
            "paragraphs": [
              "Under Costa Rican Law No. 8968, individuals may request access to, correction of, and deletion of their personal information where applicable. Requests must be resolved free of charge within five business days of receipt, as required by law.",
              "Requests may be sent to comercial@castrofallas.com, identifying the data and the right concerned. Reasonable information may be requested to verify the applicant's identity.",
              "Where appropriate, complaints may also be filed with Costa Rica's Data Protection Agency (PRODHAB)."
            ]
          },
          {
            "title": "Cookies and browser preferences",
            "paragraphs": [
              "Authentication uses a session cookie and the website stores certain preferences in browser local storage. The technologies used and removal options are described in the Cookie Policy."
            ],
            "links": [
              {
                "label": "Cookie Policy",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Applicable law and updates",
            "paragraphs": [
              "Personal data processing is subject to Costa Rican Law No. 8968, its regulations, and other applicable provisions.",
              "If website functionality or processing practices change, this policy must be updated to reflect what is actually in use."
            ]
          }
        ]
      },
      "terms": {
        "title": "Terms and Conditions of Use",
        "intro": "",
        "sections": [
          {
            "title": "Website operator",
            "paragraphs": [
              "This website is operated under the trade name Castro Fallas by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located at Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio.",
              "For inquiries related to these Terms and Conditions, users may write to comercial@castrofallas.com or call +506 2272-6772."
            ]
          },
          {
            "title": "Purpose and scope",
            "paragraphs": [
              "These conditions govern access to and use of the pages, forms, and digital functions of the Castro Fallas website.",
              "They do not replace accepted quotations, contracts, or specific conditions agreed for transportation, logistics, or customs services."
            ]
          },
          {
            "title": "Use of the website",
            "paragraphs": [
              "Users must use website functions lawfully and provide truthful information when submitting requests.",
              "Unauthorized access to accounts or another person's information, interference with site operation, and submission of harmful content are prohibited."
            ]
          },
          {
            "title": "Account access",
            "paragraphs": [
              "Certain features, such as quotation requests and the tracking and itinerary services, require an authorized account.",
              "Sign-in uses a temporary verification code delivered to the email address associated with the account. Users must protect their access and report unauthorized use of which they become aware."
            ]
          },
          {
            "title": "Quotation requests",
            "paragraphs": [
              "The website allows users to submit quotations for transportation and logistics services through forms requesting contact and operation information.",
              "Submitting a request does not in itself mean accepting an offer, confirming a price, reserving transport capacity, or contracting a service.",
              "An operation's contractual terms are established in the corresponding proposal or agreement."
            ]
          },
          {
            "title": "Tracking, itineraries, and informational content",
            "paragraphs": [
              "Authorized users can access the tracking and itinerary information available through the website. The information depends on the records and sources consulted and does not replace the documents or confirmations applicable to each shipment.",
              "News, service descriptions, and virtual-assistant responses are for information purposes and are not accepted quotations or confirmations of an operation."
            ]
          },
          {
            "title": "Intellectual property",
            "paragraphs": [
              "Website materials, logos, images, text, and other elements are subject to the intellectual property rights of their respective owners. Publication does not authorize reproduction or commercial exploitation beyond what is permitted by law or applicable licenses.",
              "Notices regarding third-party components used on the website are available in Credits and Licenses."
            ],
            "links": [
              {
                "label": "Credits and Licenses",
                "href": "/licencias"
              }
            ]
          },
          {
            "title": "Liability and legal rights",
            "paragraphs": [
              "Information available through digital features must be interpreted according to its scope and the specific conditions of each operation.",
              "Nothing in these terms limits consumers' non-waivable rights or liabilities that applicable law does not permit to be excluded."
            ]
          },
          {
            "title": "Personal information",
            "paragraphs": [
              "The handling of information submitted through forms and other website functions is explained in the Privacy Policy. Cookies and browser preferences are described in the Cookie Policy."
            ],
            "links": [
              {
                "label": "Privacy Policy",
                "href": "/privacidad"
              },
              {
                "label": "Cookie Policy",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Amendments and applicable law",
            "paragraphs": [
              "Changes to these terms will be reflected on this page with an updated date. They will not retroactively change validly agreed obligations except where permitted by law.",
              "These terms are interpreted according to the laws of Costa Rica. Disputes shall be submitted to the competent authorities under applicable law."
            ]
          }
        ]
      },
      "cookies": {
        "title": "Cookie and Local Storage Policy",
        "intro": "",
        "sections": [
          {
            "title": "Operator and contact",
            "paragraphs": [
              "This website is operated by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located in Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio.",
              "For questions about this document, write to comercial@castrofallas.com or call +506 2272-6772."
            ]
          },
          {
            "title": "Sign-in cookie",
            "paragraphs": [
              "To maintain access for authenticated users, the website uses a first-party cookie named “cf_session”. Its purpose is to recognize authorized sessions and protect access to authenticated features.",
              "The cookie has a configured maximum lifetime of eight hours. It is marked HttpOnly and SameSite Strict; the Secure attribute is configured according to the server environment."
            ]
          },
          {
            "title": "Preferences stored in the browser",
            "paragraphs": [
              "The website uses browser local storage to remember the selected language and visual theme preference. This storage is not a cookie.",
              "These preferences remain in the browser until they are changed or the user deletes the stored data."
            ]
          },
          {
            "title": "Deleting the stored data",
            "paragraphs": [
              "Users can remove cookies and local storage through their browser's privacy settings.",
              "Deleting the session cookie requires signing in again. Deleting preferences causes the website to use its default settings."
            ]
          },
          {
            "title": "Personal information",
            "paragraphs": [
              "The session cookie and the related handling of access data are subject to applicable personal data protection rules.",
              "For details on rights and contact channels concerning personal information, consult the Privacy Policy."
            ],
            "links": [
              {
                "label": "Privacy Policy",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Updates",
            "paragraphs": [
              "This policy describes technologies identified in the website's current functions. It must be updated if the technologies actually used change."
            ]
          }
        ]
      },
      "licenses": {
        "title": "Credits and Licenses",
        "intro": "",
        "sections": [
          {
            "title": "Website operator",
            "paragraphs": [
              "The Castro Fallas website is operated by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767.",
              "For questions about this document, write to comercial@castrofallas.com or call +506 2272-6772."
            ]
          },
          {
            "title": "Content and distinctive signs",
            "paragraphs": [
              "The website contains text, photographs, designs, illustrations, trade names, and logos. Rights in these resources belong to their respective holders.",
              "Public availability of these materials on the website does not authorize reproduction or commercial use without permission, except where allowed by law."
            ]
          },
          {
            "title": "Interactive geographic globe",
            "paragraphs": [
              "The globe on the website uses d3-geo, topojson-client, and world-atlas. The applicable license notices and copyright acknowledgments are preserved.",
              "Geographic data used by world-atlas is derived from Natural Earth and remains subject to its own terms."
            ],
            "links": [
              {
                "label": "Globe third-party license notices",
                "href": "/licenses/globe-third-party-notices.txt"
              },
              {
                "label": "D3-Geo",
                "href": "https://github.com/d3/d3-geo"
              },
              {
                "label": "TopoJSON",
                "href": "https://github.com/topojson/topojson-client"
              },
              {
                "label": "World Atlas",
                "href": "https://github.com/topojson/world-atlas"
              },
              {
                "label": "Natural Earth",
                "href": "https://www.naturalearthdata.com/about/terms-of-use/"
              }
            ]
          },
          {
            "title": "Images and graphic resources",
            "paragraphs": [
              "Images and graphic resources displayed on the website are subject to the rights and use conditions established by their respective owners. Where a license requires attribution, the relevant acknowledgment must be preserved."
            ]
          },
          {
            "title": "Third-party use of materials",
            "paragraphs": [
              "Browsing the website does not grant exploitation rights in its text, designs, marks, or third-party resources. Any use beyond the limits permitted by law or the applicable license requires authorization from the relevant rights holder."
            ]
          },
          {
            "title": "Copyright inquiries",
            "paragraphs": [
              "For inquiries or complaints regarding website content, email comercial@castrofallas.com or call +506 2272-6772. The communication should identify the material and the right allegedly affected."
            ]
          },
          {
            "title": "Applicable law",
            "paragraphs": [
              "Protection of the website's content is governed by Costa Rican intellectual property law and applicable international instruments."
            ]
          }
        ]
      }
    }
}
const content = computed(() => documents[locale.value === 'en' ? 'en' : 'es'][documentType.value])
</script>

<template>
  <div class="app-site legal-page">
    <SiteHeader />
    <main class="legal-main">
      <div class="container legal-container">
        <a class="legal-back" href="/home"><IconSymbol glyph="←" /> {{ locale === 'en' ? 'Back to home' : 'Volver al inicio' }}</a>
        <header class="legal-header">
          <p class="section-tag">{{ locale === 'en' ? 'CASTRO FALLAS · LEGAL' : 'CASTRO FALLAS · LEGAL' }}</p>
          <h1>{{ content.title }}<span>.</span></h1>
          <p class="legal-intro">{{ content.intro }}</p>
        </header>
        <article class="legal-sections">
          <section v-for="(section, index) in content.sections" :key="section.title" class="legal-section">
            <span class="legal-section-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <div><h2>{{ section.title }}</h2>
              <p v-for="paragraph in section.paragraphs || []" :key="paragraph">{{ paragraph }}</p>
              <ul v-if="section.bullets"><li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li></ul>
              <ul v-if="section.links" class="legal-reference-links"><li v-for="link in section.links" :key="link.href"><a :href="link.href" target="_blank" rel="noopener noreferrer">{{ link.label }} <IconSymbol glyph="↗" /></a></li></ul>
            </div>
          </section>
        </article>
      </div>
    </main>
    <SiteFooter />
  </div>
</template>
