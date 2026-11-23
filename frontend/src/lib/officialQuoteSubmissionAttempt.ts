// Per-tab retry identity for official quote creation; distinct from Dhole's
// future delivery key. Never persist raw personal/commercial quote data.
//
// On HTTPS/localhost use SHA-256 + sessionStorage to survive refreshes.
// On non-secure LAN HTTP previews, WebCrypto.subtle is unavailable in some
// browsers. Use getRandomValues for a secure UUID and compare the original
// request body IN MEMORY only. Never block the legacy Docker quote UI.
export type QuoteSubmissionAttempt = {
  key: string
  digest: string
  at: number
  transientBody?: string
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const sha = /^[0-9a-f]{64}$/i

function newSecureUUID(): string {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  if (!globalThis.crypto?.getRandomValues)
    throw new Error('Tu navegador no puede crear una clave aleatoria segura. Consultá con soporte.')
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, n => n.toString(16).padStart(2, '0'))
  return [hex.slice(0,4).join(''), hex.slice(4,6).join(''),
    hex.slice(6,8).join(''), hex.slice(8,10).join(''),
    hex.slice(10).join('')].join('-')
}

async function contentDigest(body: string): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
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

const changedRequestError =
  'Se intentó enviar esta cotización y no se pudo confirmar el resultado. Para evitar duplicados, no se enviarán datos modificados con la misma clave. Consultá con soporte antes de empezar otra solicitud.'

export async function prepareQuoteSubmissionAttempt(
  storageKey: string, body: string,
  inMemory: QuoteSubmissionAttempt | null
): Promise<QuoteSubmissionAttempt> {
  const digest = await contentDigest(body)
  if (digest === null) {
    // A LAN HTTP preview cannot store a verifiable SHA-256 fingerprint.
    // The quote already exists in the UI; preserve its body only in memory.
    if (inMemory) {
      if (inMemory.transientBody !== body) throw new Error(changedRequestError)
      return inMemory
    }
    return {key:newSecureUUID(), digest:'', at:Date.now(), transientBody:body}
  }

  const previous = inMemory ?? storedAttempt(storageKey)
  if (previous) {
    if (previous.digest !== digest) throw new Error(changedRequestError)
    return previous
  }
  const created: QuoteSubmissionAttempt = {
    key:newSecureUUID(), digest, at:Date.now()
  }
  try { sessionStorage.setItem(storageKey, JSON.stringify(created)) }
  catch { /* The in-memory key still protects retries while the tab is open. */ }
  return created
}

export function clearQuoteSubmissionAttempt(storageKey: string): void {
  try { sessionStorage.removeItem(storageKey) } catch { /* private browsing */ }
}
