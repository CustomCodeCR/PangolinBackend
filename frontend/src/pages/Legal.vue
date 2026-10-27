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
        "intro": "Última actualización: 27 de octubre de 2026.",
        "sections": [
          {
            "title": "Responsable del tratamiento",
            "paragraphs": [
              "Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio, en adelante denominada «Castro Fallas», es responsable del tratamiento de los datos personales que reciba y administre a través del presente sitio web, en los términos establecidos por la legislación aplicable.",
              "Los titulares podrán presentar consultas o solicitudes relacionadas con sus datos personales mediante los canales de contacto oficiales de la empresa."
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
              "Los datos personales podrán ser tratados para las siguientes finalidades, según corresponda:"
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
              "Castro Fallas procurará informar al titular sobre las finalidades y condiciones del tratamiento en el momento de su recopilación."
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
              "Cuando la empresa no pueda acceder a una solicitud por existir una obligación legal de conservación u otra causa legítima, comunicará los motivos correspondientes."
            ]
          },
          {
            "title": "Ejercicio de derechos y reclamaciones",
            "paragraphs": [
              "Las consultas y solicitudes relacionadas con el tratamiento de datos personales podrán dirigirse a Castro Fallas mediante sus canales oficiales de contacto.",
              "Sin perjuicio de los mecanismos de atención de la empresa, los titulares podrán acudir ante la Agencia de Protección de Datos de los Habitantes (PRODHAB) cuando consideren vulnerados sus derechos y resulte procedente conforme a la legislación aplicable."
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
        "intro": "Última actualización: 27 de octubre de 2026.",
        "sections": [
          {
            "title": "Identificación del titular",
            "paragraphs": [
              "El presente sitio web es operado bajo el nombre comercial Castro Fallas, por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio, en adelante denominada «Castro Fallas».",
              "Para consultas relacionadas con estos Términos y Condiciones, los usuarios podrán utilizar los medios de contacto oficiales publicados en el sitio web."
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
              "Castro Fallas podrá restringir el acceso a cuentas cuando existan motivos razonables relacionados con la seguridad, el fraude o el incumplimiento de estas condiciones, respetando las disposiciones legales aplicables."
            ]
          },
          {
            "title": "Solicitudes de cotización",
            "paragraphs": [
              "Los formularios de cotización disponibles en el sitio web permiten solicitar información y propuestas relacionadas con los servicios ofrecidos por Castro Fallas.",
              "La presentación de una solicitud no constituye, por sí misma, aceptación contractual, reserva de espacio, confirmación de transporte ni obligación de prestación del servicio.",
              "Las cotizaciones emitidas por Castro Fallas estarán sujetas a su vigencia, alcance, condiciones comerciales, disponibilidad y demás estipulaciones expresamente comunicadas.",
              "La contratación de un servicio requerirá el cumplimiento de las condiciones particulares aplicables y la aceptación correspondiente."
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
        "intro": "Última actualización: 27 de octubre de 2026.",
        "sections": [
          {
            "title": "Objeto",
            "paragraphs": [
              "La presente Política de Cookies establece las condiciones generales relativas al uso de cookies y tecnologías similares en el sitio web de Castro Fallas, operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, con domicilio en Barrio San José, Curridabat, San José, Costa Rica, frente a Café Volio.",
              "Su finalidad es informar a los usuarios sobre la utilización de estas tecnologías, las categorías que pueden emplearse y los mecanismos disponibles para administrar sus preferencias."
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
              "Cookies estrictamente necesarias: permiten el funcionamiento técnico y seguro del sitio web, incluyendo, cuando corresponda, la gestión de sesiones, autenticación y protección de funcionalidades. Su utilización se limitará a las necesidades legítimas de funcionamiento y seguridad.",
              "Cookies de preferencias: permiten conservar determinadas opciones del usuario, como el idioma o las preferencias de visualización, cuando dichas funcionalidades estén implementadas.",
              "Cookies analíticas: cuando sean utilizadas, permiten obtener información estadística sobre la navegación y utilización del sitio web. Su implementación y tratamiento estarán sujetos a las obligaciones de información y consentimiento aplicables.",
              "Cookies de terceros: determinados servicios integrados podrán requerir tecnologías gestionadas por terceros. Su utilización estará sujeta a las condiciones correspondientes y a las obligaciones legales aplicables al tratamiento de datos personales."
            ]
          },
          {
            "title": "Finalidades de utilización",
            "paragraphs": [
              "Las cookies y tecnologías similares que efectivamente se implementen se utilizarán exclusivamente para las finalidades informadas al usuario."
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
              "El plazo concreto de conservación dependerá de las tecnologías efectivamente utilizadas y de su configuración."
            ]
          },
          {
            "title": "Consentimiento y administración de preferencias",
            "paragraphs": [
              "Cuando el uso de cookies o tecnologías similares implique un tratamiento de datos personales sujeto a consentimiento, Castro Fallas solicitará la autorización correspondiente conforme a la legislación aplicable.",
              "El usuario podrá administrar las preferencias que la plataforma ponga a su disposición y modificar o retirar el consentimiento cuando legalmente proceda.",
              "La desactivación de determinados mecanismos estrictamente necesarios puede afectar el funcionamiento de funcionalidades esenciales del sitio web."
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
        "intro": "Última actualización: 27 de octubre de 2026.",
        "sections": [
          {
            "title": "Titular del sitio web",
            "paragraphs": [
              "El presente sitio web es operado por Aduanera Castro Fallas S.A., cédula jurídica 3-101-035767, bajo el nombre comercial Castro Fallas.",
              "Los derechos de propiedad intelectual sobre los elementos que integran el sitio corresponderán a sus respectivos titulares, conforme a las disposiciones legales y contractuales aplicables."
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
              "Las licencias de terceros no alterarán por sí mismas la titularidad de los contenidos originales de Castro Fallas."
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
          }
        ]
      }
    },
  en: {
    privacy: {
      title: 'Privacy policy', intro: 'This policy explains how Castro Fallas uses personal information needed to respond to inquiries and provide logistics, international transportation, and customs services.',
      sections: [
        { title: 'Data controller', paragraphs: ['The company provides its services under the trade name Castro Fallas. The legal entity, corporate identification number, and address of the responsible entity must be completed and confirmed before the final version is published. For privacy inquiries, contact comercial@castrofallas.com or +506 2272-6772.'] },
        { title: 'Information we may request', paragraphs: ['To respond to an inquiry or provide a service, Castro Fallas may request identification and contact details such as name, email, phone number, company, and country; commercial information needed to prepare a quote or coordinate an operation; and information about the transportation or customs clearance of goods, such as origin, destination, service type, cargo characteristics, and expected dates. Where the nature of a procedure or applicable rules require it, documents or details about people authorized to represent the customer, consignee, exporter, or importer may also be requested.', 'Information should be limited to what is needed for the inquiry, quote, coordination, or service. Do not include sensitive information or documents that the Castro Fallas team has not requested.'] },
        { title: 'How we use the information', bullets: ['Respond to inquiries and requests for information or quotes for air, maritime, land, customs, and international logistics services.', 'Assess transportation needs and coordinate itineraries, bookings, collection, delivery, and cargo tracking.', 'Manage procedures and communications with carriers, customs brokers, terminals, authorities, and other participants in an operation.', 'Maintain the commercial relationship, provide customer service, and handle questions, complaints, or service incidents.', 'Prepare and administer proposals, service orders, contracts, invoicing, and operational documents.', 'Meet applicable legal, customs, tax, accounting, and security obligations, and protect the rights of the company and its customers.'] },
        { title: 'Who we may share it with', paragraphs: ['Castro Fallas personnel handling a request may access information needed for their work. To quote, coordinate, or complete an operation, relevant details may also need to be shared with carriers and their agents, airlines or shipping lines, customs brokers, bonded warehouses, ports, airports, terminals, transportation and delivery providers, insurers, professional advisers, and competent authorities.', 'Information is shared only as needed for the requested service, to meet applicable obligations, or to protect rights. International operations may involve sharing certain data with companies or authorities in the countries where cargo originates, transits, or is delivered. The company should confirm which third parties participate in its services and explain the applicable terms before approving this policy. Castro Fallas does not sell personal data.'] },
        { title: 'Retention and protection', paragraphs: ['Castro Fallas seeks to limit access to information to people who need it to assist the customer and manage the service, and to adopt reasonable safeguards against loss, unauthorized use, or improper disclosure. The company should confirm and document the specific safeguards it applies.', 'Information will be retained for as long as needed to respond to an inquiry, maintain the commercial relationship, and complete the relevant operations. Some documents may need to be retained for periods required by customs, tax, accounting, contractual obligations, or the handling of claims and legal proceedings. The company and its legal adviser should confirm the specific periods and criteria.'] },
        { title: 'Your rights and how to contact us', paragraphs: ['You may ask how your information is handled and request the exercise of rights provided by applicable law, including access and correction and, where appropriate, deletion or restriction of use. To submit a request, email comercial@castrofallas.com with the subject “Privacy and personal data” or call +506 2272-6772. Tell us how to contact you and describe your request; reasonable information may be requested to confirm your identity and protect your data. The procedure and response times should be confirmed before the final version is published.'] },
        { title: 'Updates to this policy', paragraphs: ['This policy may be updated if Castro Fallas services, customer practices, or applicable obligations change. The current version should state its update date. This document refers to Costa Rican personal data protection legislation, including Law No. 8968, and should be reviewed by a legal professional before final publication.'] }
      ]
    },
    terms: {
      title: 'Terms and conditions', intro: 'These working rules describe use of the Castro Fallas website and its digital tools.',
      sections: [
        { title: 'Identity and acceptance', paragraphs: ['The website is operated under the trade name Castro Fallas. Its legal entity, registration number, and address must be added once confirmed. By browsing public pages, you agree to use the website lawfully and respectfully. Terms for a specific engagement must be communicated separately and expressly accepted before a service agreement is formed.'] },
        { title: 'Website use', bullets: ['Provide accurate and current information when completing a form.', 'Use account access only if authorized and protect the temporary code you receive.', 'Do not attempt unauthorized access to accounts, systems, data, or services, or interfere with website security or availability.', 'Do not submit unlawful, malicious, or rights-infringing content.'] },
        { title: 'Quotes and services', paragraphs: ['Submitting a website request allows the team to review the information and prepare a response. A request alone is not an accepted quote, reservation, space confirmation, or transportation contract. Service, price, scope, deadlines, responsibilities, and other conditions will be set out in a proposal or document confirmed by the parties.', 'The website does not process payments. Some options may open your email application so you can send an inquiry. Do not include unnecessary personal information.'] },
        { title: 'Informational content and availability', paragraphs: ['Some news, route, itinerary, or tracking content is identified as illustrative, demonstrative, or pending confirmation. It should not be treated as confirmation of a real operation, date, or status. The company will seek to keep the website available, but interruptions may occur due to maintenance, connectivity issues, or causes outside its control.'] },
        { title: 'Intellectual property', paragraphs: ['Website text, brands, designs, photographs, and other materials belong to Castro Fallas or are used with permission. Commercial copying, modification, or exploitation is not allowed without permission, except as permitted by law.'] },
        { title: 'Liability and inquiries', paragraphs: ['Nothing in these terms limits non-waivable consumer rights or liabilities that cannot legally be excluded. For questions, requests, or complaints, contact comercial@castrofallas.com or +506 2272-6772. The complaint handling process and response period must be defined before approval.'] },
        { title: 'Applicable law and changes', paragraphs: ['These terms refer to Costa Rican law, without prejudice to applicable consumer protection rules. Castro Fallas may update these terms; the current version should remain available and be retained where required.'] }
      ]
    },
    cookies: {
      title: 'Cookie and local storage policy', intro: 'This page explains the cookies and similar technologies used by this version of the website.',
      sections: [
        { title: 'What the website currently uses', paragraphs: ['No third-party analytics or advertising tools were found in the reviewed code. The website uses browser local storage to remember preferences such as language, visual theme, and guest mode. These values stay in that browser and are not cookies.', 'When a person signs in, the server uses its own “cf_session” cookie to maintain the authenticated session. It is configured as HttpOnly and SameSite Strict; the Secure option depends on the environment and must be enabled in production with HTTPS. It is a technical cookie needed to provide the requested sign-in feature.'] },
        { title: 'What they are used for', bullets: ['The session cookie recognizes an authenticated session and protects account requests.', 'Local storage remembers language, theme, and guest status so the same browser can retain those preferences.', 'These values are not used to build advertising profiles in the reviewed version of the code.'] },
        { title: 'Managing or deleting preferences', paragraphs: ['You can clear local storage and cookies in your browser privacy settings. Removing the session cookie means you will need to sign in again. Clearing language or theme preferences resets them to their initial values. Blocking storage may prevent session or preference features from working.'] },
        { title: 'Third-party services and changes', paragraphs: ['An email provider may be involved when an access code is sent. Hosting or infrastructure providers may use their own technical logs; the company should confirm this with each provider. If analytics, maps, video, advertising, or other non-essential technologies are added, this policy should be reviewed and the required notice or consent mechanism implemented before activation.'] }
      ]
    },
    licenses: {
      title: 'Credits and licenses',
      intro: 'Information about licenses and attributions for visual resources and third-party tools used on this website.',
      sections: [
        { title: 'Interactive globe', paragraphs: ['The interactive globe uses an independent Canvas 2D implementation developed for Castro Fallas. It uses d3-geo 3.1.1, topojson-client 3.1.0, and world-atlas 2.0.2 under permissive ISC licenses. It does not use CanvasGlobe or 3d-world-map. Copyright and permission notices are preserved in the third-party license document.'], links: [{ label: 'Globe third-party notices', href: '/licenses/globe-third-party-notices.txt' }, { label: 'D3-Geo source', href: 'https://github.com/d3/d3-geo' }, { label: 'TopoJSON source', href: 'https://github.com/topojson/topojson-client' }] },
        { title: 'Map geographic data', paragraphs: ['The globe outlines come from world-atlas, a TopoJSON dataset derived from Natural Earth. Natural Earth geographic data is made available in the public domain.'], links: [{ label: 'Natural Earth terms', href: 'https://www.naturalearthdata.com/about/terms-of-use/' }, { label: 'World Atlas repository', href: 'https://github.com/topojson/world-atlas' }] },
        { title: 'Photographs and illustrations', paragraphs: ['The website displays images of air, maritime, and land transport, logistics operations, warehouses, and ports. The project files do not include a complete author or license record for each image. Before publication, Castro Fallas should confirm whether each resource is owned, purchased, or used with permission, and record its author, source, license, and required attribution.'] },
        { title: 'Logo and brand', paragraphs: ['The website uses the Castro Fallas name and logo. The company should confirm that it holds the rights or permissions required for their use and for any versions or adaptations displayed on these pages.'] },
        { title: 'Other third-party tools', paragraphs: ['Third-party tools and components are used under their respective licenses. This list should be updated whenever components that form part of the website are added, replaced, or removed.'] }
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
