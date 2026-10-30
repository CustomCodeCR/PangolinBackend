<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <svg xmlns="http://www.w3.org/2000/svg" :width="size" :height="size"
    viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.525 15.998l.79-5.146h-4.94V7.513c0-1.408.69-2.78 2.902-2.78h2.246V.35S16.484 0 14.536 0C10.47 0 7.814 2.465 7.814 6.93v3.922H3.294v5.146h4.52V24h5.56v-8.002h4.151z" />
  </svg>
</template>
