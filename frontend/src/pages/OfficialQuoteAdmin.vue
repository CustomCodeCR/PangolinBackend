<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import { refreshSession } from '../services/auth'
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const emit = defineEmits<{ (event: 'total-change', total: number): void }>()
type Row = { id:string;customerName:string;mode:string;shipmentType:string;originName:string;destinationName:string;status:string;authorization:string;createdAtUtc:string }
type Detail = {id:string;customerName:string;mode:string;shipmentType:string;status:string;authorization:string;createdAtUtc:string;form:Record<string,unknown>;history:{action:string;comment:string|null;createdAtUtc:string}[]}
const rows=ref<Row[]>([])
const detail=ref<Detail|null>(null)
const permissions=ref({canView:false,canManage:false,canAuthorize:false})
const state=ref('Received')
const comment=ref('')
const busy=ref(false)
const error=ref('')
const notice=ref('')
const page=ref(1)
const total=ref(0)
const statuses=[['Received','Recibida'],['InReview','En revisión'],['AwaitingInformation','Pendiente de información'],['Closed','Cerrada']]
function msg(e:unknown){return e instanceof Error ? e.message : 'Error inesperado.'}
async function api<T>(url:string, init:RequestInit={}):Promise<T>{
  const r=await fetch(url,{...init,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(init.headers??{})}})
  const data=await r.json().catch(()=>({})) as Record<string,unknown>
  if(!r.ok) throw new Error(typeof data.error==='string'?data.error:'HTTP '+r.status)
  return data as T
}
async function load(){busy.value=true;error.value='';try{
  const r=await api<{items:Row[];total:number}>('/api/admin/quotes/official?page='+page.value)
  rows.value=r.items;total.value=r.total;emit('total-change',r.total)
}catch(e){error.value=msg(e)}finally{busy.value=false}}
async function open(id:string){error.value='';detail.value=null;try{
  const r=await api<Detail>('/api/admin/quotes/official/'+id);detail.value=r;state.value=r.status;comment.value=''
}catch(e){error.value=msg(e)}}
async function review(){if(!detail.value||busy.value)return;busy.value=true;error.value='';notice.value='';try{
  await api('/api/admin/quotes/official/'+detail.value.id+'/review',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:state.value,comment:comment.value||null})})
  notice.value='Revisión guardada.';const id=detail.value.id;await load();await open(id)
}catch(e){error.value=msg(e)}finally{busy.value=false}}
async function decide(choice:'Authorized'|'Rejected'){if(!detail.value||busy.value)return;busy.value=true;error.value='';notice.value='';try{
  await api('/api/admin/quotes/official/'+detail.value.id+'/authorization?decision='+choice,{method:'PUT'})
  notice.value=choice==='Authorized'?'Autorizada internamente. No se ha enviado a Dhole.':'Autorización rechazada.'
  const id=detail.value.id;await load();await open(id)
}catch(e){error.value=msg(e)}finally{busy.value=false}}
onMounted(async()=>{const user=await refreshSession();if(user?.role!=='administrador'){error.value='Requiere sesión de administrador.';return}
  try{permissions.value=await api('/api/admin/quotes/official/permissions/me');if(permissions.value.canView) await load()}catch(e){error.value=msg(e)}
})

const statusNames: Record<string, string> = {
  Received: 'Recibida', InReview: 'En revisión', AwaitingInformation: 'Pendiente de información', Closed: 'Cerrada'
}
const decisionNames: Record<string, string> = {
  Pending: 'Pendiente', Authorized: 'Autorizada', Rejected: 'Rechazada'
}
const fieldNames: Record<string, string> = {
  mode:'Modalidad', shipmentType:'Tipo de embarque', originLocationId:'Origen (referencia)', destinationLocationId:'Destino (referencia)',
  podLocationId:'POD (referencia)', contactName:'Contacto', contactEmail:'Correo', contactPhone:'Teléfono',
  incoterm:'Incoterm', cargoReadyDate:'Fecha de carga lista', services:'Servicios solicitados',
  equipment:'Equipos', packages:'Bultos', cargoDescription:'Descripción de la carga',
  cabysCode:'Código CABYS', cargoValue:'Valor declarado', declaredWeight:'Peso declarado',
  declaredPackages:'Bultos declarados', observations:'Observaciones', cargoFlags:'Características de carga',
  exwCargoStatus:'Condición EXW', exwPickupAddress:'Dirección de recolección EXW',
  destinationHandling:'Manejo en destino', dimensionUnit:'Unidad de dimensiones', weightUnit:'Unidad de peso'
}
function readableField(key: string): string { return fieldNames[key] ?? key }
function readableValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'No indicado'
  if (Array.isArray(value)) {
    if (!value.length) return 'No aplica'
    return value.map((item, index) => {
      if (item !== null && typeof item === 'object') {
        const fields = Object.entries(item as Record<string, unknown>)
          .map(([key, entry]) => {
            if (key === 'unitWeightsKg' && Array.isArray(entry)) return 'Pesos individuales (kg): ' + entry.join(', ')
            return readableField(key) + ': ' + String(entry ?? 'No indicado')
          })
        return 'Línea ' + (index + 1) + ': ' + fields.join(' · ')
      }
      return String(item)
    }).join('\n')
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
function displayDate(iso: string): string { return new Date(iso).toLocaleString('es-CR') }
</script>
<template>
  <div :class="props.embedded ? 'off-admin off-admin--embedded' : 'app-site off-admin'">
    <section v-if="!props.embedded" class="off-admin-hero">
      <SiteHeader active="administracion" overlay />
      <div class="container off-admin-hero__copy">
        <p class="off-admin-eyebrow"><span class="off-admin-dash" aria-hidden="true"></span> CASTRO FALLAS · PANEL DE CONTROL</p>
        <h1>Solicitudes oficiales</h1>
        <p>Consultá y gestioná las solicitudes de tus clientes desde un solo lugar.</p>
      </div>
    </section>
    <div class="off-admin-shell">
      <div v-if="!props.embedded" class="off-admin-toolbar">
        <a href="/administracion" class="off-admin-back">← Volver a administración</a>
        <span class="off-admin-context">OPERACIONES · COTIZACIONES</span>
      </div>
      <p v-if="error" class="off-admin-alert" role="alert">{{error}}</p>
      <p v-if="notice" class="off-admin-ok" role="status">{{notice}}</p>
      <section v-if="!permissions.canView" class="off-admin-card off-admin-empty">
        <h2>Acceso pendiente</h2>
        <p>Para consultar solicitudes necesitás una cuenta administrativa activa.</p>
      </section>
      <div v-else class="off-admin-grid">
        <section class="off-admin-card" aria-label="Lista de solicitudes">
          <div class="off-admin-card-heading">
            <div>
              <p class="off-admin-card-eyebrow">BANDEJA DE ENTRADA</p>
              <h2>Solicitudes <span class="off-admin-counter">{{total}}</span></h2>
            </div>
            <button type="button" class="off-admin-button" :disabled="busy" @click="load">Actualizar</button>
          </div>
          <p v-if="rows.length===0" class="off-admin-muted off-admin-empty-message">Todavía no hay solicitudes oficiales.</p>
          <div class="off-admin-list">
            <button v-for="item in rows" :key="item.id" type="button" class="off-admin-item"
              :class="{ 'is-selected': detail?.id === item.id }"
              :aria-pressed="detail?.id === item.id" @click="open(item.id)">
              <span class="off-admin-item-top">
                <strong>{{item.customerName}}</strong>
                <span class="off-admin-type">{{item.mode}} · {{item.shipmentType}}</span>
              </span>
              <span class="off-admin-route">{{item.originName}} → {{item.destinationName}}</span>
              <span class="off-admin-item-bottom">
                <span class="off-admin-status">{{statusNames[item.status] ?? item.status}}</span>
                <span class="off-admin-approval">{{decisionNames[item.authorization] ?? item.authorization}}</span>
              </span>
            </button>
          </div>
          <div class="off-admin-pagination">
            <button class="off-admin-button" type="button" :disabled="page<=1||busy" @click="page--;load()">Anterior</button>
            <span>Página {{page}}</span>
            <button class="off-admin-button" type="button" :disabled="page*20>=total||busy" @click="page++;load()">Siguiente</button>
          </div>
        </section>
        <section class="off-admin-card off-admin-detail" aria-label="Detalle de la solicitud">
          <template v-if="detail">
            <div class="off-admin-card-heading">
              <div>
                <p class="off-admin-card-eyebrow">{{detail.mode}} · {{detail.shipmentType}}</p>
                <h2>{{detail.customerName}}</h2>
                <p class="off-admin-muted off-admin-reference">Referencia: {{detail.id}}</p>
              </div>
            </div>
            <div class="off-admin-status-row">
              <span class="off-admin-status">{{statusNames[detail.status] ?? detail.status}}</span>
              <span class="off-admin-approval">{{decisionNames[detail.authorization] ?? detail.authorization}}</span>
              <span class="off-admin-muted">{{displayDate(detail.createdAtUtc)}}</span>
            </div>
            <h3>Información de la solicitud</h3>
            <dl class="off-admin-data">
              <div v-for="(value,key) in detail.form" :key="String(key)">
                <dt>{{readableField(String(key))}}</dt>
                <dd>{{readableValue(value)}}</dd>
              </div>
            </dl>
            <form v-if="permissions.canManage" class="off-admin-form" @submit.prevent="review">
              <h3>Revisión administrativa</h3>
              <div class="off-admin-select-field">
                <label>Estado de la solicitud</label>
                <FieldDropdown v-model="state" aria-label="Estado de la solicitud"
                  :options="statuses.map(s => ({value:s[0], label:s[1]}))" />
              </div>
              <label>Comentario interno
                <textarea v-model="comment" maxlength="2000" rows="3" placeholder="Agregá un comentario para el historial"></textarea>
              </label>
              <button type="submit" class="off-admin-primary" :disabled="busy">Guardar revisión</button>
            </form>
            <section v-if="permissions.canAuthorize && detail.authorization==='Pending'" class="off-admin-auth">
              <h3>Autorización especial</h3>
              <p>Autorizar no envía la solicitud a Dhole.</p>
              <div class="off-admin-actions">
                <button type="button" class="off-admin-primary" :disabled="busy" @click="decide('Authorized')">Autorizar para Dhole</button>
                <button type="button" class="off-admin-button" :disabled="busy" @click="decide('Rejected')">Rechazar</button>
              </div>
            </section>
            <div class="off-admin-history">
              <h3>Historial</h3>
              <p v-if="!detail.history.length" class="off-admin-muted">Sin cambios registrados todavía.</p>
              <article v-for="(event,i) in detail.history" :key="i" class="off-admin-event">
                <strong>{{event.action}}</strong>
                <small>{{displayDate(event.createdAtUtc)}}</small>
                <p v-if="event.comment">{{event.comment}}</p>
              </article>
            </div>
          </template>
          <div v-else class="off-admin-empty">
            <p class="off-admin-card-eyebrow">DETALLE</p>
            <h2>Seleccioná una solicitud</h2>
            <p>Elegí una solicitud de la lista para revisar su información, estado e historial.</p>
          </div>
        </section>
      </div>
    </div>
    <SiteFooter v-if="!props.embedded" />
  </div>
</template>
<style scoped>
/* Identidad del panel de administración existente, aislada en Cotizaciones Oficiales. */
.off-admin--embedded { min-height: 0; background: transparent !important; }
.off-admin--embedded .off-admin-shell { width: 100%; margin: 0; padding: 0 0 28px; }
:global(html.theme-dark) .off-admin--embedded { background: transparent !important; }
.off-admin {
  --oq-ink: #20242b;
  --oq-muted: #65707c;
  --oq-bg: #fff8f8;
  --oq-surface: #ffffff;
  --oq-line: #ded9dc;
  --oq-field: #f5f5f7;
  --oq-input: #ffffff;
  --oq-input-border: #d6d2d8;
  --oq-accent: #b20c2a;
  --oq-glow: rgba(214, 14, 52, .18);
  min-height: 100vh;
  background: var(--oq-bg);
  color: var(--oq-ink);
}
:global(html.theme-dark) .off-admin {
  --oq-ink: #ffffff;
  --oq-muted: #c4c5cf;
  --oq-bg: #171316;
  --oq-surface: #211b20;
  --oq-line: #565057;
  --oq-field: #121a30;
  --oq-input: #121a30;
  --oq-input-border: #3b465f;
  --oq-accent: #ef233c;
  --oq-glow: rgba(214, 14, 52, .37);
  background: var(--oq-bg) !important;
  color: var(--oq-ink) !important;
  color-scheme: dark;
}
.off-admin-hero { position: relative; min-height: 330px; color: #fff; background: transparent; }
.off-admin-hero::before {
  content: ""; position: absolute; z-index: 0; inset: 0;
  background: linear-gradient(105deg, rgba(165,11,41,.94), rgba(113,13,36,.82) 47%, rgba(35,21,29,.94));
  -webkit-mask-image: linear-gradient(180deg,#000 0%,#000 42%,rgba(0,0,0,.82) 62%,rgba(0,0,0,.42) 82%,transparent 100%);
  mask-image: linear-gradient(180deg,#000 0%,#000 42%,rgba(0,0,0,.82) 62%,rgba(0,0,0,.42) 82%,transparent 100%);
  pointer-events: none;
}
.off-admin-hero__copy {
  position: relative; z-index: 1;
  padding-top: 92px; padding-bottom: 56px;
  color: #fff;
}
.off-admin-eyebrow { display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 850; letter-spacing: .13em; }
.off-admin-dash { display:inline-block; flex-shrink: 0; width: 24px; height: 2px; background: currentColor; }
.off-admin-hero__copy h1 {
  color: #fff; margin: 16px 0 0; font-family: "Arial Black", system-ui, sans-serif;
  font-size: clamp(38px, 5.7vw, 64px); line-height: 1.1; letter-spacing: -.055em;
}
.off-admin-hero__copy > p:last-child { margin: 16px 0 0; max-width: 750px; color: rgba(255,255,255,.9); font-size: 15px; line-height: 1.6; }
.off-admin-shell { position: relative; width:min(1280px,calc(100% - 64px)); margin: 0 auto; padding: 18px 0 90px; }
.off-admin-toolbar { display:flex; align-items:center; justify-content:space-between; gap: 15px; flex-wrap:wrap; margin-bottom: 16px; }
.off-admin-back { color: var(--oq-accent); font-size: 13px; font-weight: 800; text-decoration:none; }
.off-admin-back:hover { text-decoration:underline; }
.off-admin-context { color:var(--oq-muted); font-size:10px; font-weight:850; letter-spacing:.13em; }
.off-admin-grid { display:grid; grid-template-columns:minmax(295px,.83fr) minmax(0,1.17fr); gap: 24px; align-items:start; }
.off-admin-card {
  position: relative; isolation: isolate; overflow: hidden; min-width:0;
  padding: clamp(21px,2.7vw,32px); border: 1px solid var(--oq-line); border-radius:24px;
  background: var(--oq-surface); color: var(--oq-ink);
  box-shadow: none;
}
.off-admin-card::before {
  content:""; position:absolute; z-index:0; top:-55%;bottom:-55%;left:-25%;width:60%;
  border-radius:50%;
  background:radial-gradient(ellipse at center,var(--oq-glow) 0%,rgba(178,11,45,.10) 38%, transparent 76%);
  pointer-events:none;
  animation: off-admin-red-wave 9s ease-in-out infinite alternate;
}
.off-admin-card > * { position:relative; z-index:1; }
.off-admin-card-heading { display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap; padding-bottom:18px; margin-bottom:18px;border-bottom:1px solid var(--oq-line); }
.off-admin-card h2 {
  color:var(--oq-ink); font-family:"Arial Black",system-ui,sans-serif;
  font-size:clamp(22px,2.6vw,30px); line-height:1.15;letter-spacing:-.045em; overflow-wrap:anywhere; margin:0;
}
.off-admin-card h3 { color:var(--oq-ink); font-size:17px; margin:26px 0 16px; }
.off-admin-card-eyebrow { color:var(--oq-accent);font-size:10px;font-weight:900;letter-spacing:.13em;margin:0 0 8px; }
.off-admin-counter {display:inline-grid;place-items:center;min-width:31px;min-height:27px;padding:0 7px;border:1px solid var(--oq-line);border-radius:99px;font-family:system-ui,sans-serif;font-size:13px;font-weight:850;vertical-align:middle;}
.off-admin-muted { color:var(--oq-muted);font-size:12px;line-height:1.6;overflow-wrap:anywhere; }
.off-admin-reference { margin:8px 0 0; }
.off-admin-list { display:grid;gap:11px; }
.off-admin-item {
  display:grid;gap:10px;width:100%;padding:16px;text-align:left;
  border:1px solid var(--oq-line);border-radius:14px;
  background:var(--oq-input);color:var(--oq-ink);cursor:pointer;
  transition:border-color .2s,background-color .2s;
}
.off-admin-item:hover, .off-admin-item.is-selected { border-color:var(--oq-accent);background:color-mix(in srgb,var(--oq-accent) 8%,var(--oq-surface)); }
.off-admin-item-top { display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap; }
.off-admin-item strong {font-size:14px;line-height:1.4;color:var(--oq-ink);}
.off-admin-type {color:var(--oq-muted);font-size:11px;font-weight:800;}
.off-admin-route {color:var(--oq-muted);font-size:12px;line-height:1.5;overflow-wrap:anywhere;}
.off-admin-item-bottom {display:flex;gap:8px;flex-wrap:wrap;align-items:center;}
.off-admin-status,.off-admin-approval {display:inline-flex;align-items:center;max-width:100%;border-radius:99px;padding:5px 10px;font-size:11px;font-weight:800;line-height:1.3;}
.off-admin-status {background:color-mix(in srgb,var(--oq-accent) 13%,var(--oq-surface));color:var(--oq-ink);}
.off-admin-approval {background:var(--oq-field);border:1px solid var(--oq-line);color:var(--oq-ink);}
.off-admin-pagination { display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:22px;padding-top:18px;border-top:1px solid var(--oq-line);font-size:12px;color:var(--oq-muted); }
.off-admin-button,.off-admin-primary {
  display:inline-flex;align-items:center;justify-content:center;min-height:44px;
  padding:10px 17px;border-radius:11px;border:1px solid var(--oq-line);
  font:inherit;font-size:13px;font-weight:850;cursor:pointer;
}
.off-admin-button {background:var(--oq-input);color:var(--oq-ink);}
.off-admin-button:hover {border-color:var(--oq-accent);}
.off-admin-primary {background:#b20c2a;border-color:#b20c2a;color:#fff!important;}
.off-admin-primary:hover {background:#ca1639;border-color:#ca1639;}
.off-admin-button:disabled,.off-admin-primary:disabled {opacity:.56;cursor:not-allowed;}
.off-admin-status-row {display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-bottom:5px;}
.off-admin-data {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0;}
.off-admin-data > div {min-width:0;padding:13px 15px;border:1px solid var(--oq-line);border-radius:12px;background:var(--oq-field);}
.off-admin-data dt {font-size:11px;color:var(--oq-muted);font-weight:750;margin-bottom:8px;}
.off-admin-data dd {color:var(--oq-ink);margin:0;font-size:13px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere;}
.off-admin-form {display:grid;gap:15px;border-top:1px solid var(--oq-line);padding-top:16px;margin-top:30px;}
.off-admin-form h3 {margin:0 0 4px;}
.off-admin-form label {display:grid;gap:8px;color:var(--oq-ink);font-size:13px;font-weight:750;}
.off-admin-select-field {display:grid;gap:8px;min-width:0;}
.off-admin-select-field > label {color:var(--oq-ink);font-size:13px;font-weight:750;}
.off-admin-form :is(select,textarea) {
  width:100%;min-width:0;min-height:46px;padding:11px 14px;
  background:var(--oq-input);color:var(--oq-ink);
  border:1px solid var(--oq-input-border);border-radius:10px;font:inherit;font-size:14px;
}
.off-admin-form textarea {min-height:100px;resize:vertical;}
.off-admin-form textarea::placeholder {color:var(--oq-muted);opacity:1;}
.off-admin-form .off-admin-primary {justify-self:start;}
.off-admin-auth {padding:18px;margin-top:26px;border:1px solid var(--oq-line);border-left:3px solid #b20c2a;border-radius:13px;background:var(--oq-field);}
.off-admin-auth h3 {margin:0 0 8px;}
.off-admin-auth p {font-size:13px;color:var(--oq-muted);line-height:1.5;}
.off-admin-actions {display:flex;gap:10px;flex-wrap:wrap;}
.off-admin-history {margin-top:28px;padding-top:6px;border-top:1px solid var(--oq-line);}
.off-admin-event {border-top:1px solid var(--oq-line);padding:13px 0;display:grid;gap:5px;}
.off-admin-event small {font-size:11px;color:var(--oq-muted);}
.off-admin-event p {font-size:13px;overflow-wrap:anywhere;margin:0;}
.off-admin-empty {padding:25px 6px;color:var(--oq-ink);}
.off-admin-empty > p:not(.off-admin-card-eyebrow),.off-admin-empty-message {color:var(--oq-muted);line-height:1.7;}
.off-admin-alert,.off-admin-ok {padding:13px 17px;margin-bottom:20px;border-radius:11px;border:1px solid #b20c2a;background:var(--oq-field);color:var(--oq-ink);font-size:13px;}
.off-admin-ok {border-color:#528d64;}
:global(html.theme-dark) .off-admin .off-admin-card,
:global(html.theme-dark) .off-admin .off-admin-item,
:global(html.theme-dark) .off-admin .off-admin-data > div,
:global(html.theme-dark) .off-admin .off-admin-form :is(select,textarea),
:global(html.theme-dark) .off-admin .off-admin-button,
:global(html.theme-dark) .off-admin .off-admin-approval,
:global(html.theme-dark) .off-admin .off-admin-auth {
  /* Dark text is forced white globally, so every matching surface must stay dark. */
  color: #fff !important;
}
:global(html.theme-dark) .off-admin .off-admin-card {
  background-color:#211b20 !important;
  background-image:
    radial-gradient(ellipse 85% 150% at 6% 78%,rgba(145,9,43,.38) 0%,rgba(145,9,43,.14) 46%,transparent 80%),
    linear-gradient(110deg,#321d25 0%,#211b20 70%) !important;
}
:global(html.theme-dark) .off-admin .off-admin-item {background:#121a30 !important;border-color:#3b465f !important;}
:global(html.theme-dark) .off-admin .off-admin-item:is(:hover,.is-selected) {background:#30202c !important;border-color:#ef233c !important;}
:global(html.theme-dark) .off-admin .off-admin-data > div,
:global(html.theme-dark) .off-admin .off-admin-form :is(select,textarea),
:global(html.theme-dark) .off-admin .off-admin-button,
:global(html.theme-dark) .off-admin .off-admin-auth {background:#121a30 !important;border-color:#3b465f !important;}
:global(html.theme-dark) .off-admin .off-admin-approval {background:#29252f !important;border-color:#565057 !important;}
:global(html.theme-dark) .off-admin .off-admin-primary {background:#b20c2a !important;color:#fff !important;border-color:#b20c2a !important;}
:global(html.theme-dark) .off-admin .off-admin-primary:hover {background:#c91c40 !important;}
:global(html.theme-dark) .off-admin :is(.off-admin-muted,.off-admin-type,.off-admin-route,.off-admin-data dt,.off-admin-event small) {color:#c4c5cf !important;}
.off-admin :is(button,select,textarea,a):focus-visible {outline:3px solid #b20c2a;outline-offset:3px;}
@keyframes off-admin-red-wave {from{transform:translateX(0)}to{transform:translateX(133%)}}
@media (prefers-reduced-motion:reduce) {.off-admin-card::before{animation:none;transform:translateX(65%)}}
@media (max-width:900px) {.off-admin-grid{grid-template-columns:1fr;}.off-admin-hero{min-height:300px;}}
@media (max-width:650px) {.off-admin-shell{width:calc(100% - 32px);}.off-admin-hero__copy{padding-top:82px;padding-bottom:38px;}.off-admin-card{padding:20px 16px;border-radius:20px;}.off-admin-data{grid-template-columns:1fr;}.off-admin-toolbar{align-items:flex-start;}.off-admin-card-heading{align-items:flex-start;}.off-admin-card-heading .off-admin-button{flex-shrink:0;}}
</style>


<style>
/* Unscoped intentionally: Vue scoped :global rules were not winning against
   main's global html.theme-dark .app-site * { color: white!important }.
   Full selectors target only official quotes, never ContentManager itself. */
html.theme-dark .app-site .off-admin .off-admin-card,
html.theme-dark .app-site.off-admin .off-admin-card {
  background: radial-gradient(ellipse 85% 150% at 6% 78%,rgba(145,9,43,.3),transparent 78%),linear-gradient(110deg,#321d25,#211b20 70%) !important;
  color:#fff !important;
  border-color:#565057 !important;
}
html.theme-dark .app-site .off-admin .off-admin-item,
html.theme-dark .app-site.off-admin .off-admin-item {
  background:#121a30 !important; color:#fff !important;border-color:#3b465f !important;
}
html.theme-dark .app-site .off-admin .off-admin-item:is(:hover,.is-selected),
html.theme-dark .app-site.off-admin .off-admin-item:is(:hover,.is-selected) {
  background:#35212c !important;border-color:#ef233c !important;
}
html.theme-dark .app-site .off-admin .off-admin-data > div,
html.theme-dark .app-site.off-admin .off-admin-data > div,
html.theme-dark .app-site .off-admin .off-admin-form :is(select,textarea),
html.theme-dark .app-site.off-admin .off-admin-form :is(select,textarea),
html.theme-dark .app-site .off-admin .off-admin-button,
html.theme-dark .app-site.off-admin .off-admin-button,
html.theme-dark .app-site .off-admin .off-admin-auth,
html.theme-dark .app-site.off-admin .off-admin-auth {
  background:#121a30 !important; color:#fff !important;border-color:#3b465f !important;
}
html.theme-dark .app-site .off-admin :is(.off-admin-item strong,.off-admin-card h2,.off-admin-card h3,.off-admin-data dd),
html.theme-dark .app-site.off-admin :is(.off-admin-item strong,.off-admin-card h2,.off-admin-card h3,.off-admin-data dd) {color:#fff !important;}
html.theme-dark .app-site .off-admin :is(.off-admin-muted,.off-admin-type,.off-admin-route,.off-admin-data dt,.off-admin-event small),
html.theme-dark .app-site.off-admin :is(.off-admin-muted,.off-admin-type,.off-admin-route,.off-admin-data dt,.off-admin-event small) { color:#c4c5cf !important; }
html.theme-dark .app-site .off-admin .off-admin-primary,
html.theme-dark .app-site.off-admin .off-admin-primary {background:#b20c2a !important;color:#fff !important;border-color:#b20c2a !important;}
html.theme-dark .app-site .off-admin .off-admin-approval,
html.theme-dark .app-site.off-admin .off-admin-approval {background:#29252f !important;color:#fff !important;border-color:#565057 !important;}
html.theme-dark .app-site .off-admin .off-admin-status,
html.theme-dark .app-site.off-admin .off-admin-status {background:#3e2832 !important;color:#fff !important;}
html.theme-dark .app-site .off-admin .off-admin-card::before,
html.theme-dark .app-site.off-admin .off-admin-card::before {
  background:radial-gradient(ellipse at center,rgba(214,14,52,.22) 0%,rgba(178,11,45,.1) 45%,transparent 76%) !important;
  filter:none !important;
}
</style>
