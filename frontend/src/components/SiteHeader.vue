<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, ChevronDown, Menu, Moon, Settings, Sun, UserRound, X } from '@lucide/vue'
import LanguageSwitcher from './LanguageSwitcher.vue'

const props = defineProps<{ active?: string; overlay?: boolean }>()
const { t } = useI18n({ useScope: 'global' })
const expanded = ref(false)
const cargoMenuOpen = ref(false)
const darkMode = ref(false)
const sessionUser = ref<{ correo: string; nombreCliente: string } | null>(null)
const loggingOut = ref(false)
const isAuthenticated = computed(() => !!sessionUser.value)
const isGuest = ref(false)
const settingsOpen = ref(false)
const baseLinks = [
  { key: 'servicios', id: 'principal', url: '/home' },
  { key: 'noticias', id: 'noticias', url: '/noticias' },
  { key: 'nosotros', id: 'nosotros', url: '/nosotros' },
  { key: 'soluciones', id: 'soluciones', url: '/servicios' }
]
const links = computed(() => baseLinks.map(link => ({ ...link, label: t(`navLinks.${link.key}`) })))
const visibleLinks = computed(() => links.value.filter(link => isAuthenticated.value || isGuest.value || link.id === 'principal'))
const cargoLinks = computed(() => [
  { key: 'embarque', id: 'embarque', url: '/tracking', label: t('navLinks.embarque') },
  { key: 'itinerario', id: 'itinerario', url: '/itinerario', label: t('navLinks.itinerario') }
])
const canBrowseSections = computed(() => isAuthenticated.value || isGuest.value)
function syncGuest() {
  // El modo invitado vive solo en la pestaña donde fue elegido.
  localStorage.removeItem('castrofallas-guest-mode')
  isGuest.value = !isAuthenticated.value && sessionStorage.getItem('castrofallas-guest-mode') === 'true'
}
async function refreshSession() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    sessionUser.value = response.ok ? await response.json() : null
    if (sessionUser.value) localStorage.removeItem('castrofallas-guest-mode')
  } catch { sessionUser.value = null }
  syncGuest()
}
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
    if (!response.ok) throw new Error('Logout failed')
    sessionUser.value = null
    localStorage.removeItem('castrofallas-authenticated')
    sessionStorage.removeItem('castrofallas-guest-mode')
    window.location.assign('/')
  } catch {
    loggingOut.value = false
    alert(t('custom.header.logoutError'))
  }
}
function handleOutsideClick(event: MouseEvent) {
  if (!(event.target as Element).closest('.header-settings')) settingsOpen.value = false
}

onMounted(() => {
  syncGuest()
  void refreshSession()
  darkMode.value = localStorage.getItem('castrofallas-theme') === 'dark'
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
  document.addEventListener('click', handleOutsideClick)
})
onUnmounted(() => {
  document.removeEventListener('click', handleOutsideClick)
})

function toggleTheme() {
  darkMode.value = !darkMode.value
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
  localStorage.setItem('castrofallas-theme', darkMode.value ? 'dark' : 'light')
}
</script>

<template>
  <header class="site-header" :class="{ 'site-header--overlay': props.overlay }">
    <div class="header-inner">
      <a class="site-brand" href="/home" :aria-label="$t('phrases.p138')"><img src="/images/logo-header-white.png" alt="Castro Fallas" /></a>
      <button class="menu-toggle" type="button" :aria-expanded="expanded" :aria-label="$t('phrases.p137')" @click="expanded = !expanded"><X v-if="expanded" :size="22" aria-hidden="true" /><Menu v-else :size="22" aria-hidden="true" /></button>
      <nav class="main-nav" :class="{ 'main-nav--open': expanded }" :aria-label="$t('phrases.p136')">
        <a v-for="link in visibleLinks" :key="link.id" :class="{ 'is-active': props.active === link.id }" :href="link.url" @click="expanded = false">{{ link.label }}</a>
        <div v-if="canBrowseSections" class="nav-dropdown" :class="{ 'nav-dropdown--open': cargoMenuOpen, 'nav-dropdown--active': cargoLinks.some(link => props.active === link.id) }">
          <button class="nav-dropdown__trigger" type="button" :aria-expanded="cargoMenuOpen" @click="cargoMenuOpen = !cargoMenuOpen">
            {{ t('navLinks.embarque') }} <ChevronDown :size="16" class="nav-dropdown__chevron" aria-hidden="true" />
          </button>
          <div v-if="cargoMenuOpen" class="nav-dropdown__menu">
            <a v-for="link in cargoLinks" :key="link.id" :href="link.url" @click="cargoMenuOpen = false; expanded = false">{{ link.label }}</a>
          </div>
        </div>
        <div class="header-account-tools">
          <a v-if="!isAuthenticated" class="nav-login" href="/bienvenidos">{{ $t('phrases.p132') }} <ArrowUpRight :size="18" aria-hidden="true" /></a>
          <button v-else type="button" class="nav-user-icon" :disabled="loggingOut" :aria-label="t('custom.header.logout')" :title="sessionUser?.correo + ' — ' + t('custom.header.logout')" @click="logout">
            <UserRound :size="19" aria-hidden="true" />
          </button>
          <div class="header-settings" :class="{ 'header-settings--open': settingsOpen }">
            <button class="header-settings__trigger" type="button" :aria-label="t('custom.header.settings')" :aria-expanded="settingsOpen" @click.stop="settingsOpen = !settingsOpen"><Settings :size="20" aria-hidden="true" /></button>
            <div v-if="settingsOpen" class="header-settings__panel">
              <span class="header-settings__label">{{ t('custom.header.settings') }}</span>
              <button class="theme-toggle" type="button" :aria-label="darkMode ? $t('custom.header.light') : $t('custom.header.dark')" @click="toggleTheme"><Sun v-if="darkMode" :size="18" aria-hidden="true" /><Moon v-else :size="18" aria-hidden="true" /><span>{{ darkMode ? $t('custom.header.light') : $t('custom.header.dark') }}</span></button>
              <LanguageSwitcher dropdown />
            </div>
          </div>
        </div>
      </nav>
    </div>
  </header>
</template>
