<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { sanitizeNewsHtml } from '../lib/newsRichText'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = ref<HTMLElement | null>(null)
let savedRange: Range | null = null
const tab = ref<'inicio'|'insertar'|'diseno'|'vista'>('inicio')
const previewHtml = computed(() => sanitizeNewsHtml(props.modelValue || ''))
function setStyle(event: Event) { const value = (event.target as HTMLSelectElement).value; if (value) choose('formatBlock', value) }
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
          <label class="news-rich-editor__option">Tipografía <select aria-label="Tipografía" @change="choose('fontName', ($event.target as HTMLSelectElement).value)"><option value="">Seleccionar fuente</option><option v-for="font in fonts" :key="font" :value="font" :style="{fontFamily:font}">{{font}}</option></select></label>
          <label class="news-rich-editor__option">Estilo <select aria-label="Estilo de texto" @change="setStyle"><option value="">Párrafo / Título</option><option value="p">Párrafo normal</option><option value="h1">Título H1</option><option value="h2">Título H2</option><option value="h3">Título H3</option></select></label>
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
          <label class="news-rich-editor__option">Tamaño <select aria-label="Tamaño" @change="sizeText(($event.target as HTMLSelectElement).value)"><option value="">Seleccionar</option><option v-for="size in sizes" :key="size" :value="size">{{size}}</option></select></label>
          <label class="news-rich-editor__option">Color del texto <select aria-label="Color" @change="choose('foreColor',($event.target as HTMLSelectElement).value)"><option value="">Seleccionar</option><option v-for="color in colors" :key="color" :value="color">{{color}}</option></select></label>
          <label class="news-rich-editor__option">Resaltar <select aria-label="Resaltar" @change="choose('hiliteColor',($event.target as HTMLSelectElement).value)"><option value="">Seleccionar</option><option v-for="color in highlights" :key="color" :value="color">{{color}}</option></select></label>
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
.news-rich-editor__toolbar{display:grid;gap:14px;padding:14px;border-bottom:1px solid var(--admin-border,#cfd3dd);background:var(--admin-input,#fff)}
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
</style>
