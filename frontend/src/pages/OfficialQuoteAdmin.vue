<script setup lang="ts">
import { onMounted, ref } from 'vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { refreshSession } from '../services/auth'
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
  rows.value=r.items;total.value=r.total
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
</script>
<template>
<div class="app-site off-admin"><SiteHeader active="administracion"/><main class="off-admin-shell">
<a href="/administracion" class="off-admin-back">← Volver a administración</a>
<header><p class="off-admin-kicker">OPERACIONES · COTIZACIONES</p><h1>Solicitudes oficiales</h1><p>Revisión y autorización interna. La conexión con Dhole todavía no está disponible.</p></header>
<p v-if="error" class="off-admin-alert" role="alert">{{error}}</p><p v-if="notice" class="off-admin-ok" role="status">{{notice}}</p>
<div v-if="!permissions.canView" class="off-admin-card"><h2>Acceso pendiente</h2><p>Para consultar o gestionar las cotizaciones, se necesita un permiso explícito asignado por el responsable del sistema.</p></div>
<div v-else class="off-admin-grid">
<section class="off-admin-card"><div class="off-admin-row"><h2>Solicitudes ({{total}})</h2><button @click="load" :disabled="busy">Actualizar</button></div>
<p v-if="rows.length===0">No hay solicitudes oficiales todavía.</p>
<button v-for="item in rows" :key="item.id" class="off-admin-item" @click="open(item.id)">
<strong>{{item.customerName}}</strong><span>{{item.mode}} · {{item.shipmentType}}</span>
<span>{{item.originName}} → {{item.destinationName}}</span><small>{{item.status}} · {{item.authorization}}</small>
</button>
<div class="off-admin-row"><button :disabled="page<=1||busy" @click="page--;load()">Anterior</button><small>Página {{page}}</small><button :disabled="rows.length<20||busy" @click="page++;load()">Siguiente</button></div>
</section>
<section class="off-admin-card"><template v-if="detail">
<p class="off-admin-kicker">{{detail.mode}} · {{detail.shipmentType}}</p><h2>{{detail.customerName}}</h2>
<p class="off-admin-muted">Solicitud {{detail.id}}</p><p>Estado: <b>{{detail.status}}</b> · Autorización: <b>{{detail.authorization}}</b></p>
<h3>Datos completos enviados por el cliente</h3><dl class="off-admin-data"><div v-for="(value,key) in detail.form" :key="String(key)"><dt>{{key}}</dt><dd>{{typeof value==='object' ? JSON.stringify(value) : String(value??'No indicado')}}</dd></div></dl>
<form v-if="permissions.canManage" @submit.prevent="review" class="off-admin-form">
<h3>Revisión</h3><label>Estado<select v-model="state"><option v-for="s in statuses" :key="s[0]" :value="s[0]">{{s[1]}}</option></select></label>
<label>Comentario interno<textarea v-model="comment" maxlength="2000" rows="3"/></label>
<button class="off-admin-primary" :disabled="busy">Guardar revisión</button></form>
<div v-if="permissions.canAuthorize && detail.authorization==='Pending'" class="off-admin-auth"><h3>Decisión de autorización</h3><p>Esta acción no envía la solicitud a Dhole.</p><div class="off-admin-row"><button class="off-admin-primary" :disabled="busy" @click="decide('Authorized')">Autorizar para Dhole</button><button :disabled="busy" @click="decide('Rejected')">Rechazar</button></div></div>
<h3>Historial</h3><p v-if="!detail.history.length">Sin cambios todavía.</p>
<article v-for="(event,i) in detail.history" :key="i" class="off-admin-event"><strong>{{event.action}}</strong><small>{{new Date(event.createdAtUtc).toLocaleString('es-CR')}}</small><p v-if="event.comment">{{event.comment}}</p></article>
</template><div v-else><h2>Seleccioná una solicitud</h2><p>Podrás revisar la información y administrarla según tus permisos.</p></div>
</section></div></main><SiteFooter/></div>
</template>
<style scoped>
.off-admin{background:#faf6f8;color:#282734}.off-admin-shell{width:min(1190px,calc(100% - 30px));margin:auto;padding:48px 0 90px}.off-admin-back{color:#b30d2b;font-size:13px;font-weight:800}.off-admin-kicker{font-size:11px;color:#aa1332;font-weight:900;letter-spacing:.14em}.off-admin-shell header{margin:25px 0}.off-admin-shell header h1{font-size:clamp(32px,4vw,50px);letter-spacing:-.04em;margin:0 0 8px}.off-admin-shell header p{color:#676c79}.off-admin-grid{display:grid;grid-template-columns:minmax(300px,0.8fr) minmax(0,1.2fr);gap:18px;align-items:start}.off-admin-card{background:white;border:1px solid #ece3e7;border-radius:17px;padding:23px;min-width:0}.off-admin-card h2{margin:0 0 18px;font-size:21px}.off-admin-card h3{font-size:16px;margin-top:26px}.off-admin-row{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}.off-admin-row button,.off-admin-form button{padding:11px 15px;border:1px solid #d1bfc8;background:white;border-radius:9px;color:#a51331;font-weight:800;cursor:pointer}.off-admin-primary{background:#b30d2b!important;color:white!important;border-color:#b30d2b!important}.off-admin-item{width:100%;text-align:left;display:grid;gap:7px;background:#fff;border:1px solid #e2dee4;padding:14px;margin-bottom:9px;border-radius:10px;cursor:pointer;color:#262935}.off-admin-item:hover{border-color:#bd2442;background:#fff6f8}.off-admin-item span,.off-admin-muted{color:#666d7b;font-size:12px}.off-admin-item small{font-size:11px;color:#a31535}.off-admin-data{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.off-admin-data div{background:#f8f6f9;padding:12px;border-radius:9px;min-width:0}.off-admin-data dt{color:#69707c;font-size:11px}.off-admin-data dd{overflow-wrap:anywhere;margin:6px 0 0;font-size:12px;line-height:1.55}.off-admin-form{border-top:1px solid #e4dfe4;padding-top:15px;margin-top:22px;display:grid;gap:12px}.off-admin-form label{display:grid;gap:7px;font-size:12px;font-weight:800}.off-admin-form select,.off-admin-form textarea{padding:12px;border:1px solid #d9d4dd;border-radius:9px;background:white;color:#222;font:inherit}.off-admin-auth{background:#fff4f6;border:1px solid #e9cbd2;padding:15px;border-radius:10px;margin-top:22px}.off-admin-auth p{font-size:12px}.off-admin-event{padding:12px 0;border-top:1px solid #eee;display:grid;gap:6px}.off-admin-event small{font-size:11px;color:#777}.off-admin-alert,.off-admin-ok{background:#fff0f3;border:1px solid #ebbec8;padding:12px;border-radius:10px;color:#972037}.off-admin-ok{background:#ecfff3;border-color:#bfe6d0;color:#17633b}@media(max-width:850px){.off-admin-grid{grid-template-columns:1fr}.off-admin-data{grid-template-columns:1fr}}@media(max-width:460px){.off-admin-card{padding:15px}}
</style>