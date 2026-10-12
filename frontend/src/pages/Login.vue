<script setup lang="ts">
import { ref } from 'vue'

type Role = 'usuario' | 'cliente' | 'invitado'
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

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json()
    const detail = body.error || (response.status === 401 ? 'Código inválido o expirado.' : 'No se pudo iniciar sesión.')
    const marker = body.code ? ` [${body.code}]` : ''
    return `${detail}${marker}${body.traceId ? ` (ref. ${body.traceId})` : ''}`
  } catch {
    return response.status === 401 ? 'Código inválido o expirado.' : `Error HTTP ${response.status}`
  }
}

async function requestCode() {
  if (role.value === 'invitado') {
    window.location.assign('/home')
    return
  }
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
    error.value = e instanceof Error ? e.message : 'No se pudo solicitar el código.'
  } finally {
    loading.value = false
  }
}

async function verifyCode() {
  error.value = ''
  loading.value = true
  try {
    const response = await fetch('/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ challengeId: challengeId.value, codigo: otp.value.trim() })
    })
    if (!response.ok) throw new Error(await parseError(response))
    window.location.assign(destination)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'No se pudo verificar el código.'
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
  <main class="auth-simple">
    <section class="auth-simple__card">
      <img class="auth-simple__logo" src="/images/logo.png" alt="Castro Fallas" />
      <p class="section-tag">ACCESO A LA PLATAFORMA</p>
      <h1>Ingresar</h1>
      <p class="auth-simple__hint">Elegí cómo querés acceder. El ingreso con cuenta se confirma por correo.</p>

      <div class="auth-simple__options" role="group" aria-label="Tipo de ingreso">
        <button type="button" :class="{ selected: role === 'cliente' }" @click="changeRole('cliente')">Cliente</button>
        <button type="button" :class="{ selected: role === 'usuario' }" @click="changeRole('usuario')">Usuario</button>
        <button type="button" :class="{ selected: role === 'invitado' }" @click="changeRole('invitado')">Invitado</button>
      </div>

      <div v-if="role === 'invitado'" class="auth-simple__guest">
        <p>Podés explorar la página sin iniciar sesión. Para registrar cotizaciones necesitás una cuenta habilitada.</p>
        <a class="auth-simple__primary" href="/home">Entrar como invitado →</a>
      </div>

      <form v-else-if="step === 'identity'" @submit.prevent="requestCode" class="auth-simple__form">
        <label>Correo electrónico
          <input v-model="email" required type="email" maxlength="255" autocomplete="email" placeholder="nombre@empresa.com" />
        </label>
        <label v-if="role === 'cliente'">Código Dynamics de la empresa
          <input v-model="dynamics" required maxlength="200" autocomplete="off" placeholder="Código asignado a tu empresa" />
        </label>
        <p class="auth-simple__hint" v-if="role === 'cliente'">El correo debe pertenecer a un usuario activo vinculado con ese código Dynamics.</p>
        <p class="auth-simple__hint" v-else>Tu cuenta debe estar activa y registrada con tipo de acceso «usuario».</p>
        <button class="auth-simple__primary" type="submit" :disabled="loading">{{ loading ? 'Enviando…' : 'Enviar código al correo' }}</button>
      </form>

      <form v-else @submit.prevent="verifyCode" class="auth-simple__form">
        <p class="auth-simple__hint">{{ message }} Revisá tu correo; en pruebas con LocalOutbox también podés revisar backend/local-outbox/.</p>
        <label>Código de 6 dígitos
          <input v-model="otp" required minlength="6" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000" />
        </label>
        <p class="auth-simple__hint">Vence a los 5 minutos; máximo 5 intentos. Cada código puede utilizarse una sola vez.</p>
        <button class="auth-simple__primary" type="submit" :disabled="loading || otp.length !== 6">{{ loading ? 'Verificando…' : 'Verificar y entrar' }}</button>
        <button class="auth-simple__back" type="button" @click="step = 'identity'; error = ''">← Volver / solicitar otro código</button>
      </form>
      <p v-if="error" class="auth-simple__error" role="alert">{{ error }}</p>
      <p class="auth-simple__footer">Acceso de prueba · Sin creación pública de cuentas</p>
    </section>
  </main>
</template>
