<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { sanitizeNewsHtml } from '../lib/newsRichText'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const editor = ref<HTMLElement | null>(null)
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
    <div class="news-rich-editor__toolbar" role="toolbar" aria-label="Formato del artículo" @mousedown.prevent>
      <button type="button" title="Párrafo" @click="format('formatBlock', 'p')">Párrafo</button>
      <button type="button" title="Título principal" @click="format('formatBlock', 'h1')">H1</button>
      <button type="button" title="Subtítulo" @click="format('formatBlock', 'h2')">H2</button>
      <button type="button" title="Título menor" @click="format('formatBlock', 'h3')">H3</button>
      <button type="button" title="Negrita" aria-label="Negrita" @click="format('bold')"><strong>N</strong></button>
      <button type="button" title="Cursiva" aria-label="Cursiva" @click="format('italic')"><em>C</em></button>
      <button type="button" title="Subrayado" aria-label="Subrayado" @click="format('underline')"><u>S</u></button>
      <button type="button" title="Lista con viñetas" @click="format('insertUnorderedList')">• Lista</button>
      <button type="button" title="Lista numerada" @click="format('insertOrderedList')">1. Lista</button>
    </div>
    <div ref="editor" class="news-rich-editor__content" contenteditable="true" role="textbox"
      aria-label="Contenido completo de la noticia" aria-multiline="true" spellcheck="true"
      data-placeholder="Escribí el artículo y usá la barra para dar formato a los títulos y párrafos."
      @input="sync" @blur="sync" @paste="pastePlain"></div>
    <small>Seleccioná el texto y aplicá el formato. Los cambios se mostrarán en la noticia publicada.</small>
  </div>
</template>

<style scoped>
.news-rich-editor{width:100%;min-width:0;border:1px solid var(--admin-border,#cfd3dd);border-radius:12px;overflow:hidden;background:var(--admin-input,#fff);color:var(--admin-text,#171923);font-weight:400}
.news-rich-editor__toolbar{display:flex;flex-wrap:wrap;gap:5px;padding:9px;border-bottom:1px solid var(--admin-border,#cfd3dd);background:rgba(125,125,125,.06)}
.news-rich-editor__toolbar button{width:auto;min-height:34px;padding:5px 10px;border:1px solid var(--admin-border,#cfd3dd);border-radius:7px;background:var(--admin-input,#fff);color:inherit;font:inherit;cursor:pointer}
.news-rich-editor__toolbar button:hover{border-color:#ad0922}
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
</style>
