<script setup lang="ts">
import { onMounted, ref } from 'vue'
const props = defineProps<{ active?: string; overlay?: boolean }>()
const expanded = ref(false)
const authenticated = ref(false)
onMounted(async () => {
  try { authenticated.value = (await fetch('/api/auth/me', { credentials: 'same-origin' })).ok }
  catch { authenticated.value = false }
})
async function logout() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } finally { window.location.assign('/') }
}
const links = [
  {label:'Servicios',url:'/home#servicios',id:'servicios'},
  {label:'Noticias',url:'/noticias',id:'noticias'},
  {label:'Sobre Nosotros',url:'/nosotros',id:'nosotros'},
  {label:'Soluciones',url:'/home#soluciones',id:'soluciones'},
  {label:'Carga Internacional',url:'/home#embarque',id:'embarque'}
]
</script>
<template>
  <header class="site-header" :class="{ 'site-header--overlay': props.overlay }">
    <div class="header-inner">
      <a class="site-brand" href="/home" aria-label="Castro Fallas, ir al inicio"><img src="/images/logo.png" alt="Castro Fallas" /></a>
      <button class="menu-toggle" type="button" :aria-expanded="expanded" aria-label="Abrir o cerrar menú" @click="expanded = !expanded">{{ expanded ? '✕' : '☰' }}</button>
      <nav class="main-nav" :class="{'main-nav--open':expanded}" aria-label="Navegación principal">
        <a v-for="link in links" :key="link.id" :class="{'is-active':props.active===link.id}" :href="link.url" @click="expanded=false">{{ link.label }}</a>
        <button v-if="authenticated" type="button" class="nav-login auth-nav-button" @click="logout">Cerrar sesión ↗</button><a v-else class="nav-login" href="/">Ingresar <span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </header>
</template>
