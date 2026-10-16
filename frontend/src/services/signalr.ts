import * as signalR from '@microsoft/signalr'
import type { DataChangeNotification } from './websocket'

// ÚNICA conexión de la aplicación. La sesión HttpOnly viaja como cookie same-origin,
// nunca como token en URL o localStorage. El backend es el único emisor de eventos.
let connection: signalR.HubConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let reconnecting = false
let started = false
let resyncSerial = 0
const resources = new Set(['site', 'site-admin', 'news', 'news-admin', 'media', 'itineraries', 'quotes', 'users'])
function dispatch(notification: DataChangeNotification) {
  window.dispatchEvent(new CustomEvent<DataChangeNotification>('castrofallas:data-changed', { detail: notification }))
}
function refreshAfterGap() {
  // Eventos perdidos durante suspensión, cambios de red o reconexión.
  dispatch({ type: 'data-changed', eventId: `resync-${++resyncSerial}`, resource: 'sync', timestamp: new Date().toISOString() })
}
function queueReconnect() {
  if (retryTimer || !started || document.visibilityState === 'hidden') return
  retryTimer = setTimeout(() => { retryTimer = null; void startConnection() }, 15000)
}
async function startConnection() {
  if (!connection || reconnecting || connection.state !== signalR.HubConnectionState.Disconnected) return
  reconnecting = true
  try { await connection.start(); refreshAfterGap() }
  catch { queueReconnect() }
  finally { reconnecting = false }
}
export function connectSignalR() {
  if (typeof window === 'undefined' || started) return
  started = true
  connection = new signalR.HubConnectionBuilder()
    .withUrl('/api/hubs/updates', { withCredentials: true })
    .withAutomaticReconnect([0, 2000, 5000, 15000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build()

  connection.on('DataChanged', (notification: DataChangeNotification) => {
    if (!notification || notification.type !== 'data-changed'
      || !resources.has(notification.resource)
      || typeof notification.eventId !== 'string'
      || typeof notification.timestamp !== 'string') return
    dispatch(notification)
  })
  connection.onreconnected(refreshAfterGap)
  connection.onclose(queueReconnect)
  window.addEventListener('online', () => { refreshAfterGap(); void startConnection() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { refreshAfterGap(); void startConnection() }
  })
  void startConnection()
}
