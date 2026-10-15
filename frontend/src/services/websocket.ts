let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let attempts = 0
let manuallyStopped = false

export interface DataChangeNotification {
  type: 'data-changed'
  eventId: string
  resource: string
  timestamp: string
}

function getWebSocketUrl(): string {
  const configured = (import.meta as ImportMeta & { env?: { VITE_WS_URL?: string } }).env?.VITE_WS_URL?.trim()
  if (configured) {
    try {
      const address = new URL(configured)
      if (!['ws:', 'wss:'].includes(address.protocol)) throw new Error('Protocolo inválido')
      if (location.protocol === 'https:' && address.protocol !== 'wss:') {
        throw new Error('En páginas HTTPS se requiere WSS')
      }
      return address.toString()
    } catch (error) {
      console.error('[Castro Fallas] VITE_WS_URL inválida:', error)
      throw error
    }
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${location.hostname}:8081`
}

function scheduleReconnect() {
  if (manuallyStopped || reconnectTimer !== null) return

  const delay = Math.min(1000 * 2 ** attempts, 30000)
  attempts = Math.min(attempts + 1, 5)

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, delay)
}

export function connectWebSocket(): WebSocket | null {
  manuallyStopped = false

  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return socket
  }

  try {
    const connection = new WebSocket(getWebSocketUrl())
    socket = connection

    connection.onopen = () => {
      attempts = 0
      console.log('[Castro Fallas] WebSocket conectado')
    }

    connection.onmessage = (event) => {
      let message: unknown

      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }

      if (!message || typeof message !== 'object') return

      const data = message as Record<string, unknown>

      if (
        data.type === 'data-changed' &&
        typeof data.eventId === 'string' &&
        typeof data.resource === 'string' &&
        typeof data.timestamp === 'string'
      ) {
        const notification: DataChangeNotification = {
          type: 'data-changed',
          eventId: data.eventId,
          resource: data.resource,
          timestamp: data.timestamp
        }

        console.log(
          '[Castro Fallas] Actualizacion recibida:',
          notification.resource
        )

        window.dispatchEvent(
          new CustomEvent<DataChangeNotification>(
            'castrofallas:data-changed',
            { detail: notification }
          )
        )
      } else if (data.type === 'connected') {
        console.log('[Castro Fallas] Conexion confirmada')
      }
    }

    connection.onerror = () => {
      console.warn('[Castro Fallas] Error WebSocket')
    }

    connection.onclose = () => {
      if (socket === connection) socket = null

      console.log('[Castro Fallas] WebSocket desconectado')
      scheduleReconnect()
    }

    return connection
  } catch (error) {
    console.error('[Castro Fallas] Error al conectar:', error)
    scheduleReconnect()
    return null
  }
}

export function publishDataChange(resource: string): boolean {
  if (
    !/^[a-zA-Z0-9_-]{1,60}$/.test(resource) ||
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return false
  }

  socket.send(JSON.stringify({
    type: 'data-changed',
    resource
  }))

  return true
}

export function disconnectWebSocket() {
  manuallyStopped = true

  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }

  const current = socket
  socket = null
  current?.close()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!manuallyStopped) connectWebSocket()
  })
}
