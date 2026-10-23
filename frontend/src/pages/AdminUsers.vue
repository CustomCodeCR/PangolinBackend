<script setup lang="ts">
import { onMounted, ref } from 'vue'
import IconSymbol from '../components/IconSymbol.vue'
import FieldDropdown from '../components/FieldDropdown.vue'
import { authState, type AppRole } from '../services/auth'

interface ManagedUser {
  id: string
  correo: string
  nombre?: string
  role: AppRole
  activo: boolean
  creadoEn?: string
}

const users = ref<ManagedUser[]>([])
const loading = ref(true)
const savingId = ref<string | null>(null)
const error = ref('')
const notice = ref('')
const previewSuffix = authState.previewRole ? `?previewRole=${authState.previewRole}` : ''

function roleLabel(role: AppRole) {
  return role === 'administrador' ? 'Administrador' : role === 'cliente' ? 'Cliente' : 'Invitado'
}

async function loadUsers() {
  loading.value = true
  error.value = ''
  if (authState.previewRole) {
    users.value = []
    error.value = 'Esta vista de prueba no consulta ni modifica usuarios. El directorio aparecerá al conectar la API segura de administración.'
    loading.value = false
    return
  }
  try {
    const response = await fetch('/api/admin/users?page=1&pageSize=100', {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    })
    if (!response.ok) throw new Error(response.status === 404
      ? 'La API de administración de usuarios aún no está conectada.'
      : `No se pudo cargar la lista (HTTP ${response.status}).`)
    const body = await response.json()
    const list = Array.isArray(body) ? body : body.users ?? body.usuarios ?? body.data
    if (!Array.isArray(list)) throw new Error('La API debe devolver una lista de usuarios.')
    users.value = (list as unknown[]).map((entry): ManagedUser => {
      const item = entry as Record<string, unknown>
      const roleText = String(item.role ?? item.rol ?? '').toLowerCase()
      const role: AppRole = ['administrador', 'admin'].includes(roleText)
        ? 'administrador'
        : ['invitado', 'guest'].includes(roleText) ? 'invitado' : 'cliente'
      const nombre = item.nombre ?? item.name
      const creadoEn = item.creadoEn ?? item.createdAt
      return {
        id: String(item.id ?? item.userId ?? item.usuarioId ?? ''),
        correo: String(item.correo ?? item.email ?? ''),
        ...(typeof nombre === 'string' ? { nombre } : {}),
        role,
        activo: item.activo === false || item.active === false ? false : true,
        ...(typeof creadoEn === 'string' ? { creadoEn } : {})
      }
    }).filter(user => Boolean(user.id && user.correo))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo cargar la lista de usuarios.'
  } finally {
    loading.value = false
  }
}

async function updateUser(user: ManagedUser) {
  if (authState.previewRole) return
  savingId.value = user.id
  error.value = ''
  notice.value = ''
  try {
    const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ role: user.role, activo: user.activo })
    })
    if (!response.ok) throw new Error(`No se pudo guardar el usuario (HTTP ${response.status}).`)
    notice.value = `Cambios guardados para ${user.correo}.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo guardar el usuario.'
    await loadUsers()
  } finally {
    savingId.value = null
  }
}

onMounted(loadUsers)
</script>

<template>
  <main class="admin-users-page">
    <header class="admin-users-topbar">
      <a class="admin-users-brand" :href="`/home${previewSuffix}`"><img src="/images/logo.png" alt="Castro Fallas" /><span>Administración</span></a>
      <a class="admin-users-back" :href="`/home${previewSuffix}`">Volver al sitio <IconSymbol glyph="↗" /></a>
    </header>
    <section class="admin-users-shell">
      <nav class="admin-users-nav" aria-label="Secciones de administración">
        <a :href="`/admin/contenido${previewSuffix}`">Contenido</a>
        <a class="is-active" :href="`/admin/usuarios${previewSuffix}`" aria-current="page">Usuarios</a>
      </nav>
      <div class="admin-users-heading">
        <p class="admin-users-eyebrow">CASTRO FALLAS · ADMINISTRACIÓN</p>
        <h1>Usuarios y roles</h1>
        <p>Consulta las cuentas autorizadas y su nivel de acceso.</p>
      </div>
      <div v-if="authState.previewRole" class="admin-users-preview" role="status">Previsualización de desarrollo · Rol {{ roleLabel(authState.previewRole) }}. No es una sesión ni un permiso real.</div>
      <div class="admin-users-note"><strong>Acceso protegido:</strong> cada cambio debe validarse y guardarse en el backend. Invitado, cliente y administrador son los únicos roles disponibles.</div>
      <div v-if="error" class="admin-users-message admin-users-message--error" role="alert">{{ error }} <button type="button" @click="loadUsers">Reintentar</button></div>
      <p v-if="notice" class="admin-users-message admin-users-message--success" role="status">{{ notice }}</p>
      <section class="admin-users-card" aria-label="Cuentas registradas">
        <header class="admin-users-card__heading"><div><h2>Cuentas registradas</h2><p>{{ loading ? 'Cargando…' : `${users.length} usuarios` }}</p></div><button type="button" :disabled="loading" @click="loadUsers">Actualizar</button></header>
        <div v-if="loading" class="admin-users-empty" role="status">Consultando el sistema de usuarios…</div>
        <div v-else-if="!error && users.length === 0" class="admin-users-empty">Aún no hay cuentas para mostrar.</div>
        <div v-else-if="users.length" class="admin-users-table-wrap">
          <table class="admin-users-table">
            <thead><tr><th>Cuenta</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              <tr v-for="user in users" :key="user.id">
                <td><strong>{{ user.nombre || user.correo }}</strong><small v-if="user.nombre">{{ user.correo }}</small></td>
                <td><FieldDropdown :model-value="user.role" :aria-label="`Rol de ${user.correo}`" :options="[{value:'cliente',label:'Cliente'},{value:'administrador',label:'Administrador'}]" @update:model-value="value => user.role = value === 'administrador' ? 'administrador' : 'cliente'" /></td>
                <td><FieldDropdown :model-value="String(user.activo)" :aria-label="`Estado de ${user.correo}`" :options="[{value:'true',label:'Activo'},{value:'false',label:'Desactivado'}]" @update:model-value="value => user.activo = value === 'true'" /></td>
                <td><button class="admin-users-save" type="button" :disabled="savingId === user.id" @click="updateUser(user)">{{ savingId === user.id ? 'Guardando…' : 'Guardar' }}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </section>
  </main>
</template>

<style scoped>
.admin-users-page{min-height:100vh;background:linear-gradient(135deg,#f8ecee,#f5f6fa 52%,#e9eef8);color:#171923;padding-bottom:60px}.admin-users-topbar{height:82px;background:#101827;display:flex;align-items:center;justify-content:space-between;padding:0 clamp(20px,5vw,80px);color:#fff}.admin-users-brand,.admin-users-back{display:flex;align-items:center;gap:14px;color:inherit;text-decoration:none;font-weight:750}.admin-users-brand img{width:54px;height:48px;object-fit:contain}.admin-users-shell{width:min(1180px,calc(100% - 40px));margin:48px auto}.admin-users-nav{display:flex;gap:9px;margin-bottom:34px;border-bottom:1px solid #d9dce4}.admin-users-nav a{padding:12px 17px;color:#586071;text-decoration:none;font-weight:750;border-bottom:3px solid transparent}.admin-users-nav a.is-active{color:#a80e18;border-color:#a80e18}.admin-users-eyebrow{margin:0 0 9px;color:#a80e18;font-size:11px;letter-spacing:.16em;font-weight:850}.admin-users-heading h1{margin:0;font-size:clamp(34px,5vw,54px);letter-spacing:-.045em}.admin-users-heading>p:last-child{color:#656b78}.admin-users-note,.admin-users-preview{margin:25px 0;padding:16px 18px;border:1px solid #e6c1c7;border-radius:14px;background:#fff9fa;color:#53474a;line-height:1.55}.admin-users-preview{border-color:#dec67b;background:#fff9e7;color:#554314;font-size:13px}.admin-users-card{overflow:hidden;border:1px solid #e2e5eb;border-radius:20px;background:#fff;box-shadow:0 15px 38px #16213b12}.admin-users-card__heading{display:flex;align-items:center;justify-content:space-between;padding:22px 25px;border-bottom:1px solid #eaecf1}.admin-users-card__heading h2{margin:0;font-size:20px}.admin-users-card__heading p{margin:5px 0 0;color:#737a87;font-size:13px}.admin-users-card__heading button,.admin-users-save{border:0;border-radius:999px;background:#a80e18;color:#fff;padding:10px 16px;font:inherit;font-weight:750;cursor:pointer}.admin-users-card__heading button:disabled,.admin-users-save:disabled{opacity:.55;cursor:wait}.admin-users-empty{padding:42px 24px;text-align:center;color:#6b7280}.admin-users-table-wrap{overflow-x:auto}.admin-users-table{width:100%;border-collapse:collapse;text-align:left}.admin-users-table th,.admin-users-table td{padding:15px 20px;border-bottom:1px solid #eaecf1;white-space:nowrap}.admin-users-table th{background:#f8f9fb;color:#626a78;font-size:12px;letter-spacing:.04em}.admin-users-table td:first-child{min-width:250px;white-space:normal}.admin-users-table td:first-child strong,.admin-users-table td:first-child small{display:block}.admin-users-table td:first-child small{margin-top:4px;color:#737a87}.admin-users-table select{min-width:140px;border:1px solid #cfd3dd;border-radius:9px;background:#fff;color:#20232b;padding:9px 11px;font:inherit}.admin-users-message{margin:16px 0;padding:13px 15px;border-radius:10px}.admin-users-message--error{background:#fff0f1;color:#8b1422}.admin-users-message--success{background:#edf8f1;color:#246342}.admin-users-message button{margin-left:8px;border:0;background:transparent;color:inherit;text-decoration:underline;font:inherit;font-weight:700;cursor:pointer}@media(max-width:680px){.admin-users-topbar{height:70px;padding:0 16px}.admin-users-brand{gap:8px;font-size:14px}.admin-users-brand img{width:42px;height:40px}.admin-users-back{font-size:13px}.admin-users-shell{width:calc(100% - 24px);margin:30px auto}.admin-users-card__heading{padding:17px}.admin-users-table th,.admin-users-table td{padding:12px 14px}}
</style>
