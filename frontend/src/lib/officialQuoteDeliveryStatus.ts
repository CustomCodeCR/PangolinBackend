// The receipt capability is the original random submission key, never an ID-only
// lookup. Keep it out of URLs and do not replay POSTs to obtain delivery status.
import { onUnmounted, ref } from 'vue'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const quoteUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = ['Disabled','NotStaged','PendingDispatch','InFlight','HttpAcceptedUnverified','Unconfirmed','Rejected','Failed','Confirmed']
const pending = new Set(['PendingDispatch','InFlight','HttpAcceptedUnverified','Unconfirmed'])

export function useOfficialQuoteDeliveryStatus() {
  const state = ref('Disabled')
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  function stop() {
    generation++
    controller?.abort()
    controller = undefined
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function follow(id: string, key: string | undefined, initial: unknown) {
    stop()
    state.value = typeof initial === 'string' && states.includes(initial) ? initial : 'Disabled'
    if (!key || !uuid.test(key) || !quoteUuid.test(id) || !pending.has(state.value)) return
    const current = generation
    const deadline = Date.now() + 120_000
    const poll = async () => {
      if (current !== generation || Date.now() >= deadline) return
      const requestController = new AbortController()
      controller = requestController
      const timeout = setTimeout(() => requestController.abort(), 8_000)
      try {
        const response = await fetch('/api/quotes/official/' + encodeURIComponent(id) + '/delivery-status', {
          credentials:'same-origin', cache:'no-store', signal:requestController.signal,
          headers:{'X-CF-Quote-Request-Key':key}
        })
        if (current !== generation) return
        if (response.status === 404 || response.status === 401 || response.status === 403) return
        if (response.ok) {
          const data = await response.json() as {dholeDispatchState?:string}
          if (current !== generation) return
          if (data.dholeDispatchState && states.includes(data.dholeDispatchState))
            state.value = data.dholeDispatchState
        }
      } catch { /* Keep the last known state; never infer success. */ }
      finally { clearTimeout(timeout) }
      if (current === generation && pending.has(state.value) && Date.now() < deadline)
        timer = setTimeout(poll, 5_000)
    }
    timer = setTimeout(poll, 1_000)
  }
  onUnmounted(stop)
  return {state,follow,stop}
}

export function quoteDeliveryMessage(state:string, tr:(es:string,en:string)=>string) {
  if (state === 'Confirmed') return tr(
    '¡Tu solicitud de cotización se envió correctamente! Nuestro equipo de Pricing la atenderá y se pondrá en contacto con vos.',
    'Your quote request was successfully sent! Our Pricing team will review it and contact you.')
  if (state === 'Rejected' || state === 'Failed' || state === 'Unconfirmed') return tr(
    'Guardamos tu solicitud, pero todavía no pudimos confirmar su entrega a Pricing. No la enviés de nuevo.',
    'Your request was saved, but delivery to Pricing has not been confirmed. Please do not submit it again.')
  if (pending.has(state)) return tr(
    'Guardamos tu solicitud. Estamos verificando su entrega a Pricing. No necesitás enviarla de nuevo.',
    'Your request was saved. We are checking delivery to Pricing. There is no need to resubmit.')
  return tr('Tu solicitud se guardó correctamente.', 'Your request was saved successfully.')
}
