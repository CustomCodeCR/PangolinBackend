// Reutiliza el CMS, notificaciones y la sesión que usa la web Vue original.
// Solo se ejecuta en navegador: no crea conexiones WS entre peticiones SSR.
export default defineNuxtPlugin(async nuxtApp => {
  const [{ loadPublishedSiteCms }, realtime, { connectSignalR }] = await Promise.all([
    import('@legacy/siteCms'),
    import('@legacy/services/realtime'),
    import('@legacy/services/signalr')
  ])
  // Do not mutate the shared browser CMS store during SSR hydration.
  // Register updates before connecting so publication events are not missed.
  // The initial GET also reconciles any publication before mount.
  nuxtApp.hook('app:mounted', () => {
    realtime.initializeRealtime()
    realtime.subscribeToChanges('site', () => { void loadPublishedSiteCms(true) })
    realtime.subscribeToChanges('sync', () => { void loadPublishedSiteCms(true) })
    connectSignalR()
    void loadPublishedSiteCms().catch(() => undefined)
  })
})
