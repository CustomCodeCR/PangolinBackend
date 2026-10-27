export type ManagedNews = {
  id: string
  title: string
  category: string
  description: string
  body?: string
  image: string
  published: boolean
  author?: string
  publishedAt?: string | null
}

export type ManagedItinerary = {
  id: string
  origin: string
  destination: string
  transport: string
  departure: string
  arrival: string
  status: string
  closing?: string
  modality?: string
  carrier?: string
  vessel?: string
  voyage?: string
}

export type ManagedMedia = {
  id: string
  name: string
  kind: string
  src: string
  objectKey?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
}

export type ManagedComment = { id: string; author: string; section: string; message: string; published: boolean }

const keys = {
  news: 'castrofallas-admin-news-v1',
  itineraries: 'castrofallas-admin-itineraries-v1',
  media: 'castrofallas-admin-media-v1',
  comments: 'castrofallas-admin-comments-v1'
} as const

function read<T>(key: string): T[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value as T[] : []
  } catch {
    return []
  }
}

export const readManagedNews = () => read<ManagedNews>(keys.news)
export const readManagedItineraries = () => read<ManagedItinerary>(keys.itineraries)
export const readManagedMedia = () => read<ManagedMedia>(keys.media)
export const readManagedComments = () => read<ManagedComment>(keys.comments)

export function saveManaged<T extends { id: string }>(kind: keyof typeof keys, entry: T) {
  const entries = read<T>(keys[kind])
  const index = entries.findIndex(item => item.id === entry.id)
  if (index < 0) entries.unshift(entry)
  else entries[index] = entry
  localStorage.setItem(keys[kind], JSON.stringify(entries))
}

export function deleteManaged(kind: keyof typeof keys, id: string) {
  const entries = read<{ id: string }>(keys[kind]).filter(item => item.id !== id)
  localStorage.setItem(keys[kind], JSON.stringify(entries))
}

export function newManagedId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
