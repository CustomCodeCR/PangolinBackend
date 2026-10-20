<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { refreshSession } from '../services/auth'

type Mode = 'Maritime' | 'Air' | 'Land'
type Type = 'FCL' | 'LCL' | 'AIR_LCL' | 'FTL' | 'LTL'
type Loc = { id: string; displayName: string; code: string | null }
type ContainerLine = { size: string; type: string; quantity: number; unitWeightsKg: number[] }
type PackageLine = { description: string; quantity: number; weight: number; length: number; width: number; height: number; stackability: 'Stackable' | 'NonStackable' }
const step = ref(1)
const mode = ref<Mode | null>(null)
const shipmentType = ref<Type | null>(null)
const busy = ref(false)
const sessionOk = ref(false)
const error = ref('')
const createdId = ref('')
const locations = ref<Loc[]>([])
const locationLoading = ref(false)
const form = reactive({
  originLocationId: '', destinationLocationId: '', podLocationId: '',
  contactName: '', contactEmail: '', contactPhone: '',
  incoterm: '', cargoReadyDate: '', exwCargoStatus: '', exwPickupAddress: '',
  services: ['Transporte internacional'] as string[],
  equipment: [{ size: '', type: '', quantity: 1, unitWeightsKg: [0] }] as ContainerLine[],
  packages: [{ description: '', quantity: 1, weight: 0, length: 0, width: 0, height: 0, stackability: 'Stackable' }] as PackageLine[],
  dimensionUnit: 'cm', weightUnit: 'kg', cargoDescription: '', cabysCode: '',
  cargoValue: '' as number | '', declaredWeight: '' as number | '', declaredPackages: '' as number | '',
  observations: '', cargoFlags: [] as string[], destinationHandling: ''
})
const modeOptions = [
  { value: 'Maritime' as Mode, title: 'Marítimo', icon: '⚓', text: 'Contenedores completos o carga consolidada' },
  { value: 'Air' as Mode, title: 'Aéreo', icon: '✈️', text: 'Carga aérea consolidada' },
  { value: 'Land' as Mode, title: 'Terrestre', icon: '🚚', text: 'Camión completo o carga consolidada' }
]
const typeOptions = computed(() => mode.value === 'Maritime'
  ? [{ value: 'FCL' as Type, title: 'FCL', text: 'Contenedor completo' }, { value: 'LCL' as Type, title: 'LCL', text: 'Coloading o propio' }]
  : mode.value === 'Air'
    ? [{ value: 'AIR_LCL' as Type, title: 'LCL', text: 'Carga aérea consolidada' }]
    : [{ value: 'FTL' as Type, title: 'FTL', text: 'Camión completo' }, { value: 'LTL' as Type, title: 'LTL', text: 'Carga terrestre consolidada' }])
const equipmentMode = computed(() => shipmentType.value === 'FCL' || shipmentType.value === 'FTL')
const selectedOrigin = computed(() => locations.value.find(x => x.id === form.originLocationId))
const selectedDest = computed(() => locations.value.find(x => x.id === form.destinationLocationId))
const incoterms = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']
const serviceOptions = ['Transporte internacional','Agencia de aduanas','Almacenamiento','Control de inventario','Embalaje de carga','Picking de carga','Recepción de carga','Seguro de carga','Transporte local']
const cargoFlagOptions = ['Carga peligrosa','No estibable','Sobrepeso']
function selectMode(value: Mode) {
  if (mode.value !== value) {
    mode.value = value
    shipmentType.value = null
    form.originLocationId = ''; form.destinationLocationId = ''; form.podLocationId = ''
    locations.value = []
  }
  error.value = ''
}
function toggle(collection: string[], value: string) {
  if (value === 'Transporte internacional') return
  const at = collection.indexOf(value)
  if (at >= 0) collection.splice(at, 1)
  else collection.push(value)
}
function addEquipment() { if (form.equipment.length < 25) form.equipment.push({size:'',type:'',quantity:1,unitWeightsKg:[0]}) }
function addPackage() { if (form.packages.length < 25) form.packages.push({description:'',quantity:1,weight:0,length:0,width:0,height:0,stackability:'Stackable'}) }
function syncWeights(line: ContainerLine) {
  const n = Number(line.quantity)
  if (!Number.isInteger(n) || n < 1 || n > 25) return
  while(line.unitWeightsKg.length < n) line.unitWeightsKg.push(0)
  line.unitWeightsKg.splice(n)
}
async function loadLocations() {
  if (!mode.value) return
  const kind = mode.value === 'Maritime' ? 'seaport' : mode.value === 'Air' ? 'airport' : 'inland'
  locationLoading.value = true
  try {
    const response = await fetch('/api/quotes/official/locations?kind=' + kind, {credentials:'same-origin',cache:'no-store'})
    if (!response.ok) throw new Error('No se pudo consultar el catálogo de ubicaciones.')
    const result = await response.json() as {items: Loc[]}
    locations.value = result.items
  } catch (e) { error.value = (e as Error).message }
  finally { locationLoading.value = false }
}
onMounted(async () => {
  const user = await refreshSession()
  if (!user || !['cliente','administrador'].includes(user.role)) { error.value = 'Se requiere sesión real para enviar solicitudes.'; return }
  sessionOk.value = true
  form.contactEmail = user.correo
})
function validate(): string {
  if (step.value === 1) return mode.value ? '' : 'Seleccioná la modalidad.'
  if (step.value === 2) return shipmentType.value ? '' : 'Seleccioná el tipo de embarque.'
  if (step.value === 3) {
    if (!form.originLocationId || !form.destinationLocationId || form.originLocationId === form.destinationLocationId) return 'Elegí origen y destino distintos.'
    if (!form.incoterm) return 'Seleccioná un Incoterm.'
    if (!form.cargoReadyDate) return 'Indicá la fecha de carga lista.'
    if (form.incoterm === 'EXW' && (!form.exwCargoStatus || !form.exwPickupAddress.trim())) return 'Completá el tipo de carga y la dirección de recolección EXW.'
    if (equipmentMode.value && form.equipment.some(x => !x.size || !x.type || !Number.isInteger(Number(x.quantity)) || x.quantity < 1 || x.unitWeightsKg.length !== Number(x.quantity) || x.unitWeightsKg.some(v => Number(v) <= 0))) return 'Completá todos los equipos y el peso de cada unidad.'
    return ''
  }
  if (!form.contactName.trim() || !form.contactEmail.trim() || !form.contactPhone.trim()) return 'Completá los datos de contacto.'
  if (!form.cargoDescription.trim()) return 'Describí la carga.'
  if (!equipmentMode.value && form.packages.some(x => !x.description.trim() || x.quantity < 1 || x.weight <= 0 || x.length <= 0 || x.width <= 0 || x.height <= 0)) return 'Completá todas las medidas y los pesos de cada línea.'
  return ''
}
async function next() {
  error.value = validate()
  if (error.value) return
  if (step.value === 2) await loadLocations()
  if (step.value < 4) { step.value++; window.scrollTo({top:0,behavior:'smooth'}) }
}
function back() { if (step.value > 1) {step.value--;error.value='';window.scrollTo({top:0,behavior:'smooth'})} }
function payload() {
  return {
    mode: mode.value, shipmentType: shipmentType.value,
    originLocationId: form.originLocationId, destinationLocationId: form.destinationLocationId,
    podLocationId: mode.value === 'Maritime' && form.podLocationId ? form.podLocationId : null,
    contactName: form.contactName, contactEmail: form.contactEmail, contactPhone: form.contactPhone,
    incoterm: form.incoterm || null, cargoReadyDate: form.cargoReadyDate,
    services: form.services, equipment: equipmentMode.value ? form.equipment : [],
    packages: equipmentMode.value ? [] : form.packages,
    dimensionUnit: equipmentMode.value ? null : form.dimensionUnit,
    weightUnit: equipmentMode.value ? null : form.weightUnit,
    exwCargoStatus: form.incoterm === 'EXW' ? form.exwCargoStatus : null,
    exwPickupAddress: form.incoterm === 'EXW' ? form.exwPickupAddress : null,
    cargoDescription: form.cargoDescription, cabysCode: form.cabysCode || null,
    cargoValue: form.cargoValue === '' ? null : Number(form.cargoValue),
    declaredWeight: form.declaredWeight === '' ? null : Number(form.declaredWeight),
    declaredPackages: form.declaredPackages === '' ? null : Number(form.declaredPackages),
    observations: form.observations || null, cargoFlags: form.cargoFlags,
    destinationHandling: form.destinationHandling || null
  }
}
async function submit() {
  if (!sessionOk.value || busy.value) return
  error.value = validate()
  if (error.value) return
  busy.value = true
  try {
    const response = await fetch('/api/quotes/official', {
      method:'POST',credentials:'same-origin',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(payload())
    })
    const data = await response.json() as {id?:string;error?:string}
    if (!response.ok) throw new Error(data.error || 'No se pudo enviar la solicitud (HTTP '+response.status+').')
    createdId.value = data.id || ''
  } catch (e) { error.value = e instanceof Error ? e.message : 'Error al enviar.' }
  finally { busy.value = false }
}
</script>

<template>
  <div class="app-site official-page">
    <SiteHeader />
    <main class="official-shell">
      <header class="official-header">
        <p class="official-kicker">CASTRO FALLAS · SOLICITUD DE COTIZACIÓN</p>
        <h1>Contanos qué necesitás transportar</h1>
        <p>Completá cuatro pasos sencillos. Un ejecutivo revisará tu solicitud antes de gestionarla.</p>
      </header>
      <div v-if="createdId" class="official-success" role="status">
        <span class="official-success-icon">✓</span>
        <h2>¡Solicitud recibida!</h2>
        <p>Se guardó correctamente y está pendiente de revisión administrativa. Todavía no se ha enviado a Dhole.</p>
        <p class="official-id">Número de referencia: {{ createdId }}</p>
        <a class="official-link" href="/home">Volver al inicio</a>
      </div>
      <template v-else>
        <nav class="official-progress" aria-label="Progreso de la solicitud">
          <div v-for="(name,i) in ['Modalidad','Embarque','Información','Carga y envío']" :key="name"
               class="official-progress-item" :class="{ current: step === i+1, done: step > i+1 }"
               :aria-current="step === i+1 ? 'step' : undefined">
            <span>{{ step > i+1 ? '✓' : i+1 }}</span><small>{{ name }}</small>
          </div>
        </nav>
        <section class="official-panel">
          <template v-if="step === 1">
            <p class="official-kicker">PASO 1 DE 4</p>
            <h2>¿Cómo querés transportar tu carga?</h2>
            <p class="official-hint">Elegí la modalidad que mejor corresponde a tu solicitud.</p>
            <div class="official-choices">
              <button v-for="choice in modeOptions" :key="choice.value" type="button" class="official-choice"
                :class="{ chosen: mode === choice.value }" :aria-pressed="mode === choice.value"
                @click="selectMode(choice.value)">
                <span class="official-emoji">{{ choice.icon }}</span><strong>{{ choice.title }}</strong><small>{{ choice.text }}</small>
              </button>
            </div>
          </template>
          <template v-else-if="step === 2">
            <p class="official-kicker">PASO 2 DE 4</p><h2>Tipo de embarque</h2>
            <p class="official-hint">Mostramos únicamente las opciones de {{ mode === 'Maritime' ? 'transporte marítimo' : mode === 'Air' ? 'transporte aéreo' : 'transporte terrestre' }}.</p>
            <div class="official-choices">
              <button v-for="choice in typeOptions" :key="choice.value" type="button" class="official-choice"
                :class="{ chosen: shipmentType === choice.value }" :aria-pressed="shipmentType === choice.value"
                @click="shipmentType = choice.value">
                <strong>{{ choice.title }}</strong><small>{{ choice.text }}</small>
              </button>
            </div>
          </template>
          <template v-else-if="step === 3">
            <p class="official-kicker">PASO 3 DE 4</p><h2>Ruta, equipo y servicios</h2>
            <p class="official-hint">Solo pedimos los datos necesarios para {{ shipmentType }}.</p>
            <p v-if="!locationLoading && !locations.length" class="official-catalog-alert">Aún no hay ubicaciones cargadas para esta modalidad. El administrador debe configurar el catálogo antes de poder enviar solicitudes.</p>
            <p v-else-if="locations.some(loc => loc.code?.startsWith('DEV-'))" class="official-catalog-alert" role="note">Modo de pruebas: los lugares marcados como PRUEBA son ficticios y sirven únicamente para comprobar el formulario. No corresponden a rutas reales.</p>
            <div class="official-fields">
              <label>Origen <span>*</span><select v-model="form.originLocationId" required><option value="">Seleccionar origen</option><option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
              <label>Destino <span>*</span><select v-model="form.destinationLocationId" required><option value="">Seleccionar destino</option><option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
              <label v-if="mode === 'Maritime'">POD (opcional)<select v-model="form.podLocationId"><option value="">Sin POD adicional</option><option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
              <label>Incoterm <span>*</span><select v-model="form.incoterm" required><option value="">Seleccionar Incoterm</option><option v-for="item in incoterms" :key="item">{{ item }}</option></select></label>
              <label>Fecha de carga lista <span>*</span><input v-model="form.cargoReadyDate" type="date" required /></label>
            </div>
            <div v-if="form.incoterm === 'EXW'" class="official-nested">
              <h3>Información adicional para EXW</h3>
              <div class="official-fields">
                <label>Tipo de carga <span>*</span><select v-model="form.exwCargoStatus"><option value="">Seleccionar</option><option value="fiscal">Carga fiscal</option><option value="nationalized">Carga nacionalizada</option></select></label>
                <label>Dirección de recolección <span>*</span><input v-model.trim="form.exwPickupAddress" maxlength="800" placeholder="Indicá la dirección" /></label>
              </div>
            </div>
            <div class="official-nested">
              <div class="official-headline"><h3>{{ equipmentMode ? 'Distribución de equipos' : 'Servicios solicitados' }}</h3><button v-if="equipmentMode" class="official-ghost" type="button" @click="addEquipment">+ Añadir equipo</button></div>
              <template v-if="equipmentMode">
                <div v-for="(line,i) in form.equipment" :key="i" class="official-line">
                  <div class="official-headline"><strong>Equipo {{ i+1 }}</strong><button v-if="form.equipment.length>1" type="button" class="official-remove" @click="form.equipment.splice(i,1)">Quitar</button></div>
                  <div class="official-fields">
                    <label>{{ shipmentType === 'FCL' ? 'Tamaño del contenedor' : 'Furgón' }} <span>*</span>
                      <select v-model="line.size"><option value="">Seleccionar</option><template v-if="shipmentType === 'FCL'"><option>20 pies</option><option>40 pies</option><option>45 pies</option><option>48 pies</option></template><template v-else><option>24 pies / 5 TON</option><option>26 pies / 7 TON</option><option>40 pies</option><option>53 pies</option></template></select>
                    </label>
                    <label>Tipo <span>*</span><select v-model="line.type"><option value="">Seleccionar</option><template v-if="shipmentType === 'FCL'"><option>Dry Van</option><option>High Cube</option><option>Open Top</option><option>Open Side</option><option>Tank</option><option>Flat Rack</option><option>NOR</option></template><template v-else><option>Furgón</option></template></select></label>
                    <label>Cantidad <span>*</span><input v-model.number="line.quantity" type="number" min="1" max="25" step="1" @input="syncWeights(line)" /></label>
                    <label v-for="(weight,wi) in line.unitWeightsKg" :key="wi">Peso {{ wi+1 }} (kg) <span>*</span><input v-model.number="line.unitWeightsKg[wi]" type="number" min="0.001" step="any" /></label>
                  </div>
                </div>
              </template>
            </div>
            <div class="official-nested"><h3>Servicios</h3><p class="official-hint">El transporte internacional viene seleccionado.</p><div class="official-checks"><label v-for="s in serviceOptions" :key="s"><input type="checkbox" :checked="form.services.includes(s)" :disabled="s === 'Transporte internacional'" @change="toggle(form.services,s)" />{{ s }}</label></div></div>
          </template>
          <template v-else>
            <p class="official-kicker">PASO 4 DE 4</p><h2>Descripción de carga y contacto</h2>
            <p class="official-hint">Revisá los detalles. No se piden archivos ni se calculan tarifas.</p>
            <div class="official-fields">
              <label class="full">Descripción de la carga <span>*</span><textarea v-model.trim="form.cargoDescription" rows="3" maxlength="4000" placeholder="¿Qué productos necesitás transportar?" /></label>
              <label>Código CABYS (opcional)<input v-model.trim="form.cabysCode" maxlength="40" placeholder="Ingresá el código si lo conocés" /></label>
              <label>Valor de la carga (si aplica)<input v-model.number="form.cargoValue" type="number" min="0" step="any" /></label>
              <label>Peso declarado (si aplica)<input v-model.number="form.declaredWeight" type="number" min="0" step="any" /></label>
              <label>Cantidad de bultos (si aplica)<input v-model.number="form.declaredPackages" type="number" min="0" step="1" /></label>
            </div>
            <div v-if="!equipmentMode" class="official-nested">
              <div class="official-headline"><h3>Medidas de la carga</h3><button class="official-ghost" type="button" @click="addPackage">+ Añadir línea</button></div>
              <div class="official-fields"><label>Unidad de dimensiones<select v-model="form.dimensionUnit"><option value="cm">Centímetros (cm)</option><option value="m">Metros (m)</option><option value="in">Pulgadas (in)</option></select></label><label>Unidad de peso<select v-model="form.weightUnit"><option value="kg">Kilogramos (kg)</option><option value="lb">Libras (lb)</option></select></label></div>
              <div v-for="(line,i) in form.packages" :key="i" class="official-line">
                <div class="official-headline"><strong>Bulto / Línea {{ i+1 }}</strong><button v-if="form.packages.length>1" class="official-remove" type="button" @click="form.packages.splice(i,1)">Quitar</button></div>
                <div class="official-fields">
                  <label class="full">Descripción <span>*</span><input v-model.trim="line.description" maxlength="400" /></label>
                  <label>Cantidad <span>*</span><input v-model.number="line.quantity" min="1" step="1" type="number" /></label>
                  <label>Peso total <span>*</span><input v-model.number="line.weight" min="0.001" step="any" type="number" /></label>
                  <label>Largo <span>*</span><input v-model.number="line.length" min="0.001" step="any" type="number" /></label>
                  <label>Ancho <span>*</span><input v-model.number="line.width" min="0.001" step="any" type="number" /></label>
                  <label>Alto <span>*</span><input v-model.number="line.height" min="0.001" step="any" type="number" /></label>
                  <label>Estibabilidad<select v-model="line.stackability"><option value="Stackable">Estibable</option><option value="NonStackable">No estibable</option></select></label>
                </div>
              </div>
            </div>
            <div class="official-nested"><h3>Opciones de carga</h3><div class="official-checks"><label v-for="flag in cargoFlagOptions" :key="flag"><input type="checkbox" :checked="form.cargoFlags.includes(flag)" @change="toggle(form.cargoFlags,flag)" />{{ flag }}</label></div><label class="official-single">Observaciones<textarea v-model.trim="form.observations" maxlength="4000" rows="3" /></label></div>
            <div class="official-nested"><h3>Datos de contacto</h3><div class="official-fields"><label>Nombre <span>*</span><input v-model.trim="form.contactName" maxlength="150" autocomplete="name" /></label><label>Correo <span>*</span><input v-model.trim="form.contactEmail" type="email" maxlength="255" autocomplete="email" /></label><label>Teléfono <span>*</span><input v-model.trim="form.contactPhone" maxlength="40" autocomplete="tel" /></label></div></div>
            <div class="official-summary"><strong>Resumen</strong><span>{{ mode }} · {{ shipmentType }}</span><span>{{ selectedOrigin?.displayName }} → {{ selectedDest?.displayName }}</span><span>{{ form.services.join(', ') }}</span></div>
          </template>
          <p v-if="error" class="official-error" role="alert">{{ error }}</p>
          <footer class="official-buttons">
            <button v-if="step>1" type="button" class="official-back" :disabled="busy" @click="back">← Atrás</button><span v-else></span>
            <button v-if="step<4" type="button" class="official-primary" @click="next">Continuar →</button>
            <button v-else type="button" class="official-primary" :disabled="busy || !sessionOk" @click="submit">{{ busy ? 'Enviando…' : 'Enviar solicitud →' }}</button>
          </footer>
        </section>
      </template>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.official-page{background:linear-gradient(150deg,#fff9fa,#f7f7fa);color:#242630}.official-shell{width:min(960px,calc(100% - 32px));margin:auto;padding:52px 0 90px}.official-header{max-width:700px;margin-bottom:29px}.official-kicker{font-size:11px;font-weight:900;letter-spacing:.16em;color:#a90a26;margin:0 0 12px}.official-header h1{font-size:clamp(31px,4.5vw,51px);line-height:1.12;letter-spacing:-.05em;margin:0 0 14px}.official-header>p:last-child,.official-hint{color:#626778;font-size:14px;line-height:1.7}.official-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:20px}.official-progress-item{display:flex;align-items:center;gap:9px;border-radius:12px;padding:11px 12px;background:#efedf0;color:#777584;min-width:0}.official-progress-item span{display:grid;place-items:center;flex-shrink:0;width:29px;height:29px;border-radius:50%;background:#dedbe0;font-size:12px;font-weight:850}.official-progress-item small{font-size:12px;font-weight:750;white-space:normal}.official-progress-item.current{background:#a90928;color:white}.official-progress-item.current span{background:white;color:#a90928}.official-progress-item.done{color:#39735a;background:#e8f5ec}.official-panel{background:white;border:1px solid #e9e0e5;box-shadow:0 20px 55px #38202a0b;border-radius:23px;padding:clamp(20px,4vw,42px)}.official-panel h2{font-size:clamp(23px,3vw,30px);letter-spacing:-.035em;margin:0 0 8px}.official-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin-top:28px}.official-choice{background:#fff;border:1px solid #dcdde4;border-radius:15px;min-height:140px;display:flex;flex-direction:column;text-align:left;gap:11px;padding:21px;cursor:pointer;color:#262935}.official-choice:hover,.official-choice.chosen{border-color:#af1432;background:#fff6f7;box-shadow:0 0 0 2px #b5142920}.official-emoji{font-size:27px}.official-choice strong{font-size:17px}.official-choice small{font-size:12px;color:#687080;line-height:1.5}.official-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}.official-fields label,.official-single{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#4e5260;font-weight:800;min-width:0}.official-fields label span{color:#ad112f}.official-fields .full{grid-column:1/-1}.official-fields input,.official-fields select,.official-fields textarea,.official-single textarea{width:100%;background:white;color:#252937;border:1px solid #cfd0d9;border-radius:10px;padding:12px;min-height:45px;font:inherit;font-size:14px;outline-offset:2px}.official-fields input:focus,.official-fields select:focus,.official-fields textarea:focus{outline:2px solid #b61534}.official-nested{margin-top:27px;padding-top:24px;border-top:1px solid #eee5e9}.official-nested h3{font-size:17px;margin:0 0 12px}.official-line{padding:18px;background:#faf9fb;border:1px solid #e8e1e7;border-radius:14px;margin:12px 0}.official-line strong{font-size:13px}.official-headline{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}.official-ghost,.official-remove{border:1px solid #d6bdc5;background:white;color:#9b1732;font-size:12px;font-weight:850;border-radius:9px;padding:9px 12px;cursor:pointer}.official-remove{color:#7a5964}.official-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}.official-checks label{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.5}.official-checks input{accent-color:#ae112e;width:17px;height:17px}.official-single{margin-top:20px}.official-summary{padding:15px;margin-top:25px;display:grid;gap:8px;border-radius:12px;background:#f8f5f7;font-size:13px;overflow-wrap:anywhere}.official-summary span{color:#656b76}.official-buttons{border-top:1px solid #ede7eb;padding-top:22px;margin-top:29px;display:flex;justify-content:space-between;gap:12px}.official-primary,.official-back{padding:13px 23px;border-radius:11px;min-height:46px;border:0;font-weight:850;font-size:13px;cursor:pointer}.official-primary{background:#b20c2d;color:white}.official-primary:disabled{opacity:.6}.official-back{border:1px solid #d4c4cc;color:#9b1b36;background:white}.official-error,.official-catalog-alert{margin-top:20px;padding:13px;border-radius:12px;border:1px solid #e8b4bf;color:#981a38;background:#fff0f3;font-size:13px;line-height:1.6}.official-success{text-align:center;background:white;border-radius:22px;border:1px solid #dfd9df;padding:50px 24px}.official-success-icon{font-size:36px;color:#238756}.official-success h2{font-size:28px}.official-success p{line-height:1.6}.official-id{overflow-wrap:anywhere;color:#697080;font-size:13px}.official-link{display:inline-block;margin-top:16px;color:white;background:#ad0d2b;padding:12px 20px;border-radius:10px;font-weight:800}@media(max-width:670px){.official-shell{padding-top:30px}.official-progress-item{flex-direction:column;padding:9px 4px;gap:4px;text-align:center}.official-progress-item small{font-size:10px}.official-fields,.official-checks{grid-template-columns:1fr}.official-buttons .official-primary{flex:1}.official-choices{grid-template-columns:1fr}.official-choice{min-height:98px}}

/* El tema oscuro global fuerza texto blanco: dar también fondos oscuros a cada superficie. */
:global(html.theme-dark) .official-page {
  background: linear-gradient(140deg, #1b1320 0%, #0e182b 75%) !important;
  color: #f6f7fb !important;
  color-scheme: dark;
}
:global(html.theme-dark) .official-shell .official-panel,
:global(html.theme-dark) .official-shell .official-success {
  background: #1b2435 !important;
  border-color: #444f63 !important;
  color: #f5f7ff !important;
}
:global(html.theme-dark) .official-shell .official-header > p:last-child,
:global(html.theme-dark) .official-shell .official-hint,
:global(html.theme-dark) .official-shell .official-choice small,
:global(html.theme-dark) .official-shell .official-summary span,
:global(html.theme-dark) .official-shell .official-id {
  color: #c6d1e3 !important;
}
:global(html.theme-dark) .official-shell .official-kicker {
  color: #ff879d !important;
}
:global(html.theme-dark) .official-shell .official-progress-item {
  background: #263146 !important;
  color: #e1e7f1 !important;
}
:global(html.theme-dark) .official-shell .official-progress-item span {
  background: #46546d !important;
  color: #fff !important;
}
:global(html.theme-dark) .official-shell .official-progress-item.current {
  background: #a91031 !important;
  color: #fff !important;
}
:global(html.theme-dark) .official-shell .official-progress-item.current span {
  background: #fff !important;
  color: #9f0c29 !important;
}
:global(html.theme-dark) .official-shell .official-progress-item.done {
  background: #1a4238 !important;
  color: #c9f5df !important;
}
:global(html.theme-dark) .official-shell .official-choice {
  background: #131e31 !important;
  border-color: #4b5a70 !important;
  color: #f5f7fd !important;
}
:global(html.theme-dark) .official-shell .official-choice:is(:hover, .chosen, :focus-visible) {
  background: #392135 !important;
  border-color: #ff819d !important;
  box-shadow: 0 0 0 2px rgba(255, 129, 157, .17);
}
:global(html.theme-dark) .official-shell .official-line,
:global(html.theme-dark) .official-shell .official-summary {
  background: #121c2d !important;
  border-color: #45536b !important;
}
:global(html.theme-dark) .official-shell .official-nested,
:global(html.theme-dark) .official-shell .official-buttons {
  border-color: #46516a !important;
}
:global(html.theme-dark) .official-shell .official-fields label,
:global(html.theme-dark) .official-shell .official-single { color: #e8ecf5 !important; }
:global(html.theme-dark) .official-shell .official-fields :is(input, select, textarea),
:global(html.theme-dark) .official-shell .official-single textarea {
  background: #111a2c !important;
  color: #f7f9fd !important;
  border-color: #586780 !important;
}
:global(html.theme-dark) .official-shell :is(input, textarea)::placeholder {
  color: #bbc5d7 !important;
  opacity: 1;
}
:global(html.theme-dark) .official-shell :is(.official-ghost, .official-remove, .official-back) {
  background: #273146 !important;
  color: #ffd8e1 !important;
  border-color: #67778f !important;
}
:global(html.theme-dark) .official-shell .official-primary,
:global(html.theme-dark) .official-shell .official-link {
  background: #b10c30 !important;
  color: #fff !important;
}
:global(html.theme-dark) .official-shell .official-success-icon {
  color: #83e6b1 !important;
}
:global(html.theme-dark) .official-shell :is(.official-error, .official-catalog-alert) {
  background: #382032 !important;
  color: #ffd1db !important;
  border-color: #925268 !important;
}
:global(html.theme-dark) .official-shell :is(button, a, input, select, textarea):focus-visible {
  outline: 3px solid #fa829f;
  outline-offset: 3px;
}
</style>