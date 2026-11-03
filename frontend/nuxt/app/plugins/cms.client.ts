// Reutiliza el CMS, notificaciones y la sesión que usa la web Vue original.
// Solo se ejecuta en navegador: no crea conexiones WS entre peticiones SSR.
export default defineNuxtPlugin(async () => {
  const [{ loadPublishedSiteCms }, realtime, { connectSignalR }] = await Promise.all([
    import('@legacy/siteCms'),
    import('@legacy/services/realtime'),
    import('@legacy/services/signalr')
  ])
  realtime.initializeRealtime()
  connectSignalR()
  // No bloquear hidratación: el CMS actualiza sus slots después del primer render.
  void loadPublishedSiteCms().catch(() => undefined)
  realtime.subscribeToChanges('site', () => { void loadPublishedSiteCms(true) })
  realtime.subscribeToChanges('sync', () => { void loadPublishedSiteCms(true) })
})
