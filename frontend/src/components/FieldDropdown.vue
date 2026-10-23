<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

type DropdownChoice = { value: string; label: string }
const props = defineProps<{
  modelValue: string
  options: DropdownChoice[]
  ariaLabel: string
  id?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const uid = useId()
const listId = computed(() => props.id ? props.id + '-options' : uid + '-options')
const isOpen = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const popupStyle = ref<Record<string, string>>({})
const selected = computed(() => props.options.find(option => option.value === props.modelValue)?.label ?? props.options[0]?.label ?? '')

function positionMenu() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const viewport = window.visualViewport
  const top = viewport?.offsetTop ?? 0
  const bottom = top + (viewport?.height ?? window.innerHeight)
  const below = Math.max(0, bottom - rect.bottom - 12)
  const above = Math.max(0, rect.top - top - 12)
  const flip = below < 240 && above > below
  const available = flip ? above : below
  const maxHeight = Math.max(44, Math.min(300, available - 6))
  const width = Math.max(1, Math.min(rect.width, window.innerWidth - 16))
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
  popupStyle.value = {
    top: Math.max(top + 4, flip ? rect.top - maxHeight - 6 : rect.bottom + 6) + 'px',
    left: left + 'px',
    width: width + 'px',
    maxHeight: maxHeight + 'px',
  }
}
function closeMenu() { isOpen.value = false }
function openMenu(focusOption = false) {
  positionMenu()
  isOpen.value = true
  if (focusOption) void nextTick(() => {
    (menu.value?.querySelector('[aria-selected="true"]') as HTMLButtonElement | null)?.focus({ preventScroll: true })
  })
}
function toggleMenu() { if (isOpen.value) closeMenu(); else openMenu() }
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
function reposition() { if (isOpen.value) positionMenu() }
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
    trigger.value?.focus({ preventScroll: true })
  } else if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
    event.preventDefault()
    const items = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    if (!items.length) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
      event.key === 'ArrowDown' ? (current + 1) % items.length : (current + items.length - 1) % items.length
    items[next]?.focus({ preventScroll: true })
  } else if (event.key === 'Tab') closeMenu()
}
watch(isOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', outsidePointer, true)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.visualViewport?.addEventListener('resize', reposition)
    window.visualViewport?.addEventListener('scroll', reposition)
  } else removeListeners()
})
function removeListeners() {
  document.removeEventListener('pointerdown', outsidePointer, true)
  window.removeEventListener('resize', reposition)
  window.removeEventListener('scroll', reposition, true)
  window.visualViewport?.removeEventListener('resize', reposition)
  window.visualViewport?.removeEventListener('scroll', reposition)
}
onBeforeUnmount(removeListeners)
</script>

<template>
  <div class="cf-dropdown">
    <button :id="id" ref="trigger" type="button" class="cf-dropdown__trigger"
      role="combobox" :aria-label="ariaLabel" aria-haspopup="listbox"
      :aria-controls="listId" :aria-expanded="isOpen"
      @click="toggleMenu" @keydown.down.prevent="openMenu(true)"
      @keydown.up.prevent="openMenu(true)" @keydown.esc.prevent="closeMenu">
      <span class="cf-dropdown__value">{{ selected }}</span><span class="cf-dropdown__chevron" aria-hidden="true"></span>
    </button>
    <Teleport to="body">
      <div v-if="isOpen" :id="listId" ref="menu" class="cf-dropdown__menu" role="listbox"
        :aria-label="ariaLabel" :style="popupStyle" @keydown="handleKeydown">
        <button v-for="option in options" :key="option.value" type="button" role="option"
          :aria-selected="modelValue === option.value" tabindex="-1"
          :class="{ 'cf-dropdown__option--selected': modelValue === option.value }"
          @click="choose(option.value)">{{ option.label }}</button>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* Shared quote and itinerary dropdown: the menu lives in body so no form card
   can clip it or paint its text over the options. */
.cf-dropdown { width:100%; min-width:0; }
.cf-dropdown__trigger {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  box-sizing:border-box; width:100%; min-width:0; min-height:45px;
  padding:11px 15px; border:1px solid #cfd2dc; border-radius:13px;
  background:#fff; color:#242630; text-align:left; font:inherit;
  font-size:14px; font-weight:600; line-height:1.35; cursor:pointer;
}
.cf-dropdown__trigger:focus-visible { outline:2px solid #b20c2a; outline-offset:2px; }
.cf-dropdown__value { min-width:0; overflow-wrap:anywhere; }
.cf-dropdown__chevron { flex:none; width:8px; height:8px; border-right:2px solid currentColor; border-bottom:2px solid currentColor; transform:translateY(-3px) rotate(45deg); }
.cf-dropdown__menu {
  position:fixed; z-index:2147483000; box-sizing:border-box; margin:0;
  padding:8px; display:flex; flex-direction:column; gap:2px;
  overflow-y:auto; overscroll-behavior:contain; border-radius:16px;
  border:1px solid #e5dce0; background:#fff; color:#242630;
  box-shadow:0 18px 38px rgba(35,21,28,.26);
}
.cf-dropdown__menu > button {
  flex:0 0 auto; width:100%; min-height:44px; padding:10px 14px;
  border:0; border-radius:11px; text-align:left; background:transparent;
  color:inherit; font:inherit; font-size:14px; font-weight:600; cursor:pointer;
}
.cf-dropdown__menu > button:is(:hover,:focus-visible,.cf-dropdown__option--selected) {
  background:#f7e8eb; color:#a80e18;
}
.cf-dropdown__menu > button:focus-visible { outline:2px solid #b20c2a; outline-offset:-2px; }
html.theme-dark .cf-dropdown__trigger {
  border-color:#4f5365; background:#121a30; color:#fff;
}
html.theme-dark .cf-dropdown__menu {
  background:#19191c; color:#fff; border-color:#52505b;
  box-shadow:0 18px 38px rgba(0,0,0,.48);
}
html.theme-dark .cf-dropdown__menu > button:is(:hover,:focus-visible,.cf-dropdown__option--selected) {
  background:#30262d; color:#ff806f;
}
/* Itinerary filters use the same type size as their date fields on desktop. */
.app-site.itinerary-page .cf-dropdown__trigger { min-height:42px; font-size:12px; }
@media(max-width:650px) {
  .cf-dropdown__trigger, .app-site.itinerary-page .cf-dropdown__trigger { min-height:46px; font-size:16px; }
  .cf-dropdown__menu > button { font-size:16px; }
}
</style>
