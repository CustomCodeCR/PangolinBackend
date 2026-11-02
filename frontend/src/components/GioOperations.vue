<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { ArrowLeft, CheckCircle2, ChevronRight, FileText, LoaderCircle, MapPin, Search, ShieldCheck, Ship } from '@lucide/vue'
import { refreshSession } from '../services/auth'

type Kind = 'quote' | 'tracking' | 'itinerary'
type Phase = 'collect' | 'review' | 'auth' | 'location' | 'result'
type Choice = { value: string; label: string }
type Step = { key: string; prompt: string; choices?: Choice[]; optional?: boolean; hint?: string }
type Location = { id: string; displayName: string; code: string | null }
type Itinerary = { id: string; pol: string; pod: string; etd: string; eta: string; status: string; transport: string; modality: string }
type Shipment = { title?: string | null; status?: string | null; origin?: string | null; destination?: string | null; etd?: string | null; eta?: string | null; customerStatus?: string | null; vessel?: string | null; bcf?: string | null; updatedAtUtc?: string | null }

const props = defineProps<{ kind: Kind; language: 'es' | 'en'; initialQuestion?: string }>()
const emit = defineEmits<{ back: [] }>()
const tr = (es: string, en: string) => props.language === 'en' ? en : es
const values = reactive<Record<string, string>>({})
const selectedLocations = reactive<Record<string, string>>({})
const phase = ref<Phase>('collect')
const stepIndex = ref(0)
const input = ref('')
const error = ref('')
const busy = ref(false)
const history = ref<{ question: string; answer: string }[]>([])
const scroller = ref<HTMLElement | null>(null)
const pendingRole = ref('')
const locationTerm = ref('')
const locationChoices = ref<Location[]>([])
const quoteId = ref('')
const quoteStatus = ref('')
const itineraries = ref<Itinerary[]>([])
const itineraryTotal = ref(0)
const shipments = ref<Shipment[]>([])
const shipmentTruncated = ref(false)
const restrictedTracking = ref(false)
const STORAGE_KEY = 'gcf-gio-quote-draft-v1'
const prefilled = ref(false)
const editingField = ref('')
const i = (es: string, en: string) => tr(es, en)
const modes = computed<Choice[]>(() => [{value:'Maritime',label:i('Marítimo','Ocean')},{value:'Air',label:i('Aéreo','Air')},{value:'Land',label:i('Terrestre','Ground')}])
const terms = 'EXW FCA FAS FOB CFR CIF CPT CIP DAP DPU DDP'.split(' ').map(value => ({value,label:value}))
const isEquipment = computed(() => ['FCL', 'FTL'].includes(values.shipmentType))
const shipmentOptions = computed<Choice[]>(() => values.mode === 'Maritime'
  ? [{value:'FCL',label:i('Contenedor completo (FCL)','Full container (FCL)')},{value:'LCL',label:i('Carga consolidada (LCL)','Consolidated cargo (LCL)')}]
  : values.mode === 'Air' ? [{value:'AIR_LCL',label:i('Carga aérea (AIR LCL)','Air cargo (AIR LCL)')}]
  : [{value:'FTL',label:i('Camión completo (FTL)','Full truck (FTL)')},{value:'LTL',label:i('Carga consolidada (LTL)','Consolidated cargo (LTL)')}])
const steps = computed<Step[]>(() => {
  if (props.kind === 'tracking') return [
    {key:'referenceType',prompt:i('¿Qué tipo de referencia tienes?','Which reference type do you have?'),choices:[{value:'BCF',label:'BCF / BL / HBL'},{value:'CONTAINER',label:i('Contenedor','Container')},{value:'PO',label:'PO'},{value:'IDTRA',label:'IDTRA'}]},
    {key:'reference',prompt:i('Escribe el número de referencia del embarque.','Enter your shipment reference number.')}
  ]
  if (props.kind === 'itinerary') return [
    {key:'origin',prompt:i('¿Desde qué puerto o lugar necesitas salir?','Where should the route depart from?')},
    {key:'destination',prompt:i('¿Cuál es el destino?','What is the destination?')},
    {key:'transport',prompt:i('¿Qué tipo de transporte buscas?','Which transport mode do you need?'),choices:[{value:'maritime',label:i('Marítimo','Ocean')},{value:'ground',label:i('Terrestre','Ground')},{value:'',label:i('Cualquiera','Any')}]},
    {key:'departure',prompt:i('¿Desde qué fecha de salida? Formato AAAA-MM-DD. Puedes omitirla.','Earliest departure date? Use YYYY-MM-DD or skip.'),optional:true,hint:'AAAA-MM-DD'}
  ]
  const result: Step[] = [
    {key:'mode',prompt:i('¡Vamos a preparar tu cotización! ¿Qué transporte necesitas?','Let us prepare your quote. Which transport mode do you need?'),choices:modes.value},
    {key:'shipmentType',prompt:i('¿Qué tipo de embarque?','Which shipment type?'),choices:shipmentOptions.value},
    {key:'origin',prompt:i('¿Desde qué ciudad o puerto sale la carga?','Where will the cargo depart from?')},
    {key:'destination',prompt:i('¿Cuál es el destino?','What is the destination?')}
  ]
  if (values.shipmentType === 'LCL') result.push({key:'pod',prompt:i('Para LCL, indica también el puerto de descarga (POD).','For LCL, provide the port of discharge (POD).')})
  result.push(
    {key:'incoterm',prompt:i('¿Qué Incoterm se utilizará?','Which Incoterm applies?'),choices:terms},
    {key:'cargoReadyDate',prompt:i('¿En qué fecha estará lista la carga? Escribe AAAA-MM-DD.','When will the cargo be ready? Enter YYYY-MM-DD.'),hint:'AAAA-MM-DD'}
  )
  if (values.incoterm === 'EXW') result.push(
    {key:'exwCargoStatus',prompt:i('¿La carga EXW está nacionalizada o en régimen fiscal?','Is the EXW cargo nationalized or under fiscal regime?'),choices:[{value:'nationalized',label:i('Nacionalizada','Nationalized')},{value:'fiscal',label:i('Fiscal','Fiscal')}]},
    {key:'exwPickupAddress',prompt:i('¿Cuál es la dirección de recolección EXW?','What is the EXW pickup address?')}
  )
  result.push(
    {key:'cargoDescription',prompt:i('Describe la mercancía que necesitas transportar.','Describe the goods you need to transport.')},
    {key:'dangerousGoods',prompt:i('¿La mercancía es peligrosa o requiere manejo especial?','Is this dangerous cargo or does it require special handling?'),choices:[{value:'yes',label:i('Sí','Yes')},{value:'no',label:'No'},{value:'unsure',label:i('No estoy seguro','Not sure')}]}
  )
  if (isEquipment.value) result.push(
    {key:'equipmentSize',prompt:i('¿Qué tamaño o tipo de equipo necesitas? Ejemplo: 40 HC.','Which equipment size do you need? Example: 40 HC.')},
    {key:'equipmentType',prompt:i('¿Qué tipo de equipo? Ejemplo: contenedor seco.','Which equipment type? Example: dry container.')},
    {key:'equipmentQuantity',prompt:i('¿Cuántas unidades de equipo necesitas?','How many equipment units do you need?')},
    {key:'equipmentWeights',prompt:i('Indica el peso en kg de cada unidad, separado por comas si hay varias.','Enter each unit weight in kg, separated by commas for multiple units.')}
  )
  else result.push(
    {key:'packageQuantity',prompt:i('¿Cuántos bultos enviarás?','How many packages will you ship?')},
    {key:'packageWeight',prompt:i('¿Cuánto pesa cada bulto en kg?','How much does each package weigh in kg?')},
    {key:'packageLength',prompt:i('¿Largo de cada bulto, en cm?','Length of each package in cm?')},
    {key:'packageWidth',prompt:i('¿Ancho de cada bulto, en cm?','Width of each package in cm?')},
    {key:'packageHeight',prompt:i('¿Alto de cada bulto, en cm?','Height of each package in cm?')},
    {key:'stackable',prompt:i('¿Se pueden apilar los bultos?','Can the packages be stacked?'),choices:[{value:'Stackable',label:i('Sí','Yes')},{value:'NonStackable',label:'No'}]}
  )
  result.push(
    {key:'contactName',prompt:i('¿A nombre de quién hacemos la solicitud?','Who should be the contact for this request?')},
    {key:'contactEmail',prompt:i('¿Cuál es tu correo de contacto?','What is your contact email?')},
    {key:'contactPhone',prompt:i('¿Cuál es tu número de teléfono?','What is your phone number?')}
  )
  return result
})
const current = computed(() => steps.value[stepIndex.value])
const flowName = computed(() => props.kind === 'quote' ? tr('Cotización', 'Quote') : props.kind === 'tracking' ? tr('Embarque', 'Shipment') : tr('Itinerarios', 'Itineraries'))
const fieldLabels: Record<string, [string, string]> = {
  mode:['Modalidad','Mode'],shipmentType:['Tipo de embarque','Shipment type'],origin:['Origen','Origin'],destination:['Destino','Destination'],
  pod:['Puerto de descarga','Port of discharge'],incoterm:['Incoterm','Incoterm'],cargoReadyDate:['Carga lista','Cargo ready'],
  exwCargoStatus:['Estado EXW','EXW status'],exwPickupAddress:['Recolección EXW','EXW pickup'],
  cargoDescription:['Mercancía','Goods'],dangerousGoods:['Carga peligrosa','Dangerous goods'],equipmentSize:['Tamaño equipo','Equipment size'],equipmentType:['Tipo equipo','Equipment type'],
  equipmentQuantity:['Cantidad equipos','Equipment quantity'],equipmentWeights:['Pesos por unidad (kg)','Weights per unit (kg)'],
  packageQuantity:['Bultos','Packages'],packageWeight:['Peso por bulto (kg)','Weight per package (kg)'],
  packageLength:['Largo (cm)','Length (cm)'],packageWidth:['Ancho (cm)','Width (cm)'],packageHeight:['Alto (cm)','Height (cm)'],
  stackable:['Estibable','Stackable'],contactName:['Contacto','Contact'],contactEmail:['Correo','Email'],contactPhone:['Teléfono','Phone'],
  reference:['Referencia','Reference'],referenceType:['Tipo de referencia','Reference type'],transport:['Transporte','Transport'],departure:['Desde la fecha','Departure from']
}
const summary = computed(() => steps.value.map(step => ({
  key:step.key, label: tr((fieldLabels[step.key] ?? [step.key,step.key])[0], (fieldLabels[step.key] ?? [step.key,step.key])[1]),
  value: step.choices?.find(option => option.value === values[step.key])?.label ?? values[step.key]
})).filter(item => item.value))
const filteredLocations = computed(() => locationChoices.value.filter(loc =>
  norm(loc.displayName).includes(norm(locationTerm.value)) || norm(loc.code || '').includes(norm(locationTerm.value))).slice(0, 30))
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T12:00:00Z').getTime()) &&
  new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v
const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
const positive = (s: string) => Number.isFinite(Number(s)) && Number(s) > 0
const integer = (s: string, max: number) => /^\d+$/.test(s) && Number(s) > 0 && Number(s) <= max
const scrollEnd = async () => { await nextTick(); scroller.value?.scrollTo({top:scroller.value.scrollHeight,behavior:'smooth'}) }

function validation(key: string, value: string): string {
  if (current.value?.choices?.some(choice => choice.value === value)) return ''
  if (!value && current.value?.optional) return ''
  if (!value) return tr('Este dato es obligatorio.', 'This field is required.')
  if (['cargoReadyDate', 'departure'].includes(key) && !validDate(value)) return tr('Usa una fecha real con formato AAAA-MM-DD.', 'Enter a real date as YYYY-MM-DD.')
  if (key === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return tr('Correo electrónico inválido.', 'Invalid email.')
  if (key === 'contactPhone' && !/^[+0-9 ()-]{7,40}$/.test(value)) return tr('Escribe un teléfono válido.', 'Enter a valid phone number.')
  if (key === 'reference' && !/^[a-zA-Z0-9_-]{3,64}$/.test(value)) return tr('Referencia inválida: de 3 a 64 caracteres, letras, números o guiones.', 'Invalid reference. Use 3–64 letters, numbers or dashes.')
  if (['equipmentQuantity','packageQuantity'].includes(key) && !integer(value,key === 'equipmentQuantity' ? 25 : 10000)) return tr('Escribe una cantidad entera positiva.', 'Enter a positive whole number.')
  if (['packageWeight','packageLength','packageWidth','packageHeight'].includes(key) && !positive(value)) return tr('Escribe un número positivo (usa punto para decimales).', 'Enter a positive number (use a dot for decimals).')
  if (key === 'equipmentWeights') {
    const weights = value.split(',').map(x => x.trim())
    if (weights.length !== Number(values.equipmentQuantity) || weights.some(x => !positive(x)))
      return tr('Debe haber un peso positivo por cada unidad de equipo.', 'Provide one positive weight per equipment unit.')
  }
  if (current.value?.choices && !current.value.choices.some(choice => choice.value === value)) return tr('Selecciona una opción válida.', 'Select a valid option.')
  if (value.length > (key === 'cargoDescription' ? 400 : 200)) return tr('El dato es demasiado largo.', 'This value is too long.')
  return ''
}

function accept(value = input.value) {
  if (busy.value || phase.value !== 'collect' || !current.value) return
  const item = current.value
  const v = value.trim()
  error.value = validation(item.key, v)
  if (error.value) return
  if (item.key === 'mode' && values.mode !== v) {
    delete values.shipmentType
    for (const role of ['origin','destination','pod']) delete selectedLocations[role]
  }
  if (item.key === 'shipmentType' && values.shipmentType !== v) {
    for (const role of ['origin','destination','pod']) delete selectedLocations[role]
    for (const field of ['equipmentSize','equipmentType','equipmentQuantity','equipmentWeights','packageQuantity','packageWeight','packageLength','packageWidth','packageHeight','stackable']) delete values[field]
  }
  if (['origin','destination','pod'].includes(item.key)) delete selectedLocations[item.key]
  values[item.key] = v
  history.value.push({question:item.prompt,answer:item.choices?.find(choice => choice.value === v)?.label || v || tr('Omitido','Skipped')})
  if (editingField.value) {
    editingField.value = ''
    input.value = ''
    const missing = steps.value.findIndex(step => !step.optional && !values[step.key])
    if (missing >= 0) { stepIndex.value = missing; phase.value = 'collect' }
    else phase.value = 'review'
    void scrollEnd()
    return
  }
  stepIndex.value++
  while (stepIndex.value < steps.value.length && values[steps.value[stepIndex.value].key]) stepIndex.value++
  input.value = ''
  if (stepIndex.value >= steps.value.length) phase.value = 'review'
  void scrollEnd()
}
function editField(key: string) {
  const index = steps.value.findIndex(step => step.key === key)
  if (index < 0 || busy.value) return
  error.value = ''
  phase.value = 'collect'
  editingField.value = key
  stepIndex.value = index
  input.value = values[key] || ''
  history.value = []
  void scrollEnd()
}
function edit() {
  const first = steps.value[0]
  if (first) editField(first.key)
}
function back() {
  if (busy.value) return
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* storage not available */ }
  emit('back')
}
function saveDraft() {
  if (props.kind !== 'quote') return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({at:Date.now(),values:{...values}})) } catch { /* private browsing */ }
}
function applyInitialQuestion() {
  const question = norm(props.initialQuestion || '')
  if (!question || question.length > 800) return
  const route = question.match(/\b(?:desde|de)\s+([a-z -]{3,60}?)\s+(?:hacia|hasta|a)\s+([a-z -]{3,60}?)(?=\s*(?:[,;.]|$)|\s+(?:con|para)\b)/)
  if (route && route[1].trim() !== route[2].trim()) {
    values.origin = route[1].trim()
    values.destination = route[2].trim()
  }
  if (props.kind === 'tracking') {
    if (/\b(bcf|hbl|bl)\b/.test(question)) values.referenceType = 'BCF'
    else if (/\b(contenedor|container)\b/.test(question)) values.referenceType = 'CONTAINER'
    else if (/\bidtra\b/.test(question)) values.referenceType = 'IDTRA'
    else if (/\bpo\b/.test(question)) values.referenceType = 'PO'
    const candidates = (props.initialQuestion || '').match(/\b[a-zA-Z0-9_-]{4,64}\b/g) || []
    const references = candidates.filter(x => /\d/.test(x) && /^[a-zA-Z0-9_-]{3,64}$/.test(x) && !/^(2026|2027|2028)$/.test(x))
    if (references.length === 1) values.reference = references[0]
  }
  if (props.kind === 'quote') {
    if (/\bfcl\b/.test(question)) { values.mode = 'Maritime'; values.shipmentType = 'FCL' }
    else if (/\blcl\b/.test(question)) { values.mode = 'Maritime'; values.shipmentType = 'LCL' }
    else if (/\bftl\b/.test(question)) { values.mode = 'Land'; values.shipmentType = 'FTL' }
    else if (/\bltl\b/.test(question)) { values.mode = 'Land'; values.shipmentType = 'LTL' }
    else if (/\b(aereo|aerea|air|airfreight)\b/.test(question)) { values.mode = 'Air'; values.shipmentType = 'AIR_LCL' }
    else if (/\b(maritimo|maritima|ocean|oceanic)\b/.test(question)) values.mode = 'Maritime'
    else if (/\b(terrestre|camion|ground|truck)\b/.test(question)) values.mode = 'Land'
    const incoterm = question.match(/\b(exw|fca|fas|fob|cfr|cif|cpt|cip|dap|dpu|ddp)\b/)
    if (incoterm) values.incoterm = incoterm[1].toUpperCase()
    const day = question.match(/\b20\d{2}-\d{2}-\d{2}\b/)
    if (day && validDate(day[0])) values.cargoReadyDate = day[0]
    const size = question.match(/\b(20|40|45)\s*(?:pies|ft|hc|high cube)\b/)
    if (size) values.equipmentSize = size[0]
    const oneUnit = /\b(?:1|un|una|one)\s+(?:contenedor|container|camion|truck|furgon)\b/.test(question)
    if (oneUnit) values.equipmentQuantity = '1'
  }
  if (props.kind === 'itinerary') {
    if (/\b(maritimo|maritima|ocean)\b/.test(question)) values.transport = 'maritime'
    else if (/\b(terrestre|ground)\b/.test(question)) values.transport = 'ground'
    const day = question.match(/\b20\d{2}-\d{2}-\d{2}\b/)
    if (day && validDate(day[0])) values.departure = day[0]
  }
  while (stepIndex.value < steps.value.length && values[steps.value[stepIndex.value].key]) stepIndex.value++
  prefilled.value = stepIndex.value > 0
  if (stepIndex.value >= steps.value.length) phase.value = 'review'
}
onMounted(() => {
  if (props.kind === 'quote') {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as {at:number;values:Record<string,string>}
        if (Number.isFinite(saved.at) && Date.now() - saved.at >= 0 && Date.now() - saved.at <= 30 * 60 * 1000 &&
            saved.values && ['Maritime','Air','Land'].includes(saved.values.mode)) {
          Object.assign(values, saved.values)
          stepIndex.value = steps.value.length
          phase.value = 'review'
          prefilled.value = true
          return
        }
        sessionStorage.removeItem(STORAGE_KEY)
      }
    } catch { /* invalid or disabled storage */ }
  }
  applyInitialQuestion()
})
function loginLink(): string {
  return '/bienvenidos?next=' + encodeURIComponent(window.location.pathname + window.location.search)
}
function errorFromStatus(status: number) {
  return status === 401 ? tr('Tu sesión expiró. Inicia sesión e inténtalo de nuevo.','Your session expired. Sign in and try again.')
    : status === 403 ? tr('No tienes permiso para esta operación.','You do not have permission for this action.')
      : tr('No pudimos completar la operación. Inténtalo de nuevo.','We could not complete the operation. Please retry.')
}
async function jsonResponse(response: Response) {
  const data = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : errorFromStatus(response.status))
  return data
}
async function getLocations(role: string): Promise<Location[]> {
  const kind = values.mode === 'Maritime' ? 'seaport' : values.mode === 'Air' ? 'airport' : 'inland'
  const qs = new URLSearchParams({kind,shipmentType:values.shipmentType,routeRole:role})
  const data = await jsonResponse(await fetch('/api/quotes/official/locations?' + qs, {credentials:'same-origin',cache:'no-store'}))
  return Array.isArray(data.items) ? data.items as Location[] : []
}
async function submitQuote() {
  const roles = ['origin','destination',...(values.shipmentType === 'LCL' ? ['pod'] : [])]
  for (const role of roles) {
    if (selectedLocations[role]) continue
    const catalog = await getLocations(role)
    const matches = catalog.filter(loc => norm(loc.displayName) === norm(values[role]) || norm(loc.code || '') === norm(values[role]))
    if (matches.length === 1) { selectedLocations[role] = matches[0].id; values[role] = matches[0].displayName; continue }
    locationChoices.value = catalog
    pendingRole.value = role
    locationTerm.value = values[role] || ''
    phase.value = 'location'
    return
  }
  const equipment = isEquipment.value
  const weights = equipment ? values.equipmentWeights.split(',').map(x => Number(x.trim())) : []
  const payload = {
    mode:values.mode, shipmentType:values.shipmentType,
    originLocationId:selectedLocations.origin, destinationLocationId:selectedLocations.destination,
    podLocationId:values.shipmentType === 'LCL' ? selectedLocations.pod : null,
    contactName:values.contactName, contactEmail:values.contactEmail,contactPhone:values.contactPhone,
    incoterm:values.incoterm,cargoReadyDate:values.cargoReadyDate,services:['Transporte internacional'],
    equipment:equipment ? [{size:values.equipmentSize,type:values.equipmentType,quantity:Number(values.equipmentQuantity),unitWeightsKg:weights}] : [],
    packages:equipment ? [] : [{
      description:values.cargoDescription,quantity:Number(values.packageQuantity),
      weight:Number(values.packageWeight),length:Number(values.packageLength),width:Number(values.packageWidth),
      height:Number(values.packageHeight),stackability:values.stackable
    }],
    dimensionUnit:equipment ? null : 'cm',weightUnit:equipment ? null : 'kg',
    exwCargoStatus:values.incoterm === 'EXW' ? values.exwCargoStatus : null,
    exwPickupAddress:values.incoterm === 'EXW' ? values.exwPickupAddress : null,
    cargoDescription:values.cargoDescription,cabysCode:null,cargoValue:null,declaredWeight:null,
    declaredPackages:null,observations:values.dangerousGoods === 'unsure' ? 'La peligrosidad de la carga está pendiente de confirmar.' : null,
    cargoFlags:[...(values.dangerousGoods === 'yes' ? ['Carga peligrosa'] : []),...(!equipment && values.stackable === 'NonStackable' ? ['No estibable'] : [])],destinationHandling:null,
    deliveryAddress:null,pickupAddress:null,fiscalStorageDays:null
  }
  const data = await jsonResponse(await fetch('/api/quotes/official',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}))
  quoteId.value = String(data.id || '')
  quoteStatus.value = String(data.status || '')
  if (!quoteId.value) throw new Error(tr('No recibimos el identificador de la solicitud. Consultá con soporte antes de repetir el envío.','No request ID was returned. Contact support before submitting again.'))
  try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* storage disabled */ }
  phase.value = 'result'
}
async function chooseLocation(loc: Location) {
  if (busy.value) return
  selectedLocations[pendingRole.value] = loc.id
  values[pendingRole.value] = loc.displayName
  phase.value = 'review'
  await perform()
}
async function searchItineraries() {
  const query = new URLSearchParams({pol:values.origin,pod:values.destination,page:'1',pageSize:'5'})
  if (values.transport) query.set('transporte',values.transport)
  if (values.departure) query.set('etdDesde',values.departure)
  const data = await jsonResponse(await fetch('/api/itinerarios?' + query, {credentials:'same-origin',cache:'no-store'}))
  itineraries.value = Array.isArray(data.items) ? data.items as Itinerary[] : []
  itineraryTotal.value = Number(data.total) || 0
  phase.value = 'result'
}
async function searchShipment() {
  const data = await jsonResponse(await fetch('/api/tracking/dynamics/search',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({type:values.referenceType,reference:values.reference})
  }))
  shipments.value = Array.isArray(data.records) ? data.records as Shipment[] : []
  shipmentTruncated.value = data.truncated === true
  phase.value = 'result'
}
async function perform() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const user = await refreshSession()
    if (!user) { saveDraft(); phase.value = 'auth'; return }
    if (props.kind === 'quote') await submitQuote()
    if (props.kind === 'itinerary') await searchItineraries()
    if (props.kind === 'tracking') {
      // The existing Dynamics lookup has no verified client-to-shipment ownership check.
      // Never expose that unscoped lookup to a customer from the conversational interface.
      if (user.role !== 'administrador') { restrictedTracking.value = true; phase.value = 'result'; return }
      await searchShipment()
    }
  } catch (e) {
    phase.value = 'review'
    error.value = e instanceof Error ? e.message : errorFromStatus(500)
  } finally {
    busy.value = false
    void scrollEnd()
  }
}
</script>

<template>
  <div class="gio-ops">
    <div class="gio-ops__bar">
      <button type="button" class="gio-ops__back" :disabled="busy" @click="back"><ArrowLeft :size="15" />{{ tr('Menú','Menu') }}</button>
      <strong>{{ flowName }}</strong>
      <span v-if="phase === 'collect'">{{ stepIndex + 1 }}/{{ steps.length }}</span>
    </div>
    <div ref="scroller" class="gio-ops__scroll" aria-live="polite">
      <div class="gio-ops__bubble">{{ tr('Te ayudaré paso a paso. Puedes revisar todo antes de realizar la acción.','I will guide you step by step. You can review everything before taking action.') }}</div>
      <div v-if="prefilled" class="gio-ops__bubble gio-ops__bubble--quiet">{{ tr('Tomé algunos datos de tu mensaje o borrador. Confírmalos en el resumen.','I picked up some details from your message or draft. Please review them in the summary.') }}</div>
      <div v-for="(item,index) in history.slice(-4)" :key="index" class="gio-ops__history">
        <div class="gio-ops__bubble gio-ops__bubble--quiet">{{ item.question }}</div>
        <div class="gio-ops__bubble gio-ops__bubble--answer">{{ item.answer }}</div>
      </div>
      <template v-if="phase === 'collect' && current">
        <div class="gio-ops__bubble">{{ current.prompt }}</div>
        <div v-if="current.choices" class="gio-ops__choices">
          <button v-for="choice in current.choices" :key="choice.label" type="button" :disabled="busy" @click="accept(choice.value)">{{ choice.label }} <ChevronRight :size="14" /></button>
        </div>
        <div v-if="current.optional" class="gio-ops__choices"><button type="button" @click="accept('')">{{ tr('Omitir','Skip') }}</button></div>
      </template>
      <template v-else-if="phase === 'review'">
        <div class="gio-ops__bubble">{{ tr('Ya tengo los datos. Confirma el resumen antes de continuar.','I have the information. Please review it before proceeding.') }}</div>
        <section class="gio-ops__card">
          <h3><FileText :size="18" />{{ tr('Resumen','Summary') }}</h3>
          <dl>
            <div v-for="item in summary" :key="item.key"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd><button class="gio-ops__edit" type="button" :aria-label="tr('Editar ','Edit ') + item.label" @click="editField(item.key)">{{ tr('Editar','Edit') }}</button></div>
          </dl>
          <p v-if="kind === 'quote'" class="gio-ops__note">{{ tr('Esta es una solicitud, no una tarifa confirmada. Los precios los confirma Castro Fallas.','This is a request, not a confirmed rate. Castro Fallas confirms prices.') }}</p>
        </section>
        <button class="gio-ops__primary" type="button" :disabled="busy" @click="perform"><LoaderCircle v-if="busy" :size="16" class="gio-ops__spin" /><CheckCircle2 v-else :size="16" />{{ busy ? tr('Procesando…','Processing…') : kind === 'quote' ? tr('Confirmar y enviar solicitud','Confirm and submit request') : tr('Consultar','Search') }}</button>
        <button class="gio-ops__secondary" type="button" :disabled="busy" @click="edit">{{ tr('Modificar datos','Edit information') }}</button>
      </template>
      <template v-else-if="phase === 'auth'">
        <div class="gio-ops__bubble">{{ kind === 'quote' ? tr('Para enviar la solicitud necesitas una cuenta autorizada. El borrador permanecerá en esta pestaña hasta 30 minutos. Al volver, abre GIO y elige Cotización.','To submit this request you need an authorized account. Your draft stays in this tab for up to 30 minutes. On return, open GIO and select Quote.') : tr('Necesitas una cuenta autorizada para consultar esta información. Inicia sesión y vuelve a realizar la búsqueda.','You need an authorized account to search this information. Sign in, then start the search again.') }}</div>
        <a class="gio-ops__primary" :href="loginLink()"><ShieldCheck :size="16" />{{ tr('Iniciar sesión','Sign in') }}</a>
        <button class="gio-ops__secondary" type="button" @click="perform">{{ tr('Ya inicié sesión','I have signed in') }}</button>
      </template>
      <template v-else-if="phase === 'location'">
        <div class="gio-ops__bubble">{{ tr('Necesito que selecciones una ubicación válida del catálogo oficial para ', 'Please select an official catalog location for ') }}{{ pendingRole === 'origin' ? tr('origen','origin') : pendingRole === 'destination' ? tr('destino','destination') : 'POD' }}.</div>
        <label class="gio-ops__label">{{ tr('Buscar ubicación','Search locations') }}<input v-model="locationTerm" maxlength="100" /></label>
        <div class="gio-ops__choices gio-ops__location-list">
          <button v-for="loc in filteredLocations" :key="loc.id" type="button" :disabled="busy" @click="chooseLocation(loc)"><MapPin :size="14" />{{ loc.displayName }}</button>
        </div>
        <p v-if="filteredLocations.length === 0" class="gio-ops__note">{{ tr('No hay ubicaciones coincidentes. Prueba otra búsqueda o completa la cotización en el formulario.','No matching locations. Try another search or use the full quote form.') }}</p>
        <a class="gio-ops__secondary gio-ops__link" href="/cotizaciones">{{ tr('Abrir formulario completo','Open full quote form') }}</a>
      </template>
      <template v-else-if="phase === 'result'">
        <template v-if="kind === 'quote'">
          <div class="gio-ops__bubble">{{ tr('¡Solicitud registrada! Este es el identificador confirmado por el sistema.','Request created! This is the ID returned by the system.') }}</div>
          <section class="gio-ops__card"><h3><CheckCircle2 :size="18" />{{ tr('Solicitud recibida','Request received') }}</h3><p class="gio-ops__id">{{ quoteId }}</p><p>{{ quoteStatus }}</p><a :href="'/cotizaciones'" class="gio-ops__link">{{ tr('Ver cotizaciones','View quotes') }}</a></section>
        </template>
        <template v-else-if="kind === 'itinerary'">
          <div class="gio-ops__bubble">{{ itineraryTotal ? tr('Estos son los itinerarios publicados que coinciden con tu búsqueda.','These published itineraries match your search.') : tr('No hay itinerarios publicados con esos filtros.','There are no published itineraries matching those filters.') }}</div>
          <section v-for="item in itineraries" :key="item.id" class="gio-ops__card">
            <h3><Ship :size="17" />{{ item.pol }} → {{ item.pod }}</h3>
            <dl><div><dt>ETD</dt><dd>{{ item.etd }}</dd></div><div><dt>ETA</dt><dd>{{ item.eta }}</dd></div><div><dt>{{ tr('Modalidad','Mode') }}</dt><dd>{{ item.modality }}</dd></div><div><dt>{{ tr('Estado','Status') }}</dt><dd>{{ item.status }}</dd></div></dl>
            <a class="gio-ops__link" href="/itinerario">{{ tr('Ver en itinerarios','View itineraries') }}</a>
          </section>
          <p v-if="itineraryTotal > itineraries.length" class="gio-ops__note">{{ tr('Mostrando los primeros cinco resultados.','Showing the first five results.') }}</p>
        </template>
        <template v-else-if="restrictedTracking">
          <div class="gio-ops__bubble">{{ tr('La consulta conversacional de embarques para clientes necesita una verificación adicional de titularidad. No mostraré información privada sin ella.','Customer shipment chat lookup requires additional ownership verification. I cannot show private information without it.') }}</div>
          <a class="gio-ops__secondary gio-ops__link" href="/tracking">{{ tr('Abrir página de tracking','Open tracking page') }}</a>
        </template>
        <template v-else>
          <div class="gio-ops__bubble">{{ shipments.length ? tr('Encontré esta información en Dynamics:','I found this information in Dynamics:') : tr('No se encontraron embarques para esa referencia.','No shipments matched that reference.') }}</div>
          <section v-for="(item,index) in shipments" :key="index" class="gio-ops__card">
            <h3><Ship :size="17" />{{ item.title || item.bcf || values.reference }}</h3>
            <dl><div v-for="field in ([['status',tr('Estado','Status')],['origin',tr('Origen','Origin')],['destination',tr('Destino','Destination')],['etd','ETD'],['eta','ETA'],['vessel',tr('Buque','Vessel')],['customerStatus',tr('Actualización','Update')]] as const)" :key="field[0]" v-show="item[field[0]]"><dt>{{ field[1] }}</dt><dd>{{ item[field[0]] }}</dd></div></dl>
          </section>
          <p v-if="shipmentTruncated" class="gio-ops__note">{{ tr('Hay más resultados. Consulta la página de tracking.','There are more results. Check the tracking page.') }}</p>
          <a class="gio-ops__secondary gio-ops__link" href="/tracking">{{ tr('Abrir tracking completo','Open full tracking') }}</a>
        </template>
        <button class="gio-ops__secondary" type="button" @click="edit"><Search :size="15" />{{ tr('Nueva consulta','New search') }}</button>
      </template>
      <p v-if="error" class="gio-ops__error" role="alert">{{ error }}</p>
    </div>
    <form v-if="phase === 'collect' && current && !current.choices" class="gio-ops__form" @submit.prevent="accept()">
      <input v-model="input" :placeholder="current.hint || tr('Escribe tu respuesta…','Type your answer…')" :aria-label="current.prompt" :disabled="busy" maxlength="400" />
      <button type="submit" :disabled="busy || (!input.trim() && !current.optional)" :aria-label="tr('Continuar','Continue')"><ChevronRight :size="19" /></button>
    </form>
  </div>
</template>

<style scoped>
.gio-ops{display:flex;flex:1 1 auto;flex-direction:column;min-height:0;min-width:0;color:var(--gio-ink,#fff);font-size:12px}
.gio-ops__bar{flex:0 0 auto;display:flex;align-items:center;gap:10px;min-height:41px;padding:6px 12px;border-bottom:1px solid var(--gio-line,#555)}
.gio-ops__bar strong{flex:1;font-size:12px}.gio-ops__bar>span{color:var(--gio-muted,#aaa)}
.gio-ops__back{display:inline-flex;align-items:center;gap:5px;color:var(--gio-ink,#fff);border:0;background:transparent;font-size:11px;cursor:pointer}
.gio-ops__scroll{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;align-items:stretch;gap:10px;padding:13px 12px}
.gio-ops__bubble{align-self:flex-start;max-width:94%;padding:10px 12px;border:1px solid var(--gio-line,#555);border-radius:14px;background:var(--gio-bubble,#24212a);line-height:1.5;overflow-wrap:anywhere}
.gio-ops__history{display:contents}.gio-ops__bubble--quiet{opacity:.75}.gio-ops__bubble--answer{align-self:flex-end;background:#9c1731;color:white;border-color:#9c1731}
.gio-ops__choices{display:flex;flex-wrap:wrap;gap:7px}.gio-ops__choices button{display:flex;align-items:center;justify-content:space-between;gap:9px;text-align:left;border:1px solid var(--gio-line,#555);border-radius:11px;padding:10px 12px;background:var(--gio-action,#24212a);color:var(--gio-ink,#fff);cursor:pointer;font-size:12px;min-height:39px}
.gio-ops__choices button:hover{border-color:#bb193c}.gio-ops__location-list{max-height:195px;overflow-y:auto}.gio-ops__location-list button{width:100%}
.gio-ops__card{background:var(--gio-action,#24212a);border:1px solid var(--gio-line,#555);border-radius:14px;padding:12px;display:grid;gap:10px}
.gio-ops__card h3{display:flex;align-items:center;gap:7px;margin:0;font-size:13px;font-weight:750}
.gio-ops__card h3 svg{color:#da2042;flex-shrink:0}.gio-ops__card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:0}
.gio-ops__card dl>div{min-width:0}.gio-ops__edit{display:inline-block;padding:3px 0;border:0;background:transparent;color:#df4561;text-align:left;font-size:10px;font-weight:750;cursor:pointer}.gio-ops__card dt{font-size:10px;color:var(--gio-muted,#aaa);overflow-wrap:anywhere}.gio-ops__card dd{font-size:12px;margin:2px 0 0;overflow-wrap:anywhere}
.gio-ops__note{font-size:11px;line-height:1.45;color:var(--gio-muted,#aaa);margin:0}.gio-ops__id{overflow-wrap:anywhere;font-weight:750;font-size:12px;margin:0}
.gio-ops__primary,.gio-ops__secondary{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;border:1px solid transparent;border-radius:11px;min-height:40px;padding:9px 12px;cursor:pointer;text-decoration:none;font-weight:750;font-size:12px}
.gio-ops__primary{background:#98132e;color:#fff}.gio-ops__secondary{border-color:var(--gio-line,#555);background:var(--gio-action,#24212a);color:var(--gio-ink,#fff)}.gio-ops__link{text-decoration:none}
.gio-ops__label{display:grid;gap:5px;font-size:11px}.gio-ops__label input{height:40px;background:var(--gio-input,#14192d);color:var(--gio-ink,#fff);border:1px solid var(--gio-line,#555);border-radius:9px;padding:0 10px}
.gio-ops__error{color:#e84b66;font-size:11px;margin:0}.gio-ops__form{flex:0 0 auto;display:flex;gap:7px;border-top:1px solid var(--gio-line,#555);padding:9px 10px max(9px,env(safe-area-inset-bottom))}
.gio-ops__form input{flex:1;min-width:0;font-size:12px;height:40px;padding:0 11px;border:1px solid var(--gio-line,#555);border-radius:10px;background:var(--gio-input,#14192d);color:var(--gio-ink,#fff)}
.gio-ops__form button{display:grid;place-items:center;flex:0 0 41px;border:0;border-radius:10px;background:#98132e;color:#fff;cursor:pointer}
.gio-ops__form button:disabled,.gio-ops button:disabled{opacity:.6;cursor:not-allowed}.gio-ops__spin{animation:gio-ops-spin .9s linear infinite}@keyframes gio-ops-spin{to{transform:rotate(360deg)}}
@media(max-width:800px){.gio-ops__form input{height:48px;font-size:16px}.gio-ops__form button{flex-basis:48px}.gio-ops__choices button{min-height:44px}}
</style>
