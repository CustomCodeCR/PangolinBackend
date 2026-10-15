<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import IconSymbol from '../components/IconSymbol.vue'
import { authState, refreshSession } from '../services/auth'
import { deleteManaged, newManagedId, readManagedItineraries, readManagedMedia, readManagedNews, saveManaged, type ManagedItinerary, type ManagedMedia, type ManagedNews } from '../adminContent'

const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
type Section = 'itineraries' | 'news' | 'media' | 'users'
type AppRole = 'cliente' | 'administrador'
interface ManagedUser { id: string; correo: string; nombre?: string; role: AppRole; activo: boolean }
const section = ref<Section>(new URLSearchParams(window.location.search).get('tab') === 'usuarios' ? 'users' : 'itineraries')
const itineraries = ref<ManagedItinerary[]>([])
const news = ref<ManagedNews[]>([])
const media = ref<ManagedMedia[]>([])
const editingId = ref<string | null>(null)
const notice = ref('')
const users = ref<ManagedUser[]>([])
const usersLoading = ref(false)
const usersError = ref('')
const usersNotice = ref('')
const savingUserId = ref<string | null>(null)
const previewSuffix = computed(() => authState.previewRole ? `?previewRole=${authState.previewRole}` : '')
const isLiveAdmin = computed(() => authState.user?.role === 'administrador' && !authState.previewRole)
const newsForm = ref<ManagedNews>(emptyNews())
const itineraryForm = ref<ManagedItinerary>(emptyItinerary())
const mediaForm = ref<ManagedMedia>(emptyMedia())
const currentList = computed(() => section.value === 'itineraries' ? itineraries.value : section.value === 'news' ? news.value : media.value)

function emptyNews(): ManagedNews { return { id: '', title: '', category: 'LOGÍSTICA', description: '', image: '', published: false } }
function emptyItinerary(): ManagedItinerary { return { id: '', origin: '', destination: '', transport: 'Marítimo', departure: '', arrival: '', status: 'Programado', closing: '', modality: 'FCL', carrier: '', vessel: '', voyage: '' } }
function emptyMedia(): ManagedMedia { return { id: '', name: '', kind: 'Imagen', src: '' } }
function reload() { itineraries.value = readManagedItineraries(); news.value = readManagedNews(); media.value = readManagedMedia() }
onMounted(async () => { await refreshSession(); reload(); if (isLiveAdmin.value) await loadItineraries(); if (section.value === 'users') await loadUsers() })

function selectSection(next: Section) {
  section.value = next
  startNew()
  const url = new URL(window.location.href)
  if (next === 'users') url.searchParams.set('tab', 'usuarios')
  else url.searchParams.delete('tab')
  window.history.replaceState({}, '', url)
  if (next === 'users') loadUsers()
  else if (next === 'itineraries' && isLiveAdmin.value) loadItineraries()
}

async function loadItineraries() {
  if (!isLiveAdmin.value) { itineraries.value = readManagedItineraries(); return }
  notice.value = ''
  try {
    const all: ManagedItinerary[] = []
    let page = 1
    let totalPages = 1
    do {
      const response = await fetch(`/api/itinerarios?page=${page}&pageSize=100`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      if (response.status === 401 || response.status === 403) throw new Error('La sesión no tiene permiso para consultar itinerarios. Inicia sesión con una cuenta administradora.')
      if (!response.ok) throw new Error(`No se pudieron cargar los itinerarios (HTTP ${response.status}).`)
      const body = await response.json()
      if (!body || !Array.isArray(body.items) || typeof body.totalPages !== 'number') throw new Error('La API devolvió un formato inesperado.')
      all.push(...body.items.map((item: Record<string, unknown>): ManagedItinerary => ({
        id: String(item.id), origin: String(item.pol ?? ''), destination: String(item.pod ?? ''),
        transport: item.transport === 'ground' ? 'Terrestre' : 'Marítimo',
        departure: String(item.etd ?? ''), arrival: String(item.eta ?? ''),
        status: ({ planning: 'Programado', transit: 'En tránsito', delivered: 'Completado', delayed: 'Demorado' } as Record<string, string>)[String(item.status)] ?? 'Programado',
        closing: item.closing ? String(item.closing) : '', modality: String(item.modality ?? ''),
        carrier: '', vessel: '', voyage: ''
      })))
      totalPages = body.totalPages
      page += 1
    } while (page <= totalPages && page <= 1000)
    itineraries.value = all
  } catch (cause) { notice.value = cause instanceof Error ? cause.message : 'No se pudieron cargar los itinerarios.' }
}

async function loadUsers() {
  users.value = []
  usersError.value = ''
  if (!isLiveAdmin.value) {
    usersLoading.value = false
    usersError.value = 'Previsualización: se necesita una sesión administradora real para consultar usuarios.'
    return
  }
  usersLoading.value = true
  try {
    const all: ManagedUser[] = []
    let page = 1
    let totalPages = 1
    do {
      const response = await fetch(`/api/admin/users?page=${page}&pageSize=100`, {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`No se pudo cargar usuarios (HTTP ${response.status}).`)
      const data = await response.json()
      if (!Array.isArray(data.users) || !Number.isInteger(data.totalPages))
        throw new Error('Formato de listado de usuarios incorrecto.')
      all.push(...data.users.map((item: ManagedUser) => ({
        id: String(item.id),
        correo: item.correo,
        nombre: item.nombre,
        role: item.role,
        activo: item.activo
      })))
      totalPages = data.totalPages
      page++
    } while (page <= totalPages && page <= 1000)
    users.value = all
  } catch (cause) {
    usersError.value = cause instanceof Error ? cause.message : 'No se pudieron cargar usuarios.'
  } finally {
    usersLoading.value = false
  }
}

async function updateUser(user: ManagedUser) {
  if (!isLiveAdmin.value) return
  usersError.value = ''
  usersNotice.value = ''
  savingUserId.value = user.id
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ role: user.role, activo: user.activo })
    })
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      throw new Error(problem?.error || `No se pudo actualizar la cuenta (HTTP ${response.status}).`)
    }
    await loadUsers()
    usersNotice.value = 'Los cambios se guardaron. Se invalidaron las sesiones activas de la cuenta modificada.'
  } catch (cause) {
    usersError.value = cause instanceof Error ? cause.message : 'No se pudo modificar la cuenta.'
    await loadUsers()
    usersError.value = cause instanceof Error ? cause.message : 'No se pudo modificar la cuenta.'
  } finally {
    savingUserId.value = null
  }
}

function startNew() {
  editingId.value = null
  if (section.value === 'itineraries') itineraryForm.value = emptyItinerary()
  if (section.value === 'news') newsForm.value = emptyNews()
  if (section.value === 'media') mediaForm.value = emptyMedia()
}
async function edit(entry: ManagedItinerary | ManagedNews | ManagedMedia) {
  editingId.value = entry.id
  if (section.value === 'itineraries') {
    itineraryForm.value = { ...(entry as ManagedItinerary) }
    if (isLiveAdmin.value) {
      try {
        const response = await fetch(`/api/itinerarios/${encodeURIComponent(entry.id)}`, { credentials: 'same-origin', cache: 'no-store' })
        if (!response.ok) throw new Error(`No se pudo abrir el itinerario (HTTP ${response.status}).`)
        const item = await response.json()
        itineraryForm.value = { ...itineraryForm.value, closing: item.closing ?? '', modality: item.modality ?? '', carrier: item.carrier ?? '', vessel: item.vessel ?? '', voyage: item.voyage ?? '' }
      } catch (cause) { notice.value = cause instanceof Error ? cause.message : 'No se pudo cargar el itinerario.'; return }
    }
  }
  if (section.value === 'news') newsForm.value = { ...(entry as ManagedNews) }
  if (section.value === 'media') mediaForm.value = { ...(entry as ManagedMedia) }
  document.querySelector('.manager-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
async function submitItinerary() {
  const form = { ...itineraryForm.value }
  if (!isLiveAdmin.value) {
    const item = { ...form, id: editingId.value ?? newManagedId() }
    saveManaged('itineraries', item); reload(); notice.value = 'Itinerario guardado solo en este navegador.'; startNew(); return
  }
  const transport = form.transport === 'Terrestre' ? 'ground' : 'maritime'
  const status = ({ Programado: 'planning', 'En tránsito': 'transit', Completado: 'delivered', Demorado: 'delayed' } as Record<string, string>)[form.status] ?? 'planning'
  const payload = {
    pol: form.origin, pod: form.destination, closing: form.closing || null,
    etd: form.departure || null, eta: form.arrival || null, status, transport,
    modality: form.modality || (transport === 'ground' ? 'LTL' : 'FCL'),
    carrier: form.carrier || null, vessel: form.vessel || null, voyage: form.voyage || null
  }
  notice.value = ''
  try {
    const response = await fetch(editingId.value ? `/api/admin/itinerarios/${encodeURIComponent(editingId.value)}` : '/api/admin/itinerarios', {
      method: editingId.value ? 'PUT' : 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const problem = await response.json().catch(() => null)
      const validation = problem?.errors ? Object.values(problem.errors).flat().join(' ') : ''
      throw new Error(validation || problem?.error || `No se pudo guardar el itinerario (HTTP ${response.status}).`)
    }
    notice.value = editingId.value ? 'Itinerario actualizado en el servidor.' : 'Itinerario agregado al servidor.'
    startNew()
    await loadItineraries()
  } catch (cause) { notice.value = cause instanceof Error ? cause.message : 'No se pudo guardar el itinerario.' }
}

function submitNews() {
  const item = { ...newsForm.value, id: editingId.value ?? newManagedId() }
  saveManaged('news', item); reload(); notice.value = 'Noticia guardada en este navegador.'; startNew()
}
function submitMedia() {
  const item = { ...mediaForm.value, id: editingId.value ?? newManagedId() }
  saveManaged('media', item); reload(); notice.value = 'Archivo agregado a la biblioteca local.'; startNew()
}
async function remove(id: string) {
  if (section.value === 'itineraries' && isLiveAdmin.value) {
    notice.value = ''
    try {
      const response = await fetch(`/api/admin/itinerarios/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) throw new Error(`No se pudo eliminar el itinerario (HTTP ${response.status}).`)
      if (editingId.value === id) startNew()
      notice.value = 'Itinerario eliminado del servidor.'
      await loadItineraries()
    } catch (cause) { notice.value = cause instanceof Error ? cause.message : 'No se pudo eliminar el itinerario.' }
    return
  }
  const kind = section.value === 'itineraries' ? 'itineraries' : section.value === 'news' ? 'news' : 'media'
  deleteManaged(kind, id); reload(); if (editingId.value === id) startNew(); notice.value = 'Elemento eliminado solo en este navegador.'
}
function selectFile(event: Event, target: 'news' | 'media') {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { notice.value = 'Selecciona un archivo de imagen.'; return }
  if (file.size > 2_500_000) { notice.value = 'La imagen debe pesar menos de 2.5 MB para guardarla en este navegador.'; return }
  const reader = new FileReader()
  reader.onload = () => {
    if (target === 'news') newsForm.value.image = String(reader.result)
    else { mediaForm.value.src = String(reader.result); mediaForm.value.name ||= file.name }
  }
  reader.readAsDataURL(file)
}
function useMediaForNews(item: ManagedMedia) { section.value = 'news'; newsForm.value.image = item.src; notice.value = `Imagen “${item.name}” seleccionada para la noticia.` }
</script>

<template>
  <section id="administracion" class="content-manager" :class="{ 'is-embedded': props.embedded }">
    <header v-if="!props.embedded" class="manager-topbar">
      <a class="manager-brand" href="/home"><img src="/images/logo.png" alt="Castro Fallas" /><span>Administración</span></a>
      <div class="manager-topbar-actions"><a class="manager-back" :href="`/home${previewSuffix}`">Volver al sitio <IconSymbol glyph="↗" /></a></div>
    </header>
    <section class="manager-shell">
      <div class="manager-heading"><p class="manager-eyebrow">CASTRO FALLAS · ADMINISTRACIÓN</p><h1>{{ section === 'users' ? 'Gestión de usuarios' : 'Administración del sitio' }}</h1><p>{{ section === 'users' ? 'Consulta las cuentas y administra sus roles desde esta sección.' : 'Administra itinerarios, noticias e imágenes desde esta pantalla.' }}</p></div>
      <div v-if="authState.previewRole" class="manager-preview-note" role="status">Previsualización de desarrollo · Estás viendo el rol {{ authState.previewRole }}. No es una sesión real ni un acceso administrativo de producción.</div>
      <div class="manager-notice" role="note"><strong>Importante:</strong> itinerarios y cambios de usuarios se guardan en el servidor con una sesión administradora real. Noticias, multimedia y la previsualización se guardan solo en este navegador.</div>
      <nav class="manager-tabs" aria-label="Secciones de administración">
        <button :class="{ active: section !== 'users' }" @click="selectSection('itineraries')">Contenido</button>
        <button :class="{ active: section === 'users' }" @click="selectSection('users')">Gestión de usuarios <span>{{ users.length }}</span></button>
      </nav>
      <nav v-if="section !== 'users'" class="manager-tabs manager-subtabs" aria-label="Tipos de contenido">
        <button :class="{ active: section === 'itineraries' }" @click="selectSection('itineraries')">Itinerarios <span>{{ itineraries.length }}</span></button>
        <button :class="{ active: section === 'news' }" @click="selectSection('news')">Noticias <span>{{ news.length }}</span></button>
        <button :class="{ active: section === 'media' }" @click="selectSection('media')">Multimedia <span>{{ media.length }}</span></button>
      </nav>
      <section v-if="section === 'users'" class="manager-users-card" aria-label="Cuentas registradas">
        <header><div><p class="manager-eyebrow">CUENTAS REGISTRADAS</p><h2>{{ usersLoading ? 'Cargando…' : `${users.length} usuarios` }}</h2></div><button class="manager-add" :disabled="usersLoading" @click="loadUsers">Actualizar</button></header>
        <p v-if="usersError" class="manager-users-error" role="alert">{{ usersError }} <button v-if="!authState.previewRole" @click="loadUsers">Reintentar</button></p>
        <p v-if="usersNotice" class="manager-feedback" role="status">{{ usersNotice }}</p>
        <div v-if="usersLoading" class="manager-users-empty">Consultando el sistema de usuarios…</div>
        <div v-else-if="!usersError && users.length === 0" class="manager-users-empty">Aún no hay cuentas para mostrar.</div>
        <div v-else-if="users.length" class="manager-users-table-wrap"><table class="manager-users-table"><thead><tr><th>Cuenta</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead><tbody><tr v-for="user in users" :key="user.id"><td><strong>{{ user.nombre || user.correo }}</strong><small v-if="user.nombre">{{ user.correo }}</small></td><td><select v-model="user.role" :disabled="Boolean(authState.previewRole)" :aria-label="`Rol de ${user.correo}`"><option value="cliente">Cliente</option><option value="administrador">Administrador</option></select></td><td><select v-model="user.activo" :disabled="Boolean(authState.previewRole)" :aria-label="`Estado de ${user.correo}`"><option :value="true">Activo</option><option :value="false">Desactivado</option></select></td><td><button class="manager-user-save" :disabled="Boolean(authState.previewRole) || savingUserId === user.id" @click="updateUser(user)">{{ savingUserId === user.id ? 'Guardando…' : 'Guardar' }}</button></td></tr></tbody></table></div>
      </section>
      <div class="manager-layout">
        <template v-if="section !== 'users'">
        <section class="manager-form">
          <div class="manager-form-heading"><div><p class="manager-eyebrow">{{ editingId ? 'EDITAR' : 'NUEVO REGISTRO' }}</p><h2>{{ section === 'itineraries' ? 'Itinerario' : section === 'news' ? 'Noticia' : 'Archivo multimedia' }}</h2></div><button v-if="editingId" class="manager-cancel" @click="startNew">Cancelar</button></div>
          <form v-if="section === 'itineraries'" @submit.prevent="submitItinerary">
            <label>Origen<input v-model="itineraryForm.origin" required maxlength="120" placeholder="San José, Costa Rica" /></label>
            <label>Destino<input v-model="itineraryForm.destination" required maxlength="120" placeholder="Miami, Estados Unidos" /></label>
            <div class="manager-form-row"><label>Transporte<select v-model="itineraryForm.transport"><option>Marítimo</option><option v-if="isLiveAdmin">Terrestre</option><option v-if="!isLiveAdmin">Aéreo</option><option v-if="!isLiveAdmin">Terrestre</option><option v-if="!isLiveAdmin">Multimodal</option></select></label><label>Estado<select v-model="itineraryForm.status"><option>Programado</option><option>En tránsito</option><option>Completado</option><option>Demorado</option></select></label></div>
            <div class="manager-form-row"><label>Salida<input v-model="itineraryForm.departure" type="date" :required="isLiveAdmin" /></label><label>Llegada<input v-model="itineraryForm.arrival" type="date" :required="isLiveAdmin" /></label></div>
            <template v-if="isLiveAdmin"><label>Closing (opcional)<input v-model="itineraryForm.closing" type="date" /></label><label>Modalidad<select v-model="itineraryForm.modality"><option v-for="option in (itineraryForm.transport === 'Terrestre' ? ['LTL'] : ['FCL', 'LCL'])" :key="option" :value="option">{{ option }}</option></select></label><div class="manager-form-row"><label>Transportista (opcional)<input v-model="itineraryForm.carrier" maxlength="150" /></label><label>Buque (opcional)<input v-model="itineraryForm.vessel" maxlength="150" /></label></div><label>Viaje (opcional)<input v-model="itineraryForm.voyage" maxlength="50" /></label></template>
            <button class="manager-submit">{{ editingId ? 'Guardar cambios' : 'Agregar itinerario' }}</button>
          </form>
          <form v-else-if="section === 'news'" @submit.prevent="submitNews">
            <label>Título<input v-model="newsForm.title" required maxlength="160" placeholder="Título de la noticia" /></label>
            <label>Categoría<input v-model="newsForm.category" required maxlength="60" placeholder="LOGÍSTICA" /></label>
            <label>Resumen<textarea v-model="newsForm.description" required maxlength="1200" rows="4" placeholder="Escribe el contenido de la noticia" /></label>
            <label>Imagen (archivo)<input type="file" accept="image/*" @change="selectFile($event, 'news')" /></label>
            <label>o URL de imagen<input v-model="newsForm.image" placeholder="/images/mi-imagen.webp" /></label>
            <label class="manager-checkbox"><input v-model="newsForm.published" type="checkbox" /> Publicar noticia</label>
            <button class="manager-submit">{{ editingId ? 'Guardar cambios' : 'Agregar noticia' }}</button>
          </form>
          <form v-else @submit.prevent="submitMedia">
            <label>Nombre<input v-model="mediaForm.name" required maxlength="120" placeholder="Imagen de puerto" /></label>
            <label>Tipo<select v-model="mediaForm.kind"><option>Imagen</option><option>Video (enlace)</option><option>Documento (enlace)</option></select></label>
            <label v-if="mediaForm.kind === 'Imagen'">Seleccionar imagen<input type="file" accept="image/*" @change="selectFile($event, 'media')" /></label>
            <label>{{ mediaForm.kind === 'Imagen' ? 'o URL del archivo' : 'Enlace del archivo' }}<input v-model="mediaForm.src" required placeholder="/images/archivo.webp" /></label>
            <img v-if="mediaForm.src && mediaForm.kind === 'Imagen'" class="manager-image-preview" :src="mediaForm.src" alt="Vista previa" />
            <button class="manager-submit">{{ editingId ? 'Guardar cambios' : 'Agregar archivo' }}</button>
          </form>
          <p v-if="notice" class="manager-feedback" role="status">{{ notice }}</p>
        </section>
        <section class="manager-list">
          <header><div><p class="manager-eyebrow">REGISTROS GUARDADOS</p><h2>{{ currentList.length }} elementos</h2></div><button class="manager-add" @click="startNew">＋ Nuevo</button></header>
          <p v-if="currentList.length === 0" class="manager-empty">Todavía no hay elementos. Completa el formulario para agregar el primero.</p>
          <article v-for="entry in currentList" :key="entry.id" class="manager-item">
            <img v-if="section === 'news' && (entry as ManagedNews).image" :src="(entry as ManagedNews).image" alt="" />
            <img v-else-if="section === 'media' && (entry as ManagedMedia).kind === 'Imagen'" :src="(entry as ManagedMedia).src" alt="" />
            <div class="manager-item-copy">
              <strong v-if="section === 'itineraries'">{{ (entry as ManagedItinerary).origin }} → {{ (entry as ManagedItinerary).destination }}</strong>
              <strong v-else-if="section === 'news'">{{ (entry as ManagedNews).title }}</strong>
              <strong v-else>{{ (entry as ManagedMedia).name }}</strong>
              <small v-if="section === 'itineraries'">{{ (entry as ManagedItinerary).transport }} · {{ (entry as ManagedItinerary).status }}</small>
              <small v-else-if="section === 'news'">{{ (entry as ManagedNews).category }} · {{ (entry as ManagedNews).published ? 'Publicada' : 'Borrador' }}</small>
              <small v-else>{{ (entry as ManagedMedia).kind }}</small>
            </div>
            <div class="manager-item-actions"><button aria-label="Editar" title="Editar" @click="edit(entry)">✎</button><button aria-label="Eliminar" title="Eliminar" @click="remove(entry.id)">×</button><button v-if="section === 'media'" aria-label="Usar imagen en noticia" title="Usar en noticia" @click="useMediaForNews(entry as ManagedMedia)">↗</button></div>
          </article>
        </section>
        </template>
      </div>
    </section>
  </section>
</template>

<style scoped>
.content-manager{min-height:100vh;background:linear-gradient(135deg,#f8ecee,#f5f6fa 52%,#e9eef8);color:#171923;padding-bottom:60px}.manager-topbar{height:82px;background:#101827;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,5vw,80px);color:#fff}.manager-brand{display:flex;align-items:center;gap:18px;color:inherit;text-decoration:none;font-weight:700}.manager-brand img{width:58px;height:50px;object-fit:contain}.manager-topbar-actions{display:flex;align-items:center;gap:17px}.manager-admin-link{color:#d9deeb;text-decoration:none;font-size:13px;font-weight:750}.manager-admin-link.is-active{color:#fff}.manager-back{color:#fff;text-decoration:none;display:flex;align-items:center;gap:10px}.manager-shell{width:min(1180px,calc(100% - 40px));margin:58px auto}.manager-heading{margin-bottom:26px}.manager-eyebrow{color:#ad0b26;font-size:11px;letter-spacing:.16em;font-weight:800;margin:0 0 10px}.manager-heading h1{font-size:clamp(32px,5vw,52px);margin:0 0 8px;letter-spacing:-.04em}.manager-heading>p:last-child{color:#5d6270;margin:0}.manager-notice,.manager-preview-note{border:1px solid #e9bac2;background:#fff9fa;border-radius:14px;padding:15px 18px;color:#4d4144;line-height:1.55;margin:24px 0}.manager-preview-note{border-color:#dec67b;background:#fff9e7;color:#554314;font-size:13px}.manager-tabs{display:flex;gap:10px;border-bottom:1px solid #d9dce4;margin-bottom:22px}.manager-tabs button{border:0;background:transparent;color:#555c69;padding:14px 18px;border-bottom:3px solid transparent;font:inherit;font-weight:700;cursor:pointer}.manager-tabs button.active{color:#a80e18;border-color:#a80e18}.manager-tabs span{background:#e9eaf0;border-radius:99px;padding:2px 8px;margin-left:6px;font-size:12px}.manager-layout{display:grid;grid-template-columns:minmax(300px,.9fr) minmax(0,1.1fr);gap:22px;align-items:start}.manager-form,.manager-list{background:#fff;border:1px solid #e3e5eb;border-radius:20px;padding:24px;box-shadow:0 14px 36px #1c24320b}.manager-form-heading,.manager-list>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.manager-form h2,.manager-list h2{margin:0;font-size:23px;letter-spacing:-.03em}.manager-form form{display:grid;gap:14px}.manager-form label{display:grid;gap:7px;color:#424957;font-size:13px;font-weight:700}.manager-form input,.manager-form textarea,.manager-form select{width:100%;box-sizing:border-box;background:#fff;border:1px solid #cfd3dd;border-radius:10px;padding:12px 13px;color:#171923;font:inherit;font-weight:400;outline:none}.manager-form input:focus,.manager-form textarea:focus,.manager-form select:focus{border-color:#ad0b26;box-shadow:0 0 0 3px #ad0b2619}.manager-form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.manager-form .manager-checkbox{display:flex;align-items:center;gap:10px}.manager-checkbox input{width:auto;accent-color:#a80e18}.manager-submit,.manager-add{border:0;border-radius:999px;background:#ad0b26;color:#fff;font:inherit;font-weight:700;padding:13px 18px;cursor:pointer}.manager-cancel{border:1px solid #d6d9e0;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer}.manager-image-preview{max-width:100%;max-height:180px;object-fit:contain;border-radius:10px;background:#f1f2f4}.manager-feedback{margin:15px 0 0;padding:11px 13px;background:#f0f7f3;border-radius:9px;color:#226341;font-size:13px}.manager-list>header h2{font-size:18px}.manager-empty{padding:28px 12px;text-align:center;color:#727887;line-height:1.5}.manager-item{display:flex;align-items:center;gap:12px;border-top:1px solid #eceef2;padding:13px 0}.manager-item>img{width:58px;height:48px;object-fit:cover;border-radius:9px;background:#eceef2}.manager-item-copy{min-width:0;flex:1;display:grid;gap:5px}.manager-item-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.manager-item-copy small{color:#6d7381}.manager-item-actions{display:flex;gap:5px}.manager-item-actions button{width:34px;height:34px;border:1px solid #e1e3e8;background:#fff;border-radius:9px;font-size:18px;color:#464c58;cursor:pointer}.manager-item-actions button:hover{color:#a80e18;border-color:#dfa2ad}@media(max-width:760px){.manager-shell{margin:32px auto;width:min(100% - 24px,600px)}.manager-layout{grid-template-columns:1fr}.manager-topbar{height:70px;padding:0 16px}.manager-brand{gap:8px;font-size:13px}.manager-brand img{width:42px;height:40px}.manager-topbar-actions{gap:9px}.manager-admin-link,.manager-back{font-size:11px}.manager-tabs{overflow-x:auto}.manager-tabs button{white-space:nowrap;padding:12px 10px;font-size:14px}.manager-form,.manager-list{padding:18px}.manager-item-copy strong{white-space:normal}}
.manager-subtabs{margin-top:-14px}.manager-users-card{background:#fff;border:1px solid #e3e5eb;border-radius:20px;padding:24px;box-shadow:0 14px 36px #1c24320b}.manager-users-card>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.manager-users-card h2{margin:0;font-size:22px}.manager-users-empty{padding:34px 16px;text-align:center;color:#727887}.manager-users-error{padding:13px 15px;background:#fff0f1;color:#8b1422;border-radius:10px;line-height:1.5}.manager-users-error button{border:0;background:none;color:inherit;text-decoration:underline;font:inherit;font-weight:700;cursor:pointer}.manager-users-table-wrap{overflow-x:auto}.manager-users-table{width:100%;border-collapse:collapse;text-align:left}.manager-users-table th,.manager-users-table td{padding:14px 16px;border-bottom:1px solid #eceef2;white-space:nowrap}.manager-users-table th{background:#f8f9fb;color:#626a78;font-size:12px;letter-spacing:.04em}.manager-users-table td:first-child{min-width:230px;white-space:normal}.manager-users-table td:first-child strong,.manager-users-table td:first-child small{display:block}.manager-users-table td:first-child small{margin-top:4px;color:#737a87}.manager-users-table select{min-width:130px;border:1px solid #cfd3dd;border-radius:9px;background:#fff;color:#20232b;padding:9px 11px;font:inherit}.manager-user-save{border:0;border-radius:999px;background:#ad0b26;color:#fff;padding:9px 14px;font:inherit;font-weight:700;cursor:pointer}.manager-user-save:disabled,.manager-users-card .manager-add:disabled{opacity:.55;cursor:not-allowed}.manager-users-card .manager-add:disabled{cursor:wait}@media(max-width:760px){.manager-users-card{padding:17px}.manager-users-table th,.manager-users-table td{padding:12px}}
.content-manager.is-embedded{min-height:0;background:transparent;color:inherit;padding:20px 0 70px;scroll-margin-top:96px}.is-embedded .manager-shell{margin:12px auto 40px}.is-embedded .manager-heading h1{font-size:clamp(30px,4vw,46px)}.is-embedded .manager-notice{margin:20px 0}.is-embedded .manager-users-card,.is-embedded .manager-form,.is-embedded .manager-list{background:var(--admin-surface,#fff);color:var(--admin-text,#171923);border-color:var(--admin-border,#e3e5eb)}.is-embedded .manager-heading>p:last-child,.is-embedded .manager-tabs button{color:var(--admin-muted,#5d6270)}.is-embedded .manager-notice{background:var(--admin-note,#fff9fa);color:var(--admin-muted,#4d4144);border-color:var(--admin-border,#e9bac2)}.is-embedded .manager-form input,.is-embedded .manager-form textarea,.is-embedded .manager-form select,.is-embedded .manager-users-table select{background:var(--admin-input,#fff);color:var(--admin-text,#171923);border-color:var(--admin-border,#cfd3dd)}.is-embedded .manager-users-table th{background:var(--admin-table-head,#f8f9fb);color:var(--admin-muted,#626a78)}.is-embedded .manager-users-table td{border-color:var(--admin-border,#eceef2)}.is-embedded .manager-users-table td:first-child small,.is-embedded .manager-users-empty,.is-embedded .manager-item-copy small{color:var(--admin-muted,#727887)}.is-embedded .manager-tabs button.active{color:#a80e18}
/* The embedded manager follows the public site's navy, red and glass surfaces. */
.content-manager.is-embedded {
  --admin-surface: rgba(255, 255, 255, .88);
  --admin-text: #101b32;
  --admin-muted: #687286;
  --admin-border: rgba(23, 43, 75, .14);
  --admin-note: rgba(255, 255, 255, .64);
  --admin-input: #f7f9fd;
  --admin-table-head: #edf2fa;
  padding: 18px 0 80px;
}
.is-embedded .manager-shell { width: min(1280px, calc(100% - 64px)); margin: 16px auto 54px; }
.is-embedded .manager-heading {
  position: relative;
  overflow: hidden;
  margin: 0 0 24px;
  padding: clamp(24px, 4vw, 42px);
  border: 1px solid var(--admin-border);
  border-radius: 26px;
  background: linear-gradient(110deg, var(--admin-surface), color-mix(in srgb, var(--admin-surface) 82%, #b10c2b));
  box-shadow: 0 22px 60px rgba(6, 16, 37, .08);
}
.is-embedded .manager-heading::after {
  content: "";
  position: absolute;
  right: -60px;
  top: -130px;
  width: 300px;
  height: 300px;
  border: 1px solid rgba(173, 9, 34, .2);
  border-radius: 50%;
  box-shadow: 0 0 0 30px rgba(173, 9, 34, .035), 0 0 0 64px rgba(173, 9, 34, .025);
  pointer-events: none;
}
.is-embedded .manager-eyebrow { color: var(--admin-theme-eyebrow); }
.is-embedded .manager-heading h1 { position: relative; z-index: 1; color: var(--admin-text); font-size: clamp(32px, 4vw, 48px); }
.is-embedded .manager-heading > p:last-child { position: relative; z-index: 1; max-width: 640px; color: var(--admin-muted); font-size: 16px; line-height: 1.65; }
.is-embedded .manager-notice,
.is-embedded .manager-preview-note {
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  background: var(--admin-note);
  color: var(--admin-muted);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.is-embedded .manager-preview-note { border-color: rgba(210, 158, 49, .38); }
.is-embedded .manager-tabs {
  display: flex;
  width: fit-content;
  max-width: 100%;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--admin-border);
  border-radius: 16px;
  background: var(--admin-surface);
  box-shadow: 0 10px 28px rgba(6, 16, 37, .06);
}
.is-embedded .manager-tabs button { border: 0; border-radius: 11px; color: var(--admin-muted); padding: 11px 17px; transition: color .2s, background .2s, transform .2s; }
.is-embedded .manager-tabs button:hover { color: var(--admin-text); transform: translateY(-1px); }
.is-embedded .manager-tabs button.active { color: #fff; background: #ad0922; border: 0; box-shadow: 0 6px 16px rgba(173, 9, 34, .2); }
.is-embedded .manager-tabs span { background: rgba(126, 146, 177, .16); color: inherit; }
.is-embedded .manager-subtabs { margin-top: -10px; background: transparent; box-shadow: none; }
.is-embedded .manager-users-card,
.is-embedded .manager-form,
.is-embedded .manager-list {
  border: 1px solid var(--admin-border);
  border-radius: 22px;
  background: var(--admin-surface);
  color: var(--admin-text);
  box-shadow: 0 20px 55px rgba(6, 16, 37, .09);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}
.is-embedded .manager-form label { color: var(--admin-text); }
.is-embedded .manager-form input,
.is-embedded .manager-form textarea,
.is-embedded .manager-form select,
.is-embedded .manager-users-table select {
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: var(--admin-input);
  color: var(--admin-text);
  transition: border-color .2s, box-shadow .2s, background .2s;
}
.is-embedded .manager-form input:focus,
.is-embedded .manager-form textarea:focus,
.is-embedded .manager-form select:focus,
.is-embedded .manager-users-table select:focus { border-color: #ad0922; box-shadow: 0 0 0 4px rgba(173, 9, 34, .12); }
.is-embedded .manager-form input::placeholder,
.is-embedded .manager-form textarea::placeholder { color: var(--admin-muted); opacity: .75; }
.is-embedded .manager-submit,
.is-embedded .manager-add,
.is-embedded .manager-user-save { background: linear-gradient(110deg, #a80e18, #c20e2b); box-shadow: 0 8px 22px rgba(173, 9, 34, .18); transition: transform .2s, box-shadow .2s; }
.is-embedded .manager-submit:hover,
.is-embedded .manager-add:hover,
.is-embedded .manager-user-save:hover { transform: translateY(-2px); box-shadow: 0 12px 26px rgba(173, 9, 34, .24); }
.is-embedded .manager-list > header,
.is-embedded .manager-users-card > header { padding-bottom: 15px; border-bottom: 1px solid var(--admin-border); }
.is-embedded .manager-list h2,
.is-embedded .manager-users-card h2 { color: var(--admin-text); }
.is-embedded .manager-empty,
.is-embedded .manager-users-empty { color: var(--admin-muted); }
.is-embedded .manager-item { border-color: var(--admin-border); }
.is-embedded .manager-item-copy strong { color: var(--admin-text); }
.is-embedded .manager-item-actions button,
.is-embedded .manager-cancel { border-color: var(--admin-border); background: var(--admin-input); color: var(--admin-text); }
.is-embedded .manager-users-table th { background: var(--admin-table-head); color: var(--admin-muted); }
.is-embedded .manager-users-table td { border-color: var(--admin-border); color: var(--admin-text); }
@media (max-width: 760px) {
  .is-embedded .manager-shell { width: calc(100% - 30px); margin: 10px auto 36px; }
  .is-embedded .manager-heading { padding: 25px 21px; border-radius: 20px; }
  .is-embedded .manager-heading::after { right: -150px; opacity: .7; }
  .is-embedded .manager-heading > p:last-child { font-size: 14px; }
  .is-embedded .manager-tabs { width: 100%; overflow-x: auto; }
  .is-embedded .manager-tabs button { flex: 1 0 auto; padding: 11px 12px; }
  .is-embedded .manager-subtabs { width: 100%; }
  .is-embedded .manager-form-row { grid-template-columns: 1fr; }
  .is-embedded .manager-users-table th,
  .is-embedded .manager-users-table td { padding: 11px 10px; }
}
/* Theme tokens live on html so scoped component defaults cannot mask dark mode. */
:global(html) {
  --admin-theme-surface: #fff;
  --admin-theme-text: #101b32;
  --admin-theme-muted: #66738a;
  --admin-theme-border: rgba(19, 39, 72, .16);
  --admin-theme-note: rgba(255, 255, 255, .78);
  --admin-theme-input: #f5f7fb;
  --admin-theme-table-head: #e9eef7;
  --admin-theme-eyebrow: #ad0922;
  --admin-theme-sweep: linear-gradient(105deg, transparent 5%, rgba(190, 12, 43, .16) 46%, rgba(190, 12, 43, .05) 56%, transparent 86%);
}
:global(html.theme-dark) {
  --admin-theme-surface: #01081D;
  --admin-theme-text: #fff;
  --admin-theme-muted: #d1d9e8;
  --admin-theme-border: rgba(169, 190, 225, .2);
  --admin-theme-note: #0e1b33;
  --admin-theme-input: #060f21;
  --admin-theme-table-head: #10203a;
  --admin-theme-eyebrow: #ff7188;
  --admin-theme-sweep: linear-gradient(105deg, transparent 0%, rgba(224, 12, 52, .06) 46%, rgba(224, 12, 52, .26) 50%, rgba(224, 12, 52, .08) 54%, transparent 62%);
}
/* Match the site's dark navy surfaces and white type; keep the inverse in light mode. */
.content-manager.is-embedded {
  --admin-surface: var(--admin-theme-surface);
  --admin-text: var(--admin-theme-text);
  --admin-muted: var(--admin-theme-muted);
  --admin-border: var(--admin-theme-border);
  --admin-note: var(--admin-theme-note);
  --admin-input: var(--admin-theme-input);
  --admin-table-head: var(--admin-theme-table-head);
}
.content-manager.is-embedded .manager-form,
.content-manager.is-embedded .manager-list,
.content-manager.is-embedded .manager-users-card,
.content-manager.is-embedded .manager-heading,
.content-manager.is-embedded .manager-tabs,
.content-manager.is-embedded .manager-notice,
.content-manager.is-embedded .manager-preview-note,
.content-manager.is-embedded .manager-users-error {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background-color: var(--admin-surface) !important;
  color: var(--admin-text) !important;
  border-color: var(--admin-border) !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .14), 0 0 22px rgba(255, 255, 255, .035);
}
.content-manager.is-embedded .manager-notice,
.content-manager.is-embedded .manager-preview-note,
.content-manager.is-embedded .manager-users-error { background-color: var(--admin-note) !important; }
.content-manager.is-embedded .manager-form::before,
.content-manager.is-embedded .manager-list::before,
.content-manager.is-embedded .manager-users-card::before,
.content-manager.is-embedded .manager-heading::before,
.content-manager.is-embedded .manager-tabs::before,
.content-manager.is-embedded .manager-notice::before,
.content-manager.is-embedded .manager-preview-note::before,
.content-manager.is-embedded .manager-users-error::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  background: var(--admin-theme-sweep);
  background-size: 220% 100%;
  background-position: 100% 0;
  animation: admin-red-sweep 8.5s ease-in-out infinite;
  pointer-events: none;
}
.content-manager.is-embedded .manager-form > *,
.content-manager.is-embedded .manager-list > *,
.content-manager.is-embedded .manager-users-card > *,
.content-manager.is-embedded .manager-heading > *,
.content-manager.is-embedded .manager-tabs > *,
.content-manager.is-embedded .manager-notice > *,
.content-manager.is-embedded .manager-preview-note > *,
.content-manager.is-embedded .manager-users-error > * { position: relative; z-index: 1; }
.content-manager.is-embedded .manager-form input,
.content-manager.is-embedded .manager-form textarea,
.content-manager.is-embedded .manager-form select,
.content-manager.is-embedded .manager-users-table select {
  background-color: var(--admin-input) !important;
  color: var(--admin-text) !important;
  border-color: var(--admin-border) !important;
}
.content-manager.is-embedded .manager-users-table th { background: var(--admin-table-head) !important; color: var(--admin-text) !important; }
.content-manager.is-embedded .manager-users-table td,
.content-manager.is-embedded .manager-form label,
.content-manager.is-embedded .manager-tabs button,
.content-manager.is-embedded .manager-notice *,
.content-manager.is-embedded .manager-preview-note *,
.content-manager.is-embedded .manager-users-error * { color: var(--admin-text); }
.content-manager.is-embedded .manager-form input::placeholder,
.content-manager.is-embedded .manager-form textarea::placeholder { color: var(--admin-muted); }
.is-embedded .manager-form,
.is-embedded .manager-list,
.is-embedded .manager-users-card {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  background: var(--admin-surface);
  color: var(--admin-text);
}
.is-embedded .manager-form::before,
.is-embedded .manager-list::before,
.is-embedded .manager-users-card::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  background: linear-gradient(105deg, transparent 5%, rgba(190, 12, 43, .12) 46%, rgba(190, 12, 43, .04) 56%, transparent 86%);
  background-size: 220% 100%;
  background-position: 100% 0;
  animation: admin-red-sweep 8.5s ease-in-out infinite;
  pointer-events: none;
}
.is-embedded .manager-form > *,
.is-embedded .manager-list > *,
.is-embedded .manager-users-card > * { position: relative; z-index: 1; }
.is-embedded .manager-heading h1,
.is-embedded .manager-form h2,
.is-embedded .manager-list h2,
.is-embedded .manager-users-card h2,
.is-embedded .manager-item-copy strong { color: var(--admin-text); }
.is-embedded .manager-form label,
.is-embedded .manager-tabs button,
.is-embedded .manager-users-table td { color: var(--admin-text); }
.content-manager.is-embedded .manager-tabs button.active,
.content-manager.is-embedded .manager-tabs button.active > *,
.content-manager.is-embedded .manager-tabs button.active span {
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
}
.is-embedded .manager-heading > p:last-child,
.is-embedded .manager-item-copy small,
.is-embedded .manager-empty,
.is-embedded .manager-users-empty { color: var(--admin-muted); }
@keyframes admin-red-sweep {
  0%, 12% { background-position: 100% 0; }
  78%, 100% { background-position: 0 0; }
}
@media (prefers-reduced-motion: reduce) {
  .is-embedded .manager-form::before,
  .is-embedded .manager-list::before,
  .is-embedded .manager-users-card::before,
  .is-embedded .manager-heading::before,
  .is-embedded .manager-tabs::before,
  .is-embedded .manager-notice::before,
  .is-embedded .manager-preview-note::before,
  .is-embedded .manager-users-error::before { animation: none; background-position: 50% 0; }
}
</style>
