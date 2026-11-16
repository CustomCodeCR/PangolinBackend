import { reactive } from 'vue'

export interface SiteSlotDefinition { page: string; pageLabel: string; key: string; section: string; type: 'media' | 'text'; label: string; help: string; fallback: string; originalEs?: string; originalEn?: string; fallbackKind?: 'Imagen' | 'Video' }
export interface PublishedSiteSlot { key: string; textEs?: string | null; textEn?: string | null; mediaSrc?: string | null; mediaKind?: string | null }
export interface EditableSiteSlot { key: string; draftEs?: string | null; draftEn?: string | null; draftMediaId?: string | null; publishedEs?: string | null; publishedEn?: string | null; publishedMediaId?: string | null; updatedAt?: string; publishedAt?: string | null }

const published = reactive<Record<string, PublishedSiteSlot>>({})
let pending: Promise<void> | null = null
let revision = 0
export function loadPublishedSiteCms(force = false): Promise<void> {
  if (pending && !force) return pending
  const requestRevision = ++revision
  const request = fetch('/api/content/site', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('No se pudo cargar el contenido del sitio')
    const data: unknown = await response.json()
    if (!Array.isArray(data)) throw new Error('Respuesta CMS inválida')
    // Ignorar respuestas viejas cuando llega una publicación durante otra solicitud.
    if (requestRevision !== revision) return
    for (const key of Object.keys(published)) delete published[key]
    for (const item of data as PublishedSiteSlot[]) if (typeof item.key === 'string') published[item.key] = item
  }).catch(() => { /* Mantener contenido ya cargado ante una caída temporal. */ })
  pending = request.finally(() => { if (requestRevision === revision) pending = null })
  return pending
}
export function siteText(key: string, fallback: string, locale: string): string {
  const entry = published[key]
  const value = locale === 'en' ? entry?.textEn : entry?.textEs
  return value?.trim() || fallback
}
export function siteVisual(key: string, fallback: string, fallbackKind: 'Imagen' | 'Video' = 'Imagen'): {src: string; kind: string} {
  const entry = published[key]
  return {src: entry?.mediaSrc || fallback, kind: entry?.mediaKind || fallbackKind}
}
export function siteCssImage(key: string, fallback: string): string {
  const visual = siteVisual(key, fallback)
  return visual.kind.startsWith('Video') ? 'none' : `url(${JSON.stringify(visual.src)})`
}
