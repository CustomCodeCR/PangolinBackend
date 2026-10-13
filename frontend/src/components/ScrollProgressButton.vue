<script setup lang="ts">
import IconSymbol from './IconSymbol.vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n({ useScope: 'global' })
const progress = ref(0)
const circumference = 2 * Math.PI * 21
let observer: ResizeObserver | undefined

function updateProgress() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
  progress.value = scrollableHeight > 0
    ? Math.min(100, Math.max(0, (window.scrollY / scrollableHeight) * 100))
    : 0
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  updateProgress()
  window.addEventListener('scroll', updateProgress, { passive: true })
  window.addEventListener('resize', updateProgress, { passive: true })
  if ('ResizeObserver' in window) {
    observer = new ResizeObserver(updateProgress)
    observer.observe(document.body)
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', updateProgress)
  window.removeEventListener('resize', updateProgress)
  observer?.disconnect()
})
</script>

<template>
  <button v-show="progress > 3" class="scroll-progress-button" type="button" :aria-label="t('custom.scroll.goTop')" :title="t('custom.scroll.goTop')" @click="scrollToTop">
    <svg class="scroll-progress-button__ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle class="scroll-progress-button__track" cx="24" cy="24" r="21" />
      <circle
        class="scroll-progress-button__value"
        cx="24"
        cy="24"
        r="21"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="circumference * (1 - progress / 100)"
      />
    </svg>
    <IconSymbol class="scroll-progress-button__arrow" glyph="↑" :size="28" />
  </button>
</template>
