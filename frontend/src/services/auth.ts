import { reactive } from 'vue'

export type AppRole = 'invitado' | 'cliente' | 'administrador'
export type AuthenticatedRole = Exclude<AppRole, 'invitado'>

export interface AuthUser {
  id?: string
  correo: string
  nombre?: string
  role: AppRole
}

export const authState = reactive({
  user: null as AuthUser | null,
  previewRole: null as AppRole | null,
  loaded: false
})
let refreshPromise: Promise<AuthUser | null> | null = null

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') return null
  const role = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (['admin', 'administrador', 'administrator'].includes(role)) return 'administrador'
  if (['cliente', 'client', 'customer'].includes(role)) return 'cliente'
  if (['invitado', 'guest', 'anonymous'].includes(role)) return 'invitado'
  return null
}

function parseUser(payload: unknown): AuthUser | null {
  if (!payload || typeof payload !== 'object') return null
  const root = payload as Record<string, unknown>
  const outer = (root.user ?? root.usuario ?? root.data ?? root) as Record<string, unknown>
  const candidate = (outer.user ?? outer.usuario ?? outer) as Record<string, unknown>
  if (!candidate || typeof candidate !== 'object') return null
  const role = normalizeRole(candidate.role ?? candidate.rol ?? candidate.tipoAcceso ?? candidate.tipo)
  const correo = candidate.correo ?? candidate.email ?? candidate.emailAddress
  if (!role || typeof correo !== 'string') return null
  const nombre = candidate.nombre ?? candidate.name ?? candidate.nombreCliente
  const id = candidate.id ?? candidate.userId ?? candidate.usuarioId
  return {
    ...(typeof id === 'string' || typeof id === 'number' ? { id: String(id) } : {}),
    correo,
    ...(typeof nombre === 'string' ? { nombre } : {}),
    role
  }
}

/** The server session is the sole source of authenticated identity and role. */
export function refreshSession(): Promise<AuthUser | null> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      })
      authState.user = response.ok ? parseUser(await response.json()) : null
    } catch {
      authState.user = null
    }
    const isDevelopmentBuild = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV === true
    const requestedPreview = isDevelopmentBuild
      ? new URLSearchParams(window.location.search).get('previewRole')
      : null
    authState.previewRole = authState.user ? null :
      requestedPreview === 'administrador' || requestedPreview === 'cliente' || requestedPreview === 'invitado'
        ? requestedPreview : null
    authState.loaded = true
    return authState.user
  })()
  return refreshPromise.finally(() => { refreshPromise = null })
}

export function currentRole(): AppRole {
  return authState.user?.role ?? authState.previewRole ?? 'invitado'
}

export async function logoutSession(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store'
  })
  if (!response.ok) throw new Error('No se pudo cerrar la sesión.')
  authState.user = null
  authState.loaded = true
}
