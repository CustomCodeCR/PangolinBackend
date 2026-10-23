<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import IconSymbol from '../components/IconSymbol.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import { refreshSession } from '../services/auth'

const { locale } = useI18n({ useScope: 'global' })
const q = (es: string, en: string) => locale.value === 'en' ? en : es

type Mode = 'Maritime' | 'Air' | 'Land'
type Type = 'FCL' | 'LCL' | 'AIR_LCL' | 'FTL' | 'LTL'
type Loc = { id: string; displayName: string; code: string | null }
type ContainerLine = { size: string; type: string; quantity: number; unitWeightsKg: number[] }
type EquipmentField = 'size' | 'type'
type EquipmentOption = { value: string; label: string }
type PackageLine = { description: string; quantity: number; weight: number; length: number; width: number; height: number; stackability: 'Stackable' | 'NonStackable' }
const localQuotePreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('previewRole') === 'cliente'
const previewLocations: Loc[] = [
  { id: 'preview-acajutla', displayName: 'Acajutla, El Salvador', code: null },
  { id: 'preview-algeciras', displayName: 'Algeciras, España', code: null },
  { id: 'preview-altamira', displayName: 'Altamira, México', code: null },
  { id: 'preview-ambarli', displayName: 'Ambarli / Estambul, Turquía', code: null },
  { id: 'preview-anqing', displayName: 'Anqing, China', code: null },
  { id: 'preview-antwerp', displayName: 'Antwerp / Amberes, Bélgica', code: null }
]
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
const modeOptions = computed(() => [
  { value: 'Maritime' as Mode, title: q('Marítimo', 'Ocean'), icon: 'ship', text: q('Contenedores completos o carga consolidada', 'Full containers or consolidated cargo') },
  { value: 'Air' as Mode, title: q('Aéreo', 'Air'), icon: '✈', text: q('Carga aérea consolidada', 'Consolidated air cargo') },
  { value: 'Land' as Mode, title: q('Terrestre', 'Ground'), icon: 'truck', text: q('Camión completo o carga consolidada', 'Full truckload or consolidated cargo') }
])
const typeOptions = computed(() => mode.value === 'Maritime'
  ? [{ value: 'FCL' as Type, title: 'FCL', text: q('Contenedor completo', 'Full container load') }, { value: 'LCL' as Type, title: 'LCL', text: q('Coloading o propio', 'Consolidated or own cargo') }]
  : mode.value === 'Air'
    ? [{ value: 'AIR_LCL' as Type, title: 'LCL', text: q('Carga aérea consolidada', 'Consolidated air cargo') }]
    : [{ value: 'FTL' as Type, title: 'FTL', text: q('Camión completo', 'Full truckload') }, { value: 'LTL' as Type, title: 'LTL', text: q('Carga terrestre consolidada', 'Consolidated ground cargo') }])
const equipmentMode = computed(() => shipmentType.value === 'FCL' || shipmentType.value === 'FTL')
type LocationField = 'origin' | 'destination' | 'pod'
const activeDropdown = ref<LocationField | 'incoterm' | null>(null)
// Only one equipment dropdown can be open, even with multiple equipment lines.
const equipmentDropdown = ref<string | null>(null)
const equipmentDropdownKey = (index: number, field: EquipmentField) => index + '-' + field
const equipmentSizeOptions = computed<EquipmentOption[]>(() => shipmentType.value === 'FCL'
  ? ['20', '40', '45', '48'].map(n => ({ value: n + ' pies', label: n + ' ' + q('pies', 'ft') }))
  : [
      { value: '24 pies / 5 TON', label: '24 ' + q('pies', 'ft') + ' / 5 TON' },
      { value: '26 pies / 7 TON', label: '26 ' + q('pies', 'ft') + ' / 7 TON' },
      { value: '40 pies', label: '40 ' + q('pies', 'ft') },
      { value: '53 pies', label: '53 ' + q('pies', 'ft') }
    ])
const equipmentTypeOptions = computed<EquipmentOption[]>(() => shipmentType.value === 'FCL'
  ? ['Dry Van', 'High Cube', 'Open Top', 'Open Side', 'Tank', 'Flat Rack', 'NOR'].map(value => ({ value, label: value }))
  : [{ value: 'Furgón', label: q('Furgón', 'Truck') }])
const equipmentOptions = (field: EquipmentField) => field === 'size' ? equipmentSizeOptions.value : equipmentTypeOptions.value
const equipmentLabel = (field: EquipmentField, value: string) =>
  equipmentOptions(field).find(option => option.value === value)?.label || value || q('Seleccionar', 'Select')
function toggleEquipmentDropdown(index: number, field: EquipmentField) {
  const key = equipmentDropdownKey(index, field)
  const opening = equipmentDropdown.value !== key
  equipmentDropdown.value = opening ? key : null
  if (opening) {
    incotermMenuOpen.value = false
    openLocation.value = null
  }
}
function chooseEquipment(index: number, field: EquipmentField, value: string) {
  const line = form.equipment[index]
  if (!line) return
  line[field] = value
  equipmentDropdown.value = null
}
const incotermMenuOpen = computed({
  get: () => activeDropdown.value === 'incoterm',
  set: (isOpen: boolean) => {
    if (isOpen) activeDropdown.value = 'incoterm'
    else if (activeDropdown.value === 'incoterm') activeDropdown.value = null
  }
})
const openLocation = computed<LocationField | null>({
  get: () => activeDropdown.value === 'incoterm' ? null : activeDropdown.value,
  set: (field) => {
    if (field) activeDropdown.value = field
    else if (activeDropdown.value !== 'incoterm') activeDropdown.value = null
  }
})
function closeOtherDropdowns(event: Event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target) return
  if (target.closest('.official-equipment-wrap')) {
    incotermMenuOpen.value = false
    openLocation.value = null
    return
  }
  equipmentDropdown.value = null
  if (target.closest('.official-incoterm-wrap')) {
    openLocation.value = null
    return
  }
  if (target.closest('.official-location-combobox')) {
    incotermMenuOpen.value = false
    return
  }
  incotermMenuOpen.value = false
  openLocation.value = null
}
function toggleIncotermMenu() {
  equipmentDropdown.value = null
  const willOpen = !incotermMenuOpen.value
  if (willOpen) openLocation.value = null
  incotermMenuOpen.value = willOpen
}
function chooseIncoterm(item: string) {
  form.incoterm = item
  incotermMenuOpen.value = false
}
const selectedOrigin = computed(() => locations.value.find(x => x.id === form.originLocationId))
const selectedDest = computed(() => destinations.value.find(x => x.id === form.destinationLocationId))
const locationSearch = reactive<Record<LocationField, string>>({ origin: '', destination: '', pod: '' })
const activeLocationIndex = ref(0)
function optionsFor(field: LocationField): Loc[] {
  let source = field === 'origin' ? locations.value : field === 'destination' ? destinations.value : podOptions.value
  if (localQuotePreview && !source.length) source = previewLocations
  const query = locationSearch[field].trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  if (!query) return source
  return source.filter(loc => loc.displayName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().includes(query)
    || (loc.code || '').toLocaleLowerCase().includes(query))
}
function selectedLocationId(field: LocationField): string {
  return field === 'origin' ? form.originLocationId : field === 'destination' ? form.destinationLocationId : form.podLocationId
}
function setLocationId(field: LocationField, id: string) {
  if (field === 'origin') form.originLocationId = id
  else if (field === 'destination') form.destinationLocationId = id
  else form.podLocationId = id
}
function updateLocationSearch(field: LocationField, event: Event) {
  const value = (event.target as HTMLInputElement).value
  locationSearch[field] = value
  const source = field === 'origin' ? locations.value : field === 'destination' ? destinations.value : podOptions.value
  const selected = source.find(loc => loc.id === selectedLocationId(field))
  if (selected && selected.displayName !== value) setLocationId(field, '')
  incotermMenuOpen.value = false
  openLocation.value = field
  activeLocationIndex.value = 0
}
function focusLocation(field: LocationField) {
  incotermMenuOpen.value = false
  openLocation.value = field
  activeLocationIndex.value = 0
}
function chooseLocation(field: LocationField, location: Loc) {
  setLocationId(field, location.id)
  locationSearch[field] = location.displayName
  openLocation.value = null
}
function clearLocation(field: LocationField) {
  // Clear both the visible search and the ID used for validation/submission.
  setLocationId(field, '')
  locationSearch[field] = ''
  if (openLocation.value === field) openLocation.value = null
  activeLocationIndex.value = 0
}
function closeLocation(field: LocationField) {
  window.setTimeout(() => {
    if (openLocation.value === field) openLocation.value = null
  }, 120)
}
function toggleLocation(field: LocationField) {
  incotermMenuOpen.value = false
  openLocation.value = openLocation.value === field ? null : field
  activeLocationIndex.value = 0
}
function handleLocationKeydown(field: LocationField, event: KeyboardEvent) {
  const options = optionsFor(field)
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openLocation.value = field
    activeLocationIndex.value = Math.min(activeLocationIndex.value + 1, Math.max(options.length - 1, 0))
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    openLocation.value = field
    activeLocationIndex.value = Math.max(activeLocationIndex.value - 1, 0)
  } else if (event.key === 'Enter' && openLocation.value === field && options.length) {
    event.preventDefault()
    chooseLocation(field, options[activeLocationIndex.value] || options[0])
  } else if (event.key === 'Escape') {
    openLocation.value = null
  }
}
const incoterms = ['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP']
const serviceOptions = ['Transporte internacional','Agencia de Aduanas CR','Agencia de Aduanas Exterior','Almacenamiento','Control de inventario','Embalaje','Exoneración','Picking Carga','Recepción de carga','Seguro de carga','Transporte entrega','Transporte recolección','Transporte nacional']
const cargoFlagOptions = ['Carga peligrosa','No estibable','Sobrepeso']
const visibleCargoFlagOptions = computed(() => shipmentType.value === 'FCL' ? cargoFlagOptions.filter(flag => flag !== 'No estibable') : cargoFlagOptions)
watch(() => shipmentType.value === 'FCL', (isFullContainer) => {
  if (isFullContainer) form.cargoFlags = form.cargoFlags.filter(flag => flag !== 'No estibable')
})
const stepNames = computed(() => [q('Modalidad', 'Mode'), q('Embarque', 'Shipment'), q('Información', 'Information'), q('Carga y envío', 'Cargo and delivery')])
function displayMode(value: Mode | null) {
  if (value === 'Maritime') return q('Marítimo', 'Ocean')
  if (value === 'Air') return q('Aéreo', 'Air')
  if (value === 'Land') return q('Terrestre', 'Ground')
  return ''
}
function displayShipmentType(value: Type | null) {
  if (value === 'FCL') return q('Contenedor completo', 'Full container load')
  if (value === 'LCL') return q('Carga consolidada', 'Less than container load')
  if (value === 'AIR_LCL') return q('Carga aérea consolidada', 'Consolidated air cargo')
  if (value === 'FTL') return q('Camión completo', 'Full truckload')
  if (value === 'LTL') return q('Carga terrestre consolidada', 'Less than truckload')
  return value || ''
}
function displayService(value: string) {
  const labels: Record<string, [string, string]> = {
    'Transporte internacional': ['Transporte internacional', 'International transportation'],
    'Agencia de Aduanas CR': ['Agencia de Aduanas CR', 'Costa Rica customs brokerage'],
    'Agencia de Aduanas Exterior': ['Agencia de Aduanas Exterior', 'Foreign customs brokerage'],
    'Almacenamiento': ['Almacenamiento', 'Warehousing'],
    'Control de inventario': ['Control de inventario', 'Inventory control'],
    'Embalaje': ['Embalaje', 'Packing'],
    'Exoneración': ['Exoneración', 'Duty exemption'],
    'Picking Carga': ['Picking Carga', 'Cargo picking'],
    'Recepción de carga': ['Recepción de carga', 'Cargo receiving'],
    'Seguro de carga': ['Seguro de carga', 'Cargo insurance'],
    'Transporte entrega': ['Transporte entrega', 'Delivery transportation'],
    'Transporte recolección': ['Transporte recolección', 'Pickup transportation'],
    'Transporte nacional': ['Transporte nacional', 'Domestic transportation'],
    'Carga peligrosa': ['Carga peligrosa', 'Dangerous goods'],
    'No estibable': ['No estibable', 'Non-stackable'],
    'Sobrepeso': ['Sobrepeso', 'Overweight']
  }
  const pair = labels[value]
  return pair ? q(pair[0], pair[1]) : value
}
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
  if (localQuotePreview) {
    locations.value = previewLocations
    destinations.value = previewLocations
    podOptions.value = previewLocations
    error.value = ''
    locationLoading.value = false
    return
  }
  try {
    const fetchRole = async (routeRole: 'origin' | 'destination' | 'pod') => {
      const params = new URLSearchParams({kind,shipmentType:shipmentType.value!,routeRole})
      const response = await fetch('/api/quotes/official/locations?' + params, {credentials:'same-origin',cache:'no-store'})
      if (!response.ok) throw new Error(q('No se pudo consultar el catálogo de ', 'Could not load the ') + routeRole + q('.', ' catalog.'))
      const result = await response.json() as {items: Loc[]}
      return result.items
    }
    const [orig, dest, pod] = await Promise.all([fetchRole('origin'),fetchRole('destination'),mode.value === 'Maritime' ? fetchRole('pod') : Promise.resolve([] as Loc[])])
    const usePreviewData = localQuotePreview && (!orig.length || !dest.length)
    locations.value = usePreviewData ? previewLocations : orig
    destinations.value = usePreviewData ? previewLocations : dest
    podOptions.value = usePreviewData ? previewLocations : pod
    if (usePreviewData) error.value = ''
  } catch (e) {
    if (localQuotePreview) {
      locations.value = previewLocations
      destinations.value = previewLocations
      podOptions.value = previewLocations
      error.value = ''
    } else {
      error.value = (e as Error).message
    }
  }
  finally { locationLoading.value = false }
}
onMounted(async () => {
  const user = await refreshSession()
  if (!user || !['cliente','administrador'].includes(user.role)) return
  sessionOk.value = true
  form.contactEmail = user.correo
})
function validate(): string {
  if (step.value === 1) return mode.value ? '' : q('Seleccioná la modalidad.', 'Select a transport mode.')
  if (step.value === 2) return shipmentType.value ? '' : q('Seleccioná el tipo de embarque.', 'Select a shipment type.')
  if (step.value === 3) {
    if (!form.originLocationId || !form.destinationLocationId || form.originLocationId === form.destinationLocationId) return q('Elegí origen y destino distintos.', 'Choose different origin and destination locations.')
    if (shipmentType.value === 'LCL' && !form.podLocationId) return q('Seleccioná el POD requerido en marítimo LCL.', 'Select the required POD for ocean LCL.')
    if (!form.incoterm) return q('Seleccioná un Incoterm.', 'Select an Incoterm.')
    if (!form.cargoReadyDate) return q('Indicá la fecha de carga lista.', 'Enter the cargo ready date.')
    if (!form.services.length) return q('Seleccioná al menos un servicio.', 'Select at least one service.')
    if (form.services.includes('Transporte entrega') && !form.deliveryAddress.trim()) return q('Escribí la dirección de entrega.', 'Enter the delivery address.')
    if (form.services.includes('Transporte recolección') && !form.pickupAddress.trim()) return q('Escribí la dirección de recolección.', 'Enter the pickup address.')
    if (form.services.includes('Almacenamiento') && (!Number.isInteger(Number(form.fiscalStorageDays)) || Number(form.fiscalStorageDays) < 1 || Number(form.fiscalStorageDays) > 36500)) return q('Indicá los días de almacenaje fiscal.', 'Enter the number of fiscal storage days.')
    if (form.incoterm === 'EXW' && (!form.exwCargoStatus || !form.exwPickupAddress.trim())) return q('Completá el tipo de carga y la dirección de recolección EXW.', 'Complete the cargo type and EXW pickup address.')
    if (equipmentMode.value && form.equipment.some(x => !x.size || !x.type || !Number.isInteger(Number(x.quantity)) || x.quantity < 1 || x.unitWeightsKg.length !== Number(x.quantity) || x.unitWeightsKg.some(v => Number(v) <= 0))) return q('Completá todos los equipos y el peso de cada unidad.', 'Complete every equipment item and the weight of each unit.')
    return ''
  }
  if (!form.contactName.trim() || !form.contactEmail.trim() || !form.contactPhone.trim()) return q('Completá los datos de contacto.', 'Complete your contact details.')
  if (!form.cargoDescription.trim()) return q('Describí la carga.', 'Describe the cargo.')
  if (!equipmentMode.value && form.packages.some(x => !x.description.trim() || x.quantity < 1 || x.weight <= 0 || x.length <= 0 || x.width <= 0 || x.height <= 0)) return q('Completá todas las medidas y los pesos de cada línea.', 'Complete the dimensions and weight for every cargo line.')
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
  <div class="app-site official-page">
    <SiteHeader active="cotizaciones" />
    <main class="official-shell">
      <header class="official-header">
        <p class="official-kicker">{{ q('CASTRO FALLAS · SOLICITUD DE COTIZACIÓN', 'CASTRO FALLAS · QUOTE REQUEST') }}</p>
        <h1>{{ q('Tu carga,', 'Your cargo,') }} <span>{{ q('más cerca de su destino.', 'closer to its destination.') }}</span></h1>
        <p>{{ q('Contanos qué necesitás transportar. En cuatro pasos sencillos preparás tu solicitud para nuestro equipo de logística.', 'Tell us what you need to ship. In four simple steps, prepare your request for our logistics team.') }}</p>
      </header>
      <div v-if="createdId" class="official-success" role="status">
        <span class="official-success-icon">✓</span>
          <h2>{{ q('¡Solicitud recibida!', 'Request received!') }}</h2>
          <p>{{ q('Se guardó correctamente y está pendiente de revisión administrativa. Todavía no se ha enviado a Dhole.', 'Your request was saved and is awaiting administrative review. It has not been sent to Dhole.') }}</p>
          <p class="official-id">{{ q('Número de referencia:', 'Reference number:') }} {{ createdId }}</p>
          <a class="official-link" href="/home">{{ q('Volver al inicio', 'Back to home') }}</a>
      </div>
      <template v-else>
        <nav class="official-progress" :aria-label="q('Progreso de la solicitud', 'Request progress')">
          <div v-for="(name,i) in stepNames" :key="name"
               class="official-progress-item" :class="{ current: step === i+1, done: step > i+1 }"
               :aria-current="step === i+1 ? 'step' : undefined">
            <span>{{ step > i+1 ? '✓' : i+1 }}</span><small>{{ name }}</small>
          </div>
        </nav>
        <section class="official-panel" @pointerdown.capture="closeOtherDropdowns" @focusin="closeOtherDropdowns">
          <template v-if="step === 1">
            <p class="official-kicker">{{ q('PASO 1 DE 4', 'STEP 1 OF 4') }}</p>
            <h2>{{ q('¿Cómo querés transportar tu carga?', 'How would you like to ship your cargo?') }}</h2>
            <p class="official-hint">{{ q('Elegí la modalidad que mejor corresponde a tu solicitud.', 'Choose the transport mode that best fits your request.') }}</p>
            <div class="official-choices">
              <button v-for="choice in modeOptions" :key="choice.value" type="button" class="official-choice"
                :class="{ chosen: mode === choice.value }" :aria-pressed="mode === choice.value"
                @click="selectMode(choice.value)">
                <span class="official-emoji"><IconSymbol :glyph="choice.icon" :size="28" /></span><strong>{{ choice.title }}</strong><small>{{ choice.text }}</small>
              </button>
            </div>
          </template>
          <template v-else-if="step === 2">
            <p class="official-kicker">{{ q('PASO 2 DE 4', 'STEP 2 OF 4') }}</p><h2>{{ q('Tipo de embarque', 'Shipment type') }}</h2>
            <p class="official-hint">{{ q('Mostramos únicamente las opciones de', 'Showing only') }} {{ mode === 'Maritime' ? q('transporte marítimo', 'ocean freight') : mode === 'Air' ? q('transporte aéreo', 'air freight') : q('transporte terrestre', 'ground transportation') }}.</p>
            <div class="official-choices">
              <button v-for="choice in typeOptions" :key="choice.value" type="button" class="official-choice"
                :class="{ chosen: shipmentType === choice.value }" :aria-pressed="shipmentType === choice.value"
                @click="shipmentType = choice.value">
                <strong>{{ choice.title }}</strong><small>{{ choice.text }}</small>
              </button>
            </div>
          </template>
          <template v-else-if="step === 3">
            <p class="official-kicker">{{ q('PASO 3 DE 4', 'STEP 3 OF 4') }}</p><h2>{{ q('Ruta, equipo y servicios', 'Route, equipment and services') }}</h2>
            <p class="official-hint">{{ q('Solo pedimos los datos necesarios para', 'We only ask for the information needed for') }} {{ displayShipmentType(shipmentType) }}.</p>
            <p v-if="[...locations,...destinations,...podOptions].some(loc => loc.code?.startsWith('DEV-'))" class="official-catalog-alert" role="note">{{ q('Faltan opciones verificadas para al menos uno de los campos. Las opciones PRUEBA son exclusivamente para desarrollo.', 'At least one field has no verified options. TEST options are for development only.') }}</p>
            <div class="official-fields">
              <div class="official-location-field">
                <label for="quote-origin">{{ q('Origen', 'Origin') }} <span>*</span></label>
                <div class="official-location-combobox">
                  <input id="quote-origin" :value="locationSearch.origin" role="combobox" aria-autocomplete="list" :aria-expanded="openLocation === 'origin'" aria-controls="quote-origin-options" autocomplete="off" :placeholder="q('Buscar ciudad o país', 'Search city or country')" required @focus="focusLocation('origin')" @input="updateLocationSearch('origin', $event)" @keydown="handleLocationKeydown('origin', $event)" @blur="closeLocation('origin')" />
                  <button type="button" class="official-location-toggle" :class="{ 'official-location-toggle--clear': !!form.originLocationId }" :aria-label="form.originLocationId ? q('Limpiar origen', 'Clear origin') : q('Mostrar ubicaciones de origen', 'Show origin locations')" @mousedown.prevent @click="form.originLocationId ? clearLocation('origin') : toggleLocation('origin')">⌄</button>
                  <ul v-if="openLocation === 'origin'" id="quote-origin-options" class="official-location-options" role="listbox">
                    <li v-for="(loc,index) in optionsFor('origin')" :key="loc.id"><button type="button" role="option" :aria-selected="form.originLocationId === loc.id" :id="`quote-origin-option-${index}`" @mousedown.prevent @click="chooseLocation('origin', loc)"><span>{{ loc.displayName }}</span></button></li>
                    <li v-if="!optionsFor('origin').length" class="official-location-empty">{{ q('No hay ubicaciones que coincidan.', 'No matching locations.') }}</li>
                  </ul>
                </div>
              </div>
              <div class="official-location-field">
                <label for="quote-destination">{{ q('Destino', 'Destination') }} <span>*</span></label>
                <div class="official-location-combobox">
                  <input id="quote-destination" :value="locationSearch.destination" role="combobox" aria-autocomplete="list" :aria-expanded="openLocation === 'destination'" aria-controls="quote-destination-options" autocomplete="off" :placeholder="q('Buscar ciudad o país', 'Search city or country')" required @focus="focusLocation('destination')" @input="updateLocationSearch('destination', $event)" @keydown="handleLocationKeydown('destination', $event)" @blur="closeLocation('destination')" />
                  <button type="button" class="official-location-toggle" :class="{ 'official-location-toggle--clear': !!form.destinationLocationId }" :aria-label="form.destinationLocationId ? q('Limpiar destino', 'Clear destination') : q('Mostrar ubicaciones de destino', 'Show destination locations')" @mousedown.prevent @click="form.destinationLocationId ? clearLocation('destination') : toggleLocation('destination')">⌄</button>
                  <ul v-if="openLocation === 'destination'" id="quote-destination-options" class="official-location-options" role="listbox">
                    <li v-for="(loc,index) in optionsFor('destination')" :key="loc.id"><button type="button" role="option" :aria-selected="form.destinationLocationId === loc.id" :id="`quote-destination-option-${index}`" @mousedown.prevent @click="chooseLocation('destination', loc)"><span>{{ loc.displayName }}</span></button></li>
                    <li v-if="!optionsFor('destination').length" class="official-location-empty">{{ q('No hay ubicaciones que coincidan.', 'No matching locations.') }}</li>
                  </ul>
                </div>
              </div>
              <div v-if="mode === 'Maritime'" class="official-location-field">
                <label for="quote-pod">POD {{ shipmentType === 'LCL' ? q('(requerido)', '(required)') : q('(opcional)', '(optional)') }}</label>
                <div class="official-location-combobox">
                  <input id="quote-pod" :value="locationSearch.pod" role="combobox" aria-autocomplete="list" :aria-expanded="openLocation === 'pod'" aria-controls="quote-pod-options" autocomplete="off" :placeholder="shipmentType === 'LCL' ? q('Buscar ciudad o país', 'Search city or country') : q('Sin POD adicional', 'No additional POD')" @focus="focusLocation('pod')" @input="updateLocationSearch('pod', $event)" @keydown="handleLocationKeydown('pod', $event)" @blur="closeLocation('pod')" />
                  <button type="button" class="official-location-toggle" :class="{ 'official-location-toggle--clear': !!form.podLocationId }" :aria-label="form.podLocationId ? q('Limpiar POD', 'Clear POD') : q('Mostrar opciones de POD', 'Show POD options')" @mousedown.prevent @click="form.podLocationId ? clearLocation('pod') : toggleLocation('pod')">⌄</button>
                  <ul v-if="openLocation === 'pod'" id="quote-pod-options" class="official-location-options" role="listbox">
                    <li v-if="shipmentType !== 'LCL'"><button type="button" role="option" :aria-selected="!form.podLocationId" @mousedown.prevent @click="form.podLocationId = ''; locationSearch.pod = ''; openLocation = null">{{ q('Sin POD adicional', 'No additional POD') }}</button></li>
                    <li v-for="(loc,index) in optionsFor('pod')" :key="loc.id"><button type="button" role="option" :aria-selected="form.podLocationId === loc.id" :id="`quote-pod-option-${index}`" @mousedown.prevent @click="chooseLocation('pod', loc)"><span>{{ loc.displayName }}</span></button></li>
                    <li v-if="!optionsFor('pod').length && shipmentType === 'LCL'" class="official-location-empty">{{ q('No hay ubicaciones que coincidan.', 'No matching locations.') }}</li>
                  </ul>
                </div>
              </div>
              <div class="official-custom-field official-incoterm-field">
                <label id="quote-incoterm-label">Incoterm <span>*</span></label>
                <div class="official-select-wrap official-incoterm-wrap" @keydown.esc="incotermMenuOpen = false">
                  <button id="quote-incoterm" type="button" class="official-incoterm-trigger" role="combobox" aria-labelledby="quote-incoterm-label" aria-haspopup="listbox" :aria-expanded="incotermMenuOpen" aria-controls="quote-incoterm-options" aria-required="true" @click="toggleIncotermMenu">
                    {{ form.incoterm || q('Seleccionar Incoterm', 'Select Incoterm') }}
                  </button>
                  <ul v-if="incotermMenuOpen" id="quote-incoterm-options" class="official-incoterm-options" role="listbox">
                    <li><button type="button" role="option" aria-selected="false" @click="form.incoterm = ''; incotermMenuOpen = false">{{ q('Seleccionar Incoterm', 'Select Incoterm') }}</button></li>
                    <li v-for="item in incoterms" :key="item"><button type="button" role="option" :aria-selected="form.incoterm === item" @click="chooseIncoterm(item)">{{ item }}</button></li>
                  </ul>
                </div>
              </div>
              <label>{{ q('Fecha de carga lista', 'Cargo ready date') }} <span>*</span><input v-model="form.cargoReadyDate" type="date" required /></label>
            </div>
            <div v-if="form.incoterm === 'EXW'" class="official-nested">
              <h3>{{ q('Información adicional para EXW', 'Additional EXW information') }}</h3>
              <div class="official-fields">
                <div class="official-custom-field official-incoterm-field">
  <label>{{ q('Tipo de carga', 'Cargo type') }} <span>*</span></label>
  <FieldDropdown v-model="form.exwCargoStatus" :aria-label="q('Tipo de carga', 'Cargo type')" :options="[
    {value:'', label:q('Seleccionar', 'Select')},
    {value:'fiscal', label:q('Carga fiscal', 'Bonded cargo')},
    {value:'nationalized', label:q('Carga nacionalizada', 'Nationalized cargo')}
  ]" />
</div>
                <label>{{ q('Dirección de recolección', 'Pickup address') }} <span>*</span><input v-model.trim="form.exwPickupAddress" maxlength="800" :placeholder="q('Indicá la dirección', 'Enter the address')" /></label>
              </div>
            </div>
            <div v-if="equipmentMode || shipmentType !== 'AIR_LCL'" class="official-nested">
              <div class="official-headline"><h3>{{ equipmentMode ? q('Distribución de equipos', 'Equipment breakdown') : q('Servicios solicitados', 'Requested services') }}</h3><button v-if="equipmentMode" class="official-ghost official-add-equipment" type="button" @click="addEquipment">+ {{ q('Añadir equipo', 'Add equipment') }}</button></div>
              <template v-if="equipmentMode">
                <div v-for="(line,i) in form.equipment" :key="i" class="official-line">
                  <div class="official-headline"><strong>{{ q('Equipo', 'Equipment') }} {{ i+1 }}</strong><button v-if="form.equipment.length>1" type="button" class="official-remove" @click="form.equipment.splice(i,1)">{{ q('Quitar', 'Remove') }}</button></div>
                  <div class="official-fields">
                    <div class="official-custom-field official-incoterm-field official-equipment-field">
                      <label :id="'quote-equipment-size-label-' + i">{{ shipmentType === 'FCL' ? q('Tamaño del contenedor', 'Container size') : q('Furgón', 'Truck') }} <span>*</span></label>
                      <div class="official-select-wrap official-incoterm-wrap official-equipment-wrap" @keydown.esc.stop="equipmentDropdown = null">
                        <button :id="'quote-equipment-size-' + i" type="button" class="official-incoterm-trigger" role="combobox"
                          :aria-labelledby="'quote-equipment-size-label-' + i" aria-haspopup="listbox"
                          :aria-expanded="equipmentDropdown === equipmentDropdownKey(i, 'size')"
                          :aria-controls="'quote-equipment-size-options-' + i" aria-required="true"
                          @click="toggleEquipmentDropdown(i, 'size')">{{ equipmentLabel('size', line.size) }}</button>
                        <ul v-if="equipmentDropdown === equipmentDropdownKey(i, 'size')" :id="'quote-equipment-size-options-' + i"
                          class="official-incoterm-options official-equipment-options" role="listbox">
                          <li><button type="button" role="option" :aria-selected="line.size === ''" @click="chooseEquipment(i, 'size', '')">{{ q('Seleccionar', 'Select') }}</button></li>
                          <li v-for="option in equipmentSizeOptions" :key="option.value"><button type="button" role="option"
                            :aria-selected="line.size === option.value" @click="chooseEquipment(i, 'size', option.value)">{{ option.label }}</button></li>
                        </ul>
                      </div>
                    </div>
                    <div class="official-custom-field official-incoterm-field official-equipment-field">
                      <label :id="'quote-equipment-type-label-' + i">{{ q('Tipo', 'Type') }} <span>*</span></label>
                      <div class="official-select-wrap official-incoterm-wrap official-equipment-wrap" @keydown.esc.stop="equipmentDropdown = null">
                        <button :id="'quote-equipment-type-' + i" type="button" class="official-incoterm-trigger" role="combobox"
                          :aria-labelledby="'quote-equipment-type-label-' + i" aria-haspopup="listbox"
                          :aria-expanded="equipmentDropdown === equipmentDropdownKey(i, 'type')"
                          :aria-controls="'quote-equipment-type-options-' + i" aria-required="true"
                          @click="toggleEquipmentDropdown(i, 'type')">{{ equipmentLabel('type', line.type) }}</button>
                        <ul v-if="equipmentDropdown === equipmentDropdownKey(i, 'type')" :id="'quote-equipment-type-options-' + i"
                          class="official-incoterm-options official-equipment-options" role="listbox">
                          <li><button type="button" role="option" :aria-selected="line.type === ''" @click="chooseEquipment(i, 'type', '')">{{ q('Seleccionar', 'Select') }}</button></li>
                          <li v-for="option in equipmentTypeOptions" :key="option.value"><button type="button" role="option"
                            :aria-selected="line.type === option.value" @click="chooseEquipment(i, 'type', option.value)">{{ option.label }}</button></li>
                        </ul>
                      </div>
                    </div>
                    <label>{{ q('Cantidad', 'Quantity') }} <span>*</span><input v-model.number="line.quantity" type="number" min="1" max="25" step="1" @input="syncWeights(line)" /></label>
                    <label v-for="(weight,wi) in line.unitWeightsKg" :key="wi">{{ q('Peso', 'Weight') }} {{ wi+1 }} (kg) <span>*</span><input v-model.number="line.unitWeightsKg[wi]" type="number" min="0.001" step="any" /></label>
                  </div>
                </div>
              </template>
            </div>
            <div class="official-nested"><h3>{{ q('Servicios', 'Services') }}</h3><p class="official-hint">{{ q('Transporte internacional viene marcado inicialmente. Podés quitarlo o seleccionar varios servicios, pero debe quedar al menos uno.', 'International transportation is selected by default. You can remove it or select multiple services, but at least one must remain.') }}</p><div class="official-checks"><label v-for="s in serviceOptions" :key="s"><input type="checkbox" :checked="form.services.includes(s)" @change="toggle(form.services,s)" />{{ displayService(s) }}</label></div>
              <div v-if="form.services.includes('Almacenamiento') || form.services.includes('Transporte entrega') || form.services.includes('Transporte recolección')" class="official-fields">
                <label v-if="form.services.includes('Almacenamiento')">{{ q('Días de almacenaje fiscal', 'Fiscal storage days') }} <span>*</span><input v-model.number="form.fiscalStorageDays" type="number" min="1" max="36500" step="1" /></label>
                <label v-if="form.services.includes('Transporte entrega')" class="full">{{ q('Dirección de entrega', 'Delivery address') }} <span>*</span><textarea v-model.trim="form.deliveryAddress" rows="3" maxlength="800" :placeholder="q('Escribí la dirección de entrega', 'Enter the delivery address')"></textarea></label>
                <label v-if="form.services.includes('Transporte recolección')" class="full">{{ q('Dirección de recolección', 'Pickup address') }} <span>*</span><textarea v-model.trim="form.pickupAddress" rows="3" maxlength="800" :placeholder="q('Escribí la dirección de recolección', 'Enter the pickup address')"></textarea></label>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="official-kicker">{{ q('PASO 4 DE 4', 'STEP 4 OF 4') }}</p><h2>{{ q('Descripción de carga y contacto', 'Cargo details and contact') }}</h2>
            <p class="official-hint">{{ q('Revisá los detalles. No se piden archivos ni se calculan tarifas.', 'Review the details. No files are requested and rates are not calculated.') }}</p>
            <div class="official-fields">
              <label class="full">{{ q('Descripción de la carga', 'Cargo description') }} <span>*</span><textarea v-model.trim="form.cargoDescription" rows="3" maxlength="4000" :placeholder="q('¿Qué productos necesitás transportar?', 'What products do you need to ship?')" /></label>
              <label>{{ q('Código CABYS (opcional)', 'CABYS code (optional)') }}<input v-model.trim="form.cabysCode" maxlength="40" :placeholder="q('Ingresá el código si lo conocés', 'Enter the code if you know it')" /></label>
              <label>{{ q('Valor de la carga (si aplica)', 'Cargo value (if applicable)') }}<input v-model.number="form.cargoValue" type="number" min="0" step="any" /></label>
              <label>{{ q('Peso declarado (si aplica)', 'Declared weight (if applicable)') }}<input v-model.number="form.declaredWeight" type="number" min="0" step="any" /></label>
              <label>{{ q('Cantidad de bultos (si aplica)', 'Number of packages (if applicable)') }}<input v-model.number="form.declaredPackages" type="number" min="0" step="1" /></label>
            </div>
            <div v-if="!equipmentMode" class="official-nested">
              <div class="official-headline"><h3>{{ q('Medidas de la carga', 'Cargo dimensions') }}</h3><button class="official-ghost" type="button" @click="addPackage">+ {{ q('Añadir línea', 'Add line') }}</button></div>
              <div class="official-fields">
  <div class="official-custom-field official-incoterm-field">
    <label>{{ q('Unidad de dimensiones', 'Dimension unit') }}</label>
    <FieldDropdown v-model="form.dimensionUnit" :aria-label="q('Unidad de dimensiones', 'Dimension unit')" :options="[
      {value:'cm',label:q('Centímetros','Centimeters')+' (cm)'},
      {value:'m',label:q('Metros','Meters')+' (m)'},
      {value:'in',label:q('Pulgadas','Inches')+' (in)'}
    ]" />
  </div>
  <div class="official-custom-field official-incoterm-field">
    <label>{{ q('Unidad de peso', 'Weight unit') }}</label>
    <FieldDropdown v-model="form.weightUnit" :aria-label="q('Unidad de peso', 'Weight unit')" :options="[
      {value:'kg',label:q('Kilogramos','Kilograms')+' (kg)'},
      {value:'lb',label:q('Libras','Pounds')+' (lb)'}
    ]" />
  </div>
</div>
              <div v-for="(line,i) in form.packages" :key="i" class="official-line">
                <div class="official-headline"><strong>{{ q('Bulto / Línea', 'Package / Line') }} {{ i+1 }}</strong><button v-if="form.packages.length>1" class="official-remove" type="button" @click="form.packages.splice(i,1)">{{ q('Quitar', 'Remove') }}</button></div>
                <div class="official-fields">
                  <label class="full">{{ q('Descripción', 'Description') }} <span>*</span><input v-model.trim="line.description" maxlength="400" /></label>
                  <label>{{ q('Cantidad', 'Quantity') }} <span>*</span><input v-model.number="line.quantity" min="1" step="1" type="number" /></label>
                  <label>{{ q('Peso total', 'Total weight') }} <span>*</span><input v-model.number="line.weight" min="0.001" step="any" type="number" /></label>
                  <label>{{ q('Largo', 'Length') }} <span>*</span><input v-model.number="line.length" min="0.001" step="any" type="number" /></label>
                  <label>{{ q('Ancho', 'Width') }} <span>*</span><input v-model.number="line.width" min="0.001" step="any" type="number" /></label>
                  <label>{{ q('Alto', 'Height') }} <span>*</span><input v-model.number="line.height" min="0.001" step="any" type="number" /></label>
                  <div class="official-custom-field official-incoterm-field">
  <label>{{ q('Estibabilidad', 'Stackability') }}</label>
  <FieldDropdown :model-value="line.stackability" :aria-label="q('Estibabilidad', 'Stackability')" :options="[
    {value:'Stackable',label:q('Estibable','Stackable')},
    {value:'NonStackable',label:q('No estibable','Non-stackable')}
  ]" @update:model-value="value => line.stackability = value === 'NonStackable' ? 'NonStackable' : 'Stackable'" />
</div>
                </div>
              </div>
            </div>
            <div class="official-nested"><h3>{{ q('Opciones de carga', 'Cargo options') }}</h3><div class="official-checks"><label v-for="flag in visibleCargoFlagOptions" :key="flag"><input type="checkbox" :checked="form.cargoFlags.includes(flag)" @change="toggle(form.cargoFlags,flag)" />{{ displayService(flag) }}</label></div><label class="official-single">{{ q('Observaciones', 'Notes') }}<textarea v-model.trim="form.observations" maxlength="4000" rows="3" /></label></div>
            <div class="official-nested"><h3>{{ q('Datos de contacto', 'Contact details') }}</h3><div class="official-fields"><label>{{ q('Nombre', 'Name') }} <span>*</span><input v-model.trim="form.contactName" maxlength="150" autocomplete="name" /></label><label>{{ q('Correo', 'Email') }} <span>*</span><input v-model.trim="form.contactEmail" type="email" maxlength="255" autocomplete="email" /></label><label>{{ q('Teléfono', 'Phone') }} <span>*</span><input v-model.trim="form.contactPhone" maxlength="40" autocomplete="tel" /></label></div></div>
            <div class="official-summary"><strong>{{ q('Resumen', 'Summary') }}</strong><span>{{ displayMode(mode) }} · {{ displayShipmentType(shipmentType) }}</span><span>{{ selectedOrigin?.displayName }} → {{ selectedDest?.displayName }}</span><span>{{ form.services.map(displayService).join(', ') }}</span></div>
          </template>
          <p v-if="error" class="official-error" role="alert">{{ error }}</p>
          <footer class="official-buttons">
            <button v-if="step>1" type="button" class="official-back" :disabled="busy" @click="back">{{ q('Atrás', 'Back') }}</button><span v-else></span>
            <button v-if="step<4" type="button" class="official-primary" @click="next">{{ q('Continuar', 'Continue') }}</button>
            <button v-else type="button" class="official-primary" :disabled="busy || !sessionOk" @click="submit">{{ busy ? q('Enviando…', 'Sending…') : q('Enviar solicitud', 'Submit request') + ' →' }}</button>
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

/* Indicador de pasos en línea, como el cotizador anterior. */
.official-page .official-progress {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0;
  max-width: 820px;
  margin: 32px auto 34px;
}
.official-page .official-progress::before {
  content: "";
  position: absolute;
  z-index: 0;
  left: 12.5%;
  right: 12.5%;
  top: 26px;
  height: 4px;
  border-radius: 4px;
  background: #d6d8df;
}
.official-page .official-progress-item {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 0;
  border-radius: 0;
  background: transparent !important;
  color: #737887;
  text-align: center;
}
.official-page .official-progress-item span {
  width: 54px;
  height: 54px;
  border: 3px solid #d6d8df;
  background: #fff;
  color: #737887;
  font-size: 18px;
}
.official-page .official-progress-item small {
  color: #737887;
  font-size: 12px;
  line-height: 1.3;
}
.official-page .official-progress-item.current,
.official-page .official-progress-item.done {
  color: #b20c2a;
  background: transparent !important;
}
.official-page .official-progress-item.current span,
.official-page .official-progress-item.done span {
  border-color: #b20c2a;
  background: #b20c2a;
  color: #fff;
}
.official-page .official-progress-item.current small,
.official-page .official-progress-item.done small {
  color: #b20c2a;
}
html.theme-dark .app-site.official-page .official-progress::before { background: #46546a; }
html.theme-dark .app-site.official-page .official-progress-item,
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.done {
  background: transparent !important;
  color: #c4c5cf !important;
}
html.theme-dark .app-site.official-page .official-progress-item span {
  border-color: #46546a !important;
  background: #19243a !important;
  color: #d3dbea !important;
}
html.theme-dark .app-site.official-page .official-progress-item.current span,
html.theme-dark .app-site.official-page .official-progress-item.done span {
  border-color: #b20c2a !important;
  background: #b20c2a !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-progress-item.current small,
html.theme-dark .app-site.official-page .official-progress-item.done small { color: #fff !important; }
@media (max-width: 670px) {
  .official-page .official-progress { gap: 0; margin: 26px auto; }
  .official-page .official-progress::before { top: 21px; }
  .official-page .official-progress-item { gap: 6px; padding: 0 2px; }
  .official-page .official-progress-item span { width: 44px; height: 44px; font-size: 15px; }
  .official-page .official-progress-item small { font-size: 10px; overflow-wrap: anywhere; }
}


/* Campos de origen/destino con búsqueda y lista de países. */
.official-location-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  color: #4e5260;
  font-weight: 800;
}
.official-location-field > label { display: block; }
.official-location-field > label span { color: #ad112f; }
.official-location-combobox { position: relative; min-width: 0; }
.official-location-combobox > input { padding-right: 46px !important; }
.official-location-toggle {
  position: absolute;
  top: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #8790a0;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.official-location-options {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  padding: 8px;
  list-style: none;
  border: 1px solid #55545a;
  border-radius: 18px;
  background: #19191c !important;
  opacity: 1;
  box-shadow: 0 18px 36px #0005;
}
/* Keep the open location list above later rows such as equipment and services. */
.official-panel > .official-fields:has(.official-location-options) {
  position: relative;
  z-index: 5 !important;
}
.official-location-options li { margin: 0; padding: 0; }
.official-location-options li button {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 14px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #fff;
  text-align: left;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.official-location-options li button:hover,
.official-location-options li button[aria-selected="true"] { background: #30262d; color: #ff6b50; }
.official-location-empty { padding: 13px 14px; color: #b9bac2; font-size: 13px; }
html.theme-dark .app-site.official-page .official-location-field { color: #fff; }
html.theme-dark .app-site.official-page .official-location-toggle { color: #c4c5cf; }
html.theme-dark .app-site.official-page .official-location-options {
  background: #19191c !important;
  border-color: #55545a !important;
}
@media (max-width: 670px) {
  .official-location-options { max-height: 240px; }
}

/* Cotizaciones comparte el fondo vino, las tarjetas de vidrio y el brillo rojo
   ambiental que ya usa el formulario de itinerarios. */
.app-site.official-page {
  position: relative;
  isolation: isolate;
  background: #fff8f8 !important;
  background-image: linear-gradient(108deg, rgba(178,12,42,.09), transparent 58%) !important;
}
.app-site.official-page .official-shell { width: min(1424px, calc(100% - 48px)); }
.app-site.official-page .official-header { max-width: none; }
.app-site.official-page .official-header h1 { font-size: clamp(38px, 6vw, 72px); }
.app-site.official-page .official-progress {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  max-width: none;
  margin: 28px 0 22px;
}
.app-site.official-page .official-progress::before { display: none; }
.app-site.official-page .official-progress-item,
.app-site.official-page .official-progress-item.current,
.app-site.official-page .official-progress-item.done {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  min-height: 58px;
  padding: 10px 16px;
  border: 1px solid #ded4d8;
  border-radius: 16px;
  background: #f2eef0 !important;
  color: #39313a !important;
  text-align: left;
}
.app-site.official-page .official-progress-item span,
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span {
  display: grid;
  flex: 0 0 38px;
  width: 38px;
  height: 38px;
  border: 0 !important;
  border-radius: 50%;
  background: #48556f !important;
  color: #fff !important;
  font-size: 15px;
}
.app-site.official-page .official-progress-item.current {
  border-color: #b20c2a;
  background: #b20c2a !important;
  color: #fff !important;
}
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span { background: #fff !important; color: #b20c2a !important; }
.app-site.official-page .official-progress-item small,
.app-site.official-page .official-progress-item.current small,
.app-site.official-page .official-progress-item.done small {
  color: inherit !important;
  font-size: 14px;
  font-weight: 850;
  line-height: 1.25;
}
.app-site.official-page .official-panel {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  border: 1px solid #d8cbd0;
  border-radius: 30px;
  background: #fffdfd !important;
  box-shadow: 0 18px 46px #34101b14;
}
.app-site.official-page .official-panel::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: -48% auto -48% -22%;
  width: 52%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(214,14,52,.14), rgba(178,11,45,.07) 43%, transparent 75%);
  filter: blur(38px);
  pointer-events: none;
  animation: itinerary-red-sweep 9s ease-in-out infinite alternate;
}
.app-site.official-page .official-panel > * { position: relative; z-index: 1; }
.app-site.official-page .official-choice--mode {
  border-color: #e0d2d7;
  border-radius: 19px;
  background: rgba(255,255,255,.78);
  box-shadow: 0 10px 28px #34101b0b;
  transition: border-color .2s, background .2s, transform .2s, box-shadow .2s;
}
.app-site.official-page .official-choice:hover,
.app-site.official-page .official-choice.chosen {
  border-color: #b20c2a;
  background: #fff4f5;
  box-shadow: 0 12px 32px #b20c2a1a;
  transform: translateY(-2px);
}
.app-site.official-page .official-emoji {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border: 1px solid #b20c2a24;
  border-radius: 16px;
  background: #b20c2a12;
  color: #b20c2a;
}
.app-site.official-page .official-nested { border-color: #b20c2a30; }
.app-site.official-page .official-primary { border-radius: 13px; box-shadow: 0 8px 20px #b20c2a27; }
html.theme-dark .app-site.official-page {
  background: linear-gradient(105deg, #a50b29 0%, #4d1827 25%, #171316 63%, #080d20 100%) !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-header h1 span { color: #ffd8df !important; }
html.theme-dark .app-site.official-page .official-header > p:last-child,
html.theme-dark .app-site.official-page .official-hint { color: #e4dfe2 !important; }
html.theme-dark .app-site.official-page .official-progress-item,
html.theme-dark .app-site.official-page .official-progress-item.done {
  border-color: #ffffff38;
  background: #ffffff12 !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-progress-item.current { border-color: #c10c30; background: #b20c2a !important; }
html.theme-dark .app-site.official-page .official-progress-item span { background: #45516a !important; color: #fff !important; }
html.theme-dark .app-site.official-page .official-progress-item.current span,
html.theme-dark .app-site.official-page .official-progress-item.done span { background: #fff !important; color: #b20c2a !important; }
html.theme-dark .app-site.official-page .official-progress-item small,
html.theme-dark .app-site.official-page .official-progress-item.current small,
html.theme-dark .app-site.official-page .official-progress-item.done small { color: #fff !important; }
html.theme-dark .app-site.official-page .official-panel {
  border-color: #ffffff66;
  background: linear-gradient(112deg, rgba(48,24,34,.96), rgba(23,20,27,.96)) !important;
  box-shadow: 0 18px 52px #0003;
}
html.theme-dark .app-site.official-page .official-panel::before {
  background: radial-gradient(ellipse at center, rgba(214,14,52,.37), rgba(178,11,45,.22) 43%, transparent 75%);
}
html.theme-dark .app-site.official-page .official-choice,
html.theme-dark .app-site.official-page .official-line,
html.theme-dark .app-site.official-page .official-summary {
  border-color: #ffffff40 !important;
  background: rgba(255,255,255,.055) !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-choice:hover,
html.theme-dark .app-site.official-page .official-choice.chosen {
  border-color: #ff526c !important;
  background: rgba(178,12,42,.3) !important;
  box-shadow: 0 12px 30px #0002;
}
html.theme-dark .app-site.official-page .official-choice strong,
html.theme-dark .app-site.official-page .official-line strong,
html.theme-dark .app-site.official-page .official-panel h2,
html.theme-dark .app-site.official-page .official-nested h3 { color: #fff !important; }
html.theme-dark .app-site.official-page .official-choice small,
html.theme-dark .app-site.official-page .official-summary span { color: #d3cbd0 !important; }
html.theme-dark .app-site.official-page .official-emoji {
  border-color: #ffffff38;
  background: #ffffff16;
  color: #fff;
}
html.theme-dark .app-site.official-page .official-nested { border-color: #ffffff38; }
html.theme-dark .app-site.official-page .official-fields input,
html.theme-dark .app-site.official-page .official-fields select,
html.theme-dark .app-site.official-page .official-fields textarea,
html.theme-dark .app-site.official-page .official-single textarea,
html.theme-dark .app-site.official-page .official-location-combobox > input {
  border-color: #ffffff40 !important;
  border-radius: 13px;
  background: #10192c !important;
}
html.theme-dark .app-site.official-page .official-location-options { border-color: #ffffff48 !important; background: #19191c !important; }
@media (max-width: 760px) {
  .app-site.official-page .official-shell { width: min(100% - 28px, 600px); padding-top: 30px; }
  .app-site.official-page .official-progress { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 22px 0 16px; }
  .app-site.official-page .official-progress-item,
  .app-site.official-page .official-progress-item.current,
  .app-site.official-page .official-progress-item.done { min-height: 62px; flex-direction: column; justify-content: center; gap: 4px; padding: 6px 3px; border-radius: 11px; text-align: center; }
  .app-site.official-page .official-progress-item span { flex-basis: 28px; width: 28px; height: 28px; font-size: 12px; }
  .app-site.official-page .official-progress-item small,
  .app-site.official-page .official-progress-item.current small,
  .app-site.official-page .official-progress-item.done small { font-size: 9px; line-height: 1.05; text-align: center; overflow-wrap: anywhere; }
  .app-site.official-page .official-panel { border-radius: 22px; }
}
@media (prefers-reduced-motion: reduce) { .app-site.official-page .official-panel::before { animation: none; } }

/* Ajuste final solicitado: acentos rosados al rojo institucional y encabezado
   continuo, sin la barra vertical lateral. El diseño de los pasos se conserva. */
.app-site.official-page .official-header { border-left: 0 !important; padding-left: 0 !important; }
.app-site.official-page .official-kicker,
.app-site.official-page .official-header h1 span,
.app-site.official-page .official-fields label span,
.app-site.official-page .official-location-field > label span,
.app-site.official-page .official-back,
.app-site.official-page .official-location-options li button:hover,
.app-site.official-page .official-location-options li button[aria-selected="true"] { color: #a80e18 !important; }
.app-site.official-page .official-progress-item.current { background: #a80e18 !important; border-color: #a80e18 !important; }
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span { color: #a80e18 !important; }
.app-site.official-page .official-choice:hover,
.app-site.official-page .official-choice.chosen { border-color: #a80e18 !important; background: rgba(168,14,24,.08) !important; }
.app-site.official-page .official-emoji { border-color: rgba(168,14,24,.22); background: rgba(168,14,24,.08); color: #a80e18; }
.app-site.official-page .official-fields input:focus,
.app-site.official-page .official-fields select:focus,
.app-site.official-page .official-fields textarea:focus { outline-color: #a80e18; }
.app-site.official-page .official-primary,
.app-site.official-page .official-link { background: #a80e18 !important; }
.app-site.official-page .official-ghost,
.app-site.official-page .official-remove,
.app-site.official-page .official-back { color: #a80e18 !important; border-color: rgba(168,14,24,.38) !important; }
.app-site.official-page .official-primary { box-shadow: 0 8px 20px rgba(168,14,24,.18); }
.app-site.official-page .official-nested { border-color: rgba(168,14,24,.28); }
.app-site.official-page .official-panel::before { background: radial-gradient(ellipse at center, rgba(168,14,24,.14), rgba(168,14,24,.06) 43%, transparent 75%); }
.app-site.official-page .official-catalog-alert,
.app-site.official-page .official-error { border-color: rgba(168,14,24,.48); color: #a80e18; }
html.theme-dark .app-site.official-page .official-header h1 span { color: #a80e18 !important; -webkit-text-stroke: 0; text-shadow: none; }
html.theme-dark .app-site.official-page .official-kicker { color: #a80e18 !important; }
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.current span,
html.theme-dark .app-site.official-page .official-progress-item.done span { color: #a80e18 !important; }
html.theme-dark .app-site.official-page .official-progress-item.current { background: #a80e18 !important; border-color: #a80e18 !important; }
html.theme-dark .app-site.official-page .official-progress-item.current span,
html.theme-dark .app-site.official-page .official-progress-item.done span { background: #fff !important; }
html.theme-dark .app-site.official-page .official-choice:hover,
html.theme-dark .app-site.official-page .official-choice.chosen { border-color: #a80e18 !important; background: rgba(168,14,24,.22) !important; }
html.theme-dark .app-site.official-page .official-emoji { color: #a80e18; }
html.theme-dark .app-site.official-page .official-primary,
html.theme-dark .app-site.official-page .official-link { background: #a80e18 !important; }
html.theme-dark .app-site.official-page .official-ghost,
html.theme-dark .app-site.official-page .official-remove,
html.theme-dark .app-site.official-page .official-back { border-color: #a80e18 !important; }
html.theme-dark .app-site.official-page .official-panel::before { background: radial-gradient(ellipse at center, rgba(168,14,24,.34), rgba(168,14,24,.18) 43%, transparent 75%); }
html.theme-dark .app-site.official-page .official-catalog-alert,
html.theme-dark .app-site.official-page .official-error { border-color: #a80e18; color: #fff !important; }

/* Restaurar el progreso original: cuatro círculos unidos por una línea. */
.app-site.official-page .official-progress {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0;
  margin: 28px 0 22px;
}
.app-site.official-page .official-progress::before {
  display: block;
  position: absolute;
  z-index: 0;
  top: 26px;
  right: 12.5%;
  left: 12.5%;
  height: 3px;
  border-radius: 3px;
  background: #ded4d8;
  content: "";
}
.app-site.official-page .official-progress-item,
.app-site.official-page .official-progress-item.current,
.app-site.official-page .official-progress-item.done {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-height: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 0;
  background: transparent !important;
  color: #777584 !important;
  text-align: center;
}
.app-site.official-page .official-progress-item.current,
.app-site.official-page .official-progress-item.done { background: transparent !important; }
.app-site.official-page .official-progress-item span,
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span {
  display: grid;
  flex: 0 0 54px;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 3px solid #ded4d8 !important;
  border-radius: 50%;
  background: #f2eef0 !important;
  color: #777584 !important;
  font-size: 17px;
}
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span {
  border-color: #a80e18 !important;
  background: #a80e18 !important;
  color: #fff !important;
}
.app-site.official-page .official-progress-item span,
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span {
  box-sizing: border-box !important;
  flex: 0 0 54px !important;
  width: 54px !important;
  min-width: 54px !important;
  height: 54px !important;
  min-height: 54px !important;
  padding: 0 !important;
  border-radius: 50% !important;
}
.app-site.official-page .official-progress-item small,
.app-site.official-page .official-progress-item.current small,
.app-site.official-page .official-progress-item.done small {
  color: inherit !important;
  font-size: 12px;
  font-weight: 800;
  line-height: 1.25;
}
html.theme-dark .app-site.official-page .official-progress::before { background: #ffffff45; }
html.theme-dark .app-site.official-page .official-progress-item,
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.done { color: #d3cbd0 !important; }
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.done { background: transparent !important; }
html.theme-dark .app-site.official-page .official-progress-item span {
  border-color: #ffffff45 !important;
  background: #45516a !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.done { color: #fff !important; }
/* Mantener solamente el recorrido de círculos, sin bandas detrás. */
.app-site.official-page .official-progress-item,
.app-site.official-page .official-progress-item.current,
.app-site.official-page .official-progress-item.done,
html.theme-dark .app-site.official-page .official-progress-item,
html.theme-dark .app-site.official-page .official-progress-item.current,
html.theme-dark .app-site.official-page .official-progress-item.done { background: transparent !important; }
html.theme-dark .app-site.official-page .official-progress-item.current span,
html.theme-dark .app-site.official-page .official-progress-item.done span {
  border-color: #a80e18 !important;
  background: #a80e18 !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page {
  background: linear-gradient(115deg, #271820 0%, #171316 48%, #080d20 100%) !important;
}
html.theme-dark .app-site.official-page .official-header h1 span {
  color: #fff !important;
  -webkit-text-stroke: 0;
  text-shadow: none;
}
.app-site.official-page .official-shell { width: min(1180px, calc(100% - 40px)); padding-top: 36px; }
.app-site.official-page .official-header h1 { font-size: clamp(34px, 4.6vw, 58px); }
.app-site.official-page .official-progress { margin: 22px 0 18px; }
.app-site.official-page .official-progress::before { top: 21px; }
.app-site.official-page .official-progress-item span,
.app-site.official-page .official-progress-item.current span,
.app-site.official-page .official-progress-item.done span {
  flex: 0 0 44px !important;
  width: 44px !important;
  min-width: 44px !important;
  height: 44px !important;
  min-height: 44px !important;
  font-size: 15px;
}
.app-site.official-page .official-panel { padding: clamp(18px, 3vw, 32px); border-radius: 25px; }
.app-site.official-page .official-choices { gap: 10px; margin-top: 20px; }
.app-site.official-page .official-choice { min-height: 122px; padding: 17px; gap: 9px; }
.app-site.official-page .official-emoji { width: 48px; height: 48px; border-radius: 14px; }
.app-site.official-page .official-panel {
  overflow: visible;
  border: 0 !important;
  border-radius: 0;
  background: transparent !important;
  box-shadow: none;
}
html.theme-dark .app-site.official-page .official-panel {
  border: 0 !important;
  border-radius: 0;
  background: transparent !important;
  box-shadow: none !important;
}
/* Full-page quote background: one continuous gradient, without a footer band. */
.app-site.official-page {
  position: relative;
  isolation: isolate;
  width: 100%;
  min-height: 100vh;
  overflow-x: clip;
  overflow-y: visible;
  border: 0 !important;
  background: transparent !important;
}
/* Paint the same viewport-fixed wash on the document canvas, not a centered
   content box. This removes the visible side seams at wide desktop sizes. */
html:has(.app-site.official-page),
body:has(.app-site.official-page),
#app:has(.app-site.official-page) {
  width: 100%;
  max-width: none;
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 118% 92% at -5% 0%, rgba(178, 11, 45, .7) 0%, rgba(135, 14, 40, .48) 39%, rgba(68, 20, 40, .22) 70%, transparent 100%),
    radial-gradient(ellipse 64% 66% at 3% 33%, rgba(206, 14, 44, .2) 0%, transparent 80%),
    linear-gradient(105deg, #21171d 0%, #1b171e 48%, #080d20 100%) fixed !important;
  background-attachment: fixed, fixed !important;
}
html:not(.theme-dark):has(.app-site.official-page),
html:not(.theme-dark) body:has(.app-site.official-page),
html:not(.theme-dark) #app:has(.app-site.official-page) {
  background:
    radial-gradient(ellipse 118% 92% at -5% 0%, rgba(178, 11, 45, .14) 0%, rgba(168, 14, 24, .07) 39%, rgba(168, 14, 24, .025) 70%, transparent 100%),
    radial-gradient(ellipse 64% 66% at 3% 33%, rgba(206, 14, 44, .045) 0%, transparent 80%),
    linear-gradient(105deg, #fffafa 0%, #faf8f9 48%, #f5f6fb 100%) fixed !important;
  background-attachment: fixed, fixed !important;
}
.app-site.official-page > * { position: relative; z-index: 1; }
html.theme-dark .app-site.official-page,
html:not(.theme-dark) .app-site.official-page { background: transparent !important; }
.app-site.official-page > main.official-shell { background: transparent !important; background-image: none !important; }
.app-site.official-page .official-panel::before {
  content: none !important;
  display: none !important;
  animation: none !important;
}
/* A soft red highlight sweeps left to right inside selection cards in every step. */
.app-site.official-page .official-choice {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.app-site.official-page .official-choice::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: -55%;
  bottom: -55%;
  left: -38%;
  width: 62%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(238, 24, 58, .5) 0%, rgba(168, 14, 24, .3) 40%, rgba(126, 10, 34, .12) 62%, transparent 78%);
  filter: blur(26px);
  pointer-events: none;
  /* Keep this requested visual animation even when the site's global reduced-motion rule is active. */
  animation: quote-option-red-sweep 7s linear infinite !important;
}
.app-site.official-page .official-choice > * { position: relative; z-index: 1; }
.app-site.official-page .official-choice:nth-child(2)::before { animation-delay: -2.3s; }
.app-site.official-page .official-choice:nth-child(3)::before { animation-delay: -4.6s; }
.app-site.official-page .official-line {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}
.app-site.official-page .official-line::before {
  content: "";
  position: absolute;
  z-index: 0;
  top: -55%;
  bottom: -55%;
  left: -38%;
  width: 62%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(238, 24, 58, .5) 0%, rgba(168, 14, 24, .3) 40%, rgba(126, 10, 34, .12) 62%, transparent 78%);
  filter: blur(26px);
  pointer-events: none;
  animation: quote-option-red-sweep 7s linear infinite !important;
}
.app-site.official-page .official-line > * { position: relative; z-index: 1; }
.app-site.official-page .official-add-equipment {
  background: #a80e18 !important;
  border-color: #a80e18 !important;
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-add-equipment {
  background: #a80e18 !important;
  border-color: #a80e18 !important;
  color: #fff !important;
}
.app-site.official-page .official-back {
  background: #a80e18 !important;
  color: #fff !important;
  border-color: #a80e18 !important;
}
.app-site.official-page .official-fields label {
  display: block !important;
}
.app-site.official-page .official-fields label > span {
  display: inline-block;
  margin-left: 3px;
  vertical-align: baseline;
}
.app-site.official-page .official-fields label > :is(input, select, textarea) {
  display: block;
  margin-top: 7px;
}
.app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea),
.app-site.official-page .official-single textarea {
  background: rgba(255, 255, 255, .14) !important;
  border: 1px solid rgba(255, 255, 255, .34) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.22), 0 8px 22px rgba(28,16,22,.04);
  -webkit-backdrop-filter: blur(18px) saturate(135%);
  backdrop-filter: blur(18px) saturate(135%);
  transition: background .2s ease, border-color .2s ease, box-shadow .2s ease;
}
.app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea):focus-visible,
.app-site.official-page .official-single textarea:focus-visible {
  border-color: #a80e18 !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.6), 0 0 0 3px rgba(168,14,24,.2);
  outline: none;
}
html.theme-dark .app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea),
html.theme-dark .app-site.official-page .official-single textarea {
  background: rgba(255, 255, 255, .035) !important;
  border-color: rgba(255, 255, 255, .22) !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.1), 0 8px 22px rgba(0,0,0,.08);
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-fields :is(input:not([type="checkbox"]), textarea)::placeholder,
html.theme-dark .app-site.official-page .official-single textarea::placeholder {
  color: rgba(255,255,255,.62) !important;
}
html.theme-dark .app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea):focus-visible,
html.theme-dark .app-site.official-page .official-single textarea:focus-visible {
  border-color: #a80e18 !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 3px rgba(168,14,24,.28);
}
.app-site.official-page > .site-header {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
.app-site.official-page .official-header .official-kicker {
  color: #fff !important;
}
html.theme-dark .app-site.official-page .official-header .official-kicker {
  color: #fff !important;
}
/* La lista de ubicaciones y los controles conservaban colores oscuros incluso
   al quitar theme-dark. Define su estado claro de forma explícita. */
html:not(.theme-dark) body:has(.app-site.official-page),
html:not(.theme-dark) #app:has(.app-site.official-page) {
  color-scheme: light;
}
html:not(.theme-dark) .app-site.official-page {
  color-scheme: light;
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-header h1,
html:not(.theme-dark) .app-site.official-page .official-panel h2,
html:not(.theme-dark) .app-site.official-page .official-nested h3,
html:not(.theme-dark) .app-site.official-page .official-choice strong,
html:not(.theme-dark) .app-site.official-page .official-line strong,
html:not(.theme-dark) .app-site.official-page .official-fields label,
html:not(.theme-dark) .app-site.official-page .official-single,
html:not(.theme-dark) .app-site.official-page .official-location-field {
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-header > p:last-child,
html:not(.theme-dark) .app-site.official-page .official-hint,
html:not(.theme-dark) .app-site.official-page .official-choice small,
html:not(.theme-dark) .app-site.official-page .official-summary span,
html:not(.theme-dark) .app-site.official-page .official-id {
  color: #626778 !important;
}
html:not(.theme-dark) .app-site.official-page .official-panel,
html:not(.theme-dark) .app-site.official-page .official-success {
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-choice,
html:not(.theme-dark) .app-site.official-page .official-line,
html:not(.theme-dark) .app-site.official-page .official-summary {
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea),
html:not(.theme-dark) .app-site.official-page .official-single textarea,
html:not(.theme-dark) .app-site.official-page .official-location-combobox > input {
  color: #242630 !important;
  color-scheme: light;
}
html:not(.theme-dark) .app-site.official-page :is(input, textarea)::placeholder {
  color: #737887 !important;
  opacity: 1;
}
html:not(.theme-dark) .app-site.official-page .official-location-options {
  background: #fff !important;
  border-color: #d8cbd0 !important;
  box-shadow: 0 18px 36px rgba(35, 21, 28, .16);
}
html:not(.theme-dark) .app-site.official-page .official-location-options li button {
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-location-options li button:hover,
html:not(.theme-dark) .app-site.official-page .official-location-options li button[aria-selected="true"] {
  background: rgba(168, 14, 24, .08) !important;
  color: #a80e18 !important;
}
/* Keep the active location menu above following form sections. Raise the
   containing field as well as the list so sibling sections cannot cover it. */
.app-site.official-page .official-panel:has(.official-location-options) .official-fields {
  position: relative !important;
  z-index: 100 !important;
}
.app-site.official-page .official-panel .official-location-field:has(.official-location-options),
.app-site.official-page .official-panel .official-location-combobox:has(.official-location-options) {
  position: relative !important;
  z-index: 130 !important;
}
.app-site.official-page .official-panel .official-location-options {
  z-index: 131 !important;
}
html:not(.theme-dark) .app-site.official-page > .site-header :is(.main-nav a, .nav-dropdown__trigger, .header-settings__trigger, .menu-toggle) {
  color: #242630 !important;
}
/* On the light quotes page the active Cargo menu must retain the same
   institutional red pill and white text it has on Itinerarios. */
html:not(.theme-dark) .app-site.official-page > .site-header .main-nav .nav-dropdown--active .nav-dropdown__trigger {
  background:#ad0922 !important;
  color:#fff !important;
  border-color:transparent !important;
}
html:not(.theme-dark) .app-site.official-page > .site-header .main-nav .nav-dropdown--active .nav-dropdown__trigger:is(:hover,[aria-expanded="true"]) {
  background:#c20e2b !important;
  color:#fff !important;
}
html:not(.theme-dark) .app-site.official-page > .site-header .header-settings__trigger,
html:not(.theme-dark) .app-site.official-page > .site-header .menu-toggle {
  border-color: rgba(36, 38, 48, .25) !important;
  background: rgba(255, 255, 255, .34) !important;
}
html:not(.theme-dark) .app-site.official-page .official-header .official-kicker { color: #a80e18 !important; }
html:not(.theme-dark) .app-site.official-page > .site-header .site-brand img { filter: brightness(0) saturate(100%) invert(13%) sepia(91%) saturate(3356%) hue-rotate(343deg) brightness(83%) contrast(100%); }
/* Dejar que el resplandor rojo se vea a través de la tarjeta y de sus campos glass. */
html:not(.theme-dark) .app-site.official-page .official-line {
  background: #fff !important;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
html:not(.theme-dark) .app-site.official-page .official-line::before {
  left: -45%;
  width: 42%;
  background: radial-gradient(ellipse at center,
    rgba(168, 14, 24, .37) 0%,
    rgba(168, 14, 24, .27) 42%,
    rgba(168, 14, 24, .12) 66%,
    transparent 82%);
  filter: blur(30px);
  opacity: 0;
  animation: quote-equipment-glow-pass 6s ease-in-out infinite !important;
}
html:not(.theme-dark) .app-site.official-page .official-fields :is(input:not([type="checkbox"]), select, textarea),
html:not(.theme-dark) .app-site.official-page .official-single textarea {
  background: #fff !important;
  border-color: #cfd0d9 !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .9), 0 4px 14px rgba(28, 16, 22, .04);
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}
@keyframes quote-option-red-sweep {
  from { transform: translateX(0); }
  to { transform: translateX(220%); }
}
@keyframes quote-equipment-glow-pass {
  0%, 100% { opacity: 0; transform: translateX(0); }
  12% { opacity: .92; }
  76% { opacity: .92; transform: translateX(300%); }
  90% { opacity: 0; transform: translateX(400%); }
}
@media (max-width: 760px) {
  .app-site.official-page .official-shell { width: min(100% - 28px, 600px); padding-top: 30px; }
  .app-site.official-page .official-progress { grid-template-columns: none; margin: 22px 0 16px; }
  .app-site.official-page .official-progress::before { top: 19px; }
  .app-site.official-page .official-progress-item,
  .app-site.official-page .official-progress-item.current,
  .app-site.official-page .official-progress-item.done { flex-direction: column; gap: 5px; min-height: 0; padding: 0 2px; }
  .app-site.official-page .official-progress-item span,
  .app-site.official-page .official-progress-item.current span,
  .app-site.official-page .official-progress-item.done span {
    flex: 0 0 40px !important;
    width: 40px !important;
    min-width: 40px !important;
    height: 40px !important;
    min-height: 40px !important;
    font-size: 14px;
  }
  .app-site.official-page .official-progress-item small,
  .app-site.official-page .official-progress-item.current small,
  .app-site.official-page .official-progress-item.done small { font-size: 9px; line-height: 1.1; }
}
/* En modo claro, los pasos pendientes deben conservar buen contraste. */
html:not(.theme-dark) .app-site.official-page .official-progress-item:not(.current):not(.done),
html:not(.theme-dark) .app-site.official-page .official-progress-item:not(.current):not(.done) small {
  color: #111 !important;
}
html:not(.theme-dark) .app-site.official-page .official-progress-item:not(.current):not(.done) span {
  color: #111 !important;
}
/* Normalize all dropdown chevrons across searchable locations and native selects. */
.app-site.official-page .official-location-toggle {
  top: 50% !important;
  right: 16px !important;
  width: 24px !important;
  height: 24px !important;
  transform: translateY(-50%) !important;
  display: grid !important;
  place-items: center !important;
  color: #f2f3f6 !important;
  font-size: 0 !important;
  line-height: 0 !important;
}
.app-site.official-page .official-location-toggle::before {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
}
/* A selected location replaces the chevron with a clear X, in the same place. */
.app-site.official-page .official-location-toggle--clear::before {
  content: "×";
  width: auto;
  height: auto;
  border: 0;
  transform: none;
  font-size: 25px;
  font-weight: 400;
  line-height: 1;
}
.app-site.official-page .official-location-toggle:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
  border-radius: 5px;
}
.app-site.official-page .official-fields select {
  appearance: none !important;
  -webkit-appearance: none !important;
  padding-right: 64px !important;
  background-image: none !important;
}
.app-site.official-page .official-select-wrap {
  position: relative !important;
  display: block;
  width: 100%;
  margin-top: 7px;
}
.app-site.official-page .official-select-wrap select {
  display: block;
  width: 100%;
  margin-top: 0 !important;
}
.app-site.official-page .official-select-wrap::after {
  content: "";
  position: absolute;
  right: 24px;
  top: 50%;
  width: 8px;
  height: 8px;
  border-right: 2px solid #f2f3f6;
  border-bottom: 2px solid #f2f3f6;
  transform: translateY(-50%) rotate(45deg);
  pointer-events: none;
}
html:not(.theme-dark) .app-site.official-page .official-location-toggle {
  color: #414550 !important;
}
html:not(.theme-dark) .app-site.official-page .official-select-wrap::after {
  border-color: #414550;
}
/* Glass surface for the searchable location dropdowns, matching the quote selects. */
.app-site.official-page .official-location-options {
  background: rgba(25, 25, 28, .76) !important;
  border-color: rgba(255, 255, 255, .3) !important;
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
  box-shadow: 0 18px 38px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(255, 255, 255, .12);
}
html:not(.theme-dark) .app-site.official-page .official-location-options {
  background: rgba(255, 255, 255, .76) !important;
  border-color: rgba(255, 255, 255, .72) !important;
  box-shadow: 0 18px 38px rgba(35, 21, 28, .18), inset 0 1px 0 rgba(255, 255, 255, .8);
}
html.theme-dark .app-site.official-page .official-location-options {
  background: rgba(25, 25, 28, .76) !important;
  border-color: rgba(255, 255, 255, .3) !important;
}
html:not(.theme-dark) .app-site.official-page .official-fields select {
  color-scheme: light !important;
}
html:not(.theme-dark) .app-site.official-page .official-fields select option {
  color: #242630 !important;
  background-color: #fff !important;
}
.app-site.official-page .official-incoterm-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
.app-site.official-page .official-incoterm-wrap { z-index: auto !important; }
.app-site.official-page .official-incoterm-wrap:has(.official-incoterm-options) {
  position: relative !important;
  z-index: 140 !important;
}
.app-site.official-page .official-incoterm-wrap::after { border-color: #414550; }
.app-site.official-page .official-incoterm-trigger {
  display: block;
  width: 100%;
  min-height: 45px;
  margin: 0;
  padding: 12px 64px 12px 16px;
  border: 1px solid #cfd2dc;
  border-radius: 13px;
  background: #fff;
  color: #242630;
  text-align: left;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
}
.app-site.official-page .official-incoterm-options {
  position: absolute;
  z-index: 120;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
  padding: 8px;
  list-style: none;
  border: 1px solid rgba(255, 255, 255, .3);
  border-radius: 18px;
  background: rgba(25, 25, 28, .76) !important;
  opacity: 1 !important;
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
  box-shadow: 0 18px 38px rgba(0, 0, 0, .28), inset 0 1px 0 rgba(255, 255, 255, .12);
}
.app-site.official-page .official-incoterm-options li { margin: 0; padding: 0; }
.app-site.official-page .official-incoterm-options button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  min-height: 48px;
  padding: 10px 14px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: #242630;
  text-align: left;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.app-site.official-page .official-incoterm-options button:hover,
.app-site.official-page .official-incoterm-options button[aria-selected="true"] {
  background: #30262d;
  color: #ff6b50;
}
html.theme-dark .app-site.official-page .official-incoterm-wrap::after { border-color: #f2f3f6; }
html.theme-dark .app-site.official-page .official-incoterm-trigger {
  border-color: rgba(255, 255, 255, .22);
  background: rgba(255, 255, 255, .035) !important;
  color: #fff;
  -webkit-backdrop-filter: blur(18px) saturate(135%);
  backdrop-filter: blur(18px) saturate(135%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .1), 0 8px 22px rgba(0, 0, 0, .08);
}
html.theme-dark .app-site.official-page .official-incoterm-options {
  border-color: rgba(255, 255, 255, .3) !important;
  background: rgba(25, 25, 28, .76) !important;
  color: #fff !important;
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
}
html.theme-dark .app-site.official-page .official-incoterm-options button { color: #fff !important; }
html.theme-dark .app-site.official-page .official-incoterm-options button[aria-selected="true"] {
  background: #30262d !important;
  color: #ff6b50 !important;
}
.app-site.official-page .official-fields:has(.official-incoterm-options) {
  position: relative !important;
  z-index: 105 !important;
}
/* Equipment selectors reuse the Incoterm appearance in FCL and FTL.
   Raise the active equipment line above neighbouring controls and lines. */
.app-site.official-page .official-line:has(.official-equipment-options) {
  position: relative !important;
  z-index: 145 !important;
  overflow: visible;
}
.app-site.official-page .official-equipment-wrap:has(.official-equipment-options) {
  position: relative !important;
  z-index: 150 !important;
}
.app-site.official-page .official-panel > .official-nested:has(.official-fields:has(.official-location-options)),
.app-site.official-page .official-panel > .official-nested:has(.official-fields:has(.official-incoterm-options)) {
  position: relative !important;
  z-index: 20 !important;
}
html:not(.theme-dark) .app-site.official-page .official-incoterm-options {
  border-color: rgba(255, 255, 255, .72) !important;
  background: rgba(255, 255, 255, .76) !important;
  color: #242630 !important;
  opacity: 1 !important;
  box-shadow: 0 18px 38px rgba(35, 21, 28, .18), inset 0 1px 0 rgba(255, 255, 255, .8);
}
html:not(.theme-dark) .app-site.official-page .official-incoterm-options button {
  color: #242630 !important;
}
html:not(.theme-dark) .app-site.official-page .official-incoterm-options button:hover,
html:not(.theme-dark) .app-site.official-page .official-incoterm-options button[aria-selected="true"] {
  background: rgba(168, 14, 24, .08) !important;
  color: #a80e18 !important;
}
/* An open Incoterm/equipment menu must be above the NEXT form sections.
   The equipment card uses isolation:isolate and later siblings have their own
   painted layers, so lifting only the list's z-index is not enough. */
.app-site.official-page .official-panel > .official-fields:has(.official-incoterm-options),
.app-site.official-page .official-panel > .official-nested:has(.official-equipment-options) {
  position: relative !important;
  z-index: 1000 !important;
  overflow: visible !important;
}
.app-site.official-page .official-panel .official-line:has(.official-equipment-options),
.app-site.official-page .official-panel .official-fields:has(.official-equipment-options) {
  position: relative !important;
  z-index: 1010 !important;
  overflow: visible !important;
}
/* Opaque menus prevent underlying captions, input values and checkboxes
   from bleeding through. The menu styling is shared by FCL, FTL and Incoterm. */
html:not(.theme-dark) .app-site.official-page .official-incoterm-options {
  background: #fff !important;
  opacity: 1 !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  box-shadow: 0 18px 38px rgba(35, 21, 28, .24) !important;
}
html.theme-dark .app-site.official-page .official-incoterm-options {
  background: #19191c !important;
  color: #fff !important;
  opacity: 1 !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
  box-shadow: 0 18px 38px rgba(0, 0, 0, .45) !important;
}
/* Match the typography of the date field across every quote input/select. */
.app-site.official-page .official-fields :is(input:not([type="checkbox"]),select,textarea),
.app-site.official-page .official-incoterm-trigger,
.app-site.official-page .official-location-combobox input {
  font-size:14px !important;
}
@media (max-width:650px) {
  .app-site.official-page .official-fields :is(input:not([type="checkbox"]),select,textarea),
  .app-site.official-page .official-incoterm-trigger,
  .app-site.official-page .official-location-combobox input {
    font-size:16px !important;
  }
}
</style>

