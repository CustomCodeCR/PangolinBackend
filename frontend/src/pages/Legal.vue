<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

type LegalSection = { title: string; paragraphs?: string[]; bullets?: string[]; links?: { label: string; href: string }[] }
type LegalDocument = { title: string; intro: string; draft: string; sections: LegalSection[] }
const { locale } = useI18n({ useScope: 'global' })
const documentType = computed(() => {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path === '/terminos' ? 'terms' : path === '/cookies' ? 'cookies' : path === '/licencias' ? 'licenses' : 'privacy'
})

const documents: Record<'es' | 'en', Record<'privacy' | 'terms' | 'cookies' | 'licenses', LegalDocument>> = {
  es: {
    privacy: {
      title: 'Política de privacidad',
      intro: 'En esta política se explica cómo Castro Fallas utiliza la información personal necesaria para atender consultas y prestar servicios de logística, transporte internacional y gestión aduanera.',
      draft: 'Borrador para revisión legal. Antes de aprobarlo, la empresa debe confirmar la razón social responsable, los datos de identificación y domicilio, los terceros que participan en cada servicio y los plazos aplicables de conservación.',
      sections: [
        { title: 'Responsable del tratamiento', paragraphs: ['La empresa ofrece sus servicios bajo el nombre comercial Castro Fallas. La razón social, cédula jurídica y domicilio de la entidad responsable deben completarse y confirmarse antes de publicar la versión definitiva. Para consultas sobre privacidad puede escribir a comercial@castrofallas.com o llamar al +506 2272-6772.'] },
        { title: 'Información que podemos solicitar', paragraphs: ['Para atender una consulta o prestar un servicio, Castro Fallas puede solicitar datos de identificación y contacto, como nombre, correo electrónico, teléfono, empresa y país; información comercial necesaria para preparar una cotización o coordinar una operación; y datos relacionados con el transporte o despacho de mercancías, como origen, destino, tipo de servicio, características de la carga y fechas previstas. Cuando la naturaleza del trámite o la normativa aplicable lo requiera, también podrán solicitarse documentos o datos de las personas autorizadas para representar al cliente, consignatario, exportador o importador.', 'La información debe limitarse a lo necesario para la consulta, cotización, coordinación o prestación del servicio. No incluya en los formularios información sensible o documentos que no hayan sido solicitados por el equipo de Castro Fallas.'] },
        { title: 'Para qué utilizamos la información', bullets: ['Responder consultas, solicitudes de información y cotizaciones de servicios aéreos, marítimos, terrestres, aduaneros y de logística internacional.', 'Evaluar las necesidades de transporte y coordinar itinerarios, reservas, recolección, entrega y seguimiento de la carga.', 'Gestionar trámites y comunicaciones con transportistas, agentes aduaneros, terminales, autoridades y demás participantes de una operación.', 'Mantener la relación comercial, brindar atención al cliente y atender consultas, reclamos o incidencias relacionadas con el servicio.', 'Preparar y administrar propuestas, órdenes de servicio, contratos, facturación y documentación operativa.', 'Cumplir obligaciones legales, aduaneras, tributarias, contables y de seguridad aplicables, así como proteger los derechos de la empresa y de sus clientes.'] },
        { title: 'Con quién podemos compartirla', paragraphs: ['El personal de Castro Fallas que atiende la solicitud puede consultar la información necesaria para realizar su trabajo. Para cotizar, coordinar o completar una operación, también puede ser necesario comunicar datos pertinentes a transportistas y sus agentes, líneas aéreas o navieras, agentes aduaneros, almacenes fiscales, puertos, aeropuertos, terminales, proveedores de transporte y entrega, aseguradoras, asesores profesionales y autoridades competentes.', 'La información se comparte solo en la medida necesaria para la gestión solicitada, para cumplir obligaciones aplicables o para proteger derechos. En operaciones internacionales, ciertos datos pueden comunicarse a empresas o autoridades ubicadas en los países de origen, tránsito o destino de la carga. La empresa debe confirmar qué terceros intervienen en sus servicios y explicar las condiciones aplicables a esas comunicaciones antes de aprobar esta política. Castro Fallas no vende datos personales.'] },
        { title: 'Conservación y protección', paragraphs: ['Castro Fallas procura limitar el acceso a la información a las personas que la necesitan para atender al cliente y gestionar el servicio, y adoptar medidas razonables para resguardarla frente a pérdida, uso no autorizado o divulgación indebida. La empresa debe confirmar y documentar las medidas concretas que aplica.', 'La información se conservará durante el tiempo necesario para atender la consulta, mantener la relación comercial y completar las operaciones correspondientes. Algunos documentos pueden conservarse por los plazos exigidos por obligaciones aduaneras, tributarias, contables, contractuales o por la atención de reclamos y procesos legales. Los plazos y criterios concretos deben ser confirmados por la empresa y su asesora legal.'] },
        { title: 'Sus derechos y cómo contactarnos', paragraphs: ['Usted puede consultar sobre el tratamiento de sus datos y solicitar el ejercicio de los derechos reconocidos por la legislación aplicable, incluidos el acceso y la rectificación y, cuando corresponda, la eliminación o la limitación del uso de la información. Para presentar una solicitud, escriba a comercial@castrofallas.com con el asunto “Privacidad y datos personales” o llame al +506 2272-6772. Indique cómo podemos contactarle y describa su solicitud; podrían pedirle información razonable para confirmar su identidad y proteger sus datos. El procedimiento y los plazos de respuesta deben ser confirmados antes de publicar la versión definitiva.'] },
        { title: 'Actualizaciones de esta política', paragraphs: ['Esta política podrá actualizarse si cambian los servicios de Castro Fallas, la forma de atender a sus clientes o las obligaciones aplicables. La versión vigente deberá indicar su fecha de actualización. Este borrador se prepara tomando como referencia la legislación costarricense sobre protección de datos personales, incluida la Ley n.º 8968, y debe ser revisado por una profesional en derecho antes de su publicación definitiva.'] }
      ]
    },
    terms: {
      title: 'Términos y condiciones',
      intro: 'Estas reglas de trabajo describen el uso del sitio Castro Fallas y sus herramientas digitales.',
      draft: 'Borrador de trabajo para revisión legal. Antes de publicar como versión definitiva deben confirmarse la identidad legal del proveedor, el alcance comercial de cada servicio, canales de reclamo y condiciones de contratación.',
      sections: [
        { title: 'Identificación y aceptación', paragraphs: ['El sitio es operado bajo el nombre comercial Castro Fallas. La razón social, cédula jurídica y domicilio deben incorporarse una vez confirmados. Al navegar por las páginas públicas, usted acepta usar el sitio de forma lícita y respetuosa. Las condiciones de una contratación concreta deberán comunicarse por separado y ser aceptadas expresamente antes de que exista un acuerdo de servicio.'] },
        { title: 'Uso del sitio', bullets: ['Proporcione información correcta y actualizada cuando complete un formulario.', 'Use el acceso de cuenta solo si está autorizado y proteja el código temporal que recibe.', 'No intente acceder sin autorización a cuentas, sistemas, datos o servicios ni afectar la seguridad o disponibilidad del sitio.', 'No envíe contenido ilícito, malicioso o que infrinja derechos de otras personas.'] },
        { title: 'Cotizaciones y servicios', paragraphs: ['Enviar una solicitud por el sitio permite al equipo valorar la información y preparar una respuesta. La solicitud no constituye por sí sola una cotización aceptada, reserva, confirmación de espacio ni contrato de transporte. El servicio, precio, alcance, plazos, responsabilidades y demás condiciones se definirán en una propuesta o documento confirmado por las partes.', 'El sitio no procesa pagos. Algunas opciones pueden abrir su aplicación de correo para que usted envíe la consulta. No incluya información personal que no sea necesaria para atenderla.'] },
        { title: 'Contenido informativo y disponibilidad', paragraphs: ['Parte del contenido de noticias, rutas, itinerarios o seguimiento se identifica como ilustrativo, demostrativo o pendiente de confirmación. No debe utilizarse como confirmación de una operación, fecha o estado real. La empresa procurará mantener disponible el sitio, pero este puede interrumpirse por mantenimiento, fallas de conectividad o causas fuera de su control.'] },
        { title: 'Propiedad intelectual', paragraphs: ['Los textos, marcas, diseños, fotografías y demás elementos del sitio pertenecen a Castro Fallas o se usan con autorización. No se permite copiarlos, modificarlos o explotarlos comercialmente sin permiso, salvo los usos permitidos por la ley.'] },
        { title: 'Responsabilidad y consultas', paragraphs: ['Nada en estas condiciones limita derechos irrenunciables de las personas consumidoras ni responsabilidades que no puedan excluirse legalmente. Para consultas, solicitudes o reclamos, contacte comercial@castrofallas.com o +506 2272-6772. Antes de aprobar el texto deben definirse el mecanismo y plazo de respuesta a reclamos.'] },
        { title: 'Ley aplicable y cambios', paragraphs: ['Este borrador contempla como referencia la legislación de Costa Rica, sin perjuicio de las normas de protección a las personas consumidoras que resulten aplicables. Castro Fallas podrá actualizar los términos; la versión vigente deberá estar disponible para consulta y conservarse cuando corresponda.'] }
      ]
    },
    cookies: {
      title: 'Política de cookies y almacenamiento local',
      intro: 'Aquí explicamos las cookies y tecnologías similares que utiliza esta versión del sitio.',
      draft: 'Borrador de trabajo para revisión legal. Esta descripción corresponde al código del sitio revisado; debe actualizarse si se agregan analítica, publicidad, mapas externos, chat u otras herramientas.',
      sections: [
        { title: 'Qué utiliza actualmente el sitio', paragraphs: ['En el código revisado no se encontraron herramientas de analítica o publicidad de terceros. El sitio sí utiliza almacenamiento local del navegador para recordar preferencias como el idioma, el tema visual y el modo invitado. Estos valores permanecen en ese navegador y no son cookies.', 'Cuando una persona inicia sesión, el servidor usa la cookie propia “cf_session” para mantener la sesión autenticada. Está configurada como HttpOnly y SameSite Strict; la opción Secure depende de la configuración del entorno y debe activarse en producción con HTTPS. Es una cookie técnica necesaria para prestar el acceso solicitado.'] },
        { title: 'Para qué sirven', bullets: ['La cookie de sesión permite reconocer una sesión autenticada y proteger las solicitudes de cuenta.', 'El almacenamiento local recuerda idioma, tema y estado de invitado para que el sitio conserve esas preferencias en el mismo navegador.', 'No se usan estos datos para crear perfiles publicitarios en esta versión del código revisado.'] },
        { title: 'Cómo administrar o borrar preferencias', paragraphs: ['Puede borrar el almacenamiento local y las cookies desde la configuración de privacidad de su navegador. Si elimina la cookie de sesión, deberá iniciar sesión de nuevo. Si borra el idioma o el tema, el sitio volverá a sus valores iniciales. El bloqueo de almacenamiento puede impedir funciones de sesión o de preferencias.'] },
        { title: 'Servicios de terceros y cambios', paragraphs: ['El proveedor de correo puede participar cuando se envía un código de acceso. Los servicios de alojamiento o infraestructura podrían utilizar registros técnicos propios; la empresa debe confirmarlo con cada proveedor. Si se incorporan analítica, mapas, videos, publicidad u otras tecnologías no esenciales, se revisará esta política y se añadirá el mecanismo de información o consentimiento que corresponda antes de activarlas.'] }
      ]
    },
    licenses: {
      title: 'Créditos y licencias',
      intro: 'Información sobre las licencias y atribuciones de recursos visuales y herramientas de terceros que aparecen en el sitio.',
      draft: 'Información preparada a partir de los archivos y dependencias incluidos en el proyecto. La empresa debe confirmar la licencia comercial del globo y conservar los comprobantes y permisos de fotografías, ilustraciones y marca antes de publicar la versión definitiva.',
      sections: [
        { title: 'Globo terráqueo interactivo', paragraphs: ['El globo interactivo utiliza 3d-world-map y CanvasGlobe, versión 1.4.1, creado por Harsh Jhunjhunuwala y publicado bajo la marca Swiftools. La licencia del paquete indica que el uso en producción requiere una licencia comercial válida. Castro Fallas debe confirmar que cuenta con una licencia que cubra este sitio y su entidad antes de publicar. La atribución no sustituye esa autorización.'], links: [{ label: 'Licencia e información de uso', href: 'https://canvasglobe.swiftools.com/licensing/' }, { label: 'Acuerdo comercial', href: 'https://canvasglobe.swiftools.com/commercial-license/' }] },
        { title: 'Datos geográficos del mapa', paragraphs: ['La documentación incluida con CanvasGlobe identifica datos geográficos de Natural Earth para las formas del mundo y los lugares poblados, e indica que Natural Earth los declara de dominio público.'], links: [{ label: 'Términos de Natural Earth', href: 'https://www.naturalearthdata.com/about/terms-of-use/' }, { label: 'Datos de lugares poblados', href: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/' }] },
        { title: 'Fotografías e ilustraciones', paragraphs: ['El sitio muestra imágenes de transporte aéreo, marítimo y terrestre, operaciones logísticas, bodegas y puertos. Los archivos del proyecto no incluyen una ficha completa de autoría o licencia para cada imagen. Antes de publicar, Castro Fallas debe confirmar si cada recurso es propio, adquirido o utilizado con permiso, y registrar su autor, fuente, licencia y atribución requerida.'] },
        { title: 'Logotipo y marca', paragraphs: ['El sitio utiliza el nombre y el logotipo de Castro Fallas. La empresa debe confirmar que cuenta con los derechos o autorizaciones necesarios para su uso y para cualquier versión o adaptación mostrada en estas páginas.'] },
        { title: 'Otras herramientas de terceros', paragraphs: ['Las herramientas y componentes de terceros se utilizan conforme a sus respectivas licencias. La lista debe mantenerse actualizada cuando se agreguen, sustituyan o retiren componentes que formen parte del sitio.'] }
      ]
    }
  },
  en: {
    privacy: {
      title: 'Privacy policy', intro: 'This policy explains how Castro Fallas uses personal information needed to respond to inquiries and provide logistics, international transportation, and customs services.',
      draft: 'Draft for legal review. Before approval, the company should confirm the responsible legal entity, identification and address details, the third parties involved in each service, and applicable retention periods.',
      sections: [
        { title: 'Data controller', paragraphs: ['The company provides its services under the trade name Castro Fallas. The legal entity, corporate identification number, and address of the responsible entity must be completed and confirmed before the final version is published. For privacy inquiries, contact comercial@castrofallas.com or +506 2272-6772.'] },
        { title: 'Information we may request', paragraphs: ['To respond to an inquiry or provide a service, Castro Fallas may request identification and contact details such as name, email, phone number, company, and country; commercial information needed to prepare a quote or coordinate an operation; and information about the transportation or customs clearance of goods, such as origin, destination, service type, cargo characteristics, and expected dates. Where the nature of a procedure or applicable rules require it, documents or details about people authorized to represent the customer, consignee, exporter, or importer may also be requested.', 'Information should be limited to what is needed for the inquiry, quote, coordination, or service. Do not include sensitive information or documents that the Castro Fallas team has not requested.'] },
        { title: 'How we use the information', bullets: ['Respond to inquiries and requests for information or quotes for air, maritime, land, customs, and international logistics services.', 'Assess transportation needs and coordinate itineraries, bookings, collection, delivery, and cargo tracking.', 'Manage procedures and communications with carriers, customs brokers, terminals, authorities, and other participants in an operation.', 'Maintain the commercial relationship, provide customer service, and handle questions, complaints, or service incidents.', 'Prepare and administer proposals, service orders, contracts, invoicing, and operational documents.', 'Meet applicable legal, customs, tax, accounting, and security obligations, and protect the rights of the company and its customers.'] },
        { title: 'Who we may share it with', paragraphs: ['Castro Fallas personnel handling a request may access information needed for their work. To quote, coordinate, or complete an operation, relevant details may also need to be shared with carriers and their agents, airlines or shipping lines, customs brokers, bonded warehouses, ports, airports, terminals, transportation and delivery providers, insurers, professional advisers, and competent authorities.', 'Information is shared only as needed for the requested service, to meet applicable obligations, or to protect rights. International operations may involve sharing certain data with companies or authorities in the countries where cargo originates, transits, or is delivered. The company should confirm which third parties participate in its services and explain the applicable terms before approving this policy. Castro Fallas does not sell personal data.'] },
        { title: 'Retention and protection', paragraphs: ['Castro Fallas seeks to limit access to information to people who need it to assist the customer and manage the service, and to adopt reasonable safeguards against loss, unauthorized use, or improper disclosure. The company should confirm and document the specific safeguards it applies.', 'Information will be retained for as long as needed to respond to an inquiry, maintain the commercial relationship, and complete the relevant operations. Some documents may need to be retained for periods required by customs, tax, accounting, contractual obligations, or the handling of claims and legal proceedings. The company and its legal adviser should confirm the specific periods and criteria.'] },
        { title: 'Your rights and how to contact us', paragraphs: ['You may ask how your information is handled and request the exercise of rights provided by applicable law, including access and correction and, where appropriate, deletion or restriction of use. To submit a request, email comercial@castrofallas.com with the subject “Privacy and personal data” or call +506 2272-6772. Tell us how to contact you and describe your request; reasonable information may be requested to confirm your identity and protect your data. The procedure and response times should be confirmed before the final version is published.'] },
        { title: 'Updates to this policy', paragraphs: ['This policy may be updated if Castro Fallas services, customer practices, or applicable obligations change. The current version should state its update date. This draft refers to Costa Rican personal data protection legislation, including Law No. 8968, and should be reviewed by a legal professional before final publication.'] }
      ]
    },
    terms: {
      title: 'Terms and conditions', intro: 'These working rules describe use of the Castro Fallas website and its digital tools.',
      draft: 'Working draft for legal review. Before final publication, confirm the provider’s legal identity, the commercial scope of each service, complaint channels, and contracting terms.',
      sections: [
        { title: 'Identity and acceptance', paragraphs: ['The website is operated under the trade name Castro Fallas. Its legal entity, registration number, and address must be added once confirmed. By browsing public pages, you agree to use the website lawfully and respectfully. Terms for a specific engagement must be communicated separately and expressly accepted before a service agreement is formed.'] },
        { title: 'Website use', bullets: ['Provide accurate and current information when completing a form.', 'Use account access only if authorized and protect the temporary code you receive.', 'Do not attempt unauthorized access to accounts, systems, data, or services, or interfere with website security or availability.', 'Do not submit unlawful, malicious, or rights-infringing content.'] },
        { title: 'Quotes and services', paragraphs: ['Submitting a website request allows the team to review the information and prepare a response. A request alone is not an accepted quote, reservation, space confirmation, or transportation contract. Service, price, scope, deadlines, responsibilities, and other conditions will be set out in a proposal or document confirmed by the parties.', 'The website does not process payments. Some options may open your email application so you can send an inquiry. Do not include unnecessary personal information.'] },
        { title: 'Informational content and availability', paragraphs: ['Some news, route, itinerary, or tracking content is identified as illustrative, demonstrative, or pending confirmation. It should not be treated as confirmation of a real operation, date, or status. The company will seek to keep the website available, but interruptions may occur due to maintenance, connectivity issues, or causes outside its control.'] },
        { title: 'Intellectual property', paragraphs: ['Website text, brands, designs, photographs, and other materials belong to Castro Fallas or are used with permission. Commercial copying, modification, or exploitation is not allowed without permission, except as permitted by law.'] },
        { title: 'Liability and inquiries', paragraphs: ['Nothing in these terms limits non-waivable consumer rights or liabilities that cannot legally be excluded. For questions, requests, or complaints, contact comercial@castrofallas.com or +506 2272-6772. The complaint handling process and response period must be defined before approval.'] },
        { title: 'Applicable law and changes', paragraphs: ['This draft refers to Costa Rican law, without prejudice to applicable consumer protection rules. Castro Fallas may update these terms; the current version should remain available and be retained where required.'] }
      ]
    },
    cookies: {
      title: 'Cookie and local storage policy', intro: 'This page explains the cookies and similar technologies used by this version of the website.',
      draft: 'Working draft for legal review. This description reflects the website code reviewed; update it if analytics, advertising, external maps, chat, or other tools are added.',
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
      draft: 'Prepared from the project files and dependencies. The company should confirm the globe’s commercial license and retain proof of rights or permissions for photographs, illustrations, and branding before final publication.',
      sections: [
        { title: 'Interactive globe', paragraphs: ['The interactive globe uses 3d-world-map and CanvasGlobe, version 1.4.1, created by Harsh Jhunjhunuwala and published under the Swiftools brand. The package license states that production use requires a valid commercial license. Castro Fallas should confirm that it holds a license covering this website and its legal entity before publication. This attribution does not replace that authorization.'], links: [{ label: 'License information', href: 'https://canvasglobe.swiftools.com/licensing/' }, { label: 'Commercial agreement', href: 'https://canvasglobe.swiftools.com/commercial-license/' }] },
        { title: 'Map geographic data', paragraphs: ['The documentation included with CanvasGlobe identifies Natural Earth geographic data for world shapes and populated places, and states that Natural Earth declares this data to be public domain.'], links: [{ label: 'Natural Earth terms', href: 'https://www.naturalearthdata.com/about/terms-of-use/' }, { label: 'Populated places data', href: 'https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/' }] },
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
        <aside class="legal-draft" role="note"><strong>{{ locale === 'en' ? 'Working draft' : 'Borrador para revisión' }}</strong><p>{{ content.draft }}</p></aside>
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
