<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { ItineraryLocation } from '../lib/itineraryLocations'

const props = withDefaults(defineProps<{
  modelValue: string
  options: ItineraryLocation[]
  label: string
  placeholder?: string
  loading?: boolean
  error?: string
  required?: boolean
}>(), { placeholder: '', loading: false, error: '', required: false })
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const uid = useId()
const controlId = 'itinerary-location-' + uid
const listId = controlId + '-options'
const open = ref(false)
const positioned = ref(false)
const query = ref('')
const highlighted = ref(0)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
let trackingFrame = 0
let lastGeometry = ''
let placement: 'above' | 'below' | null = null
let clippingAncestors: HTMLElement[] = []

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const matches = computed(() => {
  const search = normalize(query.value)
  return !search ? props.options : props.options.filter(option =>
    normalize(option.displayName).includes(search) || normalize(option.code || '').includes(search))
})
watch(() => props.options, () => { highlighted.value = 0 })

function findClippingAncestors() {
  clippingAncestors = []
  for (let parent = trigger.value?.parentElement; parent; parent = parent.parentElement) {
    const css = window.getComputedStyle(parent)
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX + ' ' + css.overflowY)) clippingAncestors.push(parent)
  }
}
function positionMenu() {
  const rect = trigger.value?.getBoundingClientRect()
  const list = menu.value
  if (!rect || !list) return
  const viewport = window.visualViewport
  const topEdge = viewport?.offsetTop ?? 0
  const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight)
  const leftEdge = viewport?.offsetLeft ?? 0
  const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth)
  if (rect.bottom <= topEdge || rect.top >= bottomEdge || rect.right <= leftEdge || rect.left >= rightEdge ||
    clippingAncestors.some(parent => {
      const bounds = parent.getBoundingClientRect()
      return rect.bottom <= bounds.top || rect.top >= bounds.bottom ||
        rect.right <= bounds.left || rect.left >= bounds.right
    })) { closeMenu(); return }

  const geometry = [rect.top, rect.bottom, rect.left, rect.width, topEdge, bottomEdge,
    leftEdge, rightEdge, list.scrollHeight].join('|')
  if (geometry === lastGeometry) return
  lastGeometry = geometry
  const gap = 6
  const below = Math.max(0, bottomEdge - rect.bottom - gap - 4)
  const above = Math.max(0, rect.top - topEdge - gap - 4)
  const width = Math.min(Math.max(rect.width, 1), rightEdge - leftEdge - 16)
  list.style.width = width + 'px'
  list.style.maxHeight = '300px'
  const naturalHeight = list.scrollHeight + list.offsetHeight - list.clientHeight
  if (!placement) placement = below < Math.min(300, naturalHeight) && above > below ? 'above' : 'below'
  const available = placement === 'above' ? above : below
  if (available < 44) { closeMenu(); return }
  list.style.maxHeight = Math.min(300, available) + 'px'
  const renderedHeight = list.getBoundingClientRect().height
  const desiredTop = placement === 'above' ? rect.top - renderedHeight - gap : rect.bottom + gap
  list.style.top = Math.max(topEdge + 4, Math.min(desiredTop, bottomEdge - renderedHeight - 4)) + 'px'
  list.style.left = Math.max(leftEdge + 8, Math.min(rect.left, rightEdge - width - 8)) + 'px'
  positioned.value = true
}
function trackMenu() {
  trackingFrame = 0
  if (!open.value) return
  positionMenu()
  if (open.value) trackingFrame = requestAnimationFrame(trackMenu)
}
function removeListeners() {
  document.removeEventListener('pointerdown', outsidePointer, true)
  window.removeEventListener('resize', positionMenu)
  window.removeEventListener('scroll', positionMenu, true)
  window.visualViewport?.removeEventListener('resize', positionMenu)
  window.visualViewport?.removeEventListener('scroll', positionMenu)
  if (trackingFrame) cancelAnimationFrame(trackingFrame)
  trackingFrame = 0
}
function closeMenu() {
  open.value = false
  positioned.value = false
  placement = null
  lastGeometry = ''
  clippingAncestors = []
  query.value = ''
}
function openMenu() {
  query.value = ''
  highlighted.value = 0
  positioned.value = false
  open.value = true
  void nextTick(() => {
    if (!open.value) return
    positionMenu()
    searchInput.value?.focus({ preventScroll: true })
  })
}
function toggleMenu() { if (open.value) closeMenu(); else openMenu() }
function choose(value: string) {
  emit('update:modelValue', value)
  closeMenu()
  trigger.value?.focus({ preventScroll: true })
}
function outsidePointer(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || trigger.value?.contains(target) || menu.value?.contains(target)) return
  closeMenu()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
    trigger.value?.focus({ preventScroll: true })
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = Math.max(0, Math.min(matches.value.length - 1,
      highlighted.value + (event.key === 'ArrowDown' ? 1 : -1)))
    menu.value?.querySelectorAll<HTMLButtonElement>('[role="option"]')[highlighted.value]?.scrollIntoView({ block: 'nearest' })
  } else if (event.key === 'Enter' && matches.value.length) {
    event.preventDefault()
    choose(matches.value[highlighted.value]?.displayName ?? matches.value[0].displayName)
  } else if (event.key === 'Tab') closeMenu()
}
watch(open, value => {
  if (value) {
    findClippingAncestors()
    document.addEventListener('pointerdown', outsidePointer, true)
    window.addEventListener('resize', positionMenu)
    window.addEventListener('scroll', positionMenu, true)
    window.visualViewport?.addEventListener('resize', positionMenu)
    window.visualViewport?.addEventListener('scroll', positionMenu)
    if (!trackingFrame) trackingFrame = requestAnimationFrame(trackMenu)
  } else removeListeners()
})
onBeforeUnmount(removeListeners)
</script>

<template>
  <div class="itinerary-location-picker">
    <label :for="controlId">{{ label }}</label>
    <div class="cf-dropdown">
      <button :id="controlId" ref="trigger" type="button" class="cf-dropdown__trigger"
        role="combobox" aria-haspopup="listbox" :aria-label="label"
        :aria-controls="listId" :aria-expanded="open"
        @click="toggleMenu" @keydown.down.prevent="openMenu" @keydown.up.prevent="openMenu"
        @keydown.esc.prevent="closeMenu">
        <span class="cf-dropdown__value" :class="{ 'itinerary-location-picker__placeholder': !modelValue }">{{ modelValue || placeholder }}</span>
        <span class="cf-dropdown__chevron" :class="{ 'cf-dropdown__chevron--open': open }" aria-hidden="true"></span>
      </button>
    </div>
    <Teleport to="body">
      <div v-if="open" :id="listId" ref="menu" role="listbox"
        class="cf-dropdown__menu itinerary-location-picker__menu"
        :aria-label="label" :style="{ visibility: positioned ? 'visible' : 'hidden' }"
        @keydown="onKeydown">
        <input ref="searchInput" v-model="query" class="itinerary-location-picker__search"
          type="search" autocomplete="off" :aria-label="label"
          :placeholder="placeholder" @input="highlighted = 0" />
        <span v-if="loading" class="itinerary-location-picker__message">Cargando ubicaciones…</span>
        <span v-else-if="error" class="itinerary-location-picker__message">{{ error }}</span>
        <span v-else-if="!matches.length" class="itinerary-location-picker__message">No hay ubicaciones disponibles.</span>
        <template v-if="!loading && !error">
          <button v-for="(item, index) in matches" :key="item.id" type="button" role="option"
            :aria-selected="item.displayName === modelValue" tabindex="-1"
            :class="{ 'cf-dropdown__option--selected': item.displayName === modelValue, 'itinerary-location-picker__highlighted': highlighted === index && !!query }"
            @click="choose(item.displayName)">{{ item.displayName }}</button>
        </template>
        <button v-if="modelValue && !required" type="button" class="itinerary-location-picker__clear"
          @click="choose('')">Limpiar selección</button>
      </div>
    </Teleport>
  </div>
</template>

<style>
.itinerary-location-picker { display:flex; flex-direction:column; gap:8px; min-width:0; }
.itinerary-location-picker > label { color:inherit; font-size:13px; font-weight:700; }
.itinerary-location-picker__placeholder { opacity:.66; }
.itinerary-location-picker__menu { padding:8px; }
.itinerary-location-picker__menu .itinerary-location-picker__search {
  flex:none; box-sizing:border-box; width:100%; min-height:44px;
  border:1px solid #cfd2dc; border-radius:11px; padding:10px 12px;
  background:#fff; color:#242630; font:inherit; font-size:14px;
}
.itinerary-location-picker__menu .itinerary-location-picker__search:focus-visible { outline:2px solid #b20c2a; outline-offset:-2px; }
.itinerary-location-picker__menu .itinerary-location-picker__message { padding:12px; font-size:13px; color:inherit; }
.itinerary-location-picker__menu > .itinerary-location-picker__clear { border-top:1px solid #8884; border-radius:0; }
.itinerary-location-picker__menu > button.itinerary-location-picker__highlighted { background:#f7e8eb; color:#a80e18; }
html.theme-dark .itinerary-location-picker__menu .itinerary-location-picker__search {
  background:#121a30; color:#fff; border-color:#52505b;
}
html.theme-dark .itinerary-location-picker__menu > button.itinerary-location-picker__highlighted {
  background:#30262d; color:#ff806f;
}
.app-site.itinerary-page .itinerary-location-picker .cf-dropdown__trigger { min-height:42px; }
.content-manager .itinerary-location-picker .cf-dropdown__trigger {
  background:var(--admin-input,#f7f9fd);
  color:var(--admin-text,#101b32);
  border-color:var(--admin-border,#cfd3dd);
  min-height:46px;
}
html.theme-dark .content-manager .itinerary-location-picker .cf-dropdown__trigger {
  background:#121a30; color:#fff; border-color:#3b465f;
}
@media(max-width:650px) {
  .app-site.itinerary-page .itinerary-location-picker .cf-dropdown__trigger { min-height:46px; font-size:16px; }
  .itinerary-location-picker__menu .itinerary-location-picker__search { font-size:16px; }
}
</style>
