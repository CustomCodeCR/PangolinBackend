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
const profileOpen = ref(false)
const profileButton = ref<HTMLButtonElement | null>(null)
const roleLabel = computed(() =>
  sessionUser.value?.role === 'administrador'
    ? t('custom.header.roleAdmin')
    : t('custom.header.roleClient')
)
/* Bind the actual saved theme to the profile. Unlike a global html selector,
   these inline variables remain reliable with Vue scoped styles on mobile. */
const profileTheme = computed(() => darkMode.value ? {
  '--profile-bg': '#0a1228',
  '--profile-ink': '#f4f6fb',
  '--profile-muted': '#c0c9da',
  '--profile-heading': '#ffb5c4',
  '--profile-border': 'rgba(255,255,255,.2)',
  '--profile-rule': 'rgba(255,255,255,.18)',
  '--profile-shadow': '0 20px 45px rgba(0,0,0,.45)'
} : {
  '--profile-bg': '#ffffff',
  '--profile-ink': '#25212a',
  '--profile-muted': '#706971',
  '--profile-heading': '#a30e29',
  '--profile-border': '#ecdde2',
  '--profile-rule': '#eee3e7',
  '--profile-shadow': '0 20px 45px rgba(24,6,12,.24)'
})
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
function toggleProfile() {
  profileOpen.value = !profileOpen.value
  settingsOpen.value = false
}
function handleOutsideClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return
  if (!event.target.closest('.header-settings')) settingsOpen.value = false
  if (!event.target.closest('.header-profile')) profileOpen.value = false
}
function handleEscapeKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (profileOpen.value) {
    profileOpen.value = false
    profileButton.value?.focus()
  }
  settingsOpen.value = false
}
watch(isAuthenticated, authenticated => {
  if (!authenticated) profileOpen.value = false
})
function applySystemTheme(event?: MediaQueryListEvent) {
  if (localStorage.getItem('castrofallas-theme')) return
  darkMode.value = event?.matches ?? !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
}
watch(expanded, async isOpen => {
  if (!isOpen) profileOpen.value = false
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
  document.addEventListener('keydown', handleEscapeKey)
})
onUnmounted(() => {
  mobileMenuResizeObserver?.disconnect()
  const hero = headerElement.value?.closest<HTMLElement>('.home-hero')
  hero?.classList.remove('home-hero--menu-open')
  hero?.style.removeProperty('--mobile-open-menu-height')
  systemThemeQuery?.removeEventListener('change', applySystemTheme)
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleEscapeKey)
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
          <div v-if="isAuthenticated" class="header-profile" :class="{ 'header-profile--open': profileOpen }">
            <button ref="profileButton" type="button" class="nav-user-icon header-profile__trigger" :disabled="loggingOut"
              :aria-label="t('custom.header.profile')" :aria-expanded="profileOpen" aria-controls="header-profile-panel"
              :title="t('custom.header.profile')" @click.stop="toggleProfile">
              <UserRound :size="19" aria-hidden="true" />
            </button>
            <div v-if="profileOpen && sessionUser" id="header-profile-panel" class="header-profile__panel"
              :style="profileTheme" role="region" :aria-label="t('custom.header.profile')">
              <span class="header-profile__heading">{{ t('custom.header.account') }}</span>
              <dl class="header-profile__details">
                <div>
                  <dt>{{ t('custom.header.accountName') }}</dt>
                  <dd class="header-profile__name">{{ sessionUser.nombre?.trim() || t('custom.header.account') }}</dd>
                </div>
                <div>
                  <dt>{{ t('custom.header.accountRole') }}</dt>
                  <dd>{{ roleLabel }}</dd>
                </div>
                <div>
                  <dt>{{ t('custom.header.accountEmail') }}</dt>
                  <dd>{{ sessionUser.correo }}</dd>
                </div>
              </dl>
              <button type="button" class="header-profile__logout" :disabled="loggingOut" @click="logout">
                {{ t('custom.header.logout') }}
              </button>
            </div>
          </div>
          <div class="header-settings" :class="{ 'header-settings--open': settingsOpen }">
            <button class="header-settings__trigger" type="button" :aria-label="t('custom.header.settings')" :aria-expanded="settingsOpen" @click.stop="settingsOpen = !settingsOpen; profileOpen = false"><Settings :size="20" aria-hidden="true" /></button>
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

<style scoped>
/* Account popover: separate profile inspection from the actual logout action. */
.header-profile {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}
.header-profile__trigger[aria-expanded="true"] {
  box-shadow: 0 0 0 3px rgba(255, 255, 255, .28);
}
.header-profile__trigger:focus-visible,
.header-profile__logout:focus-visible {
  outline: 3px solid #e8a0ae;
  outline-offset: 3px;
}
.header-profile__panel {
  position: absolute;
  z-index: 80;
  top: calc(100% + 12px);
  right: 0;
  width: min(310px, calc(100vw - 32px));
  padding: 18px;
  border: 1px solid var(--profile-border, #ecdde2);
  border-radius: 16px;
  background: var(--profile-bg, #fff);
  box-shadow: var(--profile-shadow, 0 20px 45px rgba(24, 6, 12, .24));
  color: var(--profile-ink, #25212a);
  text-align: left;
}
.header-profile__heading {
  display: block;
  padding-bottom: 11px;
  border-bottom: 1px solid var(--profile-rule, #eee3e7);
  color: var(--profile-heading, #a30e29);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.header-profile__details {
  display: grid;
  gap: 12px;
  margin: 14px 0 16px;
}
.header-profile__details dt {
  margin-bottom: 3px;
  color: var(--profile-muted, #706971);
  font-size: 11px;
  font-weight: 700;
}
.header-profile__details dd {
  margin: 0;
  color: var(--profile-ink, #25212a);
  overflow-wrap: anywhere;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.45;
}
.header-profile__details .header-profile__name {
  font-size: 16px;
  font-weight: 900;
}
.header-profile__logout {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 11px 14px;
  border: 1px solid #b60c2b;
  border-radius: 10px;
  background: #b60c2b;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  text-align: center;
}
.header-profile__logout:hover { background: #900a22; }
.header-profile__logout:disabled { opacity: .65; cursor: wait; }
/* The profile's colors come from the reactive theme variables above;
   no global html selector or theme-specific CSS cascade is required. */

/* A mobile profile is part of the expanded navigation flow, not an
   absolutely-positioned popover hanging off the user icon. Keep both
   controls centered in the first row, then center the card beneath them. */
@media (max-width: 1080px) {
  .header-account-tools:has(.header-profile--open) {
    display: grid;
    grid-template-columns: 44px 40px;
    grid-template-rows: 44px auto;
    justify-content: center;
    justify-items: center;
    align-items: center;
    gap: 10px;
    width: 100%;
    margin-inline: 0;
  }
  .header-profile--open {
    display: contents;
  }
  .header-profile--open .header-profile__trigger {
    grid-column: 1;
    grid-row: 1;
  }
  .header-account-tools:has(.header-profile--open) > .header-settings {
    grid-column: 2;
    grid-row: 1;
  }
  .header-profile--open .header-profile__panel {
    position: relative;
    top: auto;
    right: auto;
    left: auto;
    grid-column: 1 / -1;
    grid-row: 2;
    justify-self: center;
    width: min(310px, calc(100vw - 40px));
    max-width: calc(100vw - 40px);
    box-sizing: border-box;
    margin: 0;
    transform: none;
  }
}
</style>
