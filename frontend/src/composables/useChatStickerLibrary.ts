import { computed, ref } from 'vue'

interface SavedStickerRecord {
  id: string
  userId: string
  sourceId: string
  createdAt: number
  blob: Blob
}
export interface StickerPreview extends SavedStickerRecord { previewUrl: string }

const DB_NAME = 'castrofallas-chat-stickers'
const STORE = 'saved-stickers'
const LIMIT = 32

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('Este navegador no permite guardar stickers.')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('No se pudo acceder a los stickers guardados.'))
  })
}

async function allForUser(userId: string): Promise<SavedStickerRecord[]> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
      request.onsuccess = () => resolve((request.result as SavedStickerRecord[])
        .filter(item => item.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt))
      request.onerror = () => reject(new Error('No se pudieron leer tus stickers.'))
    })
  } finally { db.close() }
}

async function writeRecords(record: SavedStickerRecord, removeIds: string[]) {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      const store = transaction.objectStore(STORE)
      for (const id of removeIds) store.delete(id)
      store.put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(new Error('No se pudo guardar el sticker.'))
    })
  } finally { db.close() }
}

export function useChatStickerLibrary(getUserId: () => string) {
  const savedStickers = ref<StickerPreview[]>([])
  const stickerError = ref('')
  const stickerBusy = ref(false)
  const savedSources = computed(() => new Set(savedStickers.value.map(item => item.sourceId).filter(Boolean)))

  function releasePreviews() {
    savedStickers.value.forEach(item => URL.revokeObjectURL(item.previewUrl))
    savedStickers.value = []
  }

  async function loadStickers() {
    const userId = getUserId()
    if (!userId) return
    stickerError.value = ''
    try {
      const items = await allForUser(userId)
      releasePreviews()
      savedStickers.value = items.map(item => ({
        ...item, previewUrl: URL.createObjectURL(item.blob)
      }))
    } catch (cause) {
      stickerError.value = cause instanceof Error ? cause.message : 'No se pudieron cargar los stickers.'
    }
  }

  async function saveSticker(blob: Blob, sourceId = '') {
    const userId = getUserId()
    if (!userId || blob.size > 800_000 || blob.size < 12 ||
        (blob.type !== 'image/png' && blob.type !== 'image/jpeg'))
      throw new Error('El sticker no cumple los límites permitidos.')
    stickerBusy.value = true
    try {
      const existing = await allForUser(userId)
      if (sourceId && existing.some(item => item.sourceId === sourceId)) return
      const record: SavedStickerRecord = {
        id: userId + ':' + crypto.randomUUID(), userId, sourceId,
        blob, createdAt: Date.now()
      }
      await writeRecords(record, existing.slice(LIMIT - 1).map(item => item.id))
      await loadStickers()
    } finally { stickerBusy.value = false }
  }

  async function removeSticker(id: string) {
    const userId = getUserId()
    if (!id.startsWith(userId + ':')) return
    const db = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(new Error('No se pudo borrar el sticker.'))
      })
    } finally { db.close() }
    await loadStickers()
  }

  return {
    savedStickers, savedSources, stickerError, stickerBusy,
    loadStickers, saveSticker, removeSticker, releasePreviews
  }
}
