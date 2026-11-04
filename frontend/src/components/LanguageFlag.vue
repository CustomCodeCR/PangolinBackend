<script setup lang="ts">
defineProps<{ language: 'es' | 'en' }>()
</script>

<template>
  <!-- SVG propios: los emojis de banderas pueden aparecer como letras ES/GB
       en Windows aunque Linux los muestre como banderas. -->
  <svg v-if="language === 'es'" class="language-flag" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect width="30" height="20" fill="#AA151B" />
    <rect y="5" width="30" height="10" fill="#F1BF00" />
    <!-- Escudo estilizado para distinguir claramente la bandera a este tamaño. -->
    <g transform="translate(8.2 8)">
      <rect x="-1.6" y="-1.5" width="4.4" height="5.6" rx=".5" fill="#fff4d9" stroke="#ab151b" stroke-width=".55" />
      <path d="M-1.1 .1H.4V1.8H-1.1ZM.8 .1H2.3V1.8H.8Z" fill="#AA151B" />
      <path d="M-1.1 2.2H.4V3.5H-1.1Z" fill="#C19C40" />
      <path d="M.8 2.2H2.3V3.5H.8Z" fill="#AA151B" />
      <path d="M-1.2-2.1Q.6-3.8 2.4-2.1" stroke="#AA151B" stroke-width=".9" fill="none" />
    </g>
  </svg>
  <svg v-else class="language-flag" viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <g>
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="5.4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" stroke-width="2.2" />
      <path d="M15 0V20M0 10H30" stroke="#fff" stroke-width="7" />
      <path d="M15 0V20M0 10H30" stroke="#C8102E" stroke-width="3.4" />
    </g>
  </svg>
</template>

<style scoped>
.language-flag {
  display: block;
  width: 25px;
  height: 17px;
  min-width: 25px;
  flex: 0 0 25px;
  border: 1px solid rgba(0, 0, 0, .1);
  border-radius: 2px;
  box-sizing: border-box;
  overflow: hidden;
}
</style>
