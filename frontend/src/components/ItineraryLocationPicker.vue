<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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
const open = ref(false)
const query = ref(props.modelValue)
const highlighted = ref(0)
const controlId = 'itinerary-location-' + Math.random().toString(36).slice(2)
const listId = controlId + '-options'
watch(() => props.modelValue, value => { if (!open.value) query.value = value })
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim()
const matches = computed(() => {
  const search = normalize(query.value)
  if (!search || normalize(props.modelValue) === search) return props.options
  return props.options.filter(option => normalize(option.displayName).includes(search) || normalize(option.code || '').includes(search))
})
function choose(value: string) {
  emit('update:modelValue', value)
  query.value = value
  open.value = false
  highlighted.value = 0
}
function onInput(event: Event) {
  query.value = (event.target as HTMLInputElement).value
  highlighted.value = 0
  open.value = true
  // Do not send an unrecognized free-text place to admin storage or itinerary filters.
  if (query.value !== props.modelValue) emit('update:modelValue', '')
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { open.value = false; query.value = props.modelValue; return }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    highlighted.value = Math.max(0, Math.min(matches.value.length - 1,
      highlighted.value + (event.key === 'ArrowDown' ? 1 : -1)))
  }
  if (event.key === 'Enter' && open.value && matches.value.length) {
    event.preventDefault()
    choose(matches.value[highlighted.value]?.displayName ?? matches.value[0].displayName)
  }
}
function onBlur() {
  window.setTimeout(() => {
    if (!open.value) return
    open.value = false
    query.value = props.modelValue
  }, 120)
}
</script>

<template>
  <div class="itinerary-location-picker">
    <label :for="controlId">{{ label }}</label>
    <div class="itinerary-location-picker__control">
      <input :id="controlId" :value="query" type="text" role="combobox" autocomplete="off"
        :required="required" :placeholder="placeholder" :aria-label="label"
        aria-autocomplete="list" :aria-controls="listId" :aria-expanded="open"
        @input="onInput" @focus="open = true; highlighted = 0" @keydown="onKeydown" @blur="onBlur" />
      <button type="button" class="itinerary-location-picker__toggle" :aria-label="label"
        :aria-expanded="open" @mousedown.prevent @click="open = !open; query = modelValue">
        <span :class="{ 'is-open': open }" aria-hidden="true">⌄</span>
      </button>
    </div>
    <ul v-if="open" :id="listId" class="itinerary-location-picker__options" role="listbox">
      <li v-if="loading" class="itinerary-location-picker__message">{{ $attrs.lang === 'en' ? 'Loading locations…' : 'Cargando ubicaciones…' }}</li>
      <li v-else-if="error" class="itinerary-location-picker__message">{{ error }}</li>
      <li v-else-if="!matches.length" class="itinerary-location-picker__message">No hay ubicaciones disponibles.</li>
      <li v-for="(item, index) in (!loading && !error ? matches : [])" :key="item.id">
        <button type="button" role="option" :aria-selected="item.displayName === modelValue"
          :class="{ 'is-highlighted': highlighted === index, 'is-selected': item.displayName === modelValue }"
          @mousedown.prevent @click="choose(item.displayName)">{{ item.displayName }}</button>
      </li>
      <li v-if="modelValue" class="itinerary-location-picker__clear">
        <button type="button" @mousedown.prevent @click="choose('')">Limpiar selección</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.itinerary-location-picker { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.itinerary-location-picker > label { font-weight: 700; color: inherit; }
.itinerary-location-picker__control { position: relative; min-width: 0; }
.itinerary-location-picker__control input {
  display: block; width: 100%; min-width: 0; box-sizing: border-box;
  padding: 12px 43px 12px 14px; min-height: 45px;
  border: 1px solid #47546c; border-radius: 11px;
  background: #071125; color: #fff; font: inherit;
}
.itinerary-location-picker__control input::placeholder { color: #a7b1c3; }
.itinerary-location-picker__control input:focus-visible { outline: 2px solid #da2745; outline-offset: 1px; }
.itinerary-location-picker__toggle {
  position: absolute; top: 0; bottom: 0; right: 0; width: 42px;
  display: grid; place-items: center; color: #c9ced9; background: transparent;
  border: 0; cursor: pointer; font-size: 21px;
}
.itinerary-location-picker__toggle span { transition: transform .18s ease; }
.itinerary-location-picker__toggle span.is-open { transform: rotate(180deg); }
.itinerary-location-picker__options {
  position: absolute; top: calc(100% + 5px); left: 0; right: 0; z-index: 60;
  max-height: 230px; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; margin: 0; list-style: none;
  border: 1px solid rgba(255,255,255,.28); border-radius: 13px;
  background: #10162b; box-shadow: 0 18px 32px rgba(0,0,0,.32);
}
.itinerary-location-picker__options li > button {
  width: 100%; padding: 10px 12px; border: none; border-radius: 8px;
  background: transparent; color: #fff; text-align: left; cursor: pointer; font: inherit;
}
.itinerary-location-picker__options li > button:hover,
.itinerary-location-picker__options li > button.is-highlighted { background: #ffffff20; }
.itinerary-location-picker__options li > button.is-selected { background: #b20c2a44; }
.itinerary-location-picker__message { padding: 12px; color: #cdd3e0; font-size: 13px; }
.itinerary-location-picker__clear { border-top: 1px solid #ffffff22; margin-top: 5px; }
@media (prefers-reduced-motion: reduce) {
  .itinerary-location-picker__toggle span { transition: none; }
}
</style>
