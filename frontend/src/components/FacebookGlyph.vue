<script setup lang="ts">
withDefaults(defineProps<{ size?: number; strokeWidth?: number }>(), {
  size: 24,
  strokeWidth: 1.9
})
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" :stroke-width="strokeWidth"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M15 21v-8h3l.5-4H15V6.8c0-1.4.5-2 1.9-2H19V1.5c-.8-.2-1.8-.3-2.8-.3C13.4 1.2 12 3 12 6.3V9H9v4h3v8" />
  </svg>
</template>
