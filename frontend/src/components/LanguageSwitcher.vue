<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { locale, t } = useI18n({ useScope: 'global' })
const props = withDefaults(defineProps<{ compact?: boolean; vertical?: boolean; dropdown?: boolean }>(), { compact: false, vertical: false, dropdown: false })
const open = ref(false)
const root = ref<HTMLElement | null>(null)

function setLanguage(language: 'es' | 'en') {
  locale.value = language
  localStorage.setItem('user-locale', language)
  document.documentElement.lang = language
  open.value = false
}

function handleOutsideClick(event: MouseEvent) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <div ref="root" class="language-switcher" :class="{ 'language-switcher--compact': props.compact, 'language-switcher--vertical': props.vertical, 'language-switcher--dropdown': props.dropdown }" role="group" :aria-label="t('custom.header.language')">
    <template v-if="props.dropdown">
      <button class="language-switcher__current" type="button" :aria-label="`${t('custom.header.language')}: ${locale === 'es' ? 'Español' : 'English'}`" :aria-expanded="open" @click.stop="open = !open"><span class="language-switcher__flag" aria-hidden="true">{{ locale === 'es' ? '🇪🇸' : '🇬🇧' }}</span><span class="language-switcher__name">{{ locale === 'es' ? 'Español' : 'English' }}</span><span class="language-switcher__chevron" aria-hidden="true">⌄</span></button>
      <div v-if="open" class="language-switcher__menu">
        <button type="button" :class="{ active: locale === 'es' }" :aria-pressed="locale === 'es'" lang="es" @click="setLanguage('es')"><span aria-hidden="true">🇪🇸</span> Español</button>
        <button type="button" :class="{ active: locale === 'en' }" :aria-pressed="locale === 'en'" lang="en" @click="setLanguage('en')"><span aria-hidden="true">🇬🇧</span> English</button>
      </div>
    </template>
    <template v-else>
      <button type="button" :class="{ active: locale === 'es' }" :aria-pressed="locale === 'es'" lang="es" @click="setLanguage('es')">ES</button>
      <button type="button" :class="{ active: locale === 'en' }" :aria-pressed="locale === 'en'" lang="en" @click="setLanguage('en')">EN</button>
    </template>
  </div>
</template>

<style scoped>
.language-switcher{position:static;display:flex;align-items:center;justify-content:center;gap:16px;padding:0;margin:0;background:transparent;border:0;box-shadow:none}
.language-switcher button{position:relative;appearance:none;border:0;border-radius:0;box-shadow:none;background:transparent;color:inherit;padding:3px 2px 7px;font-size:14px;font-weight:600;line-height:1.2;cursor:pointer;opacity:.68;transition:opacity .2s ease}
.language-switcher button.active{opacity:1;font-weight:800}
.language-switcher button.active::after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:#ad0922;border-radius:3px}
.language-switcher button:hover{opacity:1}
.language-switcher button:focus-visible{outline:2px solid currentColor;outline-offset:3px}
.language-switcher--compact{gap:8px}
.language-switcher--compact button{font-size:10px;padding:2px 1px 5px}
.language-switcher--compact button.active::after{height:2px}
.language-switcher--vertical{flex-direction:column;gap:2px}
.language-switcher--vertical button{min-width:26px;padding:4px 5px 4px 8px;text-align:left}
.language-switcher--vertical button.active::after{left:0;right:auto;top:3px;bottom:3px;width:2px;height:auto;border-radius:2px}
.language-switcher--dropdown{position:relative;top:auto;left:auto;right:auto;align-self:auto;width:52px;transform:none;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0}
.language-switcher--dropdown .language-switcher__current{display:flex;align-items:center;justify-content:center;gap:2px;width:100%;padding:5px 2px;border:0;border-radius:8px;color:inherit;font-size:14px;font-weight:800;opacity:1}
.language-switcher__flag{font-size:20px;line-height:1}
.language-switcher__name{font-size:12px;font-weight:750;white-space:nowrap}
.language-switcher__chevron{font-size:14px;transition:transform .18s}
.language-switcher--dropdown:has(.language-switcher__menu) .language-switcher__chevron{transform:rotate(180deg)}
.language-switcher--dropdown .language-switcher__menu{position:absolute;z-index:40;top:calc(100% + 5px);right:0;display:grid;gap:3px;min-width:130px;padding:6px;border:1px solid #ffffff50;border-radius:10px;background:#080808;box-shadow:0 10px 24px #0005}
.language-switcher--dropdown .language-switcher__menu button{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;border:0;border-radius:6px;background:transparent;color:#fff;text-align:left;font-size:12px;opacity:1}
.language-switcher--dropdown .language-switcher__menu button:hover,.language-switcher--dropdown .language-switcher__menu button.active{background:#b20c2a;color:#fff}
</style>
