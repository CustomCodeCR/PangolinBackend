<script setup lang="ts">
import SiteMedia from './SiteMedia.vue'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, ChevronDown, Menu, Moon, Settings, Sun, UserRound, X } from '@lucide/vue'
import LanguageSwitcher from './LanguageSwitcher.vue'
import { authState, currentRole, logoutSession, refreshSession } from '../services/auth'

const props = defineProps<{ active?: string; overlay?: boolean }>()
const { t } = useI18n({ useScope: 'global' })
const expanded = ref(false)
const headerElement = ref<HTMLElement | null>(null)
const menuToggle = ref<HTMLButtonElement | null>(null)
const mobileMenuQuery = window.matchMedia('(max-width: 800px)')
const mobileMenuActive = ref(mobileMenuQuery.matches)
let lockedScrollY = 0
let previousHtmlOverflow = ''
let previousBodyOverflow = ''
let previousBodyPosition = ''
let previousBodyTop = ''
let previousBodyWidth = ''
let previousBodyLeft = ''
let previousBodyRight = ''
let previousBackgroundInert = false
let backgroundLocked = false
function lockMenuBackground() {
  if (backgroundLocked) return
  lockedScrollY = window.scrollY
  previousHtmlOverflow = document.documentElement.style.overflow
  previousBodyOverflow = document.body.style.overflow
  previousBodyPosition = document.body.style.position
  previousBodyTop = document.body.style.top
  previousBodyWidth = document.body.style.width
  previousBodyLeft = document.body.style.left
  previousBodyRight = document.body.style.right
  const background = document.getElementById('app')
  previousBackgroundInert = background?.inert ?? false
  if (background) background.inert = true
  document.body.style.position = 'fixed'
  document.body.style.top = `-${lockedScrollY}px`
  document.body.style.left = '0'
  document.body.style.right = '0'
  document.body.style.width = '100%'
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  backgroundLocked = true
}
function unlockMenuBackground() {
  if (!backgroundLocked) return
  document.documentElement.style.overflow = previousHtmlOverflow
  document.body.style.overflow = previousBodyOverflow
  document.body.style.position = previousBodyPosition
  document.body.style.top = previousBodyTop
  document.body.style.left = previousBodyLeft
  document.body.style.right = previousBodyRight
  document.body.style.width = previousBodyWidth
  const background = document.getElementById('app')
  if (background) background.inert = previousBackgroundInert
  backgroundLocked = false
  if (Math.abs(window.scrollY - lockedScrollY) > 1) window.scrollTo(0, lockedScrollY)
}
function closeMenuOnDesktop(event: MediaQueryListEvent) {
  mobileMenuActive.value = event.matches
  if (!event.matches) { expanded.value = false; unlockMenuBackground() }
}
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
/* Share the frosted-glass palette of the Settings menu. Theme values
   come from the same reactive switch as the rest of the header. */
const profileTheme = computed(() => darkMode.value ? {
  '--profile-bg': 'rgba(10,18,40,.48)',
  '--profile-ink': '#ffffff',
  '--profile-muted': '#d6d9e4',
  '--profile-heading': '#ffffff',
  '--profile-border': '#ffffff38',
  '--profile-rule': '#ffffff24',
  '--profile-glow': 'radial-gradient(ellipse at center,rgba(214,14,52,.46) 0%,rgba(178,11,45,.29) 38%,rgba(126,10,34,.13) 58%,transparent 76%)',
  '--profile-shadow': '0 14px 34px rgba(0,0,0,.25)'
} : {
  '--profile-bg': 'rgba(255,255,255,.64)',
  '--profile-ink': '#20242b',
  '--profile-muted': '#4d4953',
  '--profile-heading': '#20242b',
  '--profile-border': '#f0e5e7',
  '--profile-rule': '#22242b24',
  '--profile-glow': 'radial-gradient(ellipse at center,rgba(214,14,52,.34) 0%,rgba(178,11,45,.2) 38%,rgba(126,10,34,.08) 58%,transparent 76%)',
  '--profile-shadow': '0 14px 34px rgba(0,0,0,.13)'
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
  if (expanded.value) { expanded.value = false; menuToggle.value?.focus() }
}
watch(isAuthenticated, authenticated => {
  if (!authenticated) profileOpen.value = false
})
function applySystemTheme(event?: MediaQueryListEvent) {
  if (localStorage.getItem('castrofallas-theme')) return
  darkMode.value = event?.matches ?? !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
}
watch(expanded, isOpen => {
  if (!isOpen) profileOpen.value = false
  if (isOpen && mobileMenuQuery.matches) lockMenuBackground()
  else unlockMenuBackground()
}, { flush: 'post' })

onMounted(() => {
  mobileMenuQuery.addEventListener('change', closeMenuOnDesktop)
  if (!authState.loaded) void refreshSession()
  const savedTheme = localStorage.getItem('castrofallas-theme')
  darkMode.value = savedTheme ? savedTheme === 'dark' : !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode.value)
  systemThemeQuery?.addEventListener('change', applySystemTheme)
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleEscapeKey)
})
onUnmounted(() => {
  unlockMenuBackground()
  mobileMenuQuery.removeEventListener('change', closeMenuOnDesktop)
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
  <Teleport to="body">
    <button v-if="expanded" class="mobile-nav-backdrop" tabindex="-1" type="button" :aria-label="$t('custom.home.close')" @click="expanded = false" />
  </Teleport>
  <Teleport to="body" :disabled="!expanded || !mobileMenuActive">
  <header ref="headerElement" class="site-header" :class="{ 'site-header--overlay': props.overlay, 'site-header--menu-open': expanded }">
    <div class="header-inner">
      <a class="site-brand" href="/home" :aria-label="$t('phrases.p138')"><SiteMedia slot-key="shared.logo.media" fallback="/images/logo.png" alt="Castro Fallas" /></a>
      <button ref="menuToggle" class="menu-toggle" type="button" :aria-expanded="expanded" :aria-label="$t('phrases.p137')" @click="expanded = !expanded"><X v-if="expanded" :size="22" aria-hidden="true" /><Menu v-else :size="22" aria-hidden="true" /></button>
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
  </Teleport>
</template>

<style scoped>
/* Account popover: separate profile inspection from the actual logout action. */
.header-profile {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}
/* Match the Settings control (size, outline and translucent fill). */
.header-account-tools .nav-user-icon.header-profile__trigger {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  padding: 0;
  border: 1px solid #ffffff42;
  border-radius: 50%;
  background: #ffffff12;
  box-shadow: none;
  color: #fff;
  cursor: pointer;
  transition: background .18s;
}
.header-account-tools .nav-user-icon.header-profile__trigger:hover,
.header-account-tools .nav-user-icon.header-profile__trigger[aria-expanded="true"] {
  background: #ffffff26;
}
.header-account-tools .nav-user-icon.header-profile__trigger svg {
  width: 20px;
  height: 20px;
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
  display: flex;
  flex-direction: column;
  width: min(310px, calc(100vw - 32px));
  min-width: 0;
  padding: 13px;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid var(--profile-border, #f0e5e7);
  border-radius: 14px;
  background: var(--profile-bg, rgba(255,255,255,.64));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: var(--profile-shadow, 0 14px 34px rgba(0,0,0,.13));
  color: var(--profile-ink, #20242b);
  text-align: left;
}
.header-profile__panel::before {
  position: absolute;
  z-index: 0;
  top: -45%;
  bottom: -45%;
  left: -32%;
  width: 72%;
  border-radius: 50%;
  background: var(--profile-glow);
  filter: blur(28px);
  pointer-events: none;
  content: "";
  animation: itinerary-red-sweep 9s ease-in-out infinite alternate;
}
.header-profile__panel > * {
  position: relative;
  z-index: 1;
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
/* The colors of all profile details stay bound to the current theme. */
@media (max-width: 800px) {
  .header-account-tools .nav-user-icon.header-profile__trigger {
    width: 38px;
    height: 38px;
    flex-basis: 38px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .header-profile__panel::before { animation: none; }
}

/* A mobile profile is part of the expanded navigation flow, not an
   absolutely-positioned popover hanging off the user icon. Keep both
   controls centered in the first row, then center the card beneath them. */
@media (max-width: 1080px) {
  .header-account-tools:has(.header-profile--open) {
    display: grid;
    grid-template-columns: 40px 40px;
    grid-template-rows: 40px auto;
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


<style src="../styles/mobile-navigation.css"></style>
