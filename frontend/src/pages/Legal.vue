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
        "intro": "Última actualización: 27 de octubre de 2026. Consultas: comercial@castrofallas.com · Teléfono: +506 2272-6772.",
        "sections": [
          {
            "title": "Responsable del tratamiento",
            "paragraphs": [
              "Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio, en adelante denominada «Castro Fallas», es responsable del tratamiento de los datos personales que reciba y administre a través del presente sitio web, en los términos establecidos por la legislación aplicable.",
              "Los titulares podrán presentar consultas o solicitudes relacionadas con sus datos personales mediante los canales de contacto oficiales de la empresa.",
              "Contacto para solicitudes de privacidad: comercial@castrofallas.com; teléfono +506 2272-6772. El titular podrá ejercer sus derechos por estos medios, sin perjuicio de otros canales habilitados."
            ],
            "links": [
              {
                "label": "Correo electrónico: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Teléfono: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Normativa aplicable",
            "paragraphs": [
              "El tratamiento de datos personales se realizará conforme a la Ley N.º 8968, Ley de Protección de la Persona frente al Tratamiento de sus Datos Personales, su Reglamento y demás disposiciones que resulten aplicables en Costa Rica.",
              "Castro Fallas reconoce el derecho a la autodeterminación informativa y se compromete a tratar los datos personales de manera lícita, leal y acorde con las finalidades legítimas e informadas de su recopilación."
            ]
          },
          {
            "title": "Datos personales objeto de tratamiento",
            "paragraphs": [
              "Según las funcionalidades utilizadas y la naturaleza de la relación con el titular, Castro Fallas podrá tratar las siguientes categorías de datos:"
            ],
            "bullets": [
              "Datos de identificación: nombre, apellidos e identificación, cuando resulte necesaria.",
              "Datos de contacto: correo electrónico, número telefónico, dirección y otros medios facilitados voluntariamente.",
              "Datos comerciales y operativos: información incorporada a consultas, solicitudes de cotización, documentos y comunicaciones relacionadas con servicios aduaneros o logísticos.",
              "Datos de cuenta: información asociada al registro, perfil y autenticación de usuarios.",
              "Datos técnicos: dirección IP, registros de acceso e información necesaria para la seguridad y funcionamiento del sitio, cuando estos sean recopilados.",
              "La recopilación se limitará a los datos adecuados, pertinentes y necesarios para cada finalidad. No se solicitarán datos sensibles mediante formularios generales, salvo finalidad legítima, justificación legal y cumplimiento de los requisitos específicos aplicables."
            ]
          },
          {
            "title": "Finalidades del tratamiento",
            "paragraphs": [
              "Los datos personales podrán ser tratados para las siguientes finalidades, según corresponda:",
              "Estas finalidades se aplican según la relación concreta: un visitante que consulta el sitio, una persona que solicita una cotización, un usuario con cuenta de seguimiento de carga o un representante de cliente o proveedor no necesariamente proporcionan las mismas categorías de datos."
            ],
            "bullets": [
              "Atender consultas, solicitudes de información y comunicaciones remitidas mediante el sitio web.",
              "Preparar, gestionar y dar seguimiento a solicitudes de cotización y propuestas comerciales.",
              "Gestionar relaciones contractuales y la prestación de servicios solicitados.",
              "Administrar cuentas, verificar accesos y proteger la seguridad de la plataforma.",
              "Atender requerimientos legales, administrativos o de autoridades competentes.",
              "Mantener registros necesarios para la trazabilidad y atención de operaciones legítimas.",
              "Realizar comunicaciones comerciales únicamente cuando exista una base legal que lo permita y se respeten los mecanismos de oposición o retiro del consentimiento correspondientes.",
              "No utilizar los datos para finalidades incompatibles con las informadas, salvo habilitación legal válida o consentimiento requerido."
            ]
          },
          {
            "title": "Obtención de los datos",
            "paragraphs": [
              "Los datos personales podrán obtenerse directamente de los titulares a través de formularios, comunicaciones electrónicas, solicitudes de cotización, procesos de registro o documentación entregada para la prestación de servicios.",
              "Cuando resulte legalmente procedente, también podrán recibirse datos de representantes, clientes, proveedores u otros terceros legítimamente autorizados.",
              "Castro Fallas procurará informar al titular sobre las finalidades y condiciones del tratamiento en el momento de su recopilación.",
              "En las cotizaciones y operaciones de transporte, los datos podrán comprender la identificación del contacto, origen y destino, datos de la mercancía, fechas, documentos de embarque y referencias operativas que el usuario suministre. En el seguimiento de carga, la información se utilizará según los permisos de acceso y las necesidades legítimas de la operación."
            ]
          },
          {
            "title": "Consentimiento y legitimación",
            "paragraphs": [
              "Cuando la legislación exija consentimiento, este será solicitado de manera libre, expresa, específica e informada, conforme a los requisitos legales aplicables.",
              "En los supuestos permitidos por el ordenamiento jurídico, el tratamiento también podrá sustentarse en obligaciones legales u otras habilitaciones expresamente reconocidas.",
              "El consentimiento podrá ser revocado mediante los mecanismos legalmente procedentes, sin perjuicio de las obligaciones que autoricen o exijan la conservación o tratamiento de determinados datos."
            ]
          },
          {
            "title": "Comunicación de datos a terceros",
            "paragraphs": [
              "Los datos personales podrán ser tratados por proveedores tecnológicos o prestadores de servicios que colaboren legítimamente con Castro Fallas, en la medida necesaria para ejecutar las finalidades informadas.",
              "Cuando corresponda a una operación concreta, determinados datos podrán comunicarse a transportistas, agentes, operadores logísticos u otras entidades vinculadas con la gestión del servicio solicitado, siempre que exista habilitación legal válida y se cumplan los requisitos correspondientes.",
              "Castro Fallas exigirá a los encargados del tratamiento las condiciones de confidencialidad, seguridad y uso limitado que correspondan.",
              "No se comercializarán bases de datos personales con terceros sin contar con la habilitación legal pertinente."
            ]
          },
          {
            "title": "Transferencias internacionales",
            "paragraphs": [
              "Cuando la prestación del servicio o la utilización de proveedores tecnológicos implique transferencias internacionales de datos personales, Castro Fallas deberá verificar y cumplir los requisitos establecidos por la legislación costarricense.",
              "Las transferencias se limitarán a los datos necesarios para las finalidades legítimas correspondientes y estarán sujetas a las autorizaciones, deberes de información y garantías exigibles en cada caso."
            ]
          },
          {
            "title": "Conservación de datos",
            "paragraphs": [
              "Los datos personales se conservarán durante el tiempo necesario para cumplir las finalidades que motivaron su recopilación y los plazos exigidos o permitidos por la normativa aplicable.",
              "Para determinar el período de conservación se considerarán la finalidad del tratamiento, la relación contractual existente, las obligaciones legales y la necesidad legítima de atender reclamaciones o ejercer derechos.",
              "Cumplidas dichas condiciones, los datos serán eliminados, anonimizados o sujetos al tratamiento que legalmente corresponda."
            ]
          },
          {
            "title": "Seguridad y confidencialidad",
            "paragraphs": [
              "Castro Fallas adoptará medidas técnicas y organizativas razonables para proteger los datos personales frente al acceso no autorizado, pérdida, alteración, divulgación indebida o destrucción.",
              "El acceso a la información será limitado según las funciones y responsabilidades de las personas autorizadas.",
              "La empresa adoptará las medidas legalmente exigibles cuando se identifiquen incidentes que comprometan la seguridad de los datos personales."
            ]
          },
          {
            "title": "Derechos de los titulares",
            "paragraphs": [
              "Los titulares podrán ejercer los derechos reconocidos por la legislación costarricense, incluidos, según proceda, el acceso, la rectificación, la actualización, la supresión de datos y los demás mecanismos de tutela de su autodeterminación informativa.",
              "Las solicitudes deberán permitir la identificación razonable del titular y señalar el derecho que se pretende ejercer.",
              "Castro Fallas atenderá las solicitudes dentro de los plazos y condiciones previstos por la normativa aplicable.",
              "Cuando la empresa no pueda acceder a una solicitud por existir una obligación legal de conservación u otra causa legítima, comunicará los motivos correspondientes.",
              "Las solicitudes de acceso, rectificación o supresión de datos personales deberán resolverse gratuitamente en un plazo de cinco días hábiles a partir de su recepción, conforme al artículo 7 de la Ley N.º 8968 y las reglas reglamentarias aplicables, sin perjuicio de los supuestos en que proceda requerir información adicional."
            ]
          },
          {
            "title": "Ejercicio de derechos y reclamaciones",
            "paragraphs": [
              "Las consultas y solicitudes relacionadas con el tratamiento de datos personales podrán dirigirse a Castro Fallas mediante sus canales oficiales de contacto.",
              "Sin perjuicio de los mecanismos de atención de la empresa, los titulares podrán acudir ante la Agencia de Protección de Datos de los Habitantes (PRODHAB) cuando consideren vulnerados sus derechos y resulte procedente conforme a la legislación aplicable.",
              "Para facilitar la identificación y respuesta, la solicitud podrá indicar el nombre del titular, un medio de respuesta, los datos objeto de la gestión y una descripción del derecho ejercido. Solo se solicitará la información adicional que resulte necesaria para verificar su identidad y tramitar la gestión."
            ]
          },
          {
            "title": "Cookies y tecnologías similares",
            "paragraphs": [
              "El sitio web podrá utilizar cookies u otros mecanismos técnicos para facilitar su funcionamiento, mantener sesiones o recordar determinadas preferencias.",
              "La información específica sobre estas tecnologías, sus finalidades y los mecanismos disponibles para administrarlas se desarrolla en la Política de Cookies."
            ],
            "links": [
              {
                "label": "Consultar Política de Cookies",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Modificaciones de la política",
            "paragraphs": [
              "Castro Fallas podrá actualizar esta Política de Privacidad cuando sea necesario por modificaciones normativas, cambios en las finalidades o medios del tratamiento o ajustes en sus operaciones.",
              "Las modificaciones se publicarán en el sitio web con indicación de su fecha de actualización.",
              "Cuando los cambios requieran una nueva comunicación al titular o la obtención de consentimiento, se procederá conforme a la legislación aplicable."
            ]
          }
        ]
      },
      "terms": {
        "title": "Términos y condiciones de uso",
        "intro": "Última actualización: 27 de octubre de 2026. Consultas: comercial@castrofallas.com · Teléfono: +506 2272-6772.",
        "sections": [
          {
            "title": "Identificación del titular",
            "paragraphs": [
              "El presente sitio web es operado bajo el nombre comercial Castro Fallas, por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio, en adelante denominada «Castro Fallas».",
              "Para consultas relacionadas con estos Términos y Condiciones, los usuarios podrán utilizar los medios de contacto oficiales publicados en el sitio web.",
              "Para ejercer derechos o presentar consultas relacionadas con estos términos, el usuario podrá escribir a comercial@castrofallas.com o llamar al +506 2272-6772, sin perjuicio de los demás canales oficiales publicados por la empresa."
            ],
            "links": [
              {
                "label": "Correo electrónico: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Teléfono: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Objeto y ámbito de aplicación",
            "paragraphs": [
              "Los presentes Términos y Condiciones regulan el acceso, navegación y utilización del sitio web de Castro Fallas, así como de sus contenidos, formularios y funcionalidades digitales.",
              "El acceso y uso del sitio supone el conocimiento de estas condiciones, sin perjuicio de los derechos irrenunciables reconocidos por la legislación aplicable.",
              "Estos Términos y Condiciones no sustituyen las estipulaciones particulares que regulen la contratación de servicios aduaneros, logísticos o de transporte internacional."
            ]
          },
          {
            "title": "Condiciones de acceso y uso",
            "paragraphs": [
              "El usuario se compromete a utilizar el sitio web de manera lícita, de buena fe y con respeto a los derechos de terceros.",
              "Se prohíbe utilizar el sitio para realizar actividades fraudulentas, suministrar información deliberadamente falsa, acceder sin autorización a sistemas o cuentas, interferir con el funcionamiento de la plataforma o introducir programas informáticos destinados a comprometer su seguridad.",
              "Castro Fallas podrá adoptar medidas razonables y proporcionales para prevenir el uso indebido del sitio, de conformidad con la normativa aplicable."
            ]
          },
          {
            "title": "Cuentas de usuario",
            "paragraphs": [
              "Cuando determinadas funcionalidades requieran registro o autenticación, el usuario será responsable de proporcionar información veraz y mantener la confidencialidad de sus credenciales.",
              "El usuario deberá comunicar oportunamente cualquier acceso no autorizado del que tenga conocimiento.",
              "Castro Fallas podrá restringir el acceso a cuentas cuando existan motivos razonables relacionados con la seguridad, el fraude o el incumplimiento de estas condiciones, respetando las disposiciones legales aplicables.",
              "Quien utilice una cuenta en representación de una empresa deberá contar con las facultades necesarias para actuar en su nombre. El acceso digital no autoriza, por sí mismo, la contratación de servicios ni sustituye las autorizaciones requeridas para cada operación."
            ]
          },
          {
            "title": "Solicitudes de cotización",
            "paragraphs": [
              "Los formularios de cotización disponibles en el sitio web permiten solicitar información y propuestas relacionadas con los servicios ofrecidos por Castro Fallas.",
              "La presentación de una solicitud no constituye, por sí misma, aceptación contractual, reserva de espacio, confirmación de transporte ni obligación de prestación del servicio.",
              "Las cotizaciones emitidas por Castro Fallas estarán sujetas a su vigencia, alcance, condiciones comerciales, disponibilidad y demás estipulaciones expresamente comunicadas.",
              "La contratación de un servicio requerirá el cumplimiento de las condiciones particulares aplicables y la aceptación correspondiente.",
              "Las condiciones de transporte, despacho aduanero, almacenamiento, seguros, impuestos, recargos, reclamaciones y demás aspectos de cada servicio, cuando correspondan, se regirán por la propuesta aceptada y por los documentos contractuales aplicables, no únicamente por estas condiciones de uso del sitio."
            ]
          },
          {
            "title": "Información del sitio web",
            "paragraphs": [
              "Castro Fallas procurará mantener información clara y actualizada sobre sus servicios y funcionalidades.",
              "Las referencias generales a rutas, itinerarios, disponibilidad, tarifas y tiempos estimados de tránsito tendrán carácter informativo, salvo que formen parte de una obligación contractual expresamente asumida.",
              "La información publicada no reemplaza la confirmación de las condiciones particulares de cada operación."
            ]
          },
          {
            "title": "Responsabilidad",
            "paragraphs": [
              "La responsabilidad de Castro Fallas respecto del uso del sitio web y de los servicios contratados se determinará conforme a la legislación aplicable y a las obligaciones contractuales válidamente asumidas.",
              "Castro Fallas no responderá por interrupciones o daños imputables exclusivamente a causas ajenas a su control, sin perjuicio de las obligaciones legales que le correspondan.",
              "Ninguna disposición de este documento podrá interpretarse como una exclusión de responsabilidad por dolo, culpa grave u otros supuestos respecto de los cuales la legislación prohíba limitar o excluir responsabilidad.",
              "Tampoco podrá interpretarse como una renuncia a los derechos irrenunciables reconocidos a las personas consumidoras."
            ]
          },
          {
            "title": "Propiedad intelectual",
            "paragraphs": [
              "Los textos, diseños, fotografías, signos distintivos, logotipos y demás elementos del sitio web están protegidos por la normativa aplicable sobre propiedad intelectual.",
              "Su titularidad corresponderá a Castro Fallas o a los respectivos titulares de derechos, según corresponda.",
              "Se prohíbe su reproducción, distribución, modificación o utilización comercial sin autorización, excepto en los casos permitidos por la legislación vigente o las licencias correspondientes."
            ]
          },
          {
            "title": "Enlaces y servicios de terceros",
            "paragraphs": [
              "El sitio web podrá contener enlaces o funcionalidades proporcionadas por terceros.",
              "El acceso a plataformas externas se sujetará a las condiciones y políticas de sus respectivos titulares.",
              "Castro Fallas no asumirá obligaciones derivadas de relaciones independientes entre el usuario y dichos terceros, salvo disposición legal o contractual en contrario."
            ]
          },
          {
            "title": "Protección de datos personales",
            "paragraphs": [
              "El tratamiento de datos personales realizado mediante el sitio web se sujetará a la Ley N.º 8968, Ley de Protección de la Persona frente al Tratamiento de sus Datos Personales, su Reglamento y demás disposiciones aplicables.",
              "La información relativa a las finalidades del tratamiento, los derechos de los titulares y los mecanismos para ejercerlos se encuentra desarrollada en la Política de Privacidad del sitio web."
            ],
            "links": [
              {
                "label": "Consultar Política de Privacidad",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Modificaciones",
            "paragraphs": [
              "Castro Fallas podrá actualizar estos Términos y Condiciones para atender modificaciones normativas, cambios en las funcionalidades del sitio o necesidades legítimas relacionadas con su operación.",
              "Las modificaciones se publicarán en esta sección con indicación de la fecha de actualización.",
              "Las modificaciones no alterarán retroactivamente las obligaciones contractuales previamente adquiridas, salvo acuerdo válido entre las partes o disposición legal aplicable."
            ]
          },
          {
            "title": "Legislación aplicable y resolución de controversias",
            "paragraphs": [
              "Los presentes Términos y Condiciones se interpretarán de conformidad con las leyes de la República de Costa Rica.",
              "Las controversias derivadas de su interpretación o aplicación se someterán a las autoridades judiciales o administrativas competentes y a los mecanismos de resolución de conflictos legalmente procedentes.",
              "Lo anterior se entiende sin perjuicio de las normas imperativas de protección al consumidor, competencia y jurisdicción que resulten aplicables."
            ]
          }
        ]
      },
      "cookies": {
        "title": "Política de cookies",
        "intro": "Última actualización: 27 de octubre de 2026. Consultas: comercial@castrofallas.com · Teléfono: +506 2272-6772.",
        "sections": [
          {
            "title": "Objeto",
            "paragraphs": [
              "La presente Política de Cookies establece las condiciones generales relativas al uso de cookies y tecnologías similares en el sitio web de Castro Fallas, operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio.",
              "Su finalidad es informar a los usuarios sobre la utilización de estas tecnologías, las categorías que pueden emplearse y los mecanismos disponibles para administrar sus preferencias.",
              "Para consultas relacionadas con esta política, el usuario podrá comunicarse al correo electrónico comercial@castrofallas.com o al teléfono +506 2272-6772."
            ],
            "links": [
              {
                "label": "Correo electrónico: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Teléfono: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Definición de cookies",
            "paragraphs": [
              "Las cookies son archivos de información que un sitio web puede almacenar en el dispositivo del usuario mediante su navegador.",
              "Estas tecnologías pueden permitir el funcionamiento de determinadas herramientas, la conservación de sesiones y preferencias o, cuando se hayan implementado, la obtención de información estadística sobre la utilización del sitio.",
              "El sitio también podrá emplear mecanismos técnicos equivalentes, tales como almacenamiento local del navegador, cuando resulten necesarios para sus funcionalidades."
            ]
          },
          {
            "title": "Categorías de cookies",
            "paragraphs": [
              "Para mantener las sesiones de usuarios autenticados, el sitio utiliza la cookie propia «cf_session», con una duración máxima de ocho horas y mecanismos de protección frente al acceso no autorizado. Las preferencias de idioma pueden almacenarse localmente en el navegador, mediante un mecanismo distinto de las cookies.",
              "Cookies estrictamente necesarias: permiten el funcionamiento técnico y seguro del sitio web, incluyendo, cuando corresponda, la gestión de sesiones, autenticación y protección de funcionalidades. Su utilización se limitará a las necesidades legítimas de funcionamiento y seguridad.",
              "Cookies de preferencias: permiten conservar determinadas opciones del usuario, como el idioma o las preferencias de visualización, cuando dichas funcionalidades estén implementadas.",
              "Cookies analíticas: cuando sean utilizadas, permiten obtener información estadística sobre la navegación y utilización del sitio web. Su implementación y tratamiento estarán sujetos a las obligaciones de información y consentimiento aplicables.",
              "Cookies de terceros: determinados servicios integrados podrán requerir tecnologías gestionadas por terceros. Su utilización estará sujeta a las condiciones correspondientes y a las obligaciones legales aplicables al tratamiento de datos personales."
            ]
          },
          {
            "title": "Finalidades de utilización",
            "paragraphs": [
              "Las cookies y tecnologías similares que efectivamente se implementen se utilizarán exclusivamente para las finalidades informadas al usuario.",
              "La cookie de sesión permite reconocer al usuario autenticado y proteger el acceso a funciones privadas; el almacenamiento local permite recordar preferencias del navegador. Las cookies analíticas o publicitarias, si fueran incorporadas, deberán identificarse y utilizarse conforme a las obligaciones legales de información y consentimiento aplicables."
            ],
            "bullets": [
              "Garantizar el funcionamiento y la seguridad del sitio.",
              "Mantener sesiones y facilitar el acceso a funcionalidades autorizadas.",
              "Conservar las preferencias seleccionadas por el usuario.",
              "Obtener estadísticas de navegación, cuando se hayan habilitado herramientas destinadas a ello y se cumplan los requisitos legales correspondientes.",
              "Los datos obtenidos no deberán destinarse a finalidades incompatibles con las informadas, salvo habilitación legal válida o consentimiento correspondiente."
            ]
          },
          {
            "title": "Duración",
            "paragraphs": [
              "Las cookies pueden ser de sesión o persistentes.",
              "Las cookies de sesión se utilizan durante la navegación y dejan de estar disponibles conforme a las condiciones de cierre o expiración correspondientes.",
              "Las cookies persistentes permanecen almacenadas por el período establecido para su finalidad o hasta que el usuario las elimine.",
              "El plazo concreto de conservación dependerá de las tecnologías efectivamente utilizadas y de su configuración.",
              "La cookie técnica «cf_session» tiene una duración máxima de ocho horas. Los datos de preferencias guardados en almacenamiento local pueden permanecer hasta que el usuario los elimine o modifique la configuración correspondiente."
            ]
          },
          {
            "title": "Consentimiento y administración de preferencias",
            "paragraphs": [
              "Cuando el uso de cookies o tecnologías similares implique un tratamiento de datos personales sujeto a consentimiento, Castro Fallas solicitará la autorización correspondiente conforme a la legislación aplicable.",
              "El usuario podrá administrar las preferencias que la plataforma ponga a su disposición y modificar o retirar el consentimiento cuando legalmente proceda.",
              "La desactivación de determinados mecanismos estrictamente necesarios puede afectar el funcionamiento de funcionalidades esenciales del sitio web.",
              "La existencia de esta política no sustituye un mecanismo de consentimiento cuando legalmente resulte necesario. Si se incorporan cookies no esenciales sujetas a consentimiento, deberán identificarse y gestionarse antes de su utilización conforme a la normativa aplicable."
            ]
          },
          {
            "title": "Configuración del navegador",
            "paragraphs": [
              "El usuario podrá configurar su navegador para restringir, bloquear o eliminar cookies y otros datos almacenados localmente.",
              "Las opciones disponibles dependerán del navegador y dispositivo utilizados.",
              "La eliminación de cookies puede producir el cierre de sesiones o la pérdida de preferencias previamente guardadas."
            ]
          },
          {
            "title": "Datos personales",
            "paragraphs": [
              "Cuando las cookies u otras tecnologías permitan identificar directa o indirectamente a una persona, su tratamiento se realizará de conformidad con la Ley N.º 8968, Ley de Protección de la Persona frente al Tratamiento de sus Datos Personales, su Reglamento y demás disposiciones aplicables.",
              "La información sobre los derechos de los titulares y el tratamiento de sus datos se desarrolla en la Política de Privacidad."
            ],
            "links": [
              {
                "label": "Consultar Política de Privacidad",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Servicios de terceros",
            "paragraphs": [
              "Cuando el sitio utilice tecnologías suministradas por terceros, Castro Fallas deberá informar sobre aquellas cuya identificación resulte legalmente exigible, así como sobre sus finalidades y condiciones relevantes.",
              "La utilización de dichos mecanismos se sujetará a las garantías y obligaciones de protección de datos personales aplicables."
            ]
          },
          {
            "title": "Modificaciones",
            "paragraphs": [
              "Castro Fallas podrá actualizar esta Política de Cookies debido a modificaciones normativas, cambios en las tecnologías implementadas o ajustes en las funcionalidades del sitio web.",
              "Las actualizaciones serán publicadas en esta sección con indicación de su fecha correspondiente.",
              "Cuando sea necesario informar nuevamente al usuario u obtener un nuevo consentimiento, se procederá conforme a la legislación aplicable."
            ]
          }
        ]
      },
      "licenses": {
        "title": "Créditos y licencias",
        "intro": "Última actualización: 27 de octubre de 2026. Consultas: comercial@castrofallas.com · Teléfono: +506 2272-6772.",
        "sections": [
          {
            "title": "Titular del sitio web",
            "paragraphs": [
              "El presente sitio web es operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, bajo el nombre comercial Castro Fallas.",
              "Los derechos de propiedad intelectual sobre los elementos que integran el sitio corresponderán a sus respectivos titulares, conforme a las disposiciones legales y contractuales aplicables.",
              "Para consultas relacionadas con esta política, el usuario podrá comunicarse al correo electrónico comercial@castrofallas.com o al teléfono +506 2272-6772."
            ],
            "links": [
              {
                "label": "Correo electrónico: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Teléfono: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Propiedad intelectual del contenido",
            "paragraphs": [
              "Los textos, elementos gráficos, fotografías, ilustraciones, diseños, logotipos, signos distintivos y demás contenidos originales del sitio web están protegidos por la legislación costarricense aplicable en materia de propiedad intelectual.",
              "La publicación de estos elementos no implica la concesión de una licencia general para su explotación por terceros.",
              "Salvo autorización expresa o disposición legal aplicable, queda prohibida su reproducción, distribución, transformación o utilización comercial no autorizada."
            ]
          },
          {
            "title": "Marcas y signos distintivos",
            "paragraphs": [
              "Las marcas, nombres comerciales, logotipos y demás signos distintivos que aparezcan en el sitio web pertenecen a sus respectivos titulares.",
              "Su inclusión no implica cesión de titularidad, autorización general de uso ni la existencia de una relación comercial o contractual distinta de la que corresponda en cada caso.",
              "Los signos distintivos de terceros se utilizarán con respeto a los derechos de sus titulares."
            ]
          },
          {
            "title": "Material gráfico y audiovisual",
            "paragraphs": [
              "Las fotografías, videos, ilustraciones y otros recursos audiovisuales publicados en el sitio web podrán corresponder a materiales propios, recursos utilizados bajo licencia o contenidos cuyo uso haya sido autorizado por sus titulares.",
              "Cada recurso estará sujeto a las condiciones de utilización establecidas en su respectiva licencia o autorización.",
              "Cuando la licencia exija reconocimiento de autoría, identificación de origen u otras menciones, estas deberán incorporarse conforme a sus condiciones."
            ]
          },
          {
            "title": "Software y componentes de terceros",
            "paragraphs": [
              "El sitio web podrá utilizar programas, bibliotecas, componentes o herramientas desarrolladas por terceros y distribuidas bajo licencias de software libre, de código abierto o comerciales.",
              "Los derechos sobre dichos componentes permanecerán en sus respectivos titulares.",
              "Su utilización se regirá por las condiciones de cada licencia, incluidas las obligaciones de atribución, conservación de avisos legales, distribución o disponibilidad de información cuando resulten aplicables.",
              "Las licencias de terceros no alterarán por sí mismas la titularidad de los contenidos originales de Castro Fallas.",
              "En relación con el globo geográfico, el proyecto utiliza d3-geo, topojson-client y world-atlas. Sus licencias y los avisos de atribución aplicables deben conservarse y mantenerse disponibles; los datos geográficos procedentes de Natural Earth conservan sus propias condiciones."
            ]
          },
          {
            "title": "Recursos y servicios externos",
            "paragraphs": [
              "Los recursos externos utilizados en el sitio web, incluidos los servicios de terceros, tipografías, iconos u otros elementos protegidos, conservarán las condiciones legales establecidas por sus respectivos titulares.",
              "Castro Fallas respetará las obligaciones de identificación y reconocimiento que resulten exigibles conforme a las licencias aplicables."
            ]
          },
          {
            "title": "Utilización de contenidos por terceros",
            "paragraphs": [
              "La consulta y navegación del sitio web no otorgan al usuario derechos de explotación sobre sus contenidos, marcas o elementos protegidos.",
              "Cualquier utilización que exceda los usos legalmente permitidos deberá contar con la autorización del titular correspondiente.",
              "Las solicitudes relacionadas con utilización de contenidos podrán presentarse mediante los canales oficiales de contacto de Castro Fallas."
            ]
          },
          {
            "title": "Derechos de terceros y reclamaciones",
            "paragraphs": [
              "Los titulares que consideren que algún contenido publicado vulnera sus derechos de propiedad intelectual podrán comunicarlo a Castro Fallas mediante sus canales oficiales.",
              "La solicitud deberá identificar razonablemente el material y el derecho presuntamente afectado.",
              "Castro Fallas evaluará las comunicaciones recibidas y adoptará las medidas que correspondan conforme a la legislación aplicable."
            ]
          },
          {
            "title": "Legislación aplicable",
            "paragraphs": [
              "Los derechos de propiedad intelectual relacionados con el sitio web se regirán por la legislación vigente de la República de Costa Rica y por los instrumentos internacionales que resulten aplicables.",
              "Cualquier controversia será sometida a las autoridades competentes conforme al ordenamiento jurídico correspondiente."
            ]
          },
          {
            "title": "Avisos de licencias de terceros",
            "paragraphs": [
              "Los componentes cartográficos de terceros utilizados en el sitio, incluidos d3-geo, topojson-client y world-atlas, conservan sus avisos de licencia y derechos de autor. Los datos geográficos de Natural Earth mantienen sus propias condiciones de uso. Estas referencias se incluyen para facilitar el cumplimiento de las atribuciones aplicables."
            ],
            "links": [
              {
                "label": "Avisos de licencias del globo",
                "href": "/licenses/globe-third-party-notices.txt"
              },
              {
                "label": "Licencia y código de D3-Geo",
                "href": "https://github.com/d3/d3-geo"
              },
              {
                "label": "Licencia y código de TopoJSON",
                "href": "https://github.com/topojson/topojson-client"
              },
              {
                "label": "Datos de World Atlas",
                "href": "https://github.com/topojson/world-atlas"
              },
              {
                "label": "Condiciones de Natural Earth",
                "href": "https://www.naturalearthdata.com/about/terms-of-use/"
              }
            ]
          }
        ]
      }
    },
  en: {
      "privacy": {
        "title": "Privacy Policy",
        "intro": "Last updated: October 27, 2026. Inquiries: comercial@castrofallas.com · Phone: +506 2272-6772.",
        "sections": [
          {
            "title": "Data controller",
            "paragraphs": [
              "Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located at Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio, hereinafter “Castro Fallas”, is responsible for processing the personal data it receives and manages through this website, as provided by applicable law.",
              "Data subjects may submit inquiries or requests regarding their personal information through the company's official contact channels.",
              "Contact for privacy requests: comercial@castrofallas.com; telephone +506 2272-6772. Individuals may use these contact details to exercise their rights, without prejudice to other available channels."
            ],
            "links": [
              {
                "label": "Email: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Phone: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Applicable legislation",
            "paragraphs": [
              "Personal data will be processed in accordance with Costa Rica's Law No. 8968, the Law on Protection of Persons Regarding the Processing of Their Personal Data, its regulations, and any other applicable provisions.",
              "Castro Fallas recognizes the right to informational self-determination and commits to lawful, fair processing consistent with the legitimate, disclosed purposes of collection."
            ]
          },
          {
            "title": "Categories of personal data",
            "paragraphs": [
              "Depending on the website functions used and the relationship with the data subject, Castro Fallas may process the following categories:"
            ],
            "bullets": [
              "Identification information: first name, surname, and identification details when necessary.",
              "Contact information: email address, telephone number, mailing address, and other contact details voluntarily provided.",
              "Commercial and operational information: details included in inquiries, quotations, documents, and communications concerning customs or logistics services.",
              "Account information: details associated with registration, user profiles, and authentication.",
              "Technical information: IP address, access logs, and information required for website security and operation, when collected.",
              "Collection shall be limited to information that is adequate, relevant, and necessary for each purpose. Sensitive information will not be requested through general forms unless justified by a legitimate purpose and lawful basis and subject to the applicable specific safeguards."
            ]
          },
          {
            "title": "Purposes of processing",
            "paragraphs": [
              "Personal data may be processed for the following purposes, as applicable:",
              "These purposes depend on the actual relationship: a website visitor, an individual requesting a quotation, a registered cargo-tracking user, and a representative of a customer or supplier do not necessarily provide the same categories of personal information."
            ],
            "bullets": [
              "Responding to inquiries, information requests, and communications submitted through the website.",
              "Preparing, managing, and following up on quotation requests and commercial proposals.",
              "Managing contractual relationships and providing requested services.",
              "Managing accounts, verifying access, and protecting platform security.",
              "Responding to legal or administrative requirements and requests from competent authorities.",
              "Maintaining records required for traceability and legitimate operations.",
              "Sending commercial communications only when a lawful basis exists and applicable objection or consent-withdrawal mechanisms are respected.",
              "Data shall not be used for purposes incompatible with those disclosed unless a valid legal authorization or required consent exists."
            ]
          },
          {
            "title": "Collection of personal data",
            "paragraphs": [
              "Personal data may be collected directly from individuals through forms, electronic messages, quotation requests, registration procedures, or documents submitted for service provision.",
              "Where legally permitted, information may also be obtained from representatives, customers, suppliers, or other duly authorized third parties.",
              "Castro Fallas will endeavor to inform individuals of the purposes and conditions of processing at the time of collection.",
              "For quotations and transport operations, relevant information may include contact identification, origin and destination, cargo details, dates, shipping documents, and operational references submitted by the user. Cargo-tracking information will be used in accordance with access permissions and the operation's legitimate needs."
            ]
          },
          {
            "title": "Consent and legal grounds",
            "paragraphs": [
              "Where consent is required by law, it will be requested freely, expressly, specifically, and on an informed basis, in accordance with the applicable legal requirements.",
              "Processing may also be based on legal obligations or other expressly recognized legal grounds where permitted by law.",
              "Consent may be withdrawn through legally available procedures, without prejudice to obligations that authorize or require the retention or processing of particular information."
            ]
          },
          {
            "title": "Disclosure to third parties",
            "paragraphs": [
              "Personal information may be processed by technology providers or service providers lawfully assisting Castro Fallas, only to the extent necessary for the disclosed purposes.",
              "For a specific operation, relevant information may be disclosed to carriers, agents, logistics operators, and other parties involved in the requested service, provided that a valid legal basis exists and applicable requirements are met.",
              "Castro Fallas will require appropriate confidentiality, security, and purpose-limitation safeguards from its processors.",
              "Personal databases will not be sold to third parties without an appropriate lawful authorization."
            ]
          },
          {
            "title": "International transfers",
            "paragraphs": [
              "Where service provision or technology providers involve international transfers of personal information, Castro Fallas must verify and comply with the requirements of Costa Rican law.",
              "Such transfers will be limited to information needed for legitimate purposes and subject to the applicable authorizations, notices, and safeguards."
            ]
          },
          {
            "title": "Data retention",
            "paragraphs": [
              "Personal information will be retained for as long as necessary for its original purposes and for periods required or permitted by applicable law.",
              "Retention periods will take into account the purpose of processing, the contractual relationship, legal obligations, and legitimate needs to handle claims or exercise rights.",
              "Once those requirements are satisfied, the information will be deleted, anonymized, or otherwise handled as legally appropriate."
            ]
          },
          {
            "title": "Security and confidentiality",
            "paragraphs": [
              "Castro Fallas will take reasonable technical and organizational measures to protect personal information against unauthorized access, loss, alteration, improper disclosure, or destruction.",
              "Access will be limited according to the responsibilities of authorized personnel.",
              "The company will take legally required action if incidents compromising the security of personal information are identified."
            ]
          },
          {
            "title": "Data subject rights",
            "paragraphs": [
              "Individuals may exercise their rights under Costa Rican law, including, where applicable, access, correction, updating, deletion, and other safeguards of their informational self-determination.",
              "Requests must allow reasonable verification of the individual's identity and identify the right being exercised.",
              "Castro Fallas will respond within the periods and under the conditions provided by applicable law.",
              "If a request cannot be granted because of a legal retention obligation or other legitimate ground, the company will communicate the relevant reasons.",
              "Requests to access, correct, or delete personal data must be resolved free of charge within five business days of receipt under Article 7 of Costa Rican Law No. 8968 and the applicable regulations, without prejudice to situations in which additional information may lawfully be requested."
            ]
          },
          {
            "title": "Exercising rights and complaints",
            "paragraphs": [
              "Inquiries and requests regarding personal information may be submitted to Castro Fallas through its official contact channels.",
              "Without prejudice to the company's own procedures, individuals may contact the Data Protection Agency of the Inhabitants (PRODHAB) where their rights may have been infringed and the claim is admissible under applicable law.",
              "To facilitate identification and response, requests may include the individual's name, a reply channel, the information concerned, and the right being exercised. Only additional information reasonably necessary for identity verification and the request will be sought."
            ]
          },
          {
            "title": "Cookies and similar technologies",
            "paragraphs": [
              "The website may use cookies or other technical mechanisms to operate correctly, maintain sessions, or remember preferences.",
              "Details about these technologies, their purposes, and available management mechanisms are provided in the Cookie Policy."
            ],
            "links": [
              {
                "label": "Read the Cookie Policy",
                "href": "/cookies"
              }
            ]
          },
          {
            "title": "Policy changes",
            "paragraphs": [
              "Castro Fallas may update this Privacy Policy following changes in law, processing purposes or methods, or its operations.",
              "Changes will be published on the website with the corresponding update date.",
              "Where changes require renewed notice to individuals or fresh consent, the company will act in accordance with applicable law."
            ]
          }
        ]
      },
      "terms": {
        "title": "Terms and Conditions of Use",
        "intro": "Last updated: October 27, 2026. Inquiries: comercial@castrofallas.com · Phone: +506 2272-6772.",
        "sections": [
          {
            "title": "Website operator",
            "paragraphs": [
              "This website is operated under the trade name Castro Fallas by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located at Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio, hereinafter “Castro Fallas”.",
              "Inquiries concerning these Terms and Conditions may be submitted through the official contact channels published on the website.",
              "For rights requests or inquiries regarding these terms, users may write to comercial@castrofallas.com or call +506 2272-6772, without prejudice to the company's other published official channels."
            ],
            "links": [
              {
                "label": "Email: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Phone: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Purpose and scope",
            "paragraphs": [
              "These Terms and Conditions govern access to, browsing of, and use of the Castro Fallas website and its content, forms, and digital functionality.",
              "Use of the website implies awareness of these terms, without prejudice to non-waivable rights under applicable law.",
              "These terms do not replace the specific provisions governing the engagement of customs, logistics, or international transportation services."
            ]
          },
          {
            "title": "Access and authorized use",
            "paragraphs": [
              "Users undertake to use the website lawfully, in good faith, and with respect for third-party rights.",
              "Fraud, knowingly false submissions, unauthorized system or account access, interference with website operation, and introduction of malicious software are prohibited.",
              "Castro Fallas may adopt reasonable, proportionate measures to prevent misuse, in accordance with applicable law."
            ]
          },
          {
            "title": "User accounts",
            "paragraphs": [
              "Where particular features require registration or authentication, users are responsible for providing accurate information and keeping credentials confidential.",
              "Users must promptly report any unauthorized account access of which they become aware.",
              "Castro Fallas may restrict account access for reasonable security, fraud-prevention, or terms-enforcement purposes, subject to applicable law.",
              "Anyone using an account on behalf of a business must have appropriate authority to act for it. Digital access does not, by itself, authorize the engagement of services or replace authorizations required for an operation."
            ]
          },
          {
            "title": "Quotation requests",
            "paragraphs": [
              "Website quotation forms allow users to request information and proposals regarding services offered by Castro Fallas.",
              "Submitting a request does not, in itself, constitute contractual acceptance, a booking, transportation confirmation, or an obligation to provide a service.",
              "Quotations issued by Castro Fallas are subject to their validity period, scope, commercial conditions, availability, and other expressly communicated provisions.",
              "Engagement of a service requires compliance with applicable specific conditions and the relevant acceptance.",
              "The conditions applicable to transportation, customs clearance, storage, insurance, duties, surcharges, claims, and other service-specific matters, when relevant, are governed by the accepted proposal and applicable contractual documents, rather than solely by these website terms."
            ]
          },
          {
            "title": "Website information",
            "paragraphs": [
              "Castro Fallas will endeavor to keep service information and website content clear and current.",
              "General information about routes, itineraries, availability, rates, and estimated transit times is informative unless expressly included in a binding contractual obligation.",
              "Website information does not replace confirmation of the specific terms of an operation."
            ]
          },
          {
            "title": "Liability",
            "paragraphs": [
              "Liability related to website use and contracted services will be determined by applicable law and validly assumed contractual obligations.",
              "Castro Fallas will not be responsible for disruptions or losses attributable exclusively to circumstances beyond its control, without prejudice to its legal obligations.",
              "Nothing in these terms excludes liability for intentional misconduct, gross negligence, or other circumstances where legal restrictions on liability are prohibited.",
              "Nor do these terms waive consumers' non-waivable rights."
            ]
          },
          {
            "title": "Intellectual property",
            "paragraphs": [
              "Website text, designs, photographs, distinctive signs, logos, and other elements are protected by applicable intellectual property law.",
              "These rights belong to Castro Fallas or their respective holders, as applicable.",
              "Unauthorized reproduction, distribution, modification, or commercial use is prohibited except where permitted by law or an applicable license."
            ]
          },
          {
            "title": "Third-party links and services",
            "paragraphs": [
              "The website may contain links or functionality provided by third parties.",
              "Access to third-party platforms is subject to their respective terms and policies.",
              "Castro Fallas does not assume obligations arising from independent relationships between users and those third parties, unless law or contract provides otherwise."
            ]
          },
          {
            "title": "Personal data protection",
            "paragraphs": [
              "Personal information collected through the website will be handled in accordance with Costa Rica's Law No. 8968, its regulations, and other applicable provisions.",
              "Purposes of processing, data subject rights, and procedures for exercising those rights are described in the Privacy Policy."
            ],
            "links": [
              {
                "label": "Read the Privacy Policy",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Amendments",
            "paragraphs": [
              "Castro Fallas may update these Terms and Conditions following changes in legislation, website features, or legitimate operational requirements.",
              "Amendments will be published with an update date.",
              "Changes will not retroactively alter previously acquired contractual obligations unless the parties validly agree otherwise or applicable law so provides."
            ]
          },
          {
            "title": "Governing law and disputes",
            "paragraphs": [
              "These Terms and Conditions shall be interpreted in accordance with the laws of the Republic of Costa Rica.",
              "Disputes concerning their interpretation or application shall be submitted to the competent judicial or administrative authorities and legally available dispute-resolution mechanisms.",
              "This is without prejudice to mandatory rules on consumer protection, jurisdiction, and competence."
            ]
          }
        ]
      },
      "cookies": {
        "title": "Cookie Policy",
        "intro": "Last updated: October 27, 2026. Inquiries: comercial@castrofallas.com · Phone: +506 2272-6772.",
        "sections": [
          {
            "title": "Purpose",
            "paragraphs": [
              "This Cookie Policy addresses the use of cookies and similar technologies on the Castro Fallas website, operated by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, located at Barrio San José, Curridabat, San José, Costa Rica, opposite Café Volio.",
              "Its purpose is to explain the technologies that may be used, their categories, and available ways to manage user preferences.",
              "For inquiries about this policy, users may contact comercial@castrofallas.com or telephone +506 2272-6772."
            ],
            "links": [
              {
                "label": "Email: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Phone: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "What cookies are",
            "paragraphs": [
              "Cookies are information files that a website may store on a user's device through a browser.",
              "They may enable website functions, maintain sessions and preferences, or, where implemented, collect statistical usage information.",
              "The website may also use equivalent technical mechanisms, such as browser local storage, where necessary for its features."
            ]
          },
          {
            "title": "Cookie categories",
            "paragraphs": [
              "To maintain authenticated user sessions, the website uses the first-party “cf_session” cookie, with a maximum lifetime of eight hours and protections against unauthorized access. Language preferences may be stored locally in the browser through a mechanism distinct from cookies.",
              "Strictly necessary cookies: support technical and secure operation, including session management, authentication, and protection of website functionality where applicable. Their use is limited to legitimate security and functional needs.",
              "Preference cookies: remember user choices such as language or display settings where those features exist.",
              "Analytics cookies: where used, collect statistical information about website navigation and use, subject to applicable notice and consent duties.",
              "Third-party cookies: integrated services may require technologies managed by third parties, subject to the relevant contractual terms and applicable personal-data obligations."
            ]
          },
          {
            "title": "Purposes of use",
            "paragraphs": [
              "Cookies and similar technologies that are actually implemented will be used only for purposes disclosed to users.",
              "The session cookie recognizes authenticated users and helps protect access to private functions; local storage can remember browser preferences. Any analytics or advertising cookies introduced in the future must be identified and used in accordance with applicable notice and consent requirements."
            ],
            "bullets": [
              "Ensure website functionality and security.",
              "Maintain sessions and enable authorized features.",
              "Remember user preferences.",
              "Collect website usage statistics when relevant tools are enabled and legal requirements are met.",
              "Data will not be used for incompatible purposes unless a valid legal basis or required consent exists."
            ]
          },
          {
            "title": "Duration",
            "paragraphs": [
              "Cookies may be session-based or persistent.",
              "Session cookies are used during browsing and expire under the applicable session or closure settings.",
              "Persistent cookies remain stored for the period established for their purpose or until deleted by the user.",
              "Specific retention periods depend on the technologies used and their configurations.",
              "The technical “cf_session” cookie has a maximum lifetime of eight hours. Preference data in local browser storage may remain until users delete it or change the relevant settings."
            ]
          },
          {
            "title": "Consent and preferences",
            "paragraphs": [
              "Where the use of cookies or similar technologies involves personal-data processing subject to consent, Castro Fallas will request authorization under applicable law.",
              "Users may manage available preferences and change or withdraw consent where legally permitted.",
              "Disabling certain strictly necessary technologies may affect essential website features.",
              "Publishing this policy does not replace a consent mechanism where one is legally required. If non-essential cookies requiring consent are introduced, they must be identified and managed in accordance with applicable law before being used."
            ]
          },
          {
            "title": "Browser settings",
            "paragraphs": [
              "Users may configure their browsers to restrict, block, or delete cookies and locally stored data.",
              "Available options depend on the user's browser and device.",
              "Deleting cookies may end sessions or remove saved preferences."
            ]
          },
          {
            "title": "Personal information",
            "paragraphs": [
              "Where cookies or similar technologies can identify a person directly or indirectly, related data will be processed in accordance with Costa Rica's Law No. 8968, its regulations, and other applicable provisions.",
              "Information about data subject rights and personal-data processing is available in the Privacy Policy."
            ],
            "links": [
              {
                "label": "Read the Privacy Policy",
                "href": "/privacidad"
              }
            ]
          },
          {
            "title": "Third-party services",
            "paragraphs": [
              "Where third-party technologies are used, Castro Fallas must provide the identification, purpose, and relevant conditions required by law.",
              "Their use will be subject to the applicable personal-data protection obligations and safeguards."
            ]
          },
          {
            "title": "Policy changes",
            "paragraphs": [
              "Castro Fallas may amend this Cookie Policy following legislative changes, changes in implemented technologies, or updates to website features.",
              "Updates will be published with their corresponding date.",
              "Where renewed notice or consent is required, the company will comply with applicable law."
            ]
          }
        ]
      },
      "licenses": {
        "title": "Credits and Licenses",
        "intro": "Last updated: October 27, 2026. Inquiries: comercial@castrofallas.com · Phone: +506 2272-6772.",
        "sections": [
          {
            "title": "Website operator",
            "paragraphs": [
              "This website is operated by Aduanera Castro Fallas S.A., corporate registration number 3-101-035767, under the trade name Castro Fallas.",
              "Intellectual property rights in website elements remain with their respective holders under applicable law and contractual provisions.",
              "For inquiries about this policy, users may contact comercial@castrofallas.com or telephone +506 2272-6772."
            ],
            "links": [
              {
                "label": "Email: comercial@castrofallas.com",
                "href": "mailto:comercial@castrofallas.com"
              },
              {
                "label": "Phone: +506 2272-6772",
                "href": "tel:+50622726772"
              }
            ]
          },
          {
            "title": "Intellectual property",
            "paragraphs": [
              "Original website text, graphics, photographs, illustrations, designs, logos, distinctive signs, and other content are protected by applicable Costa Rican intellectual property law.",
              "Publication does not grant third parties a general license to exploit such content.",
              "Unauthorized reproduction, distribution, modification, or commercial use is prohibited unless expressly authorized or permitted by law."
            ]
          },
          {
            "title": "Trademarks and distinctive signs",
            "paragraphs": [
              "Trademarks, trade names, logos, and other distinctive signs displayed on the website belong to their respective holders.",
              "Their display does not imply any transfer of ownership, general permission to use them, or a commercial or contractual relationship beyond what applies in the particular case.",
              "Third-party signs are used with respect for their owners' rights."
            ]
          },
          {
            "title": "Photographs and audiovisual materials",
            "paragraphs": [
              "Photographs, videos, illustrations, and other audiovisual material may be company-owned, licensed, or used with their owners' authorization.",
              "Each item remains subject to its applicable license or authorization.",
              "Where a license requires attribution, source identification, or other notices, those requirements must be followed."
            ]
          },
          {
            "title": "Third-party software and components",
            "paragraphs": [
              "The website may use software, libraries, components, or tools developed by third parties and distributed under free software, open-source, or commercial licenses.",
              "Rights in those components remain with their respective holders.",
              "Their use is governed by the corresponding licenses, including attribution, preservation of notices, distribution, or information-availability requirements where applicable.",
              "Third-party licenses do not by themselves alter ownership of original Castro Fallas content.",
              "For the geographic globe, the project uses d3-geo, topojson-client, and world-atlas. Their applicable licenses and attribution notices must be preserved and made available; geographic data from Natural Earth remains subject to its own terms."
            ]
          },
          {
            "title": "External resources and services",
            "paragraphs": [
              "External resources used on the website, including third-party services, fonts, icons, and other protected elements, remain subject to the legal conditions established by their owners.",
              "Castro Fallas will comply with identification and attribution duties required by applicable licenses."
            ]
          },
          {
            "title": "Third-party use of content",
            "paragraphs": [
              "Browsing the website does not grant users exploitation rights in its content, trademarks, or other protected elements.",
              "Use beyond the limits permitted by law requires authorization from the corresponding rights holder.",
              "Requests for use of content may be submitted through Castro Fallas's official contact channels."
            ]
          },
          {
            "title": "Third-party rights and complaints",
            "paragraphs": [
              "Rights holders who believe that content on the website infringes their intellectual property may report it through Castro Fallas's official channels.",
              "A request should reasonably identify the material concerned and the allegedly affected right.",
              "Castro Fallas will assess such notices and take action required by applicable law."
            ]
          },
          {
            "title": "Applicable law",
            "paragraphs": [
              "Intellectual property rights relating to the website are governed by the laws of the Republic of Costa Rica and applicable international instruments.",
              "Any dispute shall be submitted to the competent authorities under the applicable legal framework."
            ]
          },
          {
            "title": "Third-party license notices",
            "paragraphs": [
              "Third-party mapping components used on the website, including d3-geo, topojson-client, and world-atlas, retain their license and copyright notices. Natural Earth geographic data remains subject to its own terms of use. These references are provided to support compliance with applicable attribution obligations."
            ],
            "links": [
              {
                "label": "Globe third-party notices",
                "href": "/licenses/globe-third-party-notices.txt"
              },
              {
                "label": "D3-Geo license and source",
                "href": "https://github.com/d3/d3-geo"
              },
              {
                "label": "TopoJSON license and source",
                "href": "https://github.com/topojson/topojson-client"
              },
              {
                "label": "World Atlas data",
                "href": "https://github.com/topojson/world-atlas"
              },
              {
                "label": "Natural Earth terms",
                "href": "https://www.naturalearthdata.com/about/terms-of-use/"
              }
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
