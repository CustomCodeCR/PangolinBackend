<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, ChevronDown, Menu, Moon, Settings, Sun, UserRound, X } from '@lucide/vue'
import LanguageSwitcher from './LanguageSwitcher.vue'
import { authState, currentRole, logoutSession, refreshSession } from '../services/auth'

const props = defineProps<{ active?: string; overlay?: boolean }>()
const { t } = useI18n({ useScope: 'global' })
const expanded = ref(false)
const headerElement = ref<HTMLElement | null>(null)
let mobileMenuResizeObserver: ResizeObserver | null = null
const cargoMenuOpen = ref(false)
const darkMode = ref(false)
const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
const sessionUser = computed(() => authState.user)
const loggingOut = ref(false)
const isAuthenticated = computed(() => !!sessionUser.value)
const isAdministrator = computed(() => currentRole() === 'administrador')
const canAccessCargo = computed(() => currentRole() === 'cliente' || currentRole() === 'administrador')
const settingsOpen = ref(false)
const rolePreviewSuffix = computed(() => authState.previewRole ? `?previewRole=${authState.previewRole}` : '')
const administrationHref = computed(() => `/administracion${authState.previewRole ? `?previewRole=${encodeURIComponent(authState.previewRole)}` : ''}`)
const baseLinks = [
  { key: 'servicios', id: 'principal', url: '/home' },
  { key: 'noticias', id: 'noticias', url: '/noticias' },
  { key: 'nosotros', id: 'nosotros', url: '/nosotros' },
  { key: 'soluciones', id: 'soluciones', url: '/servicios' }
]
const links = computed(() => baseLinks.map(link => ({ ...link, label: t(`navLinks.${link.key}`) })))
const visibleLinks = computed(() => links.value.map(link => ({ ...link, url: `${link.url}${rolePreviewSuffix.value}` })))
const cargoLinks = computed(() => [
  { key: 'embarque', id: 'embarque', url: `/tracking${rolePreviewSuffix.value}`, label: t('navLinks.embarque') },
  { key: 'itinerario', id: 'itinerario', url: `/itinerario${rolePreviewSuffix.value}`, label: t('navLinks.itinerario') }
])
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logoutSession()
    window.location.assign('/')
  } catch {
    loggingOut.value = false
    alert(t('custom.header.logoutError'))
  }
}
function handleOutsideClick(event: MouseEvent) {
  if (!(event.target as Element).closest('.header-settings')) settingsOpen.value = false
}
function applySystemTheme(event?: MediaQueryListEvent) {
  if (localStorage.getItem('castrofallas-theme')) return
  darkMode.value = event?.matches ?? !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
}
watch(expanded, async isOpen => {
  const header = headerElement.value
  const hero = header?.closest<HTMLElement>('.home-hero')
  if (!header || !hero) return
  mobileMenuResizeObserver?.disconnect()
  mobileMenuResizeObserver = null
  if (!isOpen) {
    hero.classList.remove('home-hero--menu-open')
    hero.style.removeProperty('--mobile-open-menu-height')
    return
  }
  await nextTick()
  const updateMenuHeight = () => hero.style.setProperty('--mobile-open-menu-height', `${header.getBoundingClientRect().height}px`)
  hero.classList.add('home-hero--menu-open')
  updateMenuHeight()
  mobileMenuResizeObserver = new ResizeObserver(updateMenuHeight)
  mobileMenuResizeObserver.observe(header)
})

onMounted(() => {
  if (!authState.loaded) void refreshSession()
  const savedTheme = localStorage.getItem('castrofallas-theme')
  darkMode.value = savedTheme ? savedTheme === 'dark' : !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
  systemThemeQuery?.addEventListener('change', applySystemTheme)
  document.addEventListener('click', handleOutsideClick)
})
onUnmounted(() => {
  mobileMenuResizeObserver?.disconnect()
  const hero = headerElement.value?.closest<HTMLElement>('.home-hero')
  hero?.classList.remove('home-hero--menu-open')
  hero?.style.removeProperty('--mobile-open-menu-height')
  systemThemeQuery?.removeEventListener('change', applySystemTheme)
  document.removeEventListener('click', handleOutsideClick)
})

function toggleTheme() {
  darkMode.value = !darkMode.value
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
  localStorage.setItem('castrofallas-theme', darkMode.value ? 'dark' : 'light')
}
</script>

<template>
  <header ref="headerElement" class="site-header" :class="{ 'site-header--overlay': props.overlay, 'site-header--menu-open': expanded }">
    <div class="header-inner">
      <a class="site-brand" href="/home" :aria-label="$t('phrases.p138')"><img src="/images/logo.png" alt="Castro Fallas" /></a>
      <button class="menu-toggle" type="button" :aria-expanded="expanded" :aria-label="$t('phrases.p137')" @click="expanded = !expanded"><X v-if="expanded" :size="22" aria-hidden="true" /><Menu v-else :size="22" aria-hidden="true" /></button>
      <nav class="main-nav" :class="{ 'main-nav--open': expanded }" :aria-label="$t('phrases.p136')">
        <a v-for="link in visibleLinks" :key="link.id" :class="{ 'is-active': props.active === link.id }" :href="link.url" @click="expanded = false">{{ link.label }}</a>
        <div v-if="canAccessCargo" class="nav-dropdown" :class="{ 'nav-dropdown--open': cargoMenuOpen, 'nav-dropdown--active': cargoLinks.some(link => props.active === link.id) }">
          <button class="nav-dropdown__trigger" type="button" :aria-expanded="cargoMenuOpen" @click="cargoMenuOpen = !cargoMenuOpen">
            {{ t('navLinks.embarque') }} <ChevronDown :size="16" class="nav-dropdown__chevron" aria-hidden="true" />
          </button>
          <div v-if="cargoMenuOpen" class="nav-dropdown__menu">
            <a v-for="link in cargoLinks" :key="link.id" :href="link.url" @click="cargoMenuOpen = false; expanded = false">{{ link.label }}</a>
          </div>
        </div>
        <div v-if="isAdministrator" class="nav-dropdown" :class="{ 'nav-dropdown--active': props.active === 'administracion' }">
          <a class="nav-dropdown__trigger nav-admin-entry" :href="administrationHref" @click="expanded = false">Administración</a>
        </div>
        <div class="header-account-tools">
          <a v-if="!isAuthenticated" class="nav-login" href="/bienvenidos">{{ $t('phrases.p132') }} <ArrowUpRight :size="18" aria-hidden="true" /></a>
          <button v-if="isAuthenticated" type="button" class="nav-user-icon" :disabled="loggingOut" :aria-label="t('custom.header.logout')" :title="sessionUser?.correo + ' — ' + t('custom.header.logout')" @click="logout">
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
