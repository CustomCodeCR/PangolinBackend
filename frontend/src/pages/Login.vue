<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import SiteMedia from '../components/SiteMedia.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
import { refreshSession } from '../services/auth'
const { t, locale } = useI18n({ useScope: 'global' })
const email = ref('')
const otp = ref('')
const challengeId = ref('')
const step = ref<'identity' | 'otp'>('identity')
const message = ref('')
const error = ref('')
const errorKind = ref<'' | 'mail' | 'rate'>('')
const loading = ref(false)
const retrySeconds = ref(0)
const RETRY_STORAGE_KEY = 'castrofallas.login.otpRetryUntil'
const RETRY_SALT_KEY = 'castrofallas.login.otpRetrySalt'
let retryUntil = 0
let retryTimer: number | undefined

// Keep the countdown per email rather than per browser tab: switching from an
// admin account to a client must not inherit the previous user's OTP cooldown.
// Only a temporary salted fingerprint and timestamp are stored, never an email.
function retryStorageKey(): string | null {
  const normalized = email.value.trim().toLowerCase()
  if (!normalized) return null

  let salt = sessionStorage.getItem(RETRY_SALT_KEY)
  if (!salt) {
    const bytes = new Uint8Array(16)
    window.crypto.getRandomValues(bytes)
    salt = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    sessionStorage.setItem(RETRY_SALT_KEY, salt)
  }

  let hash = 2166136261
  const input = salt + ':' + normalized
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // This is a tab-local UI marker only, never an authentication identifier.
  return RETRY_STORAGE_KEY + ':' + (hash >>> 0).toString(16)
}

function updateRetryCountdown() {
  retrySeconds.value = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000))
  if (!retrySeconds.value) {
    const key = retryStorageKey()
    if (key) sessionStorage.removeItem(key)
  }
}
function restoreRetryCooldown() {
  const key = retryStorageKey()
  const saved = key ? Number(sessionStorage.getItem(key)) : 0
  retryUntil = Number.isFinite(saved) && saved > Date.now() && saved - Date.now() <= 900_000
    ? saved
    : 0
  updateRetryCountdown()
}
function beginRetryCooldown(response: Response) {
  const raw = Number(response.headers.get('Retry-After'))
  const seconds = Number.isFinite(raw) && raw > 0 ? Math.min(900, Math.ceil(raw)) : 60
  retryUntil = Date.now() + seconds * 1000
  const key = retryStorageKey()
  if (key) sessionStorage.setItem(key, String(retryUntil))
  updateRetryCountdown()
}
watch(email, restoreRetryCooldown)
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
  // Drop the obsolete tab-wide key from earlier builds.
  sessionStorage.removeItem(RETRY_STORAGE_KEY)
  restoreRetryCooldown()
  retryTimer = window.setInterval(updateRetryCountdown, 1000)
  if (await refreshSession()) window.location.replace(destination)
})
onUnmounted(() => {
  systemThemeQuery?.removeEventListener('change', syncSystemTheme)
  if (retryTimer !== undefined) window.clearInterval(retryTimer)
})

type FriendlyError = { message: string; kind: '' | 'mail' | 'rate' }
async function parseError(response: Response): Promise<FriendlyError> {
  let body: { code?: string; error?: string } | null = null
  try { body = await response.json() } catch { /* Empty HTTP 429 responses are valid. */ }
  if (response.status === 429) {
    return { message: t('custom.login.rateDescription'), kind: 'rate' }
  }
  if (response.status === 503 && body?.code === 'email_unavailable') {
    // Do not claim a 60s cooldown when the backend still allows a second try.
    const messageKey = response.headers.has('Retry-After')
      ? 'custom.login.mailUnavailableDescription'
      : 'custom.login.mailImmediateRetryDescription'
    return { message: t(messageKey), kind: 'mail' }
  }
  if (body?.code === 'account_unavailable') {
    return { message: t('custom.login.accountUnavailable'), kind: '' }
  }
  if (response.status === 401) return { message: t('custom.login.invalidOtp'), kind: '' }
  // No internal error codes, stack data or trace identifiers in the customer UI.
  if (response.status >= 500) return { message: t('custom.login.serviceError'), kind: '' }
  return { message: body?.error || t('custom.login.loginError'), kind: '' }
}

async function requestCode() {
  if (loading.value || retrySeconds.value > 0) return
  error.value = ''
  errorKind.value = ''
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
    if (!response.ok) {
      const issue = await parseError(response)
      errorKind.value = issue.kind
      if (issue.kind === 'rate' || (issue.kind === 'mail' && response.headers.has('Retry-After'))) {
        beginRetryCooldown(response)
      }
      throw new Error(issue.message)
    }
    const result = await response.json()
    // After the second successful send the server already knows a pause
    // is required. Keep the button disabled if the user goes back.
    if (response.headers.has('Retry-After')) beginRetryCooldown(response)
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
  if (loading.value || (errorKind.value === 'rate' && retrySeconds.value > 0)) return
  error.value = ''
  errorKind.value = ''
  loading.value = true
  try {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ challengeId: challengeId.value, codigo: otp.value.trim() })
    })
    if (!response.ok) {
      const issue = await parseError(response)
      errorKind.value = issue.kind
      if (issue.kind === 'rate') beginRetryCooldown(response)
      throw new Error(issue.message)
    }
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
    <div class="login-visual" :style="{ '--cms-login-hero': siteCssImage('login.hero.media', '/images/hero.webp') }">
      <SiteMedia v-if="siteVisual('login.hero.media', '/images/hero.webp').kind.startsWith('Video')" slot-key="login.hero.media" fallback="/images/hero.webp" background />
      <button class="login-guest-back" type="button" @click="enterAsGuest">
        <IconSymbol glyph="←" :size="20" /> {{ $t('custom.login.back') }}
      </button>
      <div class="login-visual__content">
        <SiteMedia slot-key="shared.logo.media" fallback="/images/logo.png" :alt="$t('phrases.p138')" />
        <p class="section-tag light-tag">{{ $t('custom.login.topTag') }}</p>
        <h1>{{ siteText('login.hero.title1', $t('custom.login.visualTitle1'), locale) }}<br />{{ siteText('login.hero.title2', $t('custom.login.visualTitle2'), locale) }}<br /><em>{{ siteText('login.hero.title3', $t('custom.login.visualTitle3'), locale) }}</em></h1>
        <p>{{ siteText('login.hero.intro', $t('custom.login.visualIntro'), locale) }}</p>
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
          <button class="login-auth-primary" type="submit" :disabled="loading || retrySeconds > 0">{{ loading ? $t('custom.login.sending') : retrySeconds > 0 ? $t('custom.login.retryButton', { seconds: retrySeconds }) : $t('custom.login.sendCode') }} <IconSymbol glyph="→" /></button>
        </form>

        <form v-else class="login-auth-form" @submit.prevent="verifyCode">
          <p class="login-auth-help">{{ message || $t('custom.login.otpMessage') }}</p>
          <label>{{ $t('custom.login.otpLabel') }}
            <input v-model="otp" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" />
          </label>
          <p class="login-auth-help">{{ $t('custom.login.otpHelp') }}</p>
          <button class="login-auth-primary" type="submit" :disabled="loading || otp.length !== 6 || (errorKind === 'rate' && retrySeconds > 0)">{{ loading ? $t('custom.login.verifying') : $t('custom.login.verify') }} <IconSymbol glyph="→" /></button>
          <button class="login-auth-back" type="button" @click="step = 'identity'; error = ''">{{ $t('custom.login.back') }}</button>
        </form>

        <div v-if="error && (errorKind === 'mail' || errorKind === 'rate')" class="login-auth-feedback" role="alert">
          <span class="login-auth-feedback__icon"><IconSymbol :glyph="errorKind === 'mail' ? '✉' : '◷'" :size="24" /></span>
          <div class="login-auth-feedback__copy">
            <strong>{{ $t(errorKind === 'mail' ? 'custom.login.mailUnavailableTitle' : 'custom.login.rateTitle') }}</strong>
            <span>{{ error }}</span>
            <small v-if="retrySeconds > 0">{{ $t('custom.login.retryIn', { seconds: retrySeconds }) }}</small>
          </div>
        </div>
        <p v-else-if="error" class="login-auth-error" role="alert">{{ error }}</p>
      </section>
      <div class="login-end">© {{ new Date().getFullYear() }} Castro Fallas · {{ $t('custom.login.end') }}</div>
    </div>
  </main>
</template>

<style scoped>
.login-auth-feedback{display:flex;align-items:flex-start;gap:12px;margin:16px 0 0;padding:15px;border:1px solid #edc6ce;border-radius:14px;background:#fff5f6;color:#22242b}
.login-auth-feedback__icon{display:flex;flex:none;align-items:center;justify-content:center;width:43px;height:43px;border-radius:12px;background:#f5e3e8;color:#a90b2d}
.login-auth-feedback__copy{display:grid;gap:5px;min-width:0;font-size:13px;line-height:1.55}
.login-auth-feedback__copy strong{font-size:14px;font-weight:750}
.login-auth-feedback__copy small{font-size:12px;font-weight:700;color:#a90b2d}
:global(html.theme-dark) .login-auth-feedback{background:#131c2d;border-color:#36445d;color:#f4f6fa}
:global(html.theme-dark) .login-auth-feedback__icon{background:#2d1c30;color:#f2a0b2}
:global(html.theme-dark) .login-auth-feedback__copy small{color:#f2a0b2}
</style>
