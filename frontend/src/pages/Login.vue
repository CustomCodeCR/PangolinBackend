<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import { refreshSession } from '../services/auth'
const { t } = useI18n({ useScope: 'global' })
const email = ref('')
const otp = ref('')
const challengeId = ref('')
const step = ref<'identity' | 'otp'>('identity')
const message = ref('')
const error = ref('')
const loading = ref(false)
const nextPath = new URLSearchParams(window.location.search).get('next')
const destination = nextPath?.startsWith('/') && !nextPath.startsWith('//') && !nextPath.startsWith('/\\')
  ? nextPath : '/home'

const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)')
function applyThemePreference() {
  const savedTheme = localStorage.getItem('castrofallas-theme')
  const darkMode = savedTheme ? savedTheme === 'dark' : !!systemThemeQuery?.matches
  document.documentElement.classList.toggle('theme-dark', darkMode)
}
function syncSystemTheme(event: MediaQueryListEvent) {
  if (localStorage.getItem('castrofallas-theme')) return
  document.documentElement.classList.toggle('theme-dark', event.matches)
}

applyThemePreference()
onMounted(async () => {
  systemThemeQuery?.addEventListener('change', syncSystemTheme)
  if (await refreshSession()) window.location.replace(destination)
})
onUnmounted(() => systemThemeQuery?.removeEventListener('change', syncSystemTheme))

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body.error || (response.status === 401 ? t('custom.login.invalidOtp') : t('custom.login.loginError'))
    const marker = body.code ? ` [${body.code}]` : ''
    return `${detail}${marker}${body.traceId ? ` (ref. ${body.traceId})` : ''}`
  } catch {
    return response.status === 401 ? t('custom.login.invalidOtp') : t('custom.login.errorHttp', { status: response.status })
  }
}

async function requestCode() {
  error.value = ''
  message.value = ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
    error.value = t('custom.login.emailInvalid')
    return
  }
  loading.value = true
  try {
    const response = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        correo: email.value.trim().toLowerCase()
      })
    })
    if (!response.ok) throw new Error(await parseError(response))
    const result = await response.json()
    challengeId.value = result.challengeId
    message.value = result.message
    otp.value = ''
    step.value = 'otp'
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('custom.login.requestError')
  } finally {
    loading.value = false
  }
}

async function verifyCode() {
  error.value = ''
  loading.value = true
  try {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ challengeId: challengeId.value, codigo: otp.value.trim() })
    })
    if (!response.ok) throw new Error(await parseError(response))
    const user = await refreshSession()
    if (!user) throw new Error(t('custom.login.roleNotReturned'))
    window.location.assign(destination)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('custom.login.verifyError')
  } finally {
    loading.value = false
  }
}

function enterAsGuest() {
  window.location.assign('/home')
}
</script>

<template>
  <main class="login-screen">
    <div class="login-visual">
      <button class="login-guest-back" type="button" @click="enterAsGuest">
        <span aria-hidden="true">←</span> {{ $t('custom.login.back') }}
      </button>
      <div class="login-visual__content">
        <img src="/images/logo.png" :alt="$t('phrases.p138')" />
        <p class="section-tag light-tag">{{ $t('custom.login.topTag') }}</p>
        <h1>{{ $t('custom.login.visualTitle1') }}<br />{{ $t('custom.login.visualTitle2') }}<br /><em>{{ $t('custom.login.visualTitle3') }}</em></h1>
        <p>{{ $t('custom.login.visualIntro') }}</p>
      </div>
      <span class="login-visual__bottom">{{ $t('custom.login.visualBottom') }}</span>
    </div>

    <div class="login-card-column">
      <div class="login-top-tools"><div class="login-mini-brand"><span class="logo-dot"></span> {{ $t('custom.login.brand') }}</div><LanguageSwitcher /></div>
      <section class="login-card login-auth-card">
        <span class="section-tag">{{ $t('custom.login.eyebrow') }}</span>
        <h2>{{ $t('custom.login.title') }}<span>.</span></h2>
        <p class="login-auth-intro">{{ $t('custom.login.intro') }}</p>

        <form v-if="step === 'identity'" class="login-auth-form" @submit.prevent="requestCode">
          <label>{{ $t('custom.login.email') }}
            <input v-model="email" required type="email" maxlength="255" autocomplete="email" :placeholder="$t('custom.login.emailPlaceholder')" />
          </label>
          <p class="login-auth-help">{{ $t('custom.login.emailHelp') }}</p>
          <button class="login-auth-primary" type="submit" :disabled="loading">{{ loading ? $t('custom.login.sending') : $t('custom.login.sendCode') }} <IconSymbol glyph="→" /></button>
        </form>

        <form v-else class="login-auth-form" @submit.prevent="verifyCode">
          <p class="login-auth-help">{{ message || $t('custom.login.otpMessage') }}</p>
          <label>{{ $t('custom.login.otpLabel') }}
            <input v-model="otp" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" />
          </label>
          <p class="login-auth-help">{{ $t('custom.login.otpHelp') }}</p>
          <button class="login-auth-primary" type="submit" :disabled="loading || otp.length !== 6">{{ loading ? $t('custom.login.verifying') : $t('custom.login.verify') }} <IconSymbol glyph="→" /></button>
          <button class="login-auth-back" type="button" @click="step = 'identity'; error = ''">{{ $t('custom.login.back') }}</button>
        </form>

        <p v-if="error" class="login-auth-error" role="alert">{{ error }}</p>
        <p class="login-auth-footer">{{ $t('custom.login.footer') }}</p>
      </section>
      <div class="login-end">© {{ new Date().getFullYear() }} Castro Fallas · {{ $t('custom.login.end') }}</div>
    </div>
  </main>
</template>
