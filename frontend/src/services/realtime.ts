import type { DataChangeNotification } from './websocket'

export type RealtimeHandler = (
  notification: DataChangeNotification
) => void

const handlers = new Map<string, Set<RealtimeHandler>>()
const recentEvents = new Set<string>()

const MAX_RECENT_EVENTS = 200

function handleNotification(event: Event) {
  const customEvent = event as CustomEvent<DataChangeNotification>
  const notification = customEvent.detail

  if (
    !notification ||
    notification.type !== 'data-changed' ||
    typeof notification.resource !== 'string' ||
    typeof notification.eventId !== 'string'
  ) {
    return
  }

  if (recentEvents.has(notification.eventId)) return

  recentEvents.add(notification.eventId)

  if (recentEvents.size > MAX_RECENT_EVENTS) {
    const oldest = recentEvents.values().next().value
    if (oldest) recentEvents.delete(oldest)
  }

  handlers.get(notification.resource)?.forEach(handler => {
    try {
      handler(notification)
    } catch (error) {
      console.error('[Realtime] Error en suscriptor:', error)
    }
  })

  handlers.get('*')?.forEach(handler => {
    try {
      handler(notification)
    } catch (error) {
      console.error('[Realtime] Error en suscriptor global:', error)
    }
  })
}

let initialized = false

export function initializeRealtime() {
  if (initialized) return

  window.addEventListener(
    'castrofallas:data-changed',
    handleNotification
  )

  initialized = true

  console.log('[Realtime] Sistema de eventos inicializado')
}

export function subscribeToChanges(
  resource: string,
  handler: RealtimeHandler
): () => void {
  if (!handlers.has(resource)) {
    handlers.set(resource, new Set())
  }

  handlers.get(resource)!.add(handler)

  return () => {
    const subscribers = handlers.get(resource)
    subscribers?.delete(handler)

    if (subscribers?.size === 0) {
      handlers.delete(resource)
    }
  }
}
