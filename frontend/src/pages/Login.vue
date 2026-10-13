<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LanguageSwitcher from '../components/LanguageSwitcher.vue'
const { t } = useI18n({ useScope: 'global' })

type Role = 'usuario' | 'cliente'
const role = ref<Role>('cliente')
const email = ref('')
const dynamics = ref('')
const otp = ref('')
const challengeId = ref('')
const step = ref<'identity' | 'otp'>('identity')
const message = ref('')
const error = ref('')
const loading = ref(false)
const nextPath = new URLSearchParams(window.location.search).get('next')
const destination = nextPath?.startsWith('/') && !nextPath.startsWith('//') && !nextPath.startsWith('/\\')
  ? nextPath : '/home'

onMounted(async () => {
  // El servidor determina si hay una sesión auténtica; localStorage no concede acceso.
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    if (response.ok) {
      localStorage.removeItem('castrofallas-guest-mode')
      sessionStorage.removeItem('castrofallas-guest-mode')
      window.location.replace(destination)
    }
  } catch { /* La página de login sigue accesible si falla la API. */ }
})

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
  loading.value = true
  try {
    const response = await fetch('/api/auth/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        tipoAcceso: role.value,
        correo: email.value.trim().toLowerCase(),
        codigoDynamics: role.value === 'cliente' ? dynamics.value.trim() : null
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
    localStorage.removeItem('castrofallas-guest-mode')
    sessionStorage.removeItem('castrofallas-guest-mode')
    window.location.assign(destination)
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('custom.login.verifyError')
  } finally {
    loading.value = false
  }
}

function changeRole(next: Role) {
  role.value = next
  step.value = 'identity'
  otp.value = ''
  error.value = ''
  message.value = ''
}
</script>

<template>
  <main class="login-screen">
    <div class="login-visual">
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

        <div class="login-auth-options" role="group" :aria-label="$t('custom.login.roleAria')">
          <button type="button" :class="{ selected: role === 'cliente' }" @click="changeRole('cliente')">{{ $t('custom.login.roles.0') }}</button>
          <button type="button" :class="{ selected: role === 'usuario' }" @click="changeRole('usuario')">{{ $t('custom.login.roles.1') }}</button>
        </div>

        <form v-if="step === 'identity'" class="login-auth-form" @submit.prevent="requestCode">
          <label>{{ $t('custom.login.email') }}
            <input v-model="email" required type="email" maxlength="255" autocomplete="email" :placeholder="$t('custom.login.emailPlaceholder')" />
          </label>
          <label v-if="role === 'cliente'">{{ $t('custom.login.companyCode') }}
            <input v-model="dynamics" required maxlength="200" autocomplete="off" :placeholder="$t('custom.login.companyCodePlaceholder')" />
          </label>
          <p class="login-auth-help" v-if="role === 'cliente'">{{ $t('custom.login.clientHelp') }}</p>
          <p class="login-auth-help" v-else>{{ $t('custom.login.userHelp') }}</p>
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
