<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { driver, type Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import IconSymbol from '../components/IconSymbol.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'

const { locale } = useI18n({ useScope: 'global' })
const en = computed(() => locale.value.toLowerCase().startsWith('en'))
const kind = ref('BL')
const reference = ref('')
const searched = ref(false)
let tour: Driver | null = null
const types = computed(() => en.value ? [
  { id: 'BL', name: 'BL number', help: 'Master Bill of Lading for the shipment.' },
  { id: 'HBL', name: 'HBL number', help: 'House Bill of Lading for your cargo.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Castro Fallas reference, when assigned.' },
  { id: 'CONTAINER', name: 'Container number', help: 'Identifier printed on the container.' },
  { id: 'PO', name: 'Purchase order (PO)', help: 'Purchase order reference, if linked to a shipment.' }
] : [
  { id: 'BL', name: 'Número BL', help: 'Conocimiento de embarque marítimo principal.' },
  { id: 'HBL', name: 'Número HBL', help: 'Conocimiento de embarque individual.' },
  { id: 'IDTRA', name: 'IDTRA', help: 'Referencia de Castro Fallas, si fue asignada.' },
  { id: 'CONTAINER', name: 'Número de contenedor', help: 'Código impreso en el contenedor.' },
  { id: 'PO', name: 'Orden de compra (PO)', help: 'Orden de compra vinculada al embarque, si aplica.' }
])
const help = computed(() => types.value.find(item => item.id === kind.value)?.help ?? '')
const copy = computed(() => en.value ? {
  eyebrow: 'CASTRO FALLAS · INTERNATIONAL CARGO', title: 'Track your', accent: 'shipment.',
  intro: 'Enter a shipment reference. Online movements are not connected yet; our team can assist you with that reference.',
  heading: 'Find your shipment', hint: 'Choose the reference type shown on your shipping documents.',
  guide: 'Step-by-step guide', type: 'Reference type', number: 'Shipment reference',
  placeholder: 'Enter reference', search: 'Search shipment', required: 'Enter a reference to continue.',
  unavailable: 'Online tracking is not available yet',
  explanation: 'We cannot retrieve live movements yet. Contact Castro Fallas and include your reference so the team can assist.',
  contact: 'Contact Castro Fallas', process: 'How shipment coordination works',
  processIntro: 'Our team works with carriers, customs agents and the other parties involved.',
  steps: [
    ['Review details', 'Identify the operation with its reference and documents.'],
    ['Coordinate at origin', 'Arrange preparation and applicable export documents.'],
    ['Transport and customs', 'Coordinate transit and applicable customs procedures.'],
    ['Coordinate at destination', 'Arrange the next steps for the agreed service.']
  ],
  tourTitles: ['Explore the globe', 'Choose reference type', 'Enter the reference', 'Search shipment', 'The logistics process'],
  back: 'Back to home', next: 'Next', previous: 'Back', done: 'Finish'
} : {
  eyebrow: 'CASTRO FALLAS · CARGA INTERNACIONAL', title: 'Rastrea tu', accent: 'embarque.',
  intro: 'Ingresa una referencia del embarque. Todavía no hay movimientos en línea; nuestro equipo puede ayudarte con esa referencia.',
  heading: 'Busca tu embarque', hint: 'Selecciona el tipo de referencia que aparece en los documentos.',
  guide: 'Guía paso a paso', type: 'Tipo de referencia', number: 'Referencia del embarque',
  placeholder: 'Ingresa la referencia', search: 'Buscar embarque', required: 'Ingresa una referencia para continuar.',
  unavailable: 'El seguimiento en línea aún no está disponible',
  explanation: 'Por ahora no podemos consultar movimientos en tiempo real. Contacta a Castro Fallas e incluye la referencia para recibir asistencia.',
  contact: 'Contactar a Castro Fallas', process: 'Así coordinamos cada embarque',
  processIntro: 'Nuestro equipo coordina con transportistas, agentes aduanales y las demás partes involucradas.',
  steps: [
    ['Revisamos los datos', 'Identificamos la operación con la referencia y sus documentos.'],
    ['Coordinamos el origen', 'Gestionamos la preparación y documentos de exportación.'],
    ['Transporte y aduanas', 'Coordinamos el tránsito y las gestiones aduaneras aplicables.'],
    ['Coordinamos el destino', 'Organizamos las siguientes gestiones del servicio acordado.']
  ],
  tourTitles: ['Explora el globo', 'Elige el tipo de referencia', 'Ingresa tu referencia', 'Busca el embarque', 'Cómo funciona la coordinación'],
  back: 'Volver al inicio', next: 'Siguiente', previous: 'Anterior', done: 'Finalizar'
})
const mailto = computed(() => {
  const title = en.value ? 'Shipment tracking request' : 'Consulta de seguimiento de embarque'
  const body = (en.value ? 'Reference' : 'Referencia') + ' (' + kind.value + '): ' + reference.value.trim()
  return 'mailto:comercial@castrofallas.com?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body)
})
function openGuide() {
  tour?.destroy()
  const targets = ['.tracking-intro .world-globe', '#tracking-guide-type', '#tracking-guide-reference', '#tracking-guide-submit', '.tracking-process__steps']
  tour = driver({
    animate: true, allowClose: true, overlayOpacity: .65, stagePadding: 9,
    steps: targets.map((element, index) => ({ element, popover: {
      title: copy.value.tourTitles[index], description: index === 0 ? copy.value.intro :
      index === 1 ? copy.value.hint : index === 2 ? copy.value.placeholder :
      index === 3 ? copy.value.explanation : copy.value.processIntro
    } })),
    nextBtnText: copy.value.next, prevBtnText: copy.value.previous,
    doneBtnText: copy.value.done, onDestroyed: () => { tour = null }
  })
  tour.drive()
}
onBeforeUnmount(() => tour?.destroy())
</script>

<template>
  <div class="app-site tracking-site">
    <SiteHeader active="embarque" />
    <main class="tracking-page">
      <div class="container">
        <a class="back-link" href="/home#embarque">{{ copy.back }}</a>
        <section class="tracking-intro">
          <div class="tracking-copy">
            <p class="section-tag">{{ copy.eyebrow }}</p>
            <h1>{{ copy.title }} <span>{{ copy.accent }}</span></h1>
            <p class="tracking-lead">{{ copy.intro }}</p>
          </div>
          <WorldGlobe />
        </section>
        <section class="tracking-search-section">
          <form class="tracking-search" @submit.prevent="searched = true" novalidate>
            <div class="tracking-top">
              <div>
                <p class="section-tag">{{ copy.type }}</p>
                <h2>{{ copy.heading }}</h2>
              </div>
              <button class="tracking-guide" type="button" @click="openGuide">{{ copy.guide }} <IconSymbol glyph="↗" /></button>
            </div>
            <p class="tracking-hint">{{ copy.hint }}</p>
            <div class="tracking-fields">
              <label id="tracking-guide-type">{{ copy.type }}
                <select v-model="kind">
                  <option v-for="item in types" :key="item.id" :value="item.id">{{ item.name }}</option>
                </select>
              </label>
              <label id="tracking-guide-reference">{{ copy.number }}
                <input v-model="reference" maxlength="150" autocomplete="off" :placeholder="copy.placeholder" required />
              </label>
            </div>
            <p class="tracking-hint">{{ help }}</p>
            <p v-if="searched && !reference.trim()" class="tracking-error" role="alert">{{ copy.required }}</p>
            <button id="tracking-guide-submit" type="submit" class="btn btn-primary tracking-submit">{{ copy.search }} <IconSymbol glyph="→" /></button>
            <div v-if="searched && reference.trim()" class="tracking-unavailable" role="status">
              <strong>{{ copy.unavailable }}</strong>
              <p>{{ copy.explanation }}</p>
              <a :href="mailto">{{ copy.contact }} <IconSymbol glyph="↗" /></a>
            </div>
          </form>
        </section>
        <section class="tracking-process">
          <p class="section-tag">{{ copy.eyebrow }}</p>
          <h2>{{ copy.process }}</h2>
          <p>{{ copy.processIntro }}</p>
          <ol class="tracking-process__steps">
            <li v-for="(step, index) in copy.steps" :key="index">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></div>
            </li>
          </ol>
        </section>
      </div>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.tracking-site { --track-ink: #20242b; --track-muted: #69707c; --track-surface: #fff8f8; overflow: clip; }
:global(html.theme-dark .tracking-site) { --track-ink: #fff; --track-muted: #c1c5cf; --track-surface: #171316; }
.tracking-page { padding: 38px 0 95px; min-height: 70vh; background: var(--track-surface); color: var(--track-ink); }
.back-link { display: inline-block; margin: 0 0 25px; color: inherit; }
.tracking-intro { display: grid; grid-template-columns: .95fr 1.05fr; align-items: center; gap: 35px; }
.tracking-intro :deep(.world-globe) { width: 100%; min-height: 440px; }
.tracking-copy h1 { margin: 15px 0; font-size: clamp(40px, 5.7vw, 78px); letter-spacing: -.055em; line-height: 1.06; }
.tracking-copy h1 span { color: #a80e18; }
.tracking-lead { font-size: 17px; line-height: 1.7; color: var(--track-muted); max-width: 530px; }
.tracking-search-section { margin-top: 32px; }
.tracking-search { padding: clamp(24px, 4vw, 50px); border-radius: 26px; border: 1px solid #b5092840; background: var(--track-surface); box-shadow: 0 15px 60px #b5092815; }
.tracking-top { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.tracking-top h2,.tracking-process h2 { margin: 8px 0; font-size: clamp(26px, 3vw, 38px); }
.tracking-guide { border: 1px solid #a80e18; border-radius: 999px; background: transparent; color: #a80e18; font: inherit; font-weight: 750; padding: 12px 17px; cursor: pointer; }
.tracking-guide:focus-visible { outline: 2px solid #a80e18; outline-offset: 3px; }
.tracking-hint { color: var(--track-muted); line-height: 1.6; }
.tracking-fields { display: grid; grid-template-columns: .8fr 1.2fr; gap: 17px; margin-top: 20px; }
.tracking-fields label { display: grid; gap: 9px; font-weight: 700; font-size: 14px; }
.tracking-fields input,.tracking-fields select { box-sizing: border-box; width: 100%; min-height: 52px; padding: 12px; border: 1px solid #96969b7d; border-radius: 12px; color: var(--track-ink); background: var(--track-surface); font: inherit; }
.tracking-error { color: #a80e18; font-weight: 700; }
.tracking-submit { width: 100%; display: flex; justify-content: space-between; margin-top: 22px; }
.tracking-unavailable { margin-top: 20px; padding: 20px; border-radius: 15px; border: 1px solid #a80e1866; }
.tracking-unavailable p { color: var(--track-muted); }
.tracking-unavailable a { color: #a80e18; font-weight: 750; }
.tracking-process { margin-top: 60px; padding: clamp(25px, 4vw, 50px); border-radius: 26px; border: 1px solid #b5092840; }
.tracking-process > p:not(.section-tag) { color: var(--track-muted); }
.tracking-process__steps { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 21px; padding: 0; list-style: none; margin: 35px 0 0; }
.tracking-process__steps li { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid #a80e18; padding-top: 18px; }
.tracking-process__steps li > span { color: #a80e18; font-weight: 800; }
.tracking-process__steps h3 { margin: 4px 0; font-size: 17px; }
.tracking-process__steps p { color: var(--track-muted); margin: 0; line-height: 1.6; font-size: 14px; }
@media(max-width:850px){.tracking-intro{grid-template-columns:1fr}.tracking-intro :deep(.world-globe){min-height:320px}.tracking-process__steps{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:580px){.tracking-page{padding:26px 0 70px}.tracking-fields{grid-template-columns:1fr}.tracking-process__steps{grid-template-columns:1fr}.tracking-copy h1{font-size:clamp(38px,11vw,58px)}.tracking-top{align-items:flex-start}.tracking-guide{width:100%}}
</style>
