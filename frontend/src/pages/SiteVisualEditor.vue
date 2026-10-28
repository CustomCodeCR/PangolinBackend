<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { authState } from '../services/auth'
import FieldDropdown from '../components/FieldDropdown.vue'
import { subscribeToChanges } from '../services/realtime'
import i18n from '../i18n'
import { siteSlotCatalog, type EditableSiteSlot, type SiteSlotDefinition } from '../siteCms'
import type { ManagedMedia } from '../adminContent'

const page = ref('home')
const query = ref('')
const typeFilter = ref<'all' | 'media' | 'text'>('all')
const previewError = reactive({ published: false, draft: false })
const currentKey = ref('home.hero.media')
const rows = ref<EditableSiteSlot[]>([])
const media = ref<ManagedMedia[]>([])
const textEs = ref('')
const textEn = ref('')
const mediaId = ref('')
const loading = ref(true)
const saving = ref(false)
const notice = ref('')
const error = ref('')
const storageEnabled = ref(false)
const featuredReel = ref('')
const publishedReel = ref('')
const savingFeaturedReel = ref(false)
const featuredReelNotice = ref('')
const featuredReelError = ref('')
const isLiveAdmin = computed(() => authState.user?.role === 'administrador' && !authState.previewRole)
const pages = [...new Map(siteSlotCatalog.map(slot => [slot.page, { id: slot.page, label: slot.pageLabel }])).values()]
const visible = computed(() => siteSlotCatalog.filter(slot =>
  slot.page === page.value &&
  (typeFilter.value === 'all' || slot.type === typeFilter.value) &&
  (slot.label + ' ' + slot.section + ' ' + slot.help + ' ' + slot.key + ' ' + slot.fallback).toLocaleLowerCase('es')
    .includes(query.value.trim().toLocaleLowerCase('es'))))
const filteredCount = computed(() => visible.value.length)
const selected = computed<SiteSlotDefinition>(() => siteSlotCatalog.find(x => x.key === currentKey.value) ?? siteSlotCatalog[0])
const row = computed(() => rows.value.find(x => x.key === selected.value.key))
const selectableMedia = computed(() => media.value.filter(x => x.kind === 'Imagen' || (selected.value.key !== 'shared.logo.media' && x.kind === 'Video')))
const selectedMedia = computed(() => media.value.find(x => x.id === mediaId.value))
const publishedMedia = computed(() => media.value.find(x => x.id === row.value?.publishedMediaId))
const draftSrc = computed(() => selectedMedia.value ? previewSrc(selectedMedia.value) : selected.value.type === 'media' ? selected.value.fallback : '')
const draftIsVideo = computed(() => selectedMedia.value?.kind.startsWith('Video') ?? false)
const publishedSrc = computed(() => publishedMedia.value ? previewSrc(publishedMedia.value) : selected.value.fallback)
const publishedIsVideo = computed(() => publishedMedia.value?.kind === 'Video')
const pageHref = computed(() => ({ home: '/home', services: '/servicios', about: '/nosotros', login: '/bienvenidos', shared: '/home' } as Record<string,string>)[selected.value.page] || '/home')
watch([currentKey, mediaId, rows], () => { previewError.published = false; previewError.draft = false })
const defaultCopy = computed(() => selected.value.type === 'text' ? i18n.global.t(selected.value.fallback) : '')

function previewSrc(item: ManagedMedia): string {
  return item.objectKey ? `/api/admin/content/media/${encodeURIComponent(item.id)}/file` : item.src
}
function select(slot: SiteSlotDefinition) {
  currentKey.value = slot.key
  const current = rows.value.find(x => x.key === slot.key)
  textEs.value = current?.draftEs ?? ''
  textEn.value = current?.draftEn ?? ''
  mediaId.value = current?.draftMediaId ?? ''
  error.value = ''
  notice.value = ''
  previewError.published = false
  previewError.draft = false
}
watch([query, typeFilter], () => {
  if (visible.value.length && !visible.value.some(slot => slot.key === currentKey.value))
    select(visible.value[0])
})
function switchPage(next: string) {
  page.value = next
  query.value = ''
  typeFilter.value = 'all'
  const first = siteSlotCatalog.find(x => x.page === next)
  if (first) select(first)
}
async function load() {
  loading.value = true
  try {
    if (!isLiveAdmin.value) return
    const [sites, library, status] = await Promise.all([
      fetch('/api/admin/content/site', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/admin/content/media', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/admin/content/media/storage-status', { credentials: 'same-origin', cache: 'no-store' })
    ])
    if (!sites.ok || !library.ok || !status.ok) throw new Error('No se pudieron cargar los datos del editor visual.')
    rows.value = await sites.json() as EditableSiteSlot[]
    // The selected Reel is published immediately and stored as a single CMS slot.
    publishedReel.value = rows.value.find(x => x.key === 'home.instagram.reel')?.publishedEs ?? ''
    featuredReel.value = publishedReel.value
    media.value = await library.json() as ManagedMedia[]
    storageEnabled.value = Boolean((await status.json() as {enabled:boolean}).enabled)
    select(selected.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el editor.'
  } finally { loading.value = false }
}
async function saveFeaturedReel() {
  if (!isLiveAdmin.value || savingFeaturedReel.value) return
  featuredReelError.value = ''
  featuredReelNotice.value = ''
  const url = featuredReel.value.trim()
  // A server-side allowlist also checks the URL before it is saved.
  if (url && !/^https:\/\/(?:www\.|m\.)?instagram\.com\/reel\/[A-Za-z0-9_-]{5,80}\/?(?:[?#].*)?$/i.test(url)) {
    featuredReelError.value = 'Pegá un enlace de Reel válido, por ejemplo https://www.instagram.com/reel/ABC123xyz/'
    return
  }
  savingFeaturedReel.value = true
  try {
    const response = await fetch('/api/admin/content/instagram-reel', {
      method: 'PUT', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url || null })
    })
    const data = await response.json().catch(() => null) as { url?: string | null; error?: string } | null
    if (!response.ok) throw new Error(data?.error || 'No fue posible actualizar el Reel.')
    publishedReel.value = data?.url ?? ''
    featuredReel.value = publishedReel.value
    featuredReelNotice.value = publishedReel.value
      ? '¡Reel guardado y publicado! Ya puedes verlo en el Home.'
      : 'Se quitó el Reel seleccionado. El Home volverá a mostrar el perfil si no hay conexión automática.'
  } catch (cause) {
    featuredReelError.value = cause instanceof Error ? cause.message : 'Error al guardar el Reel.'
  } finally { savingFeaturedReel.value = false }
}

async function removeFeaturedReel() {
  if (!window.confirm('¿Quitar el Reel destacado del Home?')) return
  featuredReel.value = ''
  await saveFeaturedReel()
}

async function saveDraft(): Promise<boolean> {
  if (!isLiveAdmin.value || saving.value) return false
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const slot = selected.value
    const res = await fetch(`/api/admin/content/site/${encodeURIComponent(slot.key)}`, {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slot.type === 'text'
        ? { textEs: textEs.value, textEn: textEn.value, mediaId: null }
        : { textEs: null, textEn: null, mediaId: mediaId.value || null })
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || `No se pudo guardar el borrador (HTTP ${res.status}).`)
    }
    const updated = await res.json() as EditableSiteSlot
    rows.value = [...rows.value.filter(x => x.key !== updated.key), updated]
    notice.value = 'Borrador guardado. La web pública todavía no ha cambiado.'
    return true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Error guardando el borrador.'
    return false
  } finally { saving.value = false }
}
async function publish() {
  if (!(await saveDraft())) return
  saving.value = true
  try {
    const res = await fetch(`/api/admin/content/site/${encodeURIComponent(selected.value.key)}/publish`, {
      method: 'POST', credentials: 'same-origin'
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `No se pudo publicar (HTTP ${res.status}).`)
    }
    const updated = await res.json() as EditableSiteSlot
    rows.value = [...rows.value.filter(x => x.key !== updated.key), updated]
    notice.value = '¡Publicado! El cambio ya se refleja en la página correspondiente.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Error publicando cambios.' }
  finally { saving.value = false }
}
async function restore() {
  if (!isLiveAdmin.value || saving.value || !window.confirm('¿Restaurar el contenido original de esta ubicación en la web pública?')) return
  saving.value = true; error.value = ''
  try {
    const res = await fetch(`/api/admin/content/site/${encodeURIComponent(selected.value.key)}/restore`, {
      method: 'POST', credentials: 'same-origin'
    })
    if (!res.ok) throw new Error('No se pudo restaurar la ubicación.')
    const updated = await res.json() as EditableSiteSlot
    rows.value = [...rows.value.filter(x => x.key !== updated.key), updated]
    select(selected.value)
    notice.value = 'Se restauró el contenido original sin borrar archivos de MinIO.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo restaurar.' }
  finally { saving.value = false }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file || !isLiveAdmin.value || !storageEnabled.value) return
  error.value = ''; notice.value = ''
  if (!['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm'].includes(file.type)) {
    error.value = 'Solo se permiten imágenes PNG/JPEG/WebP/GIF o videos MP4/WebM.'
    return
  }
  if (file.size > (file.type.startsWith('video/') ? 20 : 5) * 1024 * 1024) {
    error.value = 'Archivo demasiado grande. Máximo 5 MB para imágenes o 20 MB para videos.'
    return
  }
  saving.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', file.type.startsWith('video/') ? 'Video' : 'Imagen')
    form.append('name', file.name)
    const res = await fetch('/api/admin/content/media/upload', { method: 'POST', credentials: 'same-origin', body: form })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `No se pudo subir (HTTP ${res.status}).`)
    }
    const item = await res.json() as ManagedMedia
    media.value = [item, ...media.value]
    mediaId.value = item.id
    notice.value = 'Archivo subido a MinIO. Guardá y publicá esta asignación para cambiar la web.'
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo subir el archivo.' }
  finally { saving.value = false; input.value = '' }
}
async function refreshRemote() {
  if (!isLiveAdmin.value || loading.value || saving.value) return
  try {
    const [slots, library] = await Promise.all([
      fetch('/api/admin/content/site', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/admin/content/media', { credentials: 'same-origin', cache: 'no-store' })
    ])
    if (!slots.ok || !library.ok) return
    const [newRows, newMedia] = await Promise.all([slots.json(), library.json()])
    if (!Array.isArray(newRows) || !Array.isArray(newMedia)) return
    rows.value = newRows as EditableSiteSlot[]
    media.value = newMedia as ManagedMedia[]
    // No reemplazar textEs/textEn/mediaId. Podrían tener ediciones sin guardar.
  } catch { /* El editor seguirá disponible y se sincronizará al reconectar. */ }
}
const stopEditorEvents = ['site-admin', 'media', 'sync']
  .map(resource => subscribeToChanges(resource, () => { void refreshRemote() }))
onUnmounted(() => stopEditorEvents.forEach(stop => stop()))
onMounted(load)
</script>

<template>
  <section class="visual-editor" aria-label="Editor visual del sitio">
    <header class="visual-editor__intro">
      <div><p class="manager-eyebrow">CONTENIDO DEL SITIO</p><h2>Editor visual</h2>
      </div>
      <button type="button" class="visual-editor__button" @click="load" :disabled="loading">Actualizar biblioteca</button>
    </header>
    
    <section class="visual-editor__featured-reel" aria-labelledby="featured-reel-title">
      <header>
        <div>
          <p class="manager-eyebrow">INICIO · REDES SOCIALES</p>
          <h3 id="featured-reel-title">Reel de Instagram del Home</h3>
          <p>Pegá el enlace del Reel público que querés mostrar encima de las tarjetas de contacto. No requiere conectar Meta.</p>
        </div>
        <a href="/home#instagram" target="_blank" rel="noopener noreferrer">Ver Home ↗</a>
      </header>
      <form class="visual-editor__featured-reel-form" @submit.prevent="saveFeaturedReel">
        <label for="featured-reel-link">Enlace del Reel
          <input id="featured-reel-link" v-model.trim="featuredReel" type="url" inputmode="url"
            :disabled="!isLiveAdmin || loading || savingFeaturedReel" maxlength="512"
            placeholder="https://www.instagram.com/reel/..." autocomplete="off" />
        </label>
        <div class="visual-editor__featured-reel-actions">
          <button class="visual-editor__button visual-editor__publish" type="submit"
            :disabled="!isLiveAdmin || loading || savingFeaturedReel">{{ savingFeaturedReel ? 'Guardando…' : 'Guardar y mostrar Reel' }}</button>
          <button class="visual-editor__button visual-editor__reset" type="button"
            :disabled="!isLiveAdmin || loading || savingFeaturedReel || !publishedReel" @click="removeFeaturedReel">Quitar Reel</button>
        </div>
      </form>
      <p v-if="featuredReelError" class="visual-editor__error" role="alert">{{ featuredReelError }}</p>
      <p v-if="featuredReelNotice" class="visual-editor__success" role="status">{{ featuredReelNotice }}</p>
      <p v-if="publishedReel" class="visual-editor__featured-reel-current">Publicado: <a :href="publishedReel" target="_blank" rel="noopener noreferrer">{{ publishedReel }}</a></p>
      <p v-else class="visual-editor__featured-reel-current">Sin Reel elegido. La web mostrará el enlace al perfil de Instagram.</p>
      <p v-if="!isLiveAdmin" class="visual-editor__hint">Necesitás una sesión administradora real para modificar el Reel.</p>
      <small class="visual-editor__hint">El Reel debe ser público y permitir la inserción desde Instagram. Si su reproducción está restringida, el visitante podrá abrirlo en Instagram.</small>
    </section>

    <p v-if="error" role="alert" class="visual-editor__error">{{ error }}</p>
    <p v-if="notice" role="status" class="visual-editor__success">{{ notice }}</p>
    <div v-if="loading" role="status">Cargando secciones…</div>
    <template v-else>
      <div class="visual-editor__pages" role="group" aria-label="Páginas">
        <button v-for="item in pages" :key="item.id" type="button" :class="{ active: item.id === page }" @click="switchPage(item.id)">{{ item.label }}</button>
      </div>
      <div class="visual-editor__columns">
        <aside class="visual-editor__locations">
          <label>Buscar ubicación <input v-model="query" type="search" placeholder="Ej. Portada, servicio aéreo…" /></label>
          <div class="visual-editor__filters" role="group" aria-label="Filtrar ubicaciones por tipo">
            <button type="button" :aria-pressed="typeFilter === 'all'" :class="{ active: typeFilter === 'all' }" @click="typeFilter = 'all'">Todos</button>
            <button type="button" :aria-pressed="typeFilter === 'media'" :class="{ active: typeFilter === 'media' }" @click="typeFilter = 'media'">Imágenes / videos</button>
            <button type="button" :aria-pressed="typeFilter === 'text'" :class="{ active: typeFilter === 'text' }" @click="typeFilter = 'text'">Textos</button>
          </div>
          <p class="visual-editor__hint" role="status">{{ filteredCount }} ubicaciones en esta página</p>
          <div v-if="!visible.length" class="visual-editor__empty">No encontramos ubicaciones con esos filtros.</div>
          <button v-for="slot in visible" :key="slot.key" type="button" :class="{ active: slot.key === selected.key }" @click="select(slot)">
            <span class="visual-editor__slot-type">{{ slot.type === 'media' ? 'Imagen / Video' : 'Texto' }}</span>
            <span class="visual-editor__section">{{ slot.section }}</span>
            <strong>{{ slot.label }}</strong><small>{{ slot.help }}</small>
            <span v-if="rows.some(x => x.key === slot.key && (x.publishedMediaId || x.publishedEs || x.publishedEn))" class="visual-editor__published">Personalizada</span>
          </button>
        </aside>
        <div v-if="visible.length" class="visual-editor__details">
          <p class="visual-editor__breadcrumb">{{ selected.pageLabel }} / {{ selected.section }} / {{ selected.label }}</p>
          <h3>{{ selected.label }}</h3>
          <p class="visual-editor__description">{{ selected.help }}</p>
          <div class="visual-editor__context">
            <span><strong>Ubicación:</strong> {{ selected.pageLabel }} → {{ selected.section }} → {{ selected.label }}</span>
            <a :href="pageHref" target="_blank" rel="noopener noreferrer">Ver página real ↗</a>
          </div>
          <template v-if="selected.type === 'text'">
            <p class="visual-editor__hint">Texto original: {{ defaultCopy }}</p>
            <label>Texto en español <textarea v-model="textEs" maxlength="1600" rows="4" :placeholder="defaultCopy" /></label>
            <label>Texto en inglés <textarea v-model="textEn" maxlength="1600" rows="4" placeholder="Dejalo vacío para usar el texto inglés original" /></label>
            <p class="visual-editor__hint">Si un idioma queda vacío, se mostrará el texto original traducido de la web.</p>
            <div class="visual-editor__text-preview"><strong>Vista previa (ES)</strong><p>{{ textEs || defaultCopy }}</p></div>
          </template>
          <template v-else>
            <p class="visual-editor__hint"><strong>Archivo original:</strong> {{ selected.fallback ? selected.fallback.split('/').pop() : 'Esta ubicación no tiene fotografía original' }}</p>
            <div class="visual-editor__preview-grid">
              <div><strong>Contenido publicado</strong>
                <video v-if="publishedSrc && publishedIsVideo && !previewError.published" :key="publishedSrc" :src="publishedSrc" controls muted playsinline preload="metadata" @error="previewError.published = true" />
                <img v-else-if="publishedSrc && !publishedIsVideo && !previewError.published" :key="publishedSrc" :src="publishedSrc" :alt="selected.label" @error="previewError.published = true" />
                <div v-else class="visual-editor__preview-empty">{{ previewError.published ? 'No se pudo cargar este archivo. Revisá su referencia en Multimedia.' : 'Esta ubicación no tiene imagen o video original.' }}</div>
              </div>
              <div><strong>Vista de borrador</strong>
                <video v-if="draftSrc && draftIsVideo && !previewError.draft" :key="draftSrc" :src="draftSrc" controls muted playsinline preload="metadata" @error="previewError.draft = true" />
                <img v-else-if="draftSrc && !draftIsVideo && !previewError.draft" :key="draftSrc" :src="draftSrc" :alt="selected.label" @error="previewError.draft = true" />
                <div v-else class="visual-editor__preview-empty">{{ previewError.draft ? 'No fue posible cargar la vista previa. Elegí otro archivo.' : 'Sin archivo asignado todavía.' }}</div>
              </div>
            </div>
            <div class="visual-editor__library-field">
              <label>Archivo de la biblioteca de MinIO</label>
              <FieldDropdown v-model="mediaId" aria-label="Archivo de la biblioteca de MinIO" :options="[
                { value:'', label:selected.fallback ? 'Usar imagen original de esta ubicación' : 'Sin imagen asignada' },
                ...selectableMedia.map(file => ({value:file.id,label:file.name + ' (' + file.kind + ')'}))
              ]" />
            </div>
            <label v-if="storageEnabled">O subir un archivo nuevo (imagen o video)
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" @change="upload" :disabled="saving" />
            </label>
            <p v-else class="visual-editor__hint">Para subir archivos originales activá MinIO. Podés reutilizar los archivos de imagen de la biblioteca actual.</p>
            <p class="visual-editor__hint">El cambio afecta únicamente a «{{ selected.label }}». La misma imagen en otras secciones no se modifica.</p>
          </template>
          <div class="visual-editor__actions">
            <button type="button" class="visual-editor__button" :disabled="!isLiveAdmin || saving" @click="saveDraft">Guardar borrador</button>
            <button type="button" class="visual-editor__button visual-editor__publish" :disabled="!isLiveAdmin || saving" @click="publish">Publicar</button>
            <button type="button" class="visual-editor__button visual-editor__reset" :disabled="!isLiveAdmin || saving" @click="restore">Restaurar original</button>
          </div>
          <small class="visual-editor__hint">Los borradores no se muestran al público. «Restaurar original» revierte al contenido incluido en el código, sin eliminar archivos de MinIO.</small>
        </div>
      </div>
    </template>
  </section>
</template>

<!--
  Estilos deliberadamente NO scoped: html.theme-dark dentro de <style scoped>
  no alcanza al editor con las reglas de tema global del sitio. Todas las reglas
  de este bloque quedan limitadas por .visual-editor para no afectar otras páginas.
-->
<style>
.visual-editor{width:100%;display:grid;gap:16px;padding:22px;border:1px solid #ded9dc;border-radius:20px;background:#fff;color:#25252a}
.visual-editor__intro{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
/* An independent publishing shortcut for the one Reel shown in Home. */
.visual-editor__featured-reel{display:grid;gap:13px;padding:22px;border:1px solid #e8d4dc;border-radius:16px;background:linear-gradient(125deg,#fff6f9,#fff)}
.visual-editor__featured-reel header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}
.visual-editor__featured-reel header h3{font-size:clamp(20px,2vw,25px);line-height:1.28;margin:5px 0}
.visual-editor__featured-reel header p:not(.manager-eyebrow){font-size:13px;line-height:1.55;margin:0;color:#565c68}
.visual-editor__featured-reel header>a{color:#ae1740;text-decoration:underline;font-weight:700;font-size:13px;white-space:nowrap}
.visual-editor__featured-reel-form{display:flex;align-items:end;flex-wrap:wrap;gap:12px}
.visual-editor__featured-reel-form label{display:grid;gap:7px;font-weight:750;font-size:13px;flex:1 1 300px;min-width:0}
.visual-editor__featured-reel-form input{width:100%;min-width:0;padding:12px 13px;border:1px solid #bdc3ce;border-radius:10px;color:#1d2735;background:#fff;font:inherit}
.visual-editor__featured-reel-actions{display:flex;gap:9px;flex-wrap:wrap}
.visual-editor__featured-reel-current{margin:0;font-size:12px;line-height:1.55;color:#515865;overflow-wrap:anywhere}
.visual-editor__featured-reel-current a{color:#aa1745;text-decoration:underline}
html.theme-dark .visual-editor__featured-reel{background:#171924;border-color:#503042}
html.theme-dark .visual-editor__featured-reel header p:not(.manager-eyebrow),html.theme-dark .visual-editor__featured-reel-current{color:#d3d7e1}
html.theme-dark .visual-editor__featured-reel-form input{background:#0b1324;border-color:#667085;color:#fff}
html.theme-dark .visual-editor__featured-reel :is(header>a,.visual-editor__featured-reel-current a){color:#ff879e}
.visual-editor__intro h2{margin:4px 0 9px;font-size:clamp(26px,3vw,36px)}
.visual-editor__intro p{max-width:650px;color:#687078;line-height:1.6}
.visual-editor__context{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:9px;padding:11px 13px;border:1px solid #e5e7eb;border-radius:10px;font-size:12px;background:#f9fafb}
.visual-editor__context a{color:#a50c2c;text-decoration:underline;font-weight:700}
.visual-editor__filters{display:flex;gap:5px;flex-wrap:wrap}
.visual-editor__filters button{padding:8px 9px;border-radius:9px;border:1px solid #d4d7df;background:#fafafa;color:#25252a;cursor:pointer;font-weight:700;font-size:11px}
.visual-editor__filters button.active{color:#fff;background:#a60b29;border-color:#a60b29}
.visual-editor :is(.visual-editor__pages button,.visual-editor__filters button,.visual-editor__locations button,.visual-editor__button){transition:background-color .18s ease,color .18s ease,border-color .18s ease}
.visual-editor :is(.visual-editor__pages button,.visual-editor__filters button,.visual-editor__locations button,.visual-editor__button):focus-visible,
.visual-editor :is(input,select,textarea):focus-visible{outline:2px solid #a80e18;outline-offset:2px}
.visual-editor__filters button:not(.active):hover,.visual-editor__pages button:not(.active):hover{background:rgba(168,14,24,.07);border-color:#a80e18}
.visual-editor__locations button:not(.active):hover{border-color:#a80e18;background:rgba(168,14,24,.05)}
.visual-editor__empty{font-size:13px;color:#67737b;padding:20px;border:1px dashed #cbd1d8;border-radius:12px}
.visual-editor__preview-empty{display:flex;align-items:center;justify-content:center;text-align:center;min-height:170px;aspect-ratio:16/10;background:#f2f4f7;color:#566371;border:1px dashed #c5ccd5;border-radius:11px;padding:16px;font-size:13px;line-height:1.5}
.visual-editor__pages{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #eee;padding-bottom:14px}
.visual-editor__pages button,.visual-editor__button{padding:11px 15px;border:1px solid #ddd;border-radius:11px;cursor:pointer;background:white;color:#292a30;font-weight:700}
.visual-editor__pages button.active{background:#a60b29;color:#fff;border-color:#a60b29}
.visual-editor__columns{display:grid;grid-template-columns:minmax(235px,32%) minmax(0,1fr);gap:20px;align-items:start}
/* La barra se aloja en un canal propio; el padding derecho iguala al izquierdo. */
.visual-editor__locations{display:grid;align-content:start;gap:9px;max-height:760px;overflow-y:auto;overflow-x:hidden;box-sizing:border-box;padding:0 12px 0 0;scrollbar-gutter:stable;scrollbar-width:thin;scrollbar-color:#9aa4b4 transparent}
.visual-editor__locations>button,.visual-editor__locations>label,.visual-editor__locations>.visual-editor__filters{min-width:0}
.visual-editor__locations label,.visual-editor__details label{display:grid;gap:7px;font-weight:750;font-size:13px}
.visual-editor__library-field{display:grid;gap:7px;min-width:0}
.visual-editor__library-field > label{font-size:13px;font-weight:750}
.visual-editor__locations input,.visual-editor__details textarea,.visual-editor__details input,.visual-editor__details select{min-width:0;width:100%;padding:11px;border-radius:9px;border:1px solid #cbd1d8;font:inherit;background:white;color:#202126}
.visual-editor__locations button{display:grid;gap:4px;text-align:left;padding:12px;border:1px solid #e1e4e9;border-radius:12px;background:#fff;color:#202126;cursor:pointer}
.visual-editor__locations button.active{border-color:#a70c2b;background:rgba(168,14,24,.08)}
.visual-editor__locations small,.visual-editor__description,.visual-editor__hint{color:#657079;font-size:12px;line-height:1.5}
.visual-editor__slot-type{font-size:10px;color:#9c0b28;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.visual-editor__section{font-size:11px;color:#4b6179;font-weight:700}
.visual-editor__published{font-size:11px;color:#276347}
.visual-editor__details{display:grid;gap:14px;min-width:0}
.visual-editor__breadcrumb{color:#a80e18!important;font-size:11px;font-weight:850;letter-spacing:.13em;text-transform:uppercase}
.visual-editor__details h3{font-size:26px;margin:0}
.visual-editor__details p{margin:0}
.visual-editor__preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.visual-editor__preview-grid>div{display:grid;gap:8px;min-width:0}
.visual-editor__preview-grid img,.visual-editor__preview-grid video{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:11px;background:#25252b}
.visual-editor__text-preview{padding:14px;background:#f8f7f8;border-radius:12px}
.visual-editor__text-preview p{white-space:pre-wrap;line-height:1.6}
.visual-editor__actions{display:flex;flex-wrap:wrap;gap:9px}
.visual-editor__publish{background:#a70c2b;color:#fff;border-color:#a70c2b}
.visual-editor__reset{color:#a70c2b}
.visual-editor__button:disabled{opacity:.5;cursor:not-allowed}
.visual-editor__warning,.visual-editor__error,.visual-editor__success{padding:12px;border-radius:9px}
.visual-editor__warning,.visual-editor__error{background:rgba(168,14,24,.06);color:#a80e18}
.visual-editor__success{background:#eaf7ee;color:#24613c}
@media(max-width:760px){.visual-editor{padding:14px}.visual-editor__intro{flex-direction:column}.visual-editor__columns{grid-template-columns:1fr}.visual-editor__locations{max-height:300px}.visual-editor__preview-grid{grid-template-columns:1fr 1fr}}
@media(max-width:460px){.visual-editor__preview-grid{grid-template-columns:1fr}}

/* A diferencia del CSS original, este panel respeta el modo oscuro y el color del texto.
   Especificidad alta: la web contiene reglas globales con !important para dark mode. */
/* Mismo tratamiento de superficie y barrido rojo que Multimedia. */
.visual-editor{position:relative;isolation:isolate;overflow:hidden;box-shadow:0 20px 55px rgba(6,16,37,.09);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.visual-editor::before{content:"";position:absolute;z-index:0;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 5%,rgba(190,12,43,.12) 46%,rgba(190,12,43,.04) 56%,transparent 86%);background-size:220% 100%;background-position:100% 0;animation:visual-editor-red-sweep 8.5s ease-in-out infinite}
.visual-editor>*{position:relative;z-index:1}
@keyframes visual-editor-red-sweep{0%,12%{background-position:100% 0}78%,100%{background-position:0 0}}
html.theme-dark .visual-editor{background:#01081d!important;border-color:rgba(169,190,225,.2)!important;color:#f6f8ff!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 0 22px rgba(255,255,255,.035)}
html.theme-dark .visual-editor::before{background:linear-gradient(105deg,transparent 0%,rgba(224,12,52,.06) 46%,rgba(224,12,52,.26) 50%,rgba(224,12,52,.08) 54%,transparent 62%);background-size:220% 100%}
@media(prefers-reduced-motion:reduce){.visual-editor::before{animation:none;background-position:50% 0}}
html.theme-dark .visual-editor :is(h2,h3,strong,label){color:#f5f7fc!important}
html.theme-dark .visual-editor :is(.visual-editor__description,.visual-editor__hint,.visual-editor__locations small,.visual-editor__intro p){color:#c1cada!important}
html.theme-dark .visual-editor .visual-editor__pages{border-color:#3a465b}
html.theme-dark .visual-editor :is(.visual-editor__button,.visual-editor__pages button,.visual-editor__locations button,.visual-editor__filters button){background:#1d2a41!important;border-color:#49576b!important;color:#f5f7fc!important}
html.theme-dark .visual-editor :is(.visual-editor__pages button.active,.visual-editor__filters button.active,.visual-editor__publish){background:#b20d30!important;border-color:#a80e18!important;color:#fff!important}
html.theme-dark .visual-editor :is(.visual-editor__pages button,.visual-editor__filters button):not(.active):hover{background:#304058!important;border-color:#8497b6!important}
html.theme-dark .visual-editor .visual-editor__locations button:not(.active):hover{background:#273650!important;border-color:#8497b6!important}
html.theme-dark .visual-editor :is(.visual-editor__pages button.active,.visual-editor__filters button.active):hover{background:#a80e18!important}
html.theme-dark .visual-editor .visual-editor__reset{color:#ef233c!important}
html.theme-dark .visual-editor .manager-eyebrow{color:#ef233c!important}
html.theme-dark .visual-editor .visual-editor__locations button.active{background:#35151c!important;border-color:#a80e18!important}
html.theme-dark .visual-editor :is(input,select,textarea){color:#f7f9fc!important;background:#141f33!important;border-color:#54647d!important;color-scheme:dark}
html.theme-dark .visual-editor input[type="file"]::file-selector-button{background:#2b3b58;border:1px solid #7585a0;color:#fff;border-radius:6px;padding:7px 11px;cursor:pointer}
html.theme-dark .visual-editor .visual-editor__locations{scrollbar-color:#64758e transparent}
html.theme-dark .visual-editor :is(input,textarea)::placeholder{color:#adb9ce!important}
html.theme-dark .visual-editor :is(.visual-editor__text-preview,.visual-editor__context,.visual-editor__preview-empty,.visual-editor__empty){background:#1c2a41!important;border-color:#445570!important;color:#d1d9e7!important}
html.theme-dark .visual-editor .visual-editor__context a{color:#ef233c!important}
html.theme-dark .visual-editor .visual-editor__slot-type{color:#ef233c!important}
html.theme-dark .visual-editor .visual-editor__section{color:#b6c7e1!important}
html.theme-dark .visual-editor .visual-editor__published{color:#88e4ad!important}
html.theme-dark .visual-editor .visual-editor__warning,
html.theme-dark .visual-editor .visual-editor__error{background:#35151c!important;color:#ff3347!important}
html.theme-dark .visual-editor .visual-editor__success{background:#183a34!important;color:#a5f5c7!important}

/* Editor visual dentro de Administración: misma superficie carbón-vino y
   ola roja que las demás tarjetas. No afecta el editor en otras páginas. */
html.theme-dark .app-site.administration-page .visual-editor {
  background-color: #211b20 !important;
  background-image:
    radial-gradient(ellipse 85% 150% at 6% 78%,
      rgba(145, 9, 43, .38) 0%,
      rgba(145, 9, 43, .14) 46%,
      transparent 80%),
    linear-gradient(110deg, #321d25 0%, #211b20 70%) !important;
  border-color: rgba(188, 158, 168, .25) !important;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}
html.theme-dark .app-site.administration-page .visual-editor::before {
  content: "";
  inset: auto;
  top: -55%;
  bottom: -55%;
  left: -25%;
  right: auto;
  width: 60%;
  border-radius: 50%;
  background: radial-gradient(ellipse at center,
    rgba(214, 14, 52, .37) 0%,
    rgba(178, 11, 45, .23) 38%,
    rgba(126, 10, 34, .11) 58%,
    transparent 76%);
  background-size: auto;
  background-position: center;
  filter: none;
  animation: itinerary-red-sweep 9s ease-in-out infinite alternate;
}
/* Recuadros secundarios sin el azul intenso; mantener contraste y estados. */
html.theme-dark .app-site.administration-page .visual-editor :is(
  .visual-editor__button, .visual-editor__pages button,
  .visual-editor__locations button, .visual-editor__filters button
) {
  background: #30252a !important;
  border-color: #55424b !important;
}
html.theme-dark .app-site.administration-page .visual-editor :is(
  .visual-editor__text-preview, .visual-editor__context,
  .visual-editor__preview-empty, .visual-editor__empty
) {
  background: #30252a !important;
  border-color: #55424b !important;
  color: #e4dbe0 !important;
}
html.theme-dark .app-site.administration-page .visual-editor :is(input, select, textarea) {
  background: #121a30 !important;
  border-color: #3b465f !important;
  color: #fff !important;
}
html.theme-dark .app-site.administration-page .visual-editor :is(input, textarea)::placeholder {
  color: #acb1bd !important;
}
html.theme-dark .app-site.administration-page .visual-editor :is(
  .visual-editor__pages button.active, .visual-editor__filters button.active,
  .visual-editor__publish
) {
  background: #b20d30 !important;
  border-color: #a80e18 !important;
}
html.theme-dark .app-site.administration-page .visual-editor .visual-editor__locations button.active {
  background: #35151c !important;
  border-color: #a80e18 !important;
}
html.theme-dark .app-site.administration-page .visual-editor :is(
  .visual-editor__pages button, .visual-editor__filters button,
  .visual-editor__locations button
):not(.active):hover {
  background: #2f171c !important;
  border-color: #a80e18 !important;
}
@media (prefers-reduced-motion: reduce) {
  html.theme-dark .app-site.administration-page .visual-editor::before {
    animation: none;
    transform: translateX(65%);
  }
}

/* PR #94: selector de archivos con el mismo azul oscuro de los campos. */
/* Cambiar únicamente las superficies azules del input de carga y su botón
   nativo. Conservar bordes, letras, medidas, estados y funcionalidad. */
html.theme-dark .visual-editor input[type="file"],
html.theme-dark .app-site.administration-page .visual-editor input[type="file"] {
  background-color:#060f21 !important;
}
html.theme-dark .visual-editor input[type="file"]::file-selector-button,
html.theme-dark .app-site.administration-page .visual-editor input[type="file"]::file-selector-button {
  background-color:#060f21 !important;
}

/* PR #94: fondo del selector cerrado para la biblioteca de MinIO. */
/* No altera el menú teletransportado ni la apariencia de sus opciones. */
html.theme-dark .visual-editor .visual-editor__library-field .cf-dropdown__trigger,
html.theme-dark .app-site.administration-page .visual-editor .visual-editor__library-field .cf-dropdown__trigger {
  background-color: #060f21 !important;
}
</style>
