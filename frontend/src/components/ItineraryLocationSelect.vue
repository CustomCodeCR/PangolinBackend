<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import type { ItineraryLocationChoice } from '../lib/itineraryLocations'

const props = withDefaults(defineProps<{
  modelValue: string
  options: ItineraryLocationChoice[]
  'aria-label': string
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  blocked?: boolean
}>(), { placeholder: 'Buscar ciudad o país', disabled: false, loading: false, blocked: false })
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'needs-transport': [] }>()
const uid = useId()
const listId = uid + '-locations'
const input = ref<HTMLInputElement | null>(null)
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const query = ref(props.modelValue)
const opened = ref(false)
const positioned = ref(false)
const activeIndex = ref(0)
const menuStyle = ref<Record<string, string>>({})
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()

const filtered = computed(() => {
  const term = normalize(query.value)
  return term ? props.options.filter(option => normalize(option.label).includes(term)) : props.options
})
const activeId = computed(() => opened.value && filtered.value.length ? listId + '-' + activeIndex.value : undefined)

// Existing records are shown unchanged, even when their old spelling is absent
// from the new catalogue. Only a choice from the catalogue can replace them.
watch(() => props.modelValue, value => {
  if (!opened.value) query.value = value
})
watch(() => props.disabled, disabled => { if (disabled) closeMenu() })
watch(filtered, () => { activeIndex.value = 0; if (opened.value) void nextTick(positionMenu) })

function positionMenu() {
  const rect = root.value?.getBoundingClientRect()
  const element = menu.value
  if (!rect || !element) return
  const viewport = window.visualViewport
  const topEdge = viewport?.offsetTop ?? 0
  const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight)
  const leftEdge = viewport?.offsetLeft ?? 0
  const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth)
  if (rect.bottom < topEdge || rect.top > bottomEdge || rect.right < leftEdge || rect.left > rightEdge) {
    closeMenu()
    return
  }
  const gap = 6
  const below = bottomEdge - rect.bottom - gap - 4
  const above = rect.top - topEdge - gap - 4
  const height = Math.min(290, Math.max(48, element.scrollHeight))
  const placeAbove = below < Math.min(230, height) && above > below
  const maxHeight = Math.max(48, Math.min(290, placeAbove ? above : below))
  const width = Math.max(1, Math.min(Math.max(rect.width, 240), rightEdge - leftEdge - 16))
  const left = Math.max(leftEdge + 8, Math.min(rect.left, rightEdge - width - 8))
  const top = placeAbove ? Math.max(topEdge + 4, rect.top - Math.min(height, maxHeight) - gap) : rect.bottom + gap
  menuStyle.value = {
    top: top + 'px', left: left + 'px', width: width + 'px',
    maxHeight: maxHeight + 'px', visibility: 'visible'
  }
  positioned.value = true
}
function openMenu() {
  if (props.blocked) { emit('needs-transport'); return }
  if (props.disabled || props.loading) return
  opened.value = true
  positioned.value = false
  activeIndex.value = 0
  void nextTick(positionMenu)
}
function closeMenu() { opened.value = false; positioned.value = false }
function onInput(event: Event) {
  if (props.blocked) return
  query.value = (event.target as HTMLInputElement).value
  // Never submit arbitrary typed text as a location.
  emit('update:modelValue', '')
  openMenu()
}
function choose(option: ItineraryLocationChoice) {
  query.value = option.value
  emit('update:modelValue', option.value)
  closeMenu()
  input.value?.focus({ preventScroll: true })
}
function onBlur() {
  // A typed search is just a search, not a new free-text location.
  query.value = props.modelValue
  closeMenu()
}
function clearSelection() {
  query.value = ''
  emit('update:modelValue', '')
  closeMenu()
}
function onBlockedClick() {
  if (props.blocked) emit('needs-transport')
}
function toggle() {
  if (props.blocked) { emit('needs-transport'); return }
  if (props.modelValue) { clearSelection(); return }
  if (opened.value) { query.value = props.modelValue; closeMenu(); return }
  query.value = ''
  input.value?.focus({ preventScroll: true })
  openMenu()
}
function onKeydown(event: KeyboardEvent) {
  if (props.blocked) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); emit('needs-transport') }; return }
  if (event.key === 'Escape') {
    if (opened.value) { event.preventDefault(); onBlur() }
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!opened.value) { openMenu(); return }
    const size = filtered.value.length
    if (size) activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + size) % size
    void nextTick(() => menu.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }))
  } else if (event.key === 'Enter' && opened.value && filtered.value.length) {
    event.preventDefault()
    choose(filtered.value[activeIndex.value]!)
  } else if (event.key === 'Tab') {
    onBlur()
  }
}
function outside(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !root.value?.contains(target) && !menu.value?.contains(target)) onBlur()
}
function reposition() { if (opened.value) positionMenu() }
watch(opened, isOpen => {
  if (isOpen) {
    document.addEventListener('pointerdown', outside, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
  } else {
    document.removeEventListener('pointerdown', outside, true)
    window.removeEventListener('resize', reposition)
    window.removeEventListener('scroll', reposition, true)
    window.visualViewport?.removeEventListener('resize', reposition)
    window.visualViewport?.removeEventListener('scroll', reposition)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', outside, true)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
  window.visualViewport?.removeEventListener('resize', reposition)
  window.visualViewport?.removeEventListener('scroll', reposition)
})
</script>

<template>
  <div ref="root" class="itinerary-location-select" :class="{ 'is-blocked': blocked }">
    <input ref="input" class="itinerary-location-select__input" type="text"
      :value="query" :disabled="disabled || loading" :readonly="blocked"
      :aria-disabled="blocked || disabled || loading"
      :placeholder="loading ? 'Cargando ubicaciones…' : placeholder"
      role="combobox" autocomplete="off" aria-autocomplete="list" :aria-label="props['aria-label']"
      :aria-controls="listId" :aria-expanded="opened" :aria-activedescendant="activeId"
      @focus="openMenu" @click="onBlockedClick" @input="onInput" @keydown="onKeydown" @blur="onBlur" />
    <button type="button" class="itinerary-location-select__toggle" :disabled="disabled || loading"
      :aria-label="modelValue ? 'Limpiar ' + props['aria-label'] : 'Mostrar opciones de ' + props['aria-label']"
      @mousedown.prevent @click="toggle">
      <svg v-if="modelValue && !blocked" class="itinerary-location-select__clear-icon" width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span v-else class="itinerary-location-select__chevron" :class="{ 'is-open': opened }" aria-hidden="true"></span>
    </button>
    <Teleport to="body">
      <div v-if="opened" :id="listId" ref="menu" class="itinerary-location-select__menu" role="listbox"
        :aria-label="props['aria-label']" :style="positioned ? menuStyle : { visibility: 'hidden' }">
        <button v-for="(option, index) in filtered" :id="listId + '-' + index" :key="option.value"
          type="button" role="option" :aria-selected="modelValue === option.value"
          :data-active="index === activeIndex" :class="{ 'is-selected': modelValue === option.value, 'is-active': index === activeIndex }"
          @mousedown.prevent @click="choose(option)">{{ option.label }}</button>
        <p v-if="filtered.length === 0" class="itinerary-location-select__empty">No hay ubicaciones que coincidan.</p>
      </div>
    </Teleport>
  </div>
</template>

<style>
.itinerary-location-select { position:relative; min-width:0; width:100%; }
.itinerary-location-select .itinerary-location-select__input {
  box-sizing:border-box; display:block; width:100%; min-height:45px; padding:11px 48px 11px 14px;
  border:1px solid #cfd2dc; border-radius:13px; background:#fff; color:#242630;
  font:inherit; font-size:14px; font-weight:600; outline:none;
}
.itinerary-location-select .itinerary-location-select__input:focus-visible {border-color:#b20c2a;box-shadow:0 0 0 3px #b20c2a17;}
.itinerary-location-select .itinerary-location-select__input:disabled {opacity:.65;cursor:not-allowed;}
.itinerary-location-select.is-blocked .itinerary-location-select__input {opacity:.64;background:#f2f4f8;cursor:pointer;}
.app-site.itinerary-page .itinerary-form-line .itinerary-location-select__input {padding-right:52px;}
.content-manager .manager-form .itinerary-location-select__input {padding-right:52px;}
.itinerary-location-select.is-blocked .itinerary-location-select__input::placeholder {color:#8d97a6;opacity:1;}
.itinerary-location-select__clear-icon {display:block;transition:color .18s ease;}
.itinerary-location-select__toggle:hover .itinerary-location-select__clear-icon {color:#b20c2a;}
.itinerary-location-select .itinerary-location-select__toggle {
  position:absolute; top:0; right:0; height:100%; width:45px; display:grid; place-items:center;
  padding:0; border:0; border-radius:0 13px 13px 0; background:transparent;
  color:#3d4655; cursor:pointer;
}
.itinerary-location-select__toggle:disabled {opacity:.55;cursor:not-allowed;}
.itinerary-location-select__chevron {
  width:9px; height:9px; border-right:2px solid currentColor; border-bottom:2px solid currentColor;
  transform:translateY(-3px) rotate(45deg); transition:transform .2s ease;
}
.itinerary-location-select__chevron.is-open {transform:translateY(2px) rotate(225deg);}
.itinerary-location-select__menu {
  position:fixed; z-index:2147483000; display:flex; flex-direction:column; gap:2px;
  padding:8px; box-sizing:border-box; overflow-y:auto; overflow-x:hidden;
  overscroll-behavior:contain; border:1px solid #e5dce0; border-radius:16px;
  background:#fff; color:#242630; box-shadow:0 18px 38px rgba(35,21,28,.26);
}
.itinerary-location-select__menu button {
  width:100%; min-height:45px; flex:none; padding:11px 14px;
  border:0; border-radius:11px; background:transparent; color:inherit;
  font:inherit; font-size:14px; font-weight:600; text-align:left; cursor:pointer;
  white-space:normal; overflow-wrap:anywhere;
}
.itinerary-location-select__menu button:is(:hover,.is-selected,.is-active) {background:#f7e8eb;color:#a80e18;}
.itinerary-location-select__menu button:focus-visible {outline:2px solid #b20c2a;outline-offset:-2px;}
.itinerary-location-select__empty {margin:0;padding:13px 14px;color:#7c7680;font-size:13px;}
html.theme-dark .itinerary-location-select .itinerary-location-select__input {
  border-color:#3b465f; background:#121a30; color:#fff;
}
html.theme-dark .itinerary-location-select .itinerary-location-select__toggle {color:#d0d4df;}
html.theme-dark .itinerary-location-select.is-blocked .itinerary-location-select__input {background:#222a3b;opacity:.65;}
html.theme-dark .itinerary-location-select__menu {
  background:#19191c;color:#fff;border-color:#52505b;box-shadow:0 18px 38px rgba(0,0,0,.48);
}
html.theme-dark .itinerary-location-select__menu button:is(:hover,.is-selected,.is-active) {background:#30262d;color:#ff806f;}
html.theme-dark .itinerary-location-select__empty {color:#b9bac2;}
.content-manager .itinerary-location-select .itinerary-location-select__input {
  min-height:46px;border-radius:12px;background:var(--admin-input,#f7f9fd);
  color:var(--admin-text,#101b32);border-color:var(--admin-border,#cfd3dd);
  font-size:14px;font-weight:400;
}
.content-manager .itinerary-location-select.is-blocked .itinerary-location-select__input {background:var(--admin-input,#f7f9fd);opacity:.65;}
html.theme-dark .content-manager .itinerary-location-select.is-blocked .itinerary-location-select__input {background:#121a30;opacity:.55;}
html.theme-dark .content-manager .itinerary-location-select .itinerary-location-select__input {
  background:#121a30; color:#fff; border-color:#3b465f;
}
@media (max-width:650px) {
  .itinerary-location-select .itinerary-location-select__input,
  .itinerary-location-select__menu button {font-size:16px;}
}
@media (prefers-reduced-motion:reduce) {
  .itinerary-location-select__chevron {transition:none;}
}
</style>
