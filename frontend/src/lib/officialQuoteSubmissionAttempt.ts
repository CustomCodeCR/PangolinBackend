// Local, per-tab retry identity for official quote creation.
// The server may use this UUID to replay the SAME saved quote instead
// of creating a second one when a response is lost. Separate from Dhole's
// eventual outbox delivery idempotency key.
//
// Do not persist the quote payload (personal and commercial information):
// sessionStorage contains only a UUID and a SHA-256 content fingerprint.
export type QuoteSubmissionAttempt = {
  key: string
  digest: string
  at: number
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const sha = /^[0-9a-f]{64}$/i

async function contentDigest(body: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error(
    'Tu navegador no permite una solicitud segura. Utilizá HTTPS o consultá con soporte.')
  const bytes = new TextEncoder().encode(body)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)]
    .map(n => n.toString(16).padStart(2, '0')).join('')
}

function storedAttempt(storageKey: string): QuoteSubmissionAttempt | null {
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as QuoteSubmissionAttempt
    if (!parsed || !uuid.test(parsed.key) || !sha.test(parsed.digest) ||
        !Number.isFinite(parsed.at) || parsed.at > Date.now() ||
        Date.now() - parsed.at > MAX_AGE_MS) {
      sessionStorage.removeItem(storageKey)
      return null
    }
    return parsed
  } catch { return null }
}

export async function prepareQuoteSubmissionAttempt(
  storageKey: string, body: string,
  inMemory: QuoteSubmissionAttempt | null
): Promise<QuoteSubmissionAttempt> {
  const digest = await contentDigest(body)
  const previous = inMemory ?? storedAttempt(storageKey)
  if (previous) {
    if (previous.digest !== digest)
      throw new Error('Se intentó enviar esta cotización y no se pudo confirmar el resultado. Para evitar duplicados, no se enviarán datos modificados con la misma clave. Consultá con soporte antes de empezar otra solicitud.')
    return previous
  }
  if (!crypto.randomUUID)
    throw new Error('Tu navegador no permite generar una clave de envío segura.')
  const created = {key:crypto.randomUUID(),digest,at:Date.now()}
  try { sessionStorage.setItem(storageKey, JSON.stringify(created)) }
  catch { /* In-memory key still protects retries while this page remains open. */ }
  return created
}

export function clearQuoteSubmissionAttempt(storageKey: string): void {
  try { sessionStorage.removeItem(storageKey) } catch { /* session storage disabled */ }
}
