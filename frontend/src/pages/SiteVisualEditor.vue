<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { authState } from '../services/auth'
import i18n from '../i18n'
import { siteSlotCatalog, type EditableSiteSlot, type SiteSlotDefinition } from '../siteCms'
import type { ManagedMedia } from '../adminContent'

const page = ref('home')
const query = ref('')
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
const isLiveAdmin = computed(() => authState.user?.role === 'administrador' && !authState.previewRole)
const pages = [...new Map(siteSlotCatalog.map(slot => [slot.page, { id: slot.page, label: slot.pageLabel }])).values()]
const visible = computed(() => siteSlotCatalog.filter(slot => slot.page === page.value &&
  (slot.label + slot.help).toLowerCase().includes(query.value.toLowerCase())))
const selected = computed<SiteSlotDefinition>(() => siteSlotCatalog.find(x => x.key === currentKey.value) ?? siteSlotCatalog[0])
const row = computed(() => rows.value.find(x => x.key === selected.value.key))
const selectableMedia = computed(() => media.value.filter(x => x.kind === 'Imagen' || (selected.value.key !== 'shared.logo.media' && x.kind === 'Video')))
const selectedMedia = computed(() => media.value.find(x => x.id === mediaId.value))
const publishedMedia = computed(() => media.value.find(x => x.id === row.value?.publishedMediaId))
const draftSrc = computed(() => selectedMedia.value ? previewSrc(selectedMedia.value) : selected.value.type === 'media' ? selected.value.fallback : '')
const draftIsVideo = computed(() => selectedMedia.value?.kind.startsWith('Video') ?? false)
const publishedSrc = computed(() => publishedMedia.value ? previewSrc(publishedMedia.value) : selected.value.fallback)
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
}
function switchPage(next: string) {
  page.value = next
  query.value = ''
  const first = siteSlotCatalog.find(x => x.page === next)
  if (first) select(first)
}
async function load() {
  loading.value = true
  try {
    if (!isLiveAdmin.value) { error.value = 'La edición visual requiere una cuenta administradora real.'; return }
    const [sites, library, status] = await Promise.all([
      fetch('/api/admin/content/site', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/admin/content/media', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/admin/content/media/storage-status', { credentials: 'same-origin', cache: 'no-store' })
    ])
    if (!sites.ok || !library.ok || !status.ok) throw new Error('No se pudieron cargar los datos del editor visual.')
    rows.value = await sites.json() as EditableSiteSlot[]
    media.value = await library.json() as ManagedMedia[]
    storageEnabled.value = Boolean((await status.json() as {enabled:boolean}).enabled)
    select(selected.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el editor.'
  } finally { loading.value = false }
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
onMounted(load)
</script>

<template>
  <section class="visual-editor" aria-label="Editor visual del sitio">
    <header class="visual-editor__intro">
      <div><p class="manager-eyebrow">CONTENIDO DEL SITIO</p><h2>Editor visual</h2>
        <p>Elegí una página y una ubicación. Editá los textos en español e inglés, o asigná una imagen o video desde MinIO.</p>
      </div>
      <button type="button" class="visual-editor__button" @click="load" :disabled="loading">Actualizar biblioteca</button>
    </header>
    <p v-if="!isLiveAdmin" role="status" class="visual-editor__warning">El modo previsualización no guarda cambios en la web pública.</p>
    <p v-if="error" role="alert" class="visual-editor__error">{{ error }}</p>
    <p v-if="notice" role="status" class="visual-editor__success">{{ notice }}</p>
    <div v-if="loading" role="status">Cargando secciones…</div>
    <template v-else>
      <div class="visual-editor__pages" role="group" aria-label="Páginas">
        <button v-for="item in pages" :key="item.id" type="button" :class="{ active: item.id === page }" @click="switchPage(item.id)">{{ item.label }}</button>
      </div>
      <div class="visual-editor__columns">
        <aside class="visual-editor__locations">
          <label>Buscar ubicación <input v-model="query" placeholder="Ej. Portada, servicio aéreo…" /></label>
          <div v-if="!visible.length">No hay ubicaciones con ese nombre.</div>
          <button v-for="slot in visible" :key="slot.key" type="button" :class="{ active: slot.key === selected.key }" @click="select(slot)">
            <span class="visual-editor__slot-type">{{ slot.type === 'media' ? 'Imagen / Video' : 'Texto' }}</span>
            <strong>{{ slot.label }}</strong><small>{{ slot.help }}</small>
            <span v-if="rows.some(x => x.key === slot.key && (x.publishedMediaId || x.publishedEs || x.publishedEn))" class="visual-editor__published">Personalizada</span>
          </button>
        </aside>
        <div class="visual-editor__details">
          <p class="manager-eyebrow">{{ selected.pageLabel }} / {{ selected.label }}</p>
          <h3>{{ selected.label }}</h3>
          <p class="visual-editor__description">{{ selected.help }}</p>
          <template v-if="selected.type === 'text'">
            <p class="visual-editor__hint">Texto original: {{ defaultCopy }}</p>
            <label>Texto en español <textarea v-model="textEs" maxlength="1600" rows="4" :placeholder="defaultCopy" /></label>
            <label>Texto en inglés <textarea v-model="textEn" maxlength="1600" rows="4" placeholder="Dejalo vacío para usar el texto inglés original" /></label>
            <p class="visual-editor__hint">Si un idioma queda vacío, se mostrará el texto original traducido de la web.</p>
            <div class="visual-editor__text-preview"><strong>Vista previa (ES)</strong><p>{{ textEs || defaultCopy }}</p></div>
          </template>
          <template v-else>
            <div class="visual-editor__preview-grid">
              <div><strong>Imagen/video publicado</strong><video v-if="publishedMedia?.kind.startsWith('Video')" :src="publishedSrc" controls muted playsinline preload="metadata" /><img v-else :src="publishedSrc" :alt="selected.label" /></div>
              <div><strong>Borrador de esta ubicación</strong><video v-if="draftIsVideo" :src="draftSrc" controls muted playsinline preload="metadata" /><img v-else :src="draftSrc" :alt="selected.label" /></div>
            </div>
            <label>Archivo de la biblioteca de MinIO
              <select v-model="mediaId">
                <option value="">Imagen original de esta ubicación</option>
                <option v-for="file in selectableMedia" :key="file.id" :value="file.id">{{ file.name }} ({{ file.kind }})</option>
              </select>
            </label>
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

<style scoped>
.visual-editor{width:100%;display:grid;gap:16px;padding:22px;border:1px solid #e8e1e3;border-radius:20px;background:#fff;color:#25252a}
.visual-editor__intro{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}
.visual-editor__intro h2{margin:4px 0 9px;font-size:clamp(26px,3vw,36px)}
.visual-editor__intro p{max-width:650px;color:#687078;line-height:1.6}
.visual-editor__pages{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #eee;padding-bottom:14px}
.visual-editor__pages button,.visual-editor__button{padding:11px 15px;border:1px solid #ddd;border-radius:11px;cursor:pointer;background:white;color:#292a30;font-weight:700}
.visual-editor__pages button.active{background:#a60b29;color:#fff;border-color:#a60b29}
.visual-editor__columns{display:grid;grid-template-columns:minmax(235px,32%) minmax(0,1fr);gap:20px;align-items:start}
.visual-editor__locations{display:grid;gap:9px;max-height:760px;overflow:auto}
.visual-editor__locations label,.visual-editor__details label{display:grid;gap:7px;font-weight:750;font-size:13px}
.visual-editor__locations input,.visual-editor__details textarea,.visual-editor__details input,.visual-editor__details select{min-width:0;width:100%;padding:11px;border-radius:9px;border:1px solid #cbd1d8;font:inherit;background:white;color:#202126}
.visual-editor__locations button{display:grid;gap:4px;text-align:left;padding:12px;border:1px solid #e1e4e9;border-radius:12px;background:#fff;color:#202126;cursor:pointer}
.visual-editor__locations button.active{border-color:#a70c2b;background:#fff5f7}
.visual-editor__locations small,.visual-editor__description,.visual-editor__hint{color:#657079;font-size:12px;line-height:1.5}
.visual-editor__slot-type{font-size:10px;color:#9c0b28;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
.visual-editor__published{font-size:11px;color:#276347}
.visual-editor__details{display:grid;gap:14px;min-width:0}
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
.visual-editor__warning,.visual-editor__error{background:#fff4eb;color:#91271f}
.visual-editor__success{background:#eaf7ee;color:#24613c}
@media(max-width:760px){.visual-editor{padding:14px}.visual-editor__intro{flex-direction:column}.visual-editor__columns{grid-template-columns:1fr}.visual-editor__locations{max-height:300px}.visual-editor__preview-grid{grid-template-columns:1fr 1fr}}
@media(max-width:460px){.visual-editor__preview-grid{grid-template-columns:1fr}}
</style>
