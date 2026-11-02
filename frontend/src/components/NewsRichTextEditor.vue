<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { sanitizeNewsHtml } from '../lib/newsRichText'
import FieldDropdown from './FieldDropdown.vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = ref<HTMLElement | null>(null)
let savedRange: Range | null = null
const tab = ref<'inicio'|'insertar'|'diseno'|'vista'>('inicio')
const selectedFont = ref('')
const selectedStyle = ref('')
const selectedSize = ref('')
const openColors = ref<'foreColor'|'hiliteColor'|null>(null)
const paletteTop = ref(0)
const paletteLeft = ref(0)
const customHex = ref('#c9211e')
const recentColors = ref<string[]>([])
// A compact, consistent palette: all lightness values are valid HSL percentages.
const palette = [
  ...Array.from({ length: 12 }, (_, index) => {
    const component = Math.round(index * 255 / 11).toString(16).padStart(2, '0')
    return '#' + component.repeat(3)
  }),
  ...[28, 42, 56, 70, 84].flatMap(lightness =>
    [0, 24, 42, 58, 100, 145, 178, 205, 230, 270, 305, 335].map(hue => {
      const saturation = 85 / 100
      const luminance = lightness / 100
      const chroma = saturation * Math.min(luminance, 1 - luminance)
      const channel = (offset: number) => {
        const k = (offset + hue / 30) % 12
        const value = luminance - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
        return Math.round(value * 255).toString(16).padStart(2, '0')
      }
      return '#' + channel(0) + channel(8) + channel(4)
    })
  )
]
function applyColor(color:string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color) || !openColors.value) return
  customHex.value=color
  choose(openColors.value,color)
  recentColors.value=[color,...recentColors.value.filter(c=>c!==color)].slice(0,8)
  openColors.value=null
}
function toggleColors(kind:'foreColor'|'hiliteColor', event: MouseEvent) {
  rememberSelection()
  if (openColors.value === kind) { openColors.value = null; return }
  const button = event.currentTarget as HTMLElement
  const toolbar = button.closest('.news-rich-editor__toolbar') as HTMLElement | null
  if (toolbar) {
    const toolbarRect = toolbar.getBoundingClientRect()
    const rect = button.getBoundingClientRect()
    paletteTop.value = rect.bottom - toolbarRect.top + 6
    paletteLeft.value = Math.max(8, Math.min(rect.left - toolbarRect.left, toolbarRect.width - 396))
  }
  openColors.value = kind
}
function dismissPalette(event: PointerEvent) {
  if (!openColors.value) return
  if (event.target instanceof Element && event.target.closest('.news-rich-editor__palette, .news-rich-editor__color-trigger')) return
  openColors.value = null
}
onMounted(() => document.addEventListener('pointerdown', dismissPalette, true))
onUnmounted(() => document.removeEventListener('pointerdown', dismissPalette, true))
watch(tab, () => { openColors.value = null })
const previewHtml = computed(() => sanitizeNewsHtml(props.modelValue || ''))
function setStyle(value: string) { selectedStyle.value=value; if(value) choose('formatBlock',value) }
function setFont(value: string) { selectedFont.value=value; if(value) choose('fontName',value) }
function setSize(value: string) { selectedSize.value=value; sizeText(value) }
const fonts = ["Arial","Arial Black","Arial Narrow","Calibri","Cambria","Candara","Consolas","Constantia","Corbel","Georgia","Verdana","Tahoma","Times New Roman","Courier New","Trebuchet MS","Impact","Palatino Linotype","Book Antiqua","Garamond","Century Gothic","Franklin Gothic Medium","Lucida Sans Unicode","Lucida Console","Segoe UI","Helvetica","Helvetica Neue","Geneva","Optima","Gill Sans","Futura","Baskerville","Didot","Rockwell","Copperplate","Brush Script MT","Comic Sans MS","Monaco","Menlo","Andale Mono","Roboto","Open Sans","Lato","Montserrat","Poppins","Inter","Nunito","Raleway","Oswald","Merriweather","Playfair Display","Source Sans 3","PT Sans","PT Serif","Noto Sans","Noto Serif","Ubuntu","Rubik","Work Sans","DM Sans","Libre Baskerville"]
const sizes = ['12px','14px','16px','18px','20px','24px','28px','32px']
const colors = ['#111827','#374151','#9f1239','#b91c1c','#1d4ed8','#047857','#a16207','#ffffff']
const highlights = ['#fef08a','#bbf7d0','#bfdbfe','#fecdd3','#ffffff']
function rememberSelection() {
  const selection = window.getSelection()
  if (selection?.rangeCount && editor.value?.contains(selection.anchorNode)) savedRange = selection.getRangeAt(0).cloneRange()
}
function restoreSelection() {
  editor.value?.focus()
  if (!savedRange) return
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(savedRange)
}
function choose(command: string, value: string) {
  restoreSelection()
  format(command, value)
}
function sizeText(value: string) {
  if (!sizes.includes(value)) return
  restoreSelection()
  document.execCommand('fontSize', false, '7')
  editor.value?.querySelectorAll('font[size="7"]').forEach(element => {
    element.removeAttribute('size')
    ;(element as HTMLElement).style.fontSize = value
  })
  sync()
  rememberSelection()
}
watch(() => props.modelValue, async value => {
  await nextTick()
  if (editor.value && document.activeElement !== editor.value) {
    const html = sanitizeNewsHtml(value || '')
    if (editor.value.innerHTML !== html) editor.value.innerHTML = html
  }
}, { immediate: true })

function sync() {
  emit('update:modelValue', sanitizeNewsHtml(editor.value?.innerHTML || ''))
}
function format(command: string, value?: string) {
  editor.value?.focus()
  document.execCommand(command, false, value)
  sync()
  rememberSelection()
}
function pastePlain(event: ClipboardEvent) {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') || ''
  document.execCommand('insertText', false, text)
  sync()
}
</script>

<template>
  <div class="news-rich-editor">
    <div class="news-rich-editor__toolbar">
      <nav class="news-rich-editor__tabs" aria-label="Opciones de formato">
        <button v-for="item in (['inicio','insertar','diseno','vista'] as const)" :key="item" type="button"
          :class="{active:tab===item}" :aria-pressed="tab===item" @click="tab=item">{{ item==='inicio'?'Inicio':item==='insertar'?'Insertar':item==='diseno'?'Diseño':'Vista previa' }}</button>
      </nav>
      <template v-if="tab==='inicio'">
        <div class="news-rich-editor__fields">
          <div class="news-rich-editor__option"><span>Tipografía</span><FieldDropdown :model-value="selectedFont" :options="[{value:'',label:'Seleccionar fuente'},...fonts.map(font=>({value:font,label:font}))]" aria-label="Tipografía" @update:model-value="setFont" /></div>
          <div class="news-rich-editor__option"><span>Estilo</span><FieldDropdown :model-value="selectedStyle" :options="[{value:'',label:'Párrafo / Título'},{value:'p',label:'Párrafo normal'},{value:'h1',label:'Título H1'},{value:'h2',label:'Título H2'},{value:'h3',label:'Título H3'}]" aria-label="Estilo de texto" @update:model-value="setStyle" /></div>
        </div>
        <div class="news-rich-editor__actions">
          <div class="news-rich-editor__group"><button type="button" title="Negrita" @click="format('bold')"><b>N</b></button><button type="button" title="Cursiva" @click="format('italic')"><i>C</i></button><button type="button" title="Subrayado" @click="format('underline')"><u>S</u></button><button type="button" title="Tachado" @click="format('strikeThrough')"><s>abc</s></button></div>
          <div class="news-rich-editor__group"><button type="button" title="Alinear izquierda" @click="format('justifyLeft')">☰</button><button type="button" title="Centrar" @click="format('justifyCenter')">≡</button><button type="button" title="Alinear derecha" @click="format('justifyRight')">⇥</button><button type="button" title="Justificar" @click="format('justifyFull')">▤</button></div>
        </div>
      </template>
      <div v-else-if="tab==='insertar'" class="news-rich-editor__group">
        <button type="button" @click="format('insertUnorderedList')">• Lista</button><button type="button" @click="format('insertOrderedList')">1. Lista</button><button type="button" @click="format('formatBlock','blockquote')">Cita</button><button type="button" @click="format('superscript')">x²</button><button type="button" @click="format('subscript')">x₂</button>
      </div>
      <template v-else-if="tab==='diseno'">
        <div class="news-rich-editor__fields">
          <div class="news-rich-editor__option"><span>Tamaño</span><FieldDropdown :model-value="selectedSize" :options="[{value:'',label:'Seleccionar tamaño'},...sizes.map(size=>({value:size,label:size}))]" aria-label="Tamaño" @update:model-value="setSize" /></div>
          <div class="news-rich-editor__option news-rich-editor__color-field"><span>Color del texto</span><button type="button" class="news-rich-editor__color-trigger" :aria-expanded="openColors==='foreColor'" @click="toggleColors('foreColor', $event)"><span class="news-rich-editor__color-dot" :style="{background:customHex}"></span> Elegir color <span class="news-rich-editor__arrow" :class="{open:openColors==='foreColor'}"></span></button></div>
          <div class="news-rich-editor__option news-rich-editor__color-field"><span>Resaltar</span><button type="button" class="news-rich-editor__color-trigger" :aria-expanded="openColors==='hiliteColor'" @click="toggleColors('hiliteColor', $event)">Resaltado <span class="news-rich-editor__arrow" :class="{open:openColors==='hiliteColor'}">⌄</span></button></div>
        </div>
        <div v-if="openColors" class="news-rich-editor__palette" :style="{top: paletteTop + 'px', left: paletteLeft + 'px'}" role="group" :aria-label="openColors==='foreColor'?'Color del texto':'Color de resaltado'">
          <div class="news-rich-editor__palette-heading"><strong>{{openColors==='foreColor'?'Color del texto':'Color de resaltado'}}</strong><button type="button" @click="openColors=null" aria-label="Cerrar paleta">×</button></div>
          <span>Colores predefinidos</span>
          <div class="news-rich-editor__swatches"><button v-for="color in palette" :key="color" type="button" :title="color" :aria-label="'Seleccionar '+color" :style="{backgroundColor:color}" @click="applyColor(color)"></button></div>
          <span>Recientes</span>
          <div class="news-rich-editor__swatches news-rich-editor__recent"><button v-for="color in recentColors" :key="color" type="button" :title="color" :style="{backgroundColor:color}" @click="applyColor(color)"></button></div>
          <label class="news-rich-editor__custom"><span>Color personalizado (HEX)</span><input v-model="customHex" type="text" maxlength="7" placeholder="#c9211e" /><input v-model="customHex" type="color" aria-label="Selector de color personalizado" /><button type="button" :disabled="!/^#[0-9a-fA-F]{6}$/.test(customHex)" @click="applyColor(customHex)">Aplicar</button></label>
        </div>
        <div class="news-rich-editor__group"><button type="button" @click="format('indent')">Aumentar sangría</button><button type="button" @click="format('outdent')">Reducir sangría</button><button type="button" @click="format('removeFormat')">Quitar formato</button><button type="button" @click="format('undo')">↶ Deshacer</button><button type="button" @click="format('redo')">↷ Rehacer</button></div>
      </template>
      <p v-else class="news-rich-editor__hint">Vista previa de la noticia con su formato.</p>
    </div>
    <div v-show="tab!=='vista'" ref="editor" class="news-rich-editor__content" contenteditable="true" role="textbox"
      aria-label="Contenido completo de la noticia" aria-multiline="true" spellcheck="true"
      data-placeholder="Escribí el artículo y usá la barra para dar formato a los títulos y párrafos."
      @input="sync" @keyup="rememberSelection" @mouseup="rememberSelection" @blur="sync" @paste="pastePlain"></div>
    <div v-if="tab==='vista'" class="news-rich-editor__content" v-html="previewHtml"></div>
    <small>Seleccioná el texto y aplicá el formato. Los cambios se mostrarán en la noticia publicada.</small>
  </div>
</template>

<style scoped>
.news-rich-editor{width:100%;min-width:0;border:1px solid var(--admin-border,#cfd3dd);border-radius:12px;overflow:hidden;background:var(--admin-input,#fff);color:var(--admin-text,#171923);font-weight:400}
.news-rich-editor__toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:9px;border-bottom:1px solid var(--admin-border,#cfd3dd);background:rgba(125,125,125,.06)}
.news-rich-editor__toolbar button{width:auto;min-height:34px;padding:5px 10px;border:1px solid var(--admin-border,#cfd3dd);border-radius:7px;background:var(--admin-input,#fff);color:inherit;font:inherit;cursor:pointer}
.news-rich-editor__toolbar button:hover{border-color:#ad0922}
.news-rich-editor__option{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700}
.news-rich-editor__option select{max-width:148px;border-radius:7px;border:1px solid var(--admin-border,#cfd3dd);padding:6px;background:var(--admin-input,#fff);color:inherit;font:inherit}
.news-rich-editor__content{min-height:240px;max-height:550px;overflow:auto;padding:15px;outline:none;font-size:15px;line-height:1.7;white-space:normal}
.news-rich-editor__content:empty:before{content:attr(data-placeholder);color:var(--admin-muted,#737b89)}
.news-rich-editor__content :deep(h1){font-size:1.8em;font-weight:750;margin:1em 0 .5em}
.news-rich-editor__content :deep(h2){font-size:1.45em;font-weight:700;margin:1em 0 .5em}
.news-rich-editor__content :deep(h3){font-size:1.2em;font-weight:700;margin:.9em 0 .4em}
.news-rich-editor__content :deep(p){margin:.6em 0}
.news-rich-editor__content :deep(ul),.news-rich-editor__content :deep(ol){padding-left:1.5em;margin:.8em 0}
.news-rich-editor__content :deep(ul){list-style:disc}
.news-rich-editor__content :deep(ol){list-style:decimal}
.news-rich-editor small{display:block;padding:8px 12px;color:var(--admin-muted,#737b89);font-size:12px}
.news-rich-editor__toolbar{position:relative;display:grid;gap:14px;padding:14px;border-bottom:1px solid var(--admin-border,#cfd3dd);background:var(--admin-input,#fff)}
.news-rich-editor__tabs{display:flex;gap:7px;flex-wrap:wrap;border-bottom:1px solid var(--admin-border,#cfd3dd);padding-bottom:10px}
.news-rich-editor__tabs button{border:0;background:transparent;color:var(--admin-muted,#64748b);padding:9px 14px;border-radius:9px;cursor:pointer}
.news-rich-editor__tabs button.active{background:rgba(130,145,165,.16);color:var(--admin-text,#171923);font-weight:750}
.news-rich-editor__fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.news-rich-editor__option{display:grid;gap:7px;min-width:0;font-size:12px;color:var(--admin-muted,#64748b)}
.news-rich-editor__option select{width:100%;max-width:none;min-height:46px;min-width:0;padding:9px 12px;border:1px solid var(--admin-border,#cfd3dd);border-radius:10px;background:rgba(130,145,165,.12);color:var(--admin-text,#171923);font-size:14px}
.news-rich-editor__actions{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.news-rich-editor__group{display:flex;gap:7px;flex-wrap:wrap}
.news-rich-editor__group button{min-height:40px;width:auto;padding:8px 12px;border:1px solid var(--admin-border,#cfd3dd);border-radius:9px;background:rgba(130,145,165,.12);color:var(--admin-text,#171923);font:inherit;cursor:pointer}
.news-rich-editor__group button:hover{border-color:#af173b}
.news-rich-editor__hint{color:var(--admin-muted,#64748b);font-size:13px}
@media(max-width:650px){.news-rich-editor__fields{grid-template-columns:1fr}.news-rich-editor__actions{justify-content:flex-start}.news-rich-editor__toolbar{padding:10px}}
.news-rich-editor__option :deep(.cf-dropdown){width:100%;min-width:0}
.news-rich-editor__color-trigger{display:flex;align-items:center;gap:9px;width:100%;min-height:46px;padding:10px 14px;border:1px solid var(--admin-border,#cfd3dd);border-radius:12px;background:var(--admin-input,#fff);color:var(--admin-text,#171923);font-size:14px;font-weight:400;text-align:left;box-shadow:none;cursor:pointer}
.news-rich-editor__arrow{margin-left:auto;display:block;width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .2s ease}
.news-rich-editor__arrow.open{transform:rotate(225deg)}
.news-rich-editor__color-dot{width:19px;height:19px;border-radius:4px;border:1px solid #888}
.news-rich-editor__palette{display:grid;gap:9px;padding:12px;border-radius:12px;border:1px solid var(--admin-border,#cfd3dd);background:var(--admin-input,#fff);color:var(--admin-text,#171923);box-shadow:0 16px 32px #0005;position:absolute;width:min(380px,calc(100% - 24px));max-height:min(370px,60vh);overflow-y:auto;z-index:30;box-sizing:border-box}
.news-rich-editor__palette-heading{display:flex;align-items:center;justify-content:space-between}
.news-rich-editor__palette-heading button{background:transparent;border:0;color:inherit;font-size:23px;cursor:pointer}
.news-rich-editor__swatches{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}
.news-rich-editor__swatches button{min-width:0;width:100%;height:22px;aspect-ratio:auto;border:1px solid #858b99;border-radius:4px;cursor:pointer}
.news-rich-editor__swatches button:hover,.news-rich-editor__swatches button:focus-visible{outline:2px solid #b61537;outline-offset:1px}
.news-rich-editor__recent{grid-template-columns:repeat(8,26px)}
.news-rich-editor__custom{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.news-rich-editor__custom span{width:100%;font-weight:600}
.news-rich-editor__custom input[type=text]{min-width:110px;width:130px;padding:9px;border:1px solid var(--admin-border,#cfd3dd);border-radius:8px;background:var(--admin-input,#fff);color:inherit}
.news-rich-editor__custom input[type=color]{width:43px;height:39px;padding:2px;border:1px solid var(--admin-border,#cfd3dd);border-radius:8px;background:transparent;cursor:pointer}
.news-rich-editor__custom button{padding:9px 14px;border-radius:8px;border:0;background:#ab0b2c;color:white;cursor:pointer}
.news-rich-editor__custom button:disabled{opacity:.5;cursor:not-allowed}
@media(max-width:550px){.news-rich-editor__palette{width:min(380px,calc(100% - 12px))}.news-rich-editor__swatches{grid-template-columns:repeat(12,minmax(0,1fr))}.news-rich-editor__swatches button{height:18px}}
html.theme-dark .content-manager .news-rich-editor__color-trigger{background:#121a30;border-color:#3b465f;color:#fff}
.news-rich-editor__color-trigger:hover,.news-rich-editor__color-trigger:focus-visible{border-color:#b10d30;outline-offset:2px}
.content-manager .news-rich-editor__color-trigger{min-height:46px;background:var(--admin-input,#f7f9fd);border-color:var(--admin-border,#cfd3dd);border-radius:12px;color:var(--admin-text,#101b32);font-size:14px;font-weight:400}
html.theme-dark .content-manager .news-rich-editor__color-trigger{background:#121a30;border-color:#3b465f;color:#fff}
.news-rich-editor__color-trigger .news-rich-editor__arrow{flex:none}

@media(prefers-reduced-motion:reduce){.news-rich-editor__arrow{transition:none}}
</style>
