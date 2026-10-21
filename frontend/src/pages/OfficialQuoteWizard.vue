<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Plane, Ship, Truck } from '@lucide/vue'
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
const destinations = ref<Loc[]>([])
const podOptions = ref<Loc[]>([])
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
  observations: '', cargoFlags: [] as string[], destinationHandling: '',
  deliveryAddress: '', pickupAddress: '', fiscalStorageDays: '' as number | ''
})
const modeOptions = [
  { value: 'Maritime' as Mode, title: 'Marítimo', icon: Ship, text: 'Contenedores completos o carga consolidada' },
  { value: 'Air' as Mode, title: 'Aéreo', icon: Plane, text: 'Carga aérea consolidada' },
  { value: 'Land' as Mode, title: 'Terrestre', icon: Truck, text: 'Camión completo o carga consolidada' }
]
const typeOptions = computed(() => mode.value === 'Maritime'
  ? [{ value: 'FCL' as Type, title: 'FCL', text: 'Contenedor completo' }, { value: 'LCL' as Type, title: 'LCL', text: 'Coloading o propio' }]
  : mode.value === 'Air'
    ? [{ value: 'AIR_LCL' as Type, title: 'LCL', text: 'Carga aérea consolidada' }]
    : [{ value: 'FTL' as Type, title: 'FTL', text: 'Camión completo' }, { value: 'LTL' as Type, title: 'LTL', text: 'Carga terrestre consolidada' }])
const equipmentMode = computed(() => shipmentType.value === 'FCL' || shipmentType.value === 'FTL')
const selectedOrigin = computed(() => locations.value.find(x => x.id === form.originLocationId))
const selectedDest = computed(() => destinations.value.find(x => x.id === form.destinationLocationId))
const incoterms = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']
const serviceOptions = ['Transporte internacional','Agencia de Aduanas CR','Agencia de Aduanas Exterior','Almacenamiento','Control de inventario','Embalaje','Exoneración','Picking Carga','Recepción de carga','Seguro de carga','Transporte entrega','Transporte recolección','Transporte nacional']
const cargoFlagOptions = ['Carga peligrosa','No estibable','Sobrepeso']
function selectMode(value: Mode) {
  if (mode.value !== value) {
    mode.value = value
    shipmentType.value = null
    form.originLocationId = ''; form.destinationLocationId = ''; form.podLocationId = ''
    locations.value = []; destinations.value = []; podOptions.value = []
  }
  error.value = ''
}
function toggle(collection: string[], value: string) {
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
  if (!mode.value || !shipmentType.value) return
  const kind = mode.value === 'Maritime' ? 'seaport' : mode.value === 'Air' ? 'airport' : 'inland'
  locationLoading.value = true
  try {
    const fetchRole = async (routeRole: 'origin' | 'destination' | 'pod') => {
      const params = new URLSearchParams({kind,shipmentType:shipmentType.value!,routeRole})
      const response = await fetch('/api/quotes/official/locations?' + params, {credentials:'same-origin',cache:'no-store'})
      if (!response.ok) throw new Error('No se pudo consultar el catálogo de ' + routeRole + '.')
      const result = await response.json() as {items: Loc[]}
      return result.items
    }
    const [orig, dest, pod] = await Promise.all([fetchRole('origin'),fetchRole('destination'),mode.value === 'Maritime' ? fetchRole('pod') : Promise.resolve([] as Loc[])])
    locations.value = orig; destinations.value = dest; podOptions.value = pod
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
    if (shipmentType.value === 'LCL' && !form.podLocationId) return 'Seleccioná el POD requerido en marítimo LCL.'
    if (!form.incoterm) return 'Seleccioná un Incoterm.'
    if (!form.cargoReadyDate) return 'Indicá la fecha de carga lista.'
    if (!form.services.length) return 'Seleccioná al menos un servicio.'
    if (form.services.includes('Transporte entrega') && !form.deliveryAddress.trim()) return 'Escribí la dirección de entrega.'
    if (form.services.includes('Transporte recolección') && !form.pickupAddress.trim()) return 'Escribí la dirección de recolección.'
    if (form.services.includes('Almacenamiento') && (!Number.isInteger(Number(form.fiscalStorageDays)) || Number(form.fiscalStorageDays) < 1 || Number(form.fiscalStorageDays) > 36500)) return 'Indicá los días de almacenaje fiscal.'
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
    destinationHandling: form.destinationHandling || null,
    deliveryAddress: form.services.includes('Transporte entrega') ? form.deliveryAddress.trim() : null,
    pickupAddress: form.services.includes('Transporte recolección') ? form.pickupAddress.trim() : null,
    fiscalStorageDays: form.services.includes('Almacenamiento') ? Number(form.fiscalStorageDays) : null
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
  <div class="app-site official-page" :class="{ 'official-page--wide-wizard': !createdId, 'official-page--mode-selection': step <= 2 && !createdId }">
    <SiteHeader />
    <main class="official-shell">
      <header class="official-header">
        <p class="official-kicker">CASTRO FALLAS · SOLICITUD DE COTIZACIÓN</p>
        <h1>Tu carga, <span>más cerca de su destino.</span></h1>
        <p>Contanos qué necesitás transportar. En cuatro pasos sencillos preparás tu solicitud para nuestro equipo de logística.</p>
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
        <section class="official-panel" :class="{ 'official-panel--mode-selection': step <= 2 }">
          <!-- El reflejo se desplaza detrás del contenido y nunca intercepta clics. -->
          <div v-if="step <= 2" class="official-glass-glow" aria-hidden="true"></div>
          <template v-if="step === 1">
            <p class="official-kicker">PASO 1 DE 4</p>
            <h2>¿Cómo querés transportar tu carga?</h2>
            <p class="official-hint">Elegí la modalidad que mejor corresponde a tu solicitud.</p>
            <div class="official-choices">
              <button v-for="choice in modeOptions" :key="choice.value" type="button" class="official-choice"
                :class="{ chosen: mode === choice.value }" :aria-pressed="mode === choice.value"
                @click="selectMode(choice.value)">
                <span class="official-mode-icon" aria-hidden="true"><component :is="choice.icon" :size="38" :stroke-width="1.8" /></span><strong>{{ choice.title }}</strong><small>{{ choice.text }}</small>
              </button>
            </div>
          </template>
          <template v-else-if="step === 2">
            <p class="official-kicker">PASO 2 DE 4</p><h2>Tipo de embarque</h2>
            <p class="official-hint">Mostramos únicamente las opciones de {{ mode === 'Maritime' ? 'transporte marítimo' : mode === 'Air' ? 'transporte aéreo' : 'transporte terrestre' }}.</p>
            <div class="official-choices official-choices--shipment-type">
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
            <p v-if="!locationLoading && (!locations.length || !destinations.length || (shipmentType === 'LCL' && !podOptions.length))" class="official-catalog-alert">Faltan ubicaciones para esta modalidad. El administrador debe completar el catálogo correspondiente.</p>
            <p v-else-if="[...locations,...destinations,...podOptions].some(loc => loc.code?.startsWith('DEV-'))" class="official-catalog-alert" role="note">Modo de pruebas: los lugares marcados como PRUEBA son ficticios y sirven únicamente para comprobar el formulario. No corresponden a rutas reales.</p>
            <div class="official-fields">
              <label>Origen <span>*</span><select v-model="form.originLocationId" required><option value="">Seleccionar origen</option><option v-for="loc in locations" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
              <label>Destino <span>*</span><select v-model="form.destinationLocationId" required><option value="">Seleccionar destino</option><option v-for="loc in destinations" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
              <label v-if="mode === 'Maritime'">POD {{ shipmentType === 'LCL' ? '(requerido)' : '(opcional)' }}<select v-model="form.podLocationId"><option value="">{{ shipmentType === 'LCL' ? 'Seleccionar POD' : 'Sin POD adicional' }}</option><option v-for="loc in podOptions" :key="loc.id" :value="loc.id">{{ loc.displayName }}</option></select></label>
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
            <div class="official-nested"><h3>Servicios</h3><p class="official-hint">Transporte internacional viene marcado inicialmente. Podés quitarlo o seleccionar varios servicios, pero debe quedar al menos uno.</p><div class="official-checks"><label v-for="s in serviceOptions" :key="s"><input type="checkbox" :checked="form.services.includes(s)" @change="toggle(form.services,s)" />{{ s }}</label></div>
              <div v-if="form.services.includes('Almacenamiento') || form.services.includes('Transporte entrega') || form.services.includes('Transporte recolección')" class="official-fields">
                <label v-if="form.services.includes('Almacenamiento')">Días de almacenaje fiscal <span>*</span><input v-model.number="form.fiscalStorageDays" type="number" min="1" max="36500" step="1" /></label>
                <label v-if="form.services.includes('Transporte entrega')" class="full">Dirección de entrega <span>*</span><textarea v-model.trim="form.deliveryAddress" rows="3" maxlength="800" placeholder="Escribí la dirección de entrega"></textarea></label>
                <label v-if="form.services.includes('Transporte recolección')" class="full">Dirección de recolección <span>*</span><textarea v-model.trim="form.pickupAddress" rows="3" maxlength="800" placeholder="Escribí la dirección de recolección"></textarea></label>
              </div>
            </div>
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
.official-page{background:linear-gradient(142deg,#fff8f8 0%,#f7f4f6 56%,#fff 100%);color:#242630}.official-shell{width:min(960px,calc(100% - 32px));margin:auto;padding:52px 0 90px}.official-header{max-width:700px;margin-bottom:29px}.official-kicker{font-size:11px;font-weight:900;letter-spacing:.16em;color:#a90a26;margin:0 0 12px}.official-header h1{font-family:"Arial Black",system-ui,sans-serif;font-size:clamp(34px,5vw,58px);font-weight:900;line-height:1.09;letter-spacing:-.055em;margin:0 0 17px}.official-header h1 span{color:#b20c2a}.official-header>p:last-child,.official-hint{color:#626778;font-size:14px;line-height:1.7}.official-progress{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:20px}.official-progress-item{display:flex;align-items:center;gap:9px;border-radius:12px;padding:11px 12px;background:#efedf0;color:#777584;min-width:0}.official-progress-item span{display:grid;place-items:center;flex-shrink:0;width:29px;height:29px;border-radius:50%;background:#dedbe0;font-size:12px;font-weight:850}.official-progress-item small{font-size:12px;font-weight:750;white-space:normal}.official-progress-item.current{background:#a90928;color:white}.official-progress-item.current span{background:white;color:#a90928}.official-progress-item.done{color:#39735a;background:#e8f5ec}.official-panel{background:white;border:1px solid #e9e0e5;box-shadow:0 20px 55px #38202a0b;border-radius:23px;padding:clamp(20px,4vw,42px)}.official-panel h2{font-size:clamp(23px,3vw,30px);letter-spacing:-.035em;margin:0 0 8px}.official-choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin-top:28px}.official-choice{background:#fff;border:1px solid #dcdde4;border-radius:15px;min-height:140px;display:flex;flex-direction:column;text-align:left;gap:11px;padding:21px;cursor:pointer;color:#262935}.official-choice:hover,.official-choice.chosen{border-color:#af1432;background:#fff6f7;box-shadow:0 0 0 2px #b5142920}.official-emoji{font-size:27px}.official-choice strong{font-size:17px}.official-choice small{font-size:12px;color:#687080;line-height:1.5}.official-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:16px}.official-fields label,.official-single{display:flex;flex-direction:column;gap:7px;font-size:12px;color:#4e5260;font-weight:800;min-width:0}.official-fields label span{color:#ad112f}.official-fields .full{grid-column:1/-1}.official-fields input,.official-fields select,.official-fields textarea,.official-single textarea{width:100%;background:white;color:#252937;border:1px solid #cfd0d9;border-radius:10px;padding:12px;min-height:45px;font:inherit;font-size:14px;outline-offset:2px}.official-fields input:focus,.official-fields select:focus,.official-fields textarea:focus{outline:2px solid #b61534}.official-nested{margin-top:27px;padding-top:24px;border-top:1px solid #eee5e9}.official-nested h3{font-size:17px;margin:0 0 12px}.official-line{padding:18px;background:#faf9fb;border:1px solid #e8e1e7;border-radius:14px;margin:12px 0}.official-line strong{font-size:13px}.official-headline{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}.official-ghost,.official-remove{border:1px solid #d6bdc5;background:white;color:#9b1732;font-size:12px;font-weight:850;border-radius:9px;padding:9px 12px;cursor:pointer}.official-remove{color:#7a5964}.official-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:15px 0}.official-checks label{display:flex;align-items:center;gap:8px;font-size:13px;line-height:1.5}.official-checks input{accent-color:#ae112e;width:17px;height:17px}.official-single{margin-top:20px}.official-summary{padding:15px;margin-top:25px;display:grid;gap:8px;border-radius:12px;background:#f8f5f7;font-size:13px;overflow-wrap:anywhere}.official-summary span{color:#656b76}.official-buttons{border-top:1px solid #ede7eb;padding-top:22px;margin-top:29px;display:flex;justify-content:space-between;gap:12px}.official-primary,.official-back{padding:13px 23px;border-radius:11px;min-height:46px;border:0;font-weight:850;font-size:13px;cursor:pointer}.official-primary{background:#b20c2d;color:white}.official-primary:disabled{opacity:.6}.official-back{border:1px solid #d4c4cc;color:#9b1b36;background:white}.official-error,.official-catalog-alert{margin-top:20px;padding:13px;border-radius:12px;border:1px solid #e8b4bf;color:#981a38;background:#fff0f3;font-size:13px;line-height:1.6}.official-success{text-align:center;background:white;border-radius:22px;border:1px solid #dfd9df;padding:50px 24px}.official-success-icon{font-size:36px;color:#238756}.official-success h2{font-size:28px}.official-success p{line-height:1.6}.official-id{overflow-wrap:anywhere;color:#697080;font-size:13px}.official-link{display:inline-block;margin-top:16px;color:white;background:#ad0d2b;padding:12px 20px;border-radius:10px;font-weight:800}@media(max-width:670px){.official-shell{padding-top:30px}.official-progress-item{flex-direction:column;padding:9px 4px;gap:4px;text-align:center}.official-progress-item small{font-size:10px}.official-fields,.official-checks{grid-template-columns:1fr}.official-buttons .official-primary{flex:1}.official-choices{grid-template-columns:1fr}.official-choice{min-height:98px}}

/* El formulario reemplaza a la versión anterior sin perder su rojo institucional. */
.official-page .official-shell { position: relative; }
.official-page .official-header { border-left: 4px solid #b20c2a; padding-left: clamp(16px,3vw,26px); }
.official-page .official-progress-item.current { background: #b20c2a; }
.official-page .official-primary { background: #b20c2a; }
.official-page .official-choice.chosen { border-color: #b20c2a; }
.official-page .official-success { color: #242630; }
/* El tema global fuerza tipografía blanca: las superficies también deben oscurecerse. */
:global(html.theme-dark) .official-page { background: linear-gradient(120deg,#171316 0%,#211b20 52%,#01081d 100%) !important; color:#fff!important; color-scheme:dark; }
:global(html.theme-dark) .official-page .official-header h1 span { color:#ff8095!important; }
:global(html.theme-dark) .official-page .official-header>p:last-child,
:global(html.theme-dark) .official-page .official-hint,
:global(html.theme-dark) .official-page .official-choice small,
:global(html.theme-dark) .official-page .official-summary span,
:global(html.theme-dark) .official-page .official-id { color:#c4c5cf!important; }
:global(html.theme-dark) .official-page .official-panel,
:global(html.theme-dark) .official-page .official-success { background:#211b20!important; color:#fff!important; border-color:#565057!important; }
:global(html.theme-dark) .official-page .official-choice,
:global(html.theme-dark) .official-page .official-line,
:global(html.theme-dark) .official-page .official-summary { background:#121a30!important; border-color:#3b465f!important; color:#fff!important; }
:global(html.theme-dark) .official-page .official-choice:is(.chosen,:hover) { background:#34212e!important; border-color:#ef233c!important; }
:global(html.theme-dark) .official-page .official-progress-item { background:#29252f!important; color:#fff!important; }
:global(html.theme-dark) .official-page .official-progress-item.current { background:#b20c2a!important; }
:global(html.theme-dark) .official-page .official-progress-item span { background:#3b465f!important; color:#fff!important; }
:global(html.theme-dark) .official-page .official-progress-item.current span { background:#fff!important; color:#b20c2a!important; }
:global(html.theme-dark) .official-page .official-progress-item.done { background:#224134!important; }
:global(html.theme-dark) .official-page .official-fields label,
:global(html.theme-dark) .official-page .official-single { color:#fff!important; }
:global(html.theme-dark) .official-page :is(input,select,textarea) { background:#121a30!important; color:#fff!important; border-color:#3b465f!important; }
:global(html.theme-dark) .official-page :is(input,textarea)::placeholder { color:#bac3d5!important; opacity:1; }
:global(html.theme-dark) .official-page .official-ghost,
:global(html.theme-dark) .official-page .official-remove,
:global(html.theme-dark) .official-page .official-back { background:#121a30!important; color:#fff!important; border-color:#565b6b!important; }
:global(html.theme-dark) .official-page .official-error,
:global(html.theme-dark) .official-page .official-catalog-alert { background:#321b28!important; color:#ffcfda!important; border-color:#99566c!important; }
:global(html.theme-dark) .official-page .official-primary,
:global(html.theme-dark) .official-page .official-link { background:#b20c2a!important; color:#fff!important; }
:global(html.theme-dark) .official-page .official-kicker { color:#ff8ca2!important; }
@media (prefers-reduced-motion:reduce) { .official-page * { scroll-behavior:auto!important; } }

/* Pasos 1 y 2 comparten el Glass y el degradado carbon a vino. 
   Los pasos 3 y 4 conservan el layout ancho sin alterar los formularios. */
.official-page--wide-wizard:not(.official-page--mode-selection) {
  min-height: 100dvh;
  width: 100%;
  max-width: 100%;
  overflow-x: clip;
  overflow-y: visible;
}
.official-page--wide-wizard:not(.official-page--mode-selection) .official-shell {
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-width: 0;
  margin-inline: auto;
  padding-inline: clamp(32px, 5.5vw, 108px);
}
.official-page--wide-wizard .official-progress,
.official-page--wide-wizard .official-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
@media (max-width: 1040px) and (min-width: 751px) {
  .official-page--wide-wizard:not(.official-page--mode-selection) .official-shell {
    padding-inline: clamp(28px, 5vw, 64px);
  }
}
@media (max-width: 750px) {
  .official-page--wide-wizard:not(.official-page--mode-selection) .official-shell {
    padding-inline: 24px;
  }
}
@media (max-width: 390px) {
  .official-page--wide-wizard:not(.official-page--mode-selection) .official-shell {
    padding-inline: 16px;
  }
}
.official-page--mode-selection {
  min-height: 100dvh;
  height: auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  /* El overflow:hidden global de app-site no debe recortar el contenido. */
  overflow-x: clip;
  overflow-y: visible;
  background: linear-gradient(90deg, #491b2b 0%, #281a22 37%, #181419 72%, #181419 100%) !important;
  color: #fff;
}
.official-page--mode-selection .official-shell {
  /* Gutter interior en vez de width:calc: mantiene un borde derecho real en Safari. */
  box-sizing: border-box;
  width: 100%;
  max-width: none;
  min-width: 0;
  height: auto;
  min-height: calc(100dvh - 76px);
  margin: 0 auto;
  padding: clamp(24px, 3vh, 42px) clamp(32px, 5.5vw, 108px) clamp(40px, 5vh, 72px);
  overflow: visible;
}
.official-page--mode-selection .official-progress,
.official-page--mode-selection .official-panel--mode-selection,
.official-page--mode-selection .official-choices {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.official-page--mode-selection .official-header {
  max-width: 100%;
  border-left-color: rgba(255, 255, 255, .8);
}
.official-page--mode-selection .official-header h1,
.official-page--mode-selection .official-header h1 span { color: #fff !important; }
.official-page--mode-selection .official-header > p:last-child,
.official-page--mode-selection .official-hint { color: rgba(255, 255, 255, .82) !important; }
.official-page--mode-selection .official-kicker { color: #ffd3dc !important; }
.official-page--mode-selection .official-progress-item {
  background: rgba(255, 255, 255, .09);
  color: rgba(255, 255, 255, .82);
  border: 1px solid rgba(255, 255, 255, .12);
}
.official-page--mode-selection .official-progress-item span {
  background: rgba(255, 255, 255, .14);
  color: #fff;
}
.official-page--mode-selection .official-progress-item.current {
  background: rgba(178, 12, 42, .65);
  color: #fff;
  border-color: rgba(255, 255, 255, .3);
}
.official-page--mode-selection .official-progress-item.current span {
  background: #fff;
  color: #b20c2a;
}
.official-page--mode-selection .official-panel--mode-selection {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: clamp(28px, 3vw, 52px);
  border-radius: 28px;
  /* Mismo vidrio de referencia, con resplandor vino difuminado hacia la derecha. */
  background: linear-gradient(90deg, rgba(92, 28, 48, .42) 0%, rgba(34, 26, 33, .70) 46%, rgba(24, 22, 28, .78) 100%) !important;
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);
  border: 1px solid rgba(255, 255, 255, .3) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .1),
    inset 0 1px 0 rgba(255, 255, 255, .5),
    inset 0 -1px 0 rgba(255, 255, 255, .1),
    inset 0 0 0 0 rgba(255, 255, 255, 0);
  color: #fff !important;
}
.official-page--mode-selection .official-panel--mode-selection::before {
  content: '';
  position: absolute;
  z-index: 0;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, .8), transparent);
  pointer-events: none;
}
.official-page--mode-selection .official-panel--mode-selection::after {
  content: '';
  position: absolute;
  z-index: 0;
  top: 0; left: 0; bottom: 0;
  width: 1px;
  background: linear-gradient(180deg, rgba(255, 255, 255, .8), transparent, rgba(255, 255, 255, .3));
  pointer-events: none;
}
.official-page--mode-selection .official-panel--mode-selection > * { position: relative; z-index: 1; }
/* Una unica fuente de luz nace en la izquierda y se desvanece antes del borde derecho.
   No queda ningun resplandor vino fijo en la derecha: el fondo termina carbon. */
.official-page--mode-selection .official-panel--mode-selection > .official-glass-glow {
  position: absolute;
  z-index: 0;
  left: 0;
  top: -22%;
  bottom: -22%;
  width: 47%;
  height: auto;
  pointer-events: none;
  background: linear-gradient(90deg,
    transparent 0%,
    rgba(216, 46, 81, .10) 18%,
    rgba(247, 77, 111, .35) 48%,
    rgba(222, 55, 93, .14) 76%,
    transparent 100%);
  filter: blur(38px);
  -webkit-filter: blur(38px);
  opacity: 0;
  transform: translate3d(-120%, 0, 0);
  will-change: transform, opacity;
  animation: official-glass-glow-sweep 8s linear infinite;
}
@keyframes official-glass-glow-sweep {
  0% { transform: translate3d(-120%, 0, 0); opacity: 0; }
  12% { opacity: .95; }
  64% { opacity: .85; }
  83% { opacity: 0; }
  100% { transform: translate3d(235%, 0, 0); opacity: 0; }
}
.official-page--mode-selection .official-panel--mode-selection h2 { color: #fff !important; }
.official-page--mode-selection .official-choices {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(12px, 2vw, 22px);
  margin-top: 30px;
}
.official-page--mode-selection .official-choices--shipment-type {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.official-page--mode-selection .official-choice {
  min-width: 0;
  min-height: 190px;
  padding: clamp(20px, 2.4vw, 30px);
  background: rgba(255, 255, 255, .035) !important;
  border: 1px solid rgba(255, 255, 255, .24) !important;
  border-radius: 17px;
  color: #fff !important;
  box-shadow: none;
  transition: transform .2s ease, background-color .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.official-page--mode-selection .official-choice:hover {
  transform: translateY(-3px);
  background: rgba(255, 255, 255, .12) !important;
  border-color: rgba(255, 255, 255, .6) !important;
}
.official-page--mode-selection .official-choice.chosen {
  background: rgba(178, 12, 42, .22) !important;
  border-color: #ff637d !important;
  box-shadow: 0 0 0 2px rgba(255, 99, 125, .18);
}
.official-page--mode-selection .official-choice:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}
.official-page--mode-selection .official-choice strong { color: #fff !important; }
.official-page--mode-selection .official-choice small {
  color: rgba(255, 255, 255, .82) !important;
  overflow-wrap: anywhere;
}
.official-page--mode-selection .official-mode-icon {
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  color: #fff;
  background: rgba(255, 255, 255, .1);
  border: 1px solid rgba(255, 255, 255, .18);
}
.official-page--mode-selection .official-mode-icon :deep(svg) {
  display: block;
  color: #fff;
  stroke: currentColor;
}
.official-page--mode-selection .official-buttons { border-top-color: rgba(255, 255, 255, .18); }
@media (max-width: 1040px) and (min-width: 751px) {
  .official-page--mode-selection .official-shell { padding-inline: clamp(28px, 5vw, 64px); }
  .official-page--mode-selection .official-choices { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .official-page--mode-selection .official-choices:not(.official-choices--shipment-type) .official-choice:last-child {
    grid-column: 1 / -1;
  }
}
@media (max-width: 750px) {
  .official-page--mode-selection .official-shell {
    width: 100%;
    min-height: calc(100dvh - 72px);
    padding: 24px 24px 54px;
  }
  .official-page--mode-selection .official-progress { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .official-page--mode-selection .official-choices,
  .official-page--mode-selection .official-choices--shipment-type {
    grid-template-columns: 1fr;
    margin-top: 22px;
  }
  .official-page--mode-selection .official-panel--mode-selection { min-height: 0; padding: 24px; }
  .official-page--mode-selection .official-choice {
    min-height: 108px;
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    grid-template-rows: auto auto;
    gap: 4px 14px;
    align-content: center;
    align-items: center;
    padding: 16px;
  }
  .official-page--mode-selection .official-mode-icon { width: 56px; height: 56px; grid-row: 1 / 3; }
  .official-page--mode-selection .official-choice strong,
  .official-page--mode-selection .official-choice small { grid-column: 2; }
}
@media (max-width: 390px) {
  .official-page--mode-selection .official-shell { padding-inline: 16px; }
  .official-page--mode-selection .official-panel--mode-selection { padding: 20px 16px; }
  .official-page--mode-selection .official-progress { gap: 4px; }
  .official-page--mode-selection .official-progress-item { padding: 8px 2px; }
  .official-page--mode-selection .official-choice { gap: 4px 10px; padding: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  .official-page--mode-selection .official-choice { transition: none; }
  .official-page--mode-selection .official-choice:hover { transform: none; }
  .official-page--mode-selection .official-panel--mode-selection > .official-glass-glow {
    animation: none;
    transform: translate3d(70%, 0, 0);
    opacity: .45;
    will-change: auto;
  }
}

</style>

<style>
/* Dark palette scoped by unique wizard root. Override main's global high
   specificity/important rules without modifying shared administration or theme. */
html.theme-dark .app-site.official-page {
  background:linear-gradient(115deg,#21151d 0%,#171316 45%,#01081d 100%) !important;
  color:#fff!important;
}
html.theme-dark .app-site.official-page .official-panel,
html.theme-dark .app-site.official-page .official-success {
  background:linear-gradient(115deg,#2b1b25 0%,#171b29 100%) !important;
  color:#fff !important;border-color:#565057 !important;
}
html.theme-dark .app-site.official-page .official-choice,
html.theme-dark .app-site.official-page .official-line,
html.theme-dark .app-site.official-page .official-summary {
  background:#121a30 !important;color:#fff !important;border-color:#3b465f !important;
}
html.theme-dark .app-site.official-page .official-choice:is(:hover,.chosen) {
  background:#352130 !important;border-color:#ef233c!important;
}
html.theme-dark .app-site.official-page .official-choice :is(strong,small),
html.theme-dark .app-site.official-page .official-line strong,
html.theme-dark .app-site.official-page .official-panel h2,
html.theme-dark .app-site.official-page .official-success h2 {
  color:#fff!important;
}
html.theme-dark .app-site.official-page .official-choice small,
html.theme-dark .app-site.official-page .official-hint,
html.theme-dark .app-site.official-page .official-summary span,
html.theme-dark .app-site.official-page .official-id {
  color:#c4c5cf!important;
}
html.theme-dark .app-site.official-page .official-progress-item {
  background:#29252f!important;color:#e6e6eb!important;
}
html.theme-dark .app-site.official-page .official-progress-item.current {
  background:#b20c2a!important;color:#fff!important;
}
html.theme-dark .app-site.official-page .official-progress-item span {background:#3b465f!important;color:#fff!important;}
html.theme-dark .app-site.official-page .official-progress-item.current span {background:#fff!important;color:#b20c2a!important;}
html.theme-dark .app-site.official-page .official-progress-item.done {background:#224134!important;}
html.theme-dark .app-site.official-page :is(input,select,textarea) {
  background:#121a30!important;color:#fff!important;border-color:#3b465f!important;
}
html.theme-dark .app-site.official-page :is(.official-ghost,.official-remove,.official-back) {
  background:#121a30!important;color:#fff!important;border-color:#565b6b!important;
}
html.theme-dark .app-site.official-page :is(.official-primary,.official-link) {
  background:#b20c2a!important;color:#fff!important;
}
html.theme-dark .app-site.official-page :is(.official-error,.official-catalog-alert) {
  background:#321b28!important;color:#ffcfda!important;border-color:#99566c!important;
}
html.theme-dark .app-site.official-page .official-success-icon {color:#83e6b1!important;}
html.theme-dark .app-site.official-page .official-progress-item.current small {color:#fff!important;}
html.theme-dark .app-site.official-page .official-kicker {color:#ff8ca2!important;}

/* La selección conserva el mismo fondo Glass al activar el tema oscuro. */
html.theme-dark .app-site.official-page.official-page--mode-selection {
  background: linear-gradient(90deg, #491b2b 0%, #281a22 37%, #181419 72%, #181419 100%) !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-panel.official-panel--mode-selection {
  background: linear-gradient(90deg, rgba(92, 28, 48, .42) 0%, rgba(34, 26, 33, .70) 46%, rgba(24, 22, 28, .78) 100%) !important;
  color: #fff !important;
  border-color: rgba(255, 255, 255, .3) !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-choice {
  background: rgba(255, 255, 255, .035) !important;
  border-color: rgba(255, 255, 255, .24) !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-choice:hover {
  background: rgba(255, 255, 255, .12) !important;
  border-color: rgba(255, 255, 255, .6) !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-choice.chosen {
  background: rgba(178, 12, 42, .22) !important;
  border-color: #ff637d !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-progress-item {
  background: rgba(255, 255, 255, .09) !important;
  color: rgba(255, 255, 255, .82) !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-progress-item span {
  background: rgba(255, 255, 255, .14) !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-progress-item.current {
  background: rgba(178, 12, 42, .65) !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page.official-page--mode-selection .official-progress-item.current span {
  background: #fff !important;
  color: #b20c2a !important;
}

</style>
