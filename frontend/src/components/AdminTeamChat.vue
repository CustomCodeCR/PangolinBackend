<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as signalR from '@microsoft/signalr'
import IconSymbol from './IconSymbol.vue'
import ChatCameraTile from './ChatCameraTile.vue'
import { Sticker, LockKeyhole, SmilePlus, Mic, Video, VideoOff, Square, Plus, BookmarkPlus, ShieldBan, UserX, X } from '@lucide/vue'
import { useAdminChatCameras } from '../composables/useAdminChatCameras'
import { useChatStickerLibrary, type StickerPreview } from '../composables/useChatStickerLibrary'
import { authState } from '../services/auth'

interface ChatReply { id: string; name: string; text: string; userId?: string }
type ImageMode = 'image' | 'once' | 'sticker'
interface ChatReaction { emoji: string; userIds: string[]; userNames?: string[] }
interface ChatMessage { id: string; userId: string; name: string; email: string; text: string; sentAt: string; replyTo?: ChatReply | null; imageUrl?: string | null; imageId?: string | null; isViewOnce?: boolean; isSticker?: boolean; imageViewed?: boolean; reactions?: ChatReaction[]; audioUrl?: string | null; isSystem?: boolean; recipientId?: string | null }
interface DirectContact { userId: string; name: string; online: boolean; avatarUrl?: string | null; unreadCount: number; lastMessageAt?: string | null }
interface BlockedAccount { userId: string; name: string }
interface ChatBlockNotice { id: string; actorId: string; actorName: string; targetId: string; targetName: string; blocked: boolean; sentAt: string }
interface ChatMediaUpload { imageId: string; url: string }
interface ReadReceipt { userId: string; name: string; lastReadAt: string }
interface TypingStatus { connectionId: string; userId: string; name: string; isTyping: boolean; expiresAt: string; updatedAt: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (event: 'unread-change', count: number): void }>()
const messages = ref<ChatMessage[]>([])
const directContacts = ref<DirectContact[]>([])
const activeDirectId = ref<string | null>(null) // null = main group, always default
const directMessages = ref<ChatMessage[]>([])
const directLoading = ref(false)
const contactSearch = ref('')
const threadDrafts = ref<Record<string, string>>({})
const blockedUsers = ref<BlockedAccount[]>([])
const blockNotices = ref<ChatBlockNotice[]>([])
const blockedTrayOpen = ref(false)
const personMenuId = ref<string | null>(null)
const blockBusyId = ref<string | null>(null)
const clearedThrough = ref(0)
const receipts = ref<ReadReceipt[]>([])
const draft = ref('')
const nickname = ref('')
const nicknameInput = ref('')
const nicknameEditing = ref(false)
const nicknameSaving = ref(false)
const nicknameError = ref('')
const chatNames = ref<Record<string, string>>({})
const avatarUrls = ref<Record<string, string>>({})
const avatarPicker = ref<HTMLInputElement | null>(null)
const imagePicker = ref<HTMLInputElement | null>(null)
const avatarBusy = ref(false)
const mediaBusy = ref(false)
const outgoingImage = ref<{ blob: Blob; previewUrl: string; mode: ImageMode } | null>(null)
const selectedAttachMode = ref<'image' | 'sticker'>('image')
const imageViewer = ref<{ src: string; title: string; oneTime: boolean; objectUrl?: string } | null>(null)
const viewingImageId = ref<string | null>(null)
const reactionPickerId = ref<string | null>(null)
const expandedReaction = ref<{ messageId: string; emoji: string } | null>(null)
const emojiGrid = ref<HTMLElement | null>(null)
const reactionChoices = [
  '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '👌', '✌️', '🤞',
  '❤️', '🩷', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔',
  '😂', '🤣', '🥹', '😊', '😍', '🥰', '😘', '😎', '🤩', '🥳',
  '😀', '😁', '😅', '😉', '😌', '😋', '😜', '🤪', '🤔', '🤨',
  '😮', '😱', '😳', '🥺', '😢', '😭', '😤', '😡', '🤯', '😴',
  '👀', '💯', '🔥', '✨', '🎉', '🎊', '🎈', '🎂', '🎁', '🏆',
  '⭐', '🌟', '🚀', '💡', '✅', '❌', '⚠️', '📌', '💬', '🫶',
  '🐱', '🐶', '🐼', '🐸', '🦄', '🍕', '🍔', '🍩', '☕', '🍓', '🦞', '🏳️‍🌈'
] as const
const expandedSeenId = ref<string | null>(null)
const remoteTyping = ref<Record<string, TypingStatus>>({})
const typingClock = ref(Date.now())
let typingSweepTimer: ReturnType<typeof setInterval> | null = null
let typingIdleTimer: ReturnType<typeof setTimeout> | null = null
let typingActive = false
let typingLastSignalAt = 0
const replyTarget = ref<ChatMessage | null>(null)
const input = ref<HTMLInputElement | null>(null)
const stickerTrayOpen = ref(false)
const outgoingAudio = ref<{ blob: Blob; previewUrl: string; seconds: number } | null>(null)
const recording = ref(false)
const recordingSeconds = ref(0)
let mediaRecorder: MediaRecorder | null = null
let microphoneStream: MediaStream | null = null
let recordingTimer: ReturnType<typeof setInterval> | null = null
let voiceChunks: Blob[] = []
let discardRecording = false
const highlightedId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
const status = ref('Conectando…')
const online = ref(0)
const sending = ref(false)
const clearingChat = ref(false)
const chatNotice = ref('')
const error = ref('')
const list = ref<HTMLElement | null>(null)
const chatPanel = ref<HTMLElement | null>(null)
const lastReadAt = ref(0)
let connection: signalR.HubConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let active = true

const currentUserId = computed(() => String(authState.user?.id ?? '').toLowerCase())
const currentEmail = computed(() => (authState.user?.correo ?? '').toLowerCase())
const blockedUserIds = computed(() => new Set(blockedUsers.value.map(person => person.userId.toLowerCase())))
const activeDirect = computed(() => directContacts.value.find(contact =>
  contact.userId.toLowerCase() === activeDirectId.value) ?? null)
const filteredDirectContacts = computed(() => {
  const search = contactSearch.value.trim().toLocaleLowerCase()
  return directContacts.value.filter(contact => !search ||
    contact.name.toLocaleLowerCase().includes(search))
})
const directUnread = computed(() =>
  directContacts.value.reduce((sum, contact) => sum + contact.unreadCount, 0))
const directBlocked = computed(() => !!activeDirectId.value &&
  blockedUserIds.value.has(activeDirectId.value))
const visibleMessages = computed(() =>
  messages.value.filter(message => !blockedUserIds.value.has(message.userId.toLowerCase())))
const chatTimeline = computed<ChatMessage[]>(() => activeDirectId.value
  ? directMessages.value.filter(message => !blockedUserIds.value.has(message.userId.toLowerCase()))
  : [
    ...visibleMessages.value,
    ...blockNotices.value.filter(notice => Date.parse(notice.sentAt) > clearedThrough.value)
      .map(notice => ({
        id: 'system-' + notice.id, userId: notice.actorId,
        name: 'Sistema', email: '', sentAt: notice.sentAt, isSystem: true,
        text: notice.blocked
          ? notice.actorName + ' bloqueó a ' + notice.targetName + '.'
          : notice.actorName + ' desbloqueó a ' + notice.targetName + '.'
      }))
  ].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)))
const { savedStickers, savedSources, stickerError, stickerBusy, loadStickers, saveSticker, removeSticker, releasePreviews } =
  useChatStickerLibrary(() => currentUserId.value)
const {
  localStream: cameraStream, tiles: cameraTiles, cameraBusy, cameraError,
  supported: cameraSupported, bindHub: bindCameraHub, startCamera, stopCamera, cleanup: cleanupCameras
} = useAdminChatCameras()
const storageKey = computed(() => 'castrofallas-admin-chat-read:' + (currentUserId.value || currentEmail.value))
const nicknameStorageKey = computed(() => 'castrofallas-admin-chat-nickname:' + (currentUserId.value || currentEmail.value))
const typingNames = computed(() => {
  if (activeDirectId.value) return []
  const names = new Map<string, string>()
  for (const state of Object.values(remoteTyping.value)) {
    const userId = state.userId.toLowerCase()
    if (!state.isTyping || userId === currentUserId.value || blockedUserIds.value.has(userId) ||
        Date.parse(state.expiresAt) <= typingClock.value) continue
    if (!names.has(userId)) names.set(userId, chatNames.value[userId] || state.name)
  }
  return Array.from(names.values())
})
const typingLabel = computed(() => {
  const names = typingNames.value
  if (names.length === 1) return names[0] + ' está escribiendo'
  if (names.length === 2) return names[0] + ' y ' + names[1] + ' están escribiendo'
  return names[0] + ' y ' + (names.length - 1) + ' más están escribiendo'
})
watch(typingNames, names => { if (names.length) scrollBottom() }, { flush: 'post' })
function applyTypingState(state: TypingStatus) {
  if (!state?.connectionId || !state.userId || state.userId.toLowerCase() === currentUserId.value) return
  const next = { ...remoteTyping.value }
  if (!state.isTyping || !Number.isFinite(Date.parse(state.expiresAt)) ||
      Date.parse(state.expiresAt) <= Date.now()) {
    delete next[state.connectionId]
  } else {
    next[state.connectionId] = state
  }
  remoteTyping.value = next
  typingClock.value = Date.now()
}
function canSendTyping() {
  return !activeDirectId.value && props.visible && document.visibilityState === 'visible' &&
    connection?.state === signalR.HubConnectionState.Connected
}
function stopTyping() {
  if (typingIdleTimer) { clearTimeout(typingIdleTimer); typingIdleTimer = null }
  if (!typingActive) return
  typingActive = false
  typingLastSignalAt = 0
  if (connection?.state === signalR.HubConnectionState.Connected) {
    void connection.invoke('SetTyping', false).catch(() => {})
  }
}
function onDraftInput() {
  if (!canSendTyping() || !draft.value.trim()) { stopTyping(); return }
  const now = Date.now()
  if (!typingActive || now - typingLastSignalAt >= 1500) {
    typingActive = true
    typingLastSignalAt = now
    // Solo enviamos el estado, nunca el texto de lo que se está escribiendo.
    void connection!.invoke('SetTyping', true).catch(() => { typingActive = false })
  }
  if (typingIdleTimer) clearTimeout(typingIdleTimer)
  typingIdleTimer = setTimeout(stopTyping, 1900)
}
function savedNickname() {
  try { return localStorage.getItem(nicknameStorageKey.value) } catch { return null }
}
function avatarFor(userId: string) { return avatarUrls.value[userId.toLowerCase()] || '' }
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] ?? '').join('').toUpperCase() || '?'
}
async function compressImage(file: File, size: number, limit: number, format: 'jpeg' | 'png' = 'jpeg'): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 9_000_000)
    throw new Error('Elegí una imagen JPG, PNG o WebP de hasta 9 MB.')
  const url = URL.createObjectURL(file)
  const img = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
      img.src = url
    })
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Imagen vacía.')
    if (img.naturalWidth * img.naturalHeight > 28_000_000)
      throw new Error('La imagen tiene demasiada resolución. Elegí una foto más pequeña.')
    const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('No se pudo procesar la imagen.')
    if (format === 'jpeg') {
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    if (format === 'png') {
      // A transparent uploaded photo stays transparent as a sticker.
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
      if (blob && blob.size <= limit) return blob
      throw new Error('El sticker es demasiado pesado. Probá una imagen más pequeña.')
    }
    for (const quality of [0.82, 0.68, 0.52, 0.38]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (blob && blob.size <= limit) return blob
    }
    throw new Error('La imagen sigue siendo demasiado pesada. Probá una más pequeña.')
  } finally { URL.revokeObjectURL(url) }
}
async function uploadImage(blob: Blob, kind: 'avatar' | 'message'): Promise<ChatMediaUpload> {
  const response = await fetch('/api/admin/chat/images?kind=' + kind, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': blob.type === 'image/png' ? 'image/png' : 'image/jpeg', 'X-Chat-Media': '1' },
    body: blob
  })
  if (!response.ok) throw new Error(response.status === 413
    ? 'La imagen supera el límite permitido.'
    : 'No se pudo subir la imagen (HTTP ' + response.status + ').')
  const uploaded = await response.json() as ChatMediaUpload
  if (!uploaded.imageId || !uploaded.url?.startsWith('/api/admin/chat/images/'))
    throw new Error('Respuesta inválida del servidor de imágenes.')
  return uploaded
}
async function chooseAvatar(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file || avatarBusy.value) return
  avatarBusy.value = true
  nicknameError.value = ''
  try {
    const blob = await compressImage(file, 220, 170_000)
    const uploaded = await uploadImage(blob, 'avatar')
    if (connection?.state !== signalR.HubConnectionState.Connected) throw new Error('Chat desconectado.')
    await connection.invoke('SetAvatarImage', uploaded.imageId)
    avatarUrls.value = { ...avatarUrls.value, [currentUserId.value]: uploaded.url }
  } catch (cause) {
    nicknameError.value = cause instanceof Error ? cause.message : 'No se pudo guardar la foto.'
  } finally { avatarBusy.value = false }
}
async function removeAvatar() {
  if (avatarBusy.value || connection?.state !== signalR.HubConnectionState.Connected) return
  avatarBusy.value = true
  try {
    await connection.invoke('SetAvatarImage', null)
    const next = { ...avatarUrls.value }
    delete next[currentUserId.value]
    avatarUrls.value = next
  } catch {
    nicknameError.value = 'No se pudo quitar la foto.'
  } finally { avatarBusy.value = false }
}
function pickImage(mode: 'image' | 'sticker') {
  selectedAttachMode.value = mode
  imagePicker.value?.click()
}
function toggleViewOnce() {
  if (!outgoingImage.value || outgoingImage.value.mode === 'sticker') return
  outgoingImage.value = { ...outgoingImage.value,
    mode: outgoingImage.value.mode === 'once' ? 'image' : 'once' }
}
async function onComposerPaste(event: ClipboardEvent) {
  const imageItem = Array.from(event.clipboardData?.items ?? [])
    .find(item => item.kind === 'file' && item.type.startsWith('image/'))
  if (!imageItem) return // Ordinary copied text keeps the browser's normal paste behavior.
  event.preventDefault()
  if (mediaBusy.value || sending.value || recording.value) {
    error.value = 'Terminá el envío o la grabación antes de adjuntar otra imagen.'
    return
  }
  const file = imageItem.getAsFile()
  if (!file) return
  mediaBusy.value = true
  error.value = ''
  try {
    const blob = await compressImage(file, 1200, 800_000)
    clearOutgoingImage()
    clearOutgoingAudio()
    outgoingImage.value = { blob, previewUrl: URL.createObjectURL(blob), mode: 'image' }
    stickerTrayOpen.value = false
    reactionPickerId.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo pegar la imagen.'
  } finally { mediaBusy.value = false }
}
async function chooseImage(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  element.value = ''
  if (!file || mediaBusy.value || sending.value) return
  mediaBusy.value = true
  error.value = ''
  try {
    const mode = selectedAttachMode.value
    const blob = await compressImage(file, mode === 'sticker' ? 320 : 1200, 800_000,
      mode === 'sticker' ? 'png' : 'jpeg')
    clearOutgoingImage()
    clearOutgoingAudio()
    outgoingImage.value = { blob, previewUrl: URL.createObjectURL(blob), mode }
    if (mode === 'sticker') stickerTrayOpen.value = false
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo adjuntar la imagen.' }
  finally { mediaBusy.value = false }
}
function clearOutgoingImage() {
  if (outgoingImage.value) URL.revokeObjectURL(outgoingImage.value.previewUrl)
  outgoingImage.value = null
}
async function toggleStickerTray() {
  stickerTrayOpen.value = !stickerTrayOpen.value
  if (stickerTrayOpen.value) { reactionPickerId.value = null; await loadStickers() }
}
function useSavedSticker(item: StickerPreview) {
  clearOutgoingImage()
  clearOutgoingAudio()
  outgoingImage.value = { blob: item.blob, previewUrl: URL.createObjectURL(item.blob), mode: 'sticker' }
  stickerTrayOpen.value = false
}
async function saveMessageSticker(message: ChatMessage) {
  if (!message.isSticker || !message.imageUrl?.startsWith('/api/admin/chat/images/') || !message.imageId)
    return
  try {
    const response = await fetch(message.imageUrl, { credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('No se pudo descargar este sticker.')
    const blob = await response.blob()
    await saveSticker(blob, message.imageId)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo guardar el sticker.'
  }
}
async function removeSavedSticker(item: StickerPreview) {
  try { await removeSticker(item.id) }
  catch { error.value = 'No se pudo borrar el sticker guardado.' }
}
function clearOutgoingAudio() {
  if (outgoingAudio.value) URL.revokeObjectURL(outgoingAudio.value.previewUrl)
  outgoingAudio.value = null
}
function stopRecording(discard = false) {
  if (discard) discardRecording = true
  if (mediaRecorder?.state === 'recording') mediaRecorder.stop()
  else {
    microphoneStream?.getTracks().forEach(track => track.stop())
    microphoneStream = null
    recording.value = false
  }
}
async function startRecording() {
  if (recording.value || sending.value || mediaBusy.value) return
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    error.value = 'Para grabar audios necesitás HTTPS o localhost y permisos de micrófono.'
    return
  }
  error.value = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    microphoneStream = stream
    const formats = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
    const selected = formats.find(type => MediaRecorder.isTypeSupported(type))
    if (!selected) throw new Error('Este navegador no admite grabar notas de voz.')
    const recorder = new MediaRecorder(stream, { mimeType: selected })
    mediaRecorder = recorder
    voiceChunks = []
    discardRecording = false
    recorder.ondataavailable = event => { if (event.data.size > 0) voiceChunks.push(event.data) }
    recorder.onstop = () => {
      if (recordingTimer) { clearInterval(recordingTimer); recordingTimer = null }
      stream.getTracks().forEach(track => track.stop())
      microphoneStream = null
      recording.value = false
      if (discardRecording || !active) return
      const mime = recorder.mimeType.split(';')[0] || selected.split(';')[0]
      const blob = new Blob(voiceChunks, { type: mime })
      if (blob.size > 2_500_000 || blob.size < 16) {
        error.value = 'La grabación no cumple el límite de 2,5 MB. Grabá una nota más corta.'
        return
      }
      clearOutgoingImage()
      clearOutgoingAudio()
      outgoingAudio.value = { blob, previewUrl: URL.createObjectURL(blob), seconds: recordingSeconds.value }
    }
    recorder.start(400)
    recording.value = true
    recordingSeconds.value = 0
    const started = Date.now()
    recordingTimer = setInterval(() => {
      recordingSeconds.value = Math.floor((Date.now() - started) / 1000)
      if (recordingSeconds.value >= 45) stopRecording()
    }, 500)
  } catch (cause) {
    microphoneStream?.getTracks().forEach(track => track.stop())
    microphoneStream = null
    mediaRecorder = null
    recording.value = false
    error.value = cause instanceof Error ? cause.message : 'No se pudo iniciar el micrófono.'
  }
}
async function uploadAudio(blob: Blob): Promise<string> {
  const response = await fetch('/api/admin/chat/audio', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': blob.type, 'X-Chat-Media': '1' }, body: blob
  })
  if (!response.ok) throw new Error(response.status === 413
    ? 'El audio supera el tamaño permitido.' : 'No se pudo subir el audio.')
  const data = await response.json() as { audioId: string }
  if (!data.audioId) throw new Error('Respuesta inválida al subir el audio.')
  return data.audioId
}
function closeViewer() {
  if (imageViewer.value?.objectUrl) URL.revokeObjectURL(imageViewer.value.objectUrl)
  imageViewer.value = null
}
function viewerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (imageViewer.value) closeViewer()
    reactionPickerId.value = null
    expandedReaction.value = null
    stickerTrayOpen.value = false
    personMenuId.value = null
    blockedTrayOpen.value = false
  }
}
async function openSharedImage(message: ChatMessage) {
  error.value = ''
  closeViewer()
  if (!message.isViewOnce) {
    if (message.imageUrl?.startsWith('/api/admin/chat/images/'))
      imageViewer.value = { src: message.imageUrl, title: 'Imagen de ' + displayName(message), oneTime: false }
    return
  }
  if (!message.imageId || message.imageViewed || isOwn(message) || viewingImageId.value) return
  viewingImageId.value = message.id
  try {
    const response = await fetch('/api/admin/chat/images/' + encodeURIComponent(message.imageId) + '/consume', {
      method: 'POST', credentials: 'same-origin', headers: { 'X-Chat-Media': '1' }, cache: 'no-store'
    })
    if (!response.ok) throw new Error(response.status === 404
      ? 'La foto ya fue vista o dejó de estar disponible.' : 'No se pudo abrir la foto.')
    const blob = await response.blob()
    if (!active || !props.visible) return
    const objectUrl = URL.createObjectURL(blob)
    imageViewer.value = { src: objectUrl, objectUrl, title: 'Foto de una sola visualización', oneTime: true }
    messages.value = messages.value.map(item => item.imageId === message.imageId
      ? { ...item, imageViewed: true } : item)
    directMessages.value = directMessages.value.map(item => item.imageId === message.imageId
      ? { ...item, imageViewed: true } : item)
  } catch (cause) {
    if (active) error.value = cause instanceof Error ? cause.message : 'No se pudo abrir la foto.'
  } finally { viewingImageId.value = null }
}
function toggleReactionPicker(id: string) {
  reactionPickerId.value = reactionPickerId.value === id ? null : id
  if (reactionPickerId.value) stickerTrayOpen.value = false
}
async function toggleReaction(id: string, emoji: string) {
  if (connection?.state !== signalR.HubConnectionState.Connected) return
  reactionPickerId.value = null
  try {
    if (activeDirectId.value) await connection.invoke('ToggleDirectReaction', activeDirectId.value, id, emoji)
    else await connection.invoke('ToggleReaction', id, emoji)
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo reaccionar.' }
}
function reactedByMe(reaction: ChatReaction) {
  return reaction.userIds.some(id => id.toLowerCase() === currentUserId.value)
}
function reactorNames(reaction: ChatReaction): string[] {
  return reaction.userIds.map((id, index) => {
    const userId = id.toLowerCase()
    const fromMessage = chatTimeline.value.find(message => message.userId.toLowerCase() === userId)
    const fromReceipt = receipts.value.find(receipt => receipt.userId.toLowerCase() === userId)
    return chatNames.value[userId] || reaction.userNames?.[index] ||
      fromMessage?.name || fromReceipt?.name || 'Administrador'
  })
}
function showReactionUsers(messageId: string, emoji: string) {
  expandedReaction.value = expandedReaction.value?.messageId === messageId &&
    expandedReaction.value.emoji === emoji ? null : { messageId, emoji }
}
function togglePersonMenu(userId: string) {
  personMenuId.value = personMenuId.value === userId ? null : userId
  if (personMenuId.value) blockedTrayOpen.value = false
}
function setBlockedSnapshot(accounts: BlockedAccount[]) {
  blockedUsers.value = (accounts ?? []).filter(person =>
    person.userId?.toLowerCase() !== currentUserId.value)
  personMenuId.value = null
  if (replyTarget.value && blockedUserIds.value.has(replyTarget.value.userId.toLowerCase()))
    replyTarget.value = null
}
function addBlockNotice(notice: ChatBlockNotice) {
  if (!active || !notice?.id || blockNotices.value.some(item => item.id === notice.id)) return
  if (Date.parse(notice.sentAt) <= clearedThrough.value) return
  blockNotices.value = [...blockNotices.value.slice(-29), notice]
  scrollBottom()
}
async function setUserBlocked(userId: string, shouldBlock: boolean) {
  if (!userId || userId.toLowerCase() === currentUserId.value || blockBusyId.value ||
      connection?.state !== signalR.HubConnectionState.Connected) return
  const person = blockedUsers.value.find(item => item.userId.toLowerCase() === userId.toLowerCase())
  const name = person?.name || messages.value.find(item =>
    item.userId.toLowerCase() === userId.toLowerCase())?.name || 'este administrador'
  if (shouldBlock && !window.confirm('¿Bloquear a ' + name + '? Dejarás de ver sus mensajes. ' +
    'La persona recibirá un aviso del sistema con tu nombre y podrás desbloquearla después.')) return
  blockBusyId.value = userId
  error.value = ''
  try {
    await connection.invoke('SetUserBlocked', userId, shouldBlock)
    personMenuId.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo actualizar el bloqueo.'
  } finally { blockBusyId.value = null }
}
function displayName(message: ChatMessage) {
  return chatNames.value[message.userId.toLowerCase()] || message.name || message.email
}
function openNicknameEditor() {
  nicknameInput.value = nickname.value
  nicknameError.value = ''
  nicknameEditing.value = true
}
async function saveNickname() {
  if (nicknameSaving.value || connection?.state !== signalR.HubConnectionState.Connected) return
  const value = nicknameInput.value.trim().replace(/\s+/g, ' ')
  if (value && (value.length < 2 || value.length > 32)) {
    nicknameError.value = 'El nombre debe tener entre 2 y 32 caracteres.'
    return
  }
  nicknameSaving.value = true
  nicknameError.value = ''
  try {
    const display = await connection.invoke<string>('SetDisplayName', value)
    nickname.value = value
    chatNames.value = { ...chatNames.value, [currentUserId.value]: display }
    nicknameEditing.value = false
    try {
      if (value) localStorage.setItem(nicknameStorageKey.value, value)
      else localStorage.removeItem(nicknameStorageKey.value)
    } catch { /* Almacenamiento opcional */ }
  } catch (cause) {
    nicknameError.value = cause instanceof Error ? cause.message : 'No se pudo cambiar el apodo.'
  } finally { nicknameSaving.value = false }
}

function isOwn(message: ChatMessage) {
  return message.userId.toLowerCase() === currentUserId.value ||
    (!!currentEmail.value && message.email.toLowerCase() === currentEmail.value)
}
const unread = computed(() => visibleMessages.value.filter(message =>
  !isOwn(message) && Date.parse(message.sentAt) > lastReadAt.value
).length)
watch([unread, directUnread], ([groupUnread, privateUnread]) =>
  emit('unread-change', groupUnread + privateUnread), { immediate: true })

function persistLastRead(value: number) {
  if (!Number.isFinite(value) || value <= lastReadAt.value) return
  lastReadAt.value = value
  try { localStorage.setItem(storageKey.value, new Date(value).toISOString()) } catch { /* Storage opcional */ }
}
function initializeLastRead() {
  try {
    const saved = Date.parse(localStorage.getItem(storageKey.value) ?? '')
    if (Number.isFinite(saved)) { lastReadAt.value = saved; return }
  } catch { /* Storage opcional */ }
  // Primera conexión: no contar todo el historial anterior como notificaciones.
  persistLastRead(Date.now())
}
function scrollBottom() {
  if (!props.visible) return
  void nextTick(() => { if (props.visible && list.value) list.value.scrollTop = list.value.scrollHeight })
}
// El scroll del chat nunca se propaga a la página al llegar a un extremo.
function trapChatWheel(event: WheelEvent) {
  const element = list.value
  if (!element || event.ctrlKey || !event.deltaY) return
  // Only the message viewport traps wheel scrolling. Above/below it the page
  // scrolls naturally, including the composer and the camera panel.
  event.stopPropagation()
  const atTop = element.scrollTop <= 1 && event.deltaY < 0
  const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1 && event.deltaY > 0
  if (element.scrollHeight <= element.clientHeight + 1 || atTop || atBottom) event.preventDefault()
}
function scrollEmojiTray(event: WheelEvent) {
  if (event.ctrlKey || !emojiGrid.value) return
  event.preventDefault()
  event.stopPropagation()
  // Consume wheel events throughout the reaction tray, even over its header.
  const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? emojiGrid.value.clientHeight : 1
  emojiGrid.value.scrollTop += event.deltaY * unit
}
function canMarkRead() {
  return !activeDirectId.value && props.visible && document.visibilityState === 'visible'
}
function markVisibleRead() {
  if (!canMarkRead()) return
  const newest = visibleMessages.value.at(-1)
  if (!newest) return
  persistLastRead(Date.parse(newest.sentAt))
  if (connection?.state === signalR.HubConnectionState.Connected) {
    void connection.invoke('MarkSeen', newest.id).catch(() => { /* Reintentar cuando haya conexión */ })
  }
}
function receivedMessage(message: ChatMessage) {
  // Un mensaje enviado antes de vaciar esta cuenta no vuelve a aparecer
  // aunque llegue tarde durante una reconexión.
  if (Date.parse(message.sentAt) <= clearedThrough.value ||
      blockedUserIds.value.has(message.userId.toLowerCase())) return
  if (messages.value.some(item => item.id === message.id)) return
  chatNotice.value = ''
  messages.value = [...messages.value.slice(-59), message]
  if (canMarkRead()) { scrollBottom(); markVisibleRead() }
}
function receivedReceipt(receipt: ReadReceipt) {
  const index = receipts.value.findIndex(item => item.userId === receipt.userId)
  if (index === -1) receipts.value = [...receipts.value, receipt]
  else if (Date.parse(receipt.lastReadAt) > Date.parse(receipts.value[index].lastReadAt)) {
    receipts.value = receipts.value.map((item, i) => i === index ? receipt : item)
  }
}
function seenNames(message: ChatMessage): string[] {
  return receipts.value
    .filter(receipt => receipt.userId.toLowerCase() !== message.userId.toLowerCase()
      && Date.parse(receipt.lastReadAt) >= Date.parse(message.sentAt))
    .map(receipt => chatNames.value[receipt.userId.toLowerCase()] || receipt.name)
}
function toggleSeen(id: string) {
  expandedSeenId.value = expandedSeenId.value === id ? null : id
}
function clock(iso: string) { return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) }
function quoteText(text: string) { return text.length > 140 ? text.slice(0, 140).trimEnd() + '…' : text }
function replyToMessage(message: ChatMessage) {
  replyTarget.value = message
  error.value = ''
  void nextTick(() => input.value?.focus())
}
function cancelReply() { replyTarget.value = null; void nextTick(() => input.value?.focus()) }
function jumpToOriginal(id: string) {
  const element = Array.from(list.value?.querySelectorAll<HTMLElement>('[data-chat-id]') ?? [])
    .find(node => node.dataset.chatId === id)
  if (!element) {
    error.value = 'El mensaje original ya no está disponible en este historial temporal.'
    return
  }
  error.value = ''
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  highlightedId.value = id
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => { highlightedId.value = null; highlightTimer = null }, 1800)
}
async function clearMyChat() {
  if (clearingChat.value || !chatTimeline.value.length ||
      connection?.state !== signalR.HubConnectionState.Connected) return
  const confirmed = window.confirm(
    '¿Limpiar el chat solo para tu cuenta?\n\n' +
    'Los mensajes anteriores se ocultarán de tu vista, también al volver a entrar. ' +
    'Los otros administradores conservarán su historial, imágenes y vistos. ' +
    'La limpieza no se puede deshacer desde tu cuenta.'
  )
  if (!confirmed) return
  clearingChat.value = true
  error.value = ''
  chatNotice.value = ''
  try {
    await connection.invoke('ClearMyChat')
    // El estado se actualiza con el evento privado del servidor.
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo limpiar tu chat.'
  } finally { clearingChat.value = false }
}
function onChatClearedForUser(event: { clearedAt: string }) {
  if (!active) return
  const cutoff = Date.parse(event?.clearedAt ?? '')
  if (!Number.isFinite(cutoff) || cutoff < clearedThrough.value) return
  clearedThrough.value = cutoff
  messages.value = messages.value.filter(message => Date.parse(message.sentAt) > cutoff)
  blockNotices.value = []
  replyTarget.value = null
  expandedSeenId.value = null
  highlightedId.value = null
  reactionPickerId.value = null
  expandedReaction.value = null
  stickerTrayOpen.value = false
  personMenuId.value = null
  blockedTrayOpen.value = false
  closeViewer()
  // Los vistos globales permanecen para los mensajes posteriores y los demás.
  persistLastRead(cutoff)
  chatNotice.value = 'Tu vista del chat está limpia. Los demás administradores conservan sus mensajes.'
}
async function send() {
  const text = draft.value.trim()
  if ((!text && !outgoingImage.value && !outgoingAudio.value) || text.length > 500 ||
      sending.value || mediaBusy.value || recording.value ||
      connection?.state !== signalR.HubConnectionState.Connected) return
  sending.value = true
  error.value = ''
  stopTyping()
  const target = replyTarget.value
  try {
    if (outgoingImage.value) {
      const attachment = outgoingImage.value
      const uploaded = await uploadImage(attachment.blob, 'message')
      await connection.invoke('SendMedia', uploaded.imageId, text, target?.id ?? null, attachment.mode)
      clearOutgoingImage()
      if (attachment.mode === 'sticker') {
        try { await saveSticker(attachment.blob, uploaded.imageId) }
        catch { chatNotice.value = 'Sticker enviado. No se pudo guardar en este navegador.' }
      }
    } else if (outgoingAudio.value) {
      const audioId = await uploadAudio(outgoingAudio.value.blob)
      await connection.invoke('SendVoice', audioId, target?.id ?? null, text)
      clearOutgoingAudio()
    } else if (target) await connection.invoke('ReplyToMessage', text, target.id)
    else await connection.invoke('SendMessage', text)
    draft.value = ''
    if (replyTarget.value?.id === target?.id) replyTarget.value = null
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.' }
  finally { sending.value = false }
}
function scheduleRetry() {
  if (!active || retryTimer) return
  retryTimer = setTimeout(() => { retryTimer = null; void startChat() }, 12000)
}
async function startChat() {
  if (!active || !connection || connection.state !== signalR.HubConnectionState.Disconnected) return
  try {
    await connection.start()
    if (!active) { await connection.stop(); return }
    status.value = 'En línea'
    const remembered = savedNickname()
    if (remembered) {
      try {
        const current = await connection.invoke<string>('SetDisplayName', remembered)
        nickname.value = remembered
        chatNames.value = { ...chatNames.value, [currentUserId.value]: current }
      } catch { /* Se conserva el chat si el apodo no pudo restaurarse. */ }
    }
    markVisibleRead()
  } catch {
    if (active) { status.value = 'Sin conexión · reintentando'; scheduleRetry() }
  }
}
function onVisibility() {
  if (document.visibilityState !== 'visible' && imageViewer.value?.oneTime) closeViewer()
  if (!canSendTyping()) stopTyping()
  if (canMarkRead()) { scrollBottom(); markVisibleRead() }
}
watch(() => props.visible, showing => {
  if (showing) onVisibility()
  else {
    stopTyping()
    stopRecording(true)
    void stopCamera()
    closeViewer()
    reactionPickerId.value = null
    personMenuId.value = null
    blockedTrayOpen.value = false
    stickerTrayOpen.value = false
  }
})
onMounted(() => {
  if (authState.user?.role !== 'administrador' || authState.previewRole) {
    status.value = 'Requiere una sesión administradora real.'
    return
  }
  initializeLastRead()
  void loadStickers()
  typingSweepTimer = setInterval(() => {
    const now = Date.now()
    typingClock.value = now
    for (const state of Object.values(remoteTyping.value)) {
      if (Date.parse(state.expiresAt) > now) continue
      const next = { ...remoteTyping.value }
      delete next[state.connectionId]
      remoteTyping.value = next
    }
  }, 850)
  void nextTick(() => list.value?.addEventListener('wheel', trapChatWheel, { passive: false }))
  window.addEventListener('focus', onVisibility)
  window.addEventListener('keydown', viewerKeydown)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', startChat)

  const hub = new signalR.HubConnectionBuilder()
    .withUrl('/api/hubs/admin-chat', { withCredentials: true })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Error)
    .build()
  connection = hub
  bindCameraHub(hub)
  hub.on('ChatProfile', (profile: { displayName: string; customName: string | null }) => {
    if (!active) return
    nickname.value = savedNickname() ?? profile.customName ?? ''
    if (currentUserId.value && profile.displayName) {
      chatNames.value = { ...chatNames.value, [currentUserId.value]: profile.displayName }
    }
  })
  hub.on('AvatarSnapshot', (photos: { userId: string; url: string }[]) => {
    if (!active) return
    avatarUrls.value = Object.fromEntries((photos ?? [])
      .filter(photo => photo.url?.startsWith('/api/admin/chat/images/'))
      .map(photo => [photo.userId.toLowerCase(), photo.url]))
  })
  hub.on('AvatarChanged', (userId: string, url: string | null) => {
    if (!active) return
    const next = { ...avatarUrls.value }
    if (url?.startsWith('/api/admin/chat/images/')) next[userId.toLowerCase()] = url
    else delete next[userId.toLowerCase()]
    avatarUrls.value = next
  })
  hub.on('NicknameChanged', (userId: string, name: string) => {
    if (!active) return
    chatNames.value = { ...chatNames.value, [userId.toLowerCase()]: name }
  })
  hub.on('BlockedSnapshot', (accounts: BlockedAccount[], notices: ChatBlockNotice[]) => {
    if (!active) return
    setBlockedSnapshot(accounts)
    blockNotices.value = (notices ?? []).filter(notice =>
      Date.parse(notice.sentAt) > clearedThrough.value).slice(-30)
  })
  hub.on('BlockListChanged', (accounts: BlockedAccount[]) => {
    if (active) setBlockedSnapshot(accounts)
  })
  hub.on('ChatBlockNotice', (notice: ChatBlockNotice) => addBlockNotice(notice))
  hub.on('History', (history: ChatMessage[], seen: ReadReceipt[], clearedAt?: string) => {
    if (!active) return
    const serverCutoff = Date.parse(clearedAt ?? '')
    if (Number.isFinite(serverCutoff)) clearedThrough.value = Math.max(clearedThrough.value, serverCutoff)
    messages.value = history.filter(message =>
      Date.parse(message.sentAt) > clearedThrough.value &&
      !blockedUserIds.value.has(message.userId.toLowerCase())).slice(-60)
    receipts.value = seen ?? []
    if (canMarkRead()) { scrollBottom(); markVisibleRead() }
  })
  hub.on('Message', (message: ChatMessage) => { if (active) receivedMessage(message) })
  hub.on('ReactionChanged', (messageId: string, reactions: ChatReaction[]) => {
    if (active) messages.value = messages.value.map(message => message.id === messageId
      ? { ...message, reactions: reactions ?? [] } : message)
  })
  hub.on('OneTimeImageViewed', (imageId: string) => {
    if (active) messages.value = messages.value.map(message => message.imageId === imageId
      ? { ...message, imageViewed: true } : message)
  })
  hub.on('ChatClearedForUser', (event: { clearedAt: string }) => onChatClearedForUser(event))
  hub.on('TypingSnapshot', (states: TypingStatus[]) => {
    if (!active) return
    remoteTyping.value = {}
    for (const state of states ?? []) applyTypingState(state)
  })
  hub.on('TypingChanged', (state: TypingStatus) => { if (active) applyTypingState(state) })
  hub.on('Seen', (receipt: ReadReceipt) => { if (active) receivedReceipt(receipt) })
  hub.on('Presence', (count: number) => { if (active) online.value = count })
  hub.onreconnecting(() => {
    status.value = 'Reconectando…'
    stopTyping()
    stopRecording(true)
    void cleanupCameras(false)
    remoteTyping.value = {}
  })
  hub.onreconnected(() => { status.value = 'En línea'; markVisibleRead() })
  hub.onclose(() => {
    status.value = 'Desconectado'
    stopTyping()
    stopRecording(true)
    void cleanupCameras(false)
    remoteTyping.value = {}
    scheduleRetry()
  })
  void startChat()
})
onUnmounted(() => {
  active = false
  emit('unread-change', 0)
  stopTyping()
  stopRecording(true)
  void cleanupCameras(true)
  clearOutgoingImage()
  clearOutgoingAudio()
  releasePreviews()
  closeViewer()
  if (typingSweepTimer) clearInterval(typingSweepTimer)
  if (retryTimer) clearTimeout(retryTimer)
  if (highlightTimer) clearTimeout(highlightTimer)
  list.value?.removeEventListener('wheel', trapChatWheel)
  window.removeEventListener('focus', onVisibility)
  window.removeEventListener('keydown', viewerKeydown)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('online', startChat)
  if (connection) void connection.stop()
})
</script>

<template>
  <div class="team-chat-root">
    <section class="team-chat-profile" aria-label="Nombre visible en el chat">
      <div class="team-chat-profile__identity">
        <span class="team-chat__avatar team-chat__avatar--profile">
          <img v-if="avatarFor(currentUserId)" :src="avatarFor(currentUserId)" alt="Tu foto de perfil" />
          <span v-else>{{ initials(chatNames[currentUserId] || authState.user?.nombre || authState.user?.correo || 'Admin') }}</span>
        </span>
        <div class="team-chat-profile__copy">
          <span class="team-chat__tag">TU IDENTIDAD EN EL CHAT</span>
          <strong>{{ chatNames[currentUserId] || authState.user?.nombre || authState.user?.correo || 'Administrador' }}</strong>
          <small>Personalizá tu nombre y foto. No altera tu cuenta oficial.</small>
        </div>
      </div>
      <div class="team-chat-profile__actions">
        <input ref="avatarPicker" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp"
          aria-label="Seleccionar foto de perfil" @change="chooseAvatar" />
        <button class="team-chat-profile__edit" type="button"
          :disabled="avatarBusy || status !== 'En línea'"
          @click="avatarPicker?.click()">{{ avatarBusy ? 'Subiendo…' : 'Cambiar foto' }}</button>
        <button v-if="avatarFor(currentUserId)" class="team-chat-profile__edit team-chat-profile__remove" type="button"
          :disabled="avatarBusy" @click="removeAvatar">Quitar foto</button>
        <button v-if="!nicknameEditing" class="team-chat-profile__edit" type="button" @click="openNicknameEditor">
          <span aria-hidden="true">✎</span> {{ nickname ? 'Cambiar apodo' : 'Elegir apodo' }}
        </button>
      </div>
      <form v-if="nicknameEditing" class="team-chat-profile__form" @submit.prevent="saveNickname">
        <label class="sr-only" for="team-chat-nickname">Tu nombre para el chat</label>
        <input id="team-chat-nickname" v-model="nicknameInput" maxlength="32" autocomplete="nickname"
          placeholder="Tu nombre para el chat (2 a 32 caracteres)" :disabled="nicknameSaving" />
        <button type="submit" :disabled="nicknameSaving || status !== 'En línea'">{{ nicknameSaving ? 'Guardando…' : 'Guardar' }}</button>
        <button type="button" class="team-chat-profile__cancel" @click="nicknameEditing = false">Cancelar</button>
        <p v-if="nicknameError" class="team-chat-profile__error" role="alert">{{ nicknameError }}</p>
        <p class="team-chat-profile__hint">Dejá el campo vacío para volver al nombre de tu cuenta.</p>
      </form>
      <p v-if="nicknameError && !nicknameEditing" class="team-chat-profile__error" role="alert">{{ nicknameError }}</p>
    </section>
    <section ref="chatPanel" class="team-chat" aria-label="Chat entre administradores">
    <header class="team-chat__head">
      <div>
        <p class="team-chat__tag">CANAL PRIVADO · EXPERIMENTAL</p>
        <h2>Chat del equipo</h2>
        <p>Mensajería en vivo entre administradores. El historial se borra al reiniciar el backend.</p>
      </div>
      <div class="team-chat__head-actions">
        <div class="team-chat__presence" role="status">
          <span class="team-chat__light" :class="{ 'is-offline': status !== 'En línea' }" />
          {{ status }} <small v-if="online">· {{ online }} conectado{{ online === 1 ? '' : 's' }}</small>
        </div>
        <button class="team-chat__blocked-list-button" type="button"
          :aria-expanded="blockedTrayOpen"
          :title="'Administrar bloqueados: ' + blockedUsers.length"
          @click="blockedTrayOpen = !blockedTrayOpen; personMenuId = null">
          <ShieldBan :size="15" />
          Bloqueados ({{ blockedUsers.length }})
        </button>
        <button class="team-chat__clear-button" type="button"
          :disabled="status !== 'En línea' || clearingChat || !chatTimeline.length"
          title="Ocultar mensajes anteriores solo para tu cuenta"
          @click="clearMyChat">
          <IconSymbol glyph="trash" :size="15" />
          {{ clearingChat ? 'Limpiando…' : 'Limpiar mi chat' }}
        </button>
      </div>
    </header>
    <div v-if="blockedTrayOpen" class="team-chat__blocked-panel" role="region"
      aria-label="Administrar personas bloqueadas">
      <div class="team-chat__blocked-panel-head">
        <strong>Personas bloqueadas</strong>
        <button type="button" aria-label="Cerrar lista de bloqueados"
          @click="blockedTrayOpen = false"><X :size="17" /></button>
      </div>
      <p v-if="!blockedUsers.length">No bloqueaste a ningún administrador.</p>
      <div v-for="person in blockedUsers" :key="person.userId" class="team-chat__blocked-person">
        <span><UserX :size="16" /> {{ person.name }}</span>
        <button type="button" :disabled="status !== 'En línea' || !!blockBusyId"
          @click="setUserBlocked(person.userId, false)">
          {{ blockBusyId === person.userId ? 'Actualizando…' : 'Desbloquear' }}
        </button>
      </div>
      <small>El bloqueo solo oculta mensajes en tu chat. No expulsa a la otra persona del grupo.</small>
    </div>
    <p v-if="chatNotice" class="team-chat__notice" role="status">{{ chatNotice }}</p>
    <div ref="list" class="team-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
      <div v-if="!chatTimeline.length" class="team-chat__empty">
        <span>✳</span><strong>Este canal está esperando su primer mensaje.</strong>
        <p>Probalo con otro administrador desde otra computadora o navegador.</p>
      </div>
      <template v-for="message in chatTimeline" :key="message.id">
      <div v-if="message.isSystem" class="team-chat__system-message" role="status">
        <ShieldBan :size="15" aria-hidden="true" />
        <span>{{ message.text }}</span>
        <time :datetime="message.sentAt">{{ clock(message.sentAt) }}</time>
      </div>
      <div v-else :data-chat-id="message.id"
        class="team-chat__entry" :class="{ 'is-own': isOwn(message), 'is-highlighted': highlightedId === message.id }">
        <span class="team-chat__avatar team-chat__avatar--message" aria-hidden="true">
          <img v-if="avatarFor(message.userId)" :src="avatarFor(message.userId)" alt="" loading="lazy" />
          <span v-else>{{ initials(displayName(message)) }}</span>
        </span>
        <article class="team-chat__bubble" :class="{ 'is-own': isOwn(message), 'is-sticker': message.isSticker }">
          <div class="team-chat__by">
            <strong v-if="isOwn(message)">{{ displayName(message) }}</strong>
            <button v-else type="button" class="team-chat__person-trigger"
              :aria-label="'Opciones de ' + displayName(message)"
              :aria-expanded="personMenuId === message.userId"
              @click="togglePersonMenu(message.userId)">{{ displayName(message) }}</button>
            <span class="team-chat__meta">
              <time :datetime="message.sentAt">{{ clock(message.sentAt) }}</time>
              <button v-if="isOwn(message)" type="button" class="team-chat__seen-button"
                :aria-expanded="expandedSeenId === message.id"
                :aria-label="'Ver quién leyó este mensaje: ' + seenNames(message).length"
                title="Ver quién lo leyó" @click="toggleSeen(message.id)">✓✓</button>
            </span>
          </div>
          <div v-if="personMenuId === message.userId && !isOwn(message)"
            class="team-chat__person-menu">
            <strong>{{ displayName(message) }}</strong>
            <button type="button" :disabled="status !== 'En línea' || !!blockBusyId"
              @click="setUserBlocked(message.userId, true)">
              <UserX :size="15" /> Bloquear a esta persona
            </button>
            <small>Dejarás de ver sus mensajes y recibirá un aviso del sistema.</small>
          </div>
          <button v-if="message.replyTo" class="team-chat__quoted" type="button"
            :aria-label="'Ir al mensaje original de ' + message.replyTo.name"
            @click="jumpToOriginal(message.replyTo.id)">
            <strong>↪ {{ message.replyTo.userId && blockedUserIds.has(message.replyTo.userId.toLowerCase()) ? 'Mensaje oculto' : message.replyTo.name }}</strong>
            <span>{{ message.replyTo.userId && blockedUserIds.has(message.replyTo.userId.toLowerCase()) ? 'Contenido de una persona bloqueada' : message.replyTo.text }}</span>
          </button>
          <p v-if="message.text">{{ message.text }}</p>
          <button v-if="message.imageUrl" type="button" class="team-chat__image-link"
            :class="{ 'is-sticker': message.isSticker }"
            :aria-label="'Ampliar ' + (message.isSticker ? 'sticker' : 'imagen') + ' de ' + displayName(message)"
            @click="openSharedImage(message)">
            <img class="team-chat__shared-image" :class="{ 'is-sticker': message.isSticker }"
              :src="message.imageUrl" :alt="message.isSticker ? 'Sticker enviado por ' + displayName(message) : 'Imagen enviada por ' + displayName(message)" loading="lazy" />
          </button>
          <button v-else-if="message.isViewOnce" type="button" class="team-chat__once-button"
            :disabled="isOwn(message) || message.imageViewed || viewingImageId === message.id"
            :aria-label="message.imageViewed ? 'Foto ya vista' : 'Abrir foto de una sola visualización'"
            @click="openSharedImage(message)">
            <LockKeyhole :size="22" aria-hidden="true" />
            <span>{{ isOwn(message) ? 'Foto de una vez enviada' : message.imageViewed ? 'Foto ya vista' : viewingImageId === message.id ? 'Abriendo…' : 'Ver foto una vez' }}</span>
          </button>
          <audio v-if="message.audioUrl?.startsWith('/api/admin/chat/audio/')" class="team-chat__audio-player"
            controls preload="none" :src="message.audioUrl" :aria-label="'Audio de ' + displayName(message)">
            Tu navegador no permite reproducir este audio.
          </audio>
          <div v-if="message.reactions?.length" class="team-chat__reactions" aria-label="Reacciones al mensaje">
            <div v-for="reaction in message.reactions" :key="reaction.emoji" class="team-chat__reaction-pill"
              :class="{ 'is-mine': reactedByMe(reaction) }">
              <button type="button" class="team-chat__reaction-choice"
                :title="reactedByMe(reaction) ? 'Quitar mi reacción' : 'Reaccionar con ' + reaction.emoji"
                :aria-label="reactedByMe(reaction) ? 'Quitar mi reacción ' + reaction.emoji : 'Reaccionar con ' + reaction.emoji"
                :disabled="status !== 'En línea'"
                @click="toggleReaction(message.id, reaction.emoji)">{{ reaction.emoji }}</button>
              <button type="button" class="team-chat__reaction-count"
                :aria-expanded="expandedReaction?.messageId === message.id && expandedReaction?.emoji === reaction.emoji"
                :aria-label="'Ver quién reaccionó con ' + reaction.emoji"
                :title="reactorNames(reaction).join(', ')"
                @click="showReactionUsers(message.id, reaction.emoji)">{{ reaction.userIds.length }}</button>
            </div>
            <template v-for="reaction in message.reactions" :key="'people-' + reaction.emoji">
              <div v-if="expandedReaction?.messageId === message.id && expandedReaction?.emoji === reaction.emoji"
                class="team-chat__reactors" role="status">
                <strong>Reaccionaron con {{ reaction.emoji }}:</strong>
                <span v-for="(name, index) in reactorNames(reaction)" :key="reaction.userIds[index]">{{ name }}</span>
              </div>
            </template>
          </div>
          <div v-if="isOwn(message) && expandedSeenId === message.id" class="team-chat__seen-popover" role="status">
            <strong>Lecturas</strong>
            <span v-if="!seenNames(message).length">Todavía nadie lo ha visto</span>
            <span v-for="name in seenNames(message)" :key="name">✓ {{ name }}</span>
          </div>
        </article>
        <div class="team-chat__actions">
          <button class="team-chat__reply-action" type="button"
            :title="'Responder a ' + displayName(message)"
            :aria-label="'Responder al mensaje de ' + displayName(message)"
            @click="replyToMessage(message)">↩</button>
          <button class="team-chat__reply-action" type="button"
            :aria-expanded="reactionPickerId === message.id"
            :aria-label="'Reaccionar al mensaje de ' + displayName(message)"
            title="Reaccionar" :disabled="status !== 'En línea'"
            @click="toggleReactionPicker(message.id)"><SmilePlus :size="18" /></button>
          <button v-if="message.isSticker && message.imageId" class="team-chat__reply-action" type="button"
            :disabled="stickerBusy || savedSources.has(message.imageId)"
            :title="savedSources.has(message.imageId) ? 'Sticker guardado' : 'Guardar sticker en mi colección'"
            :aria-label="savedSources.has(message.imageId) ? 'Sticker guardado' : 'Guardar este sticker'"
            @click="saveMessageSticker(message)"><BookmarkPlus :size="17" /></button>
        </div>
      </div>
      </template>
      <div v-if="typingNames.length" class="team-chat__typing" role="status" aria-live="polite" aria-atomic="true">
        <span class="team-chat__typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="team-chat__typing-name">{{ typingLabel }}</span>
      </div>
    </div>
    <div v-if="reactionPickerId" class="team-chat__emoji-tray" role="group"
      aria-label="Reacciones con emojis" @wheel="scrollEmojiTray">
      <div class="team-chat__tray-head">
        <strong>Elegí un emoji para reaccionar</strong>
        <button type="button" aria-label="Cerrar emojis" @click="reactionPickerId = null"><X :size="17" /></button>
      </div>
      <div ref="emojiGrid" class="team-chat__emoji-grid">
        <button v-for="emoji in reactionChoices" :key="emoji" type="button"
          :aria-label="'Reaccionar con ' + emoji"
          @click="toggleReaction(reactionPickerId!, emoji)"><span>{{ emoji }}</span></button>
      </div>
    </div>
    <div v-if="stickerTrayOpen" class="team-chat__sticker-tray">
      <div class="team-chat__tray-head">
        <strong>Mis stickers</strong>
        <button type="button" aria-label="Cerrar stickers" @click="stickerTrayOpen = false"><X :size="17" /></button>
      </div>
      <div class="team-chat__sticker-grid">
        <button type="button" class="team-chat__new-sticker"
          :disabled="status !== 'En línea' || mediaBusy" @click="pickImage('sticker')">
          <Plus :size="21" /><span>Subir sticker</span>
        </button>
        <div v-for="saved in savedStickers" :key="saved.id" class="team-chat__saved-sticker">
          <button type="button" :title="'Usar sticker guardado'"
            :disabled="status !== 'En línea' || mediaBusy" @click="useSavedSticker(saved)">
            <img :src="saved.previewUrl" alt="Sticker guardado" />
          </button>
          <button type="button" class="team-chat__remove-sticker" title="Quitar de mis stickers"
            aria-label="Borrar sticker guardado" @click="removeSavedSticker(saved)"><X :size="13" /></button>
        </div>
      </div>
      <p v-if="!savedStickers.length">Todavía no guardaste stickers. Subí uno o guardá uno del chat.</p>
      <p v-if="stickerError" role="alert">{{ stickerError }}</p>
      <small>Hasta 32 stickers por cuenta, guardados en este navegador. No se sincronizan con otras computadoras.</small>
    </div>
    <div v-if="replyTarget" class="team-chat__reply-banner" role="status">
      <div class="team-chat__reply-banner-copy">
        <strong>↩ Respondiendo a {{ replyTarget.name || replyTarget.email }}</strong>
        <span>{{ quoteText(replyTarget.text) }}</span>
      </div>
      <button type="button" aria-label="Cancelar respuesta" title="Cancelar respuesta" @click="cancelReply">✕</button>
    </div>
    <div v-if="outgoingImage" class="team-chat__media-preview" role="status">
      <img :src="outgoingImage.previewUrl" alt="Vista previa de imagen a enviar" />
      <span>{{ outgoingImage.mode === 'sticker' ? 'Sticker con foto · mantiene transparencia si la imagen la tiene' : outgoingImage.mode === 'once' ? 'Foto para ver una vez · no se guarda en la galería del chat' : 'Imagen adjunta · podés agregar un texto' }}</span>
      <button v-if="outgoingImage.mode !== 'sticker'" type="button"
        class="team-chat__once-toggle" :aria-pressed="outgoingImage.mode === 'once'"
        @click="toggleViewOnce"><LockKeyhole :size="14" />{{ outgoingImage.mode === 'once' ? '✓ Ver una vez' : 'Ver una vez' }}</button>
      <button type="button" aria-label="Quitar imagen adjunta" title="Quitar imagen" @click="clearOutgoingImage">✕</button>
    </div>
    <div v-if="outgoingAudio" class="team-chat__audio-preview" role="status">
      <Mic :size="18" /><audio :src="outgoingAudio.previewUrl" controls preload="metadata" aria-label="Escuchar audio antes de enviarlo" />
      <button type="button" aria-label="Descartar grabación" @click="clearOutgoingAudio"><X :size="17" /></button>
    </div>
    <div v-if="recording" class="team-chat__recording" role="status">
      <span class="team-chat__recording-dot" aria-hidden="true"></span>
      Grabando audio · {{ recordingSeconds }} s de 45 s
      <button type="button" @click="stopRecording(true)">Descartar</button>
    </div>
    <form class="team-chat__composer" @submit.prevent="send">
      <input ref="imagePicker" type="file" class="sr-only" accept="image/jpeg,image/png,image/webp"
        aria-label="Seleccionar imagen para enviar" @change="chooseImage" />
      <button type="button" class="team-chat__attach" :disabled="status !== 'En línea' || mediaBusy || sending"
        aria-label="Adjuntar imagen" title="Enviar imagen" @click="pickImage('image')">
        <IconSymbol glyph="image" :size="19" />
      </button>
      <button type="button" class="team-chat__attach team-chat__sticker-attach"
        :disabled="status !== 'En línea' || mediaBusy || sending"
        aria-label="Abrir stickers guardados" title="Stickers guardados"
        :aria-expanded="stickerTrayOpen"
        @click="toggleStickerTray"><Sticker :size="19" /></button>
      <button type="button" class="team-chat__attach team-chat__mic-attach"
        :disabled="status !== 'En línea' || sending || mediaBusy"
        :aria-label="recording ? 'Detener grabación de audio' : 'Grabar mensaje de voz'"
        :title="recording ? 'Detener grabación' : 'Grabar audio'"
        @click="recording ? stopRecording() : startRecording()">
        <Square v-if="recording" :size="17" fill="currentColor" />
        <Mic v-else :size="19" />
      </button>
      <label class="sr-only" for="team-chat-input">Escribir mensaje</label>
      <input id="team-chat-input" ref="input" v-model="draft" maxlength="500" autocomplete="off"
        placeholder="Escribí un mensaje al equipo…" :disabled="status !== 'En línea'"
        @input="onDraftInput" @paste="onComposerPaste" @blur="stopTyping" />
      <button type="submit" :disabled="status !== 'En línea' || (!draft.trim() && !outgoingImage && !outgoingAudio) || sending || mediaBusy || recording">
        {{ sending ? 'Enviando…' : 'Enviar ↗' }}
      </button>
    </form>
    <p v-if="error" class="team-chat__error" role="alert">{{ error }}</p>
    <p class="team-chat__foot">Solo administradores autenticados · {{ visibleMessages.length }} mensajes visibles en este historial temporal.</p>
    </section>
    <section class="team-chat__camera-panel" aria-label="Cámaras del equipo">
      <div class="team-chat__camera-header">
        <div><strong><Video :size="18" /> Cámaras del equipo</strong>
          <p>Video en directo entre administradores. Activación individual, sin grabación en el servidor.</p>
        </div>
        <button type="button" :disabled="cameraBusy || status !== 'En línea'"
          @click="cameraStream ? stopCamera() : startCamera()">
          <VideoOff v-if="cameraStream" :size="18" />
          <Video v-else :size="18" />
          {{ cameraBusy ? 'Activando…' : cameraStream ? 'Apagar mi cámara' : 'Encender mi cámara' }}
        </button>
      </div>
      <div v-if="cameraStream || cameraTiles.length" class="team-chat__camera-grid">
        <ChatCameraTile v-if="cameraStream" :stream="cameraStream"
          :name="chatNames[currentUserId] || authState.user?.nombre || 'Mi cámara'" self />
        <ChatCameraTile v-for="tile in cameraTiles" :key="tile.connectionId"
          :stream="tile.stream" :name="tile.name" />
      </div>
      <p v-else class="team-chat__camera-empty">No hay cámaras activas en este momento.</p>
      <p v-if="cameraError" role="alert" class="team-chat__camera-error">{{ cameraError }}</p>
      <small v-if="!cameraSupported">Para activar cámara o micrófono desde otra computadora, se necesita una conexión HTTPS segura.</small>
      <small v-else>Las cámaras funcionan mejor dentro de la misma red. Fuera de ella puede ser necesario un servidor TURN.</small>
    </section>
    <div v-if="imageViewer" class="team-chat__lightbox" role="dialog" aria-modal="true"
      :aria-label="imageViewer.title" @click.self="closeViewer">
      <div class="team-chat__lightbox-panel">
        <div class="team-chat__lightbox-head">
          <strong>{{ imageViewer.title }}</strong>
          <button type="button" aria-label="Cerrar imagen" title="Cerrar imagen"
            @click="closeViewer">✕</button>
        </div>
        <img :src="imageViewer.src" :alt="imageViewer.title" />
        <p v-if="imageViewer.oneTime">Al cerrar, no vas a poder abrir esta foto otra vez desde tu cuenta. Las capturas de pantalla no se pueden impedir.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.team-chat {
  --chat-bg: var(--manager-card, #fff);
  --chat-text: var(--manager-ink, #20242b);
  --chat-muted: var(--manager-muted, #687080);
  --chat-line: var(--manager-line, #ded9dc);
  --chat-accent: var(--manager-accent, #b20c2a);
  --chat-soft: #f5f0f2;
  --chat-bubble: #ece8ed;
  --chat-own: #a20f2c;
  --chat-own-text: #fff;
  --chat-scroll: #b48c9a;
  --chat-quoted: rgba(50, 32, 42, .065);
  width: min(1040px, 100%);
  margin: 24px auto 64px;
  padding: clamp(17px, 3vw, 30px);
  border: 1px solid var(--chat-line);
  border-radius: 22px;
  background: var(--chat-bg);
  color: var(--chat-text);
  box-shadow: 0 14px 38px rgba(25, 16, 24, .055);
}
/* La clase theme-dark vive en <html>, fuera del scope de este componente.
   Usar el selector global COMPLETO evita que Vue intente ubicar html.theme-dark
   dentro de .team-chat. El modo claro conserva los valores anteriores. */
:global(html.theme-dark .administration-page .team-chat) {
  --chat-bg: #211b20;
  --chat-text: #fff;
  --chat-muted: #c4c5cf;
  --chat-line: #565057;
  --chat-accent: #ef233c;
  --chat-soft: #18151b;
  --chat-bubble: #352b35;
  --chat-own: #86243b;
  --chat-own-text: #fff;
  --chat-scroll: #896071;
  --chat-quoted: rgba(255, 255, 255, .075);
  color-scheme: dark;
  background: var(--chat-bg);
  color: var(--chat-text);
  box-shadow: none;
}
/* Contraste garantizado incluso con las reglas globales !important del sitio. */
:global(html.theme-dark .administration-page .team-chat .team-chat__messages),
:global(html.theme-dark .administration-page .team-chat .team-chat__composer),
:global(html.theme-dark .administration-page .team-chat .team-chat__presence) {
  background: #18151b !important;
  color: #fff !important;
  border-color: #48424b !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__bubble:not(.is-own)) {
  background: #352b35 !important;
  color: #fff !important;
  border-color: #514450 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__bubble.is-own) {
  background: #86243b !important;
  color: #fff !important;
  border-color: #a83d56 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__composer input) {
  background: transparent !important;
  color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__composer input::placeholder) {
  color: #acacb8 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__composer button) {
  background: #c51b3c !important;
  color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__composer button:disabled) {
  opacity: .56;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__messages::-webkit-scrollbar-thumb) {
  background: #896071;
  border-color: #18151b;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__reply-banner) {
  background: #18151b !important;
  color: #fff !important;
  border-color: #514450 !important;
  border-left-color: #ef233c !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__quoted) {
  background: rgba(255,255,255,.075) !important;
  color: #fff !important;
  border-left-color: #ef233c !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__bubble.is-own .team-chat__quoted) {
  background: rgba(255,255,255,.12) !important;
  border-left-color: #ffc1cd !important;
}
.team-chat__head {
  display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;
  flex-wrap: wrap; padding-bottom: 22px; border-bottom: 1px solid var(--chat-line);
}
.team-chat__tag { color: var(--chat-accent); letter-spacing: .14em; font-size: 11px; font-weight: 850; }
.team-chat__head h2 { margin: 8px 0; font-size: clamp(23px, 3vw, 34px); letter-spacing: -.04em; color: var(--chat-text); }
.team-chat__head p:not(.team-chat__tag) { margin: 0; max-width: 530px; color: var(--chat-muted); font-size: 14px; line-height: 1.5; }
.team-chat__presence {
  padding: 9px 13px; border: 1px solid var(--chat-line); border-radius: 50px;
  background: var(--chat-soft); color: var(--chat-text); font-size: 12px;
}
.team-chat__presence small { font-size: 12px; }
.team-chat__light {
  display: inline-block; width: 8px; height: 8px; margin-right: 7px;
  border-radius: 50%; background: #18a56a; box-shadow: 0 0 8px #18a56a66;
}
.team-chat__light.is-offline { background: #a9a0a9; box-shadow: none; }
.team-chat__messages {
  height: min(53vh, 470px); min-height: 285px;
  display: flex; flex-direction: column; gap: 14px; overflow: auto;
  padding: 23px 11px 23px 4px; margin: 0 0 12px;
  background: var(--chat-soft); border-bottom: 1px solid var(--chat-line);
  scrollbar-width: thin; scrollbar-color: var(--chat-scroll) transparent;
  scrollbar-gutter: stable;
  border-radius: 10px;
}
.team-chat__messages::-webkit-scrollbar { width: 9px; }
.team-chat__messages::-webkit-scrollbar-track { background: transparent; border-radius: 99px; }
.team-chat__messages::-webkit-scrollbar-thumb {
  background: var(--chat-scroll); border: 2px solid var(--chat-soft); border-radius: 99px;
}
.team-chat__messages::-webkit-scrollbar-thumb:hover { background: var(--chat-accent); }
.team-chat__bubble {
  align-self: flex-start; max-width: min(83%, 550px); padding: 13px 16px;
  border: 1px solid var(--chat-line); border-radius: 16px 16px 16px 5px;
  color: var(--chat-text); background: var(--chat-bubble); overflow-wrap: anywhere;
}
.team-chat__bubble.is-own {
  align-self: flex-end; color: var(--chat-own-text); background: var(--chat-own);
  border-color: transparent; border-radius: 16px 16px 5px 16px;
}
.team-chat__bubble.is-highlighted {
  outline: 2px solid var(--chat-accent); outline-offset: 3px;
}
.team-chat__quoted {
  width: 100%; margin-top: 10px; padding: 9px 11px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  text-align: left; background: var(--chat-quoted);
  border: 0; border-left: 3px solid var(--chat-accent); border-radius: 7px;
  color: inherit; font: inherit; cursor: pointer;
}
.team-chat__quoted strong { font-size: 12px; }
.team-chat__quoted span {
  max-width: 100%; font-size: 12px; opacity: .85;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.team-chat__bubble.is-own .team-chat__quoted {
  border-left-color: #ffc1cd; background: rgba(255,255,255,.12);
}
.team-chat__quoted:hover { filter: brightness(1.08); }
.team-chat__quoted:focus-visible, .team-chat__reply-action:focus-visible,
.team-chat__reply-banner button:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
.team-chat__bubble-footer {
  margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px;
  align-items: center; justify-content: flex-end;
}
.team-chat__reply-action {
  padding: 3px 6px; border: 0; border-radius: 6px;
  background: transparent; color: inherit; font: inherit;
  font-size: 11px; opacity: .78; cursor: pointer;
}
.team-chat__reply-action:hover { opacity: 1; text-decoration: underline; }
.team-chat__reply-banner {
  display: flex; justify-content: space-between; gap: 14px; align-items: center;
  padding: 10px 12px; margin: 0 0 9px;
  border-radius: 11px; border: 1px solid var(--chat-line);
  border-left: 3px solid var(--chat-accent);
  color: var(--chat-text); background: var(--chat-soft);
}
.team-chat__reply-banner-copy {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px;
}
.team-chat__reply-banner-copy strong { color: var(--chat-accent); font-size: 12px; }
.team-chat__reply-banner-copy span {
  color: var(--chat-muted); font-size: 12px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.team-chat__reply-banner > button {
  flex-shrink: 0; width: 32px; height: 32px;
  border: 1px solid var(--chat-line); border-radius: 8px;
  background: transparent; color: var(--chat-text); cursor: pointer;
}
.team-chat__reply-banner > button:hover { background: var(--chat-quoted); }
.team-chat__by { display: flex; align-items: flex-start; justify-content: space-between; gap: 15px; font-size: 12px; }
.team-chat__by strong { font-weight: 800; }
.team-chat__by time { opacity: .8; white-space: nowrap; font-size: 11px; }
.team-chat__bubble p { margin: 9px 0 0; line-height: 1.5; white-space: pre-wrap; font-size: 14px; }
.team-chat__seen { display: block; font-size: 11px; opacity: .84; text-align: right; }
.team-chat__empty { margin: auto; text-align: center; color: var(--chat-muted); padding: 22px; }
.team-chat__empty span { display: block; font-size: 40px; color: var(--chat-accent); }
.team-chat__empty strong { display: block; color: var(--chat-text); margin: 12px 0 6px; }
.team-chat__empty p { margin: 0; font-size: 13px; }
.team-chat__composer {
  display: flex; align-items: center; gap: 10px; border-radius: 14px;
  border: 1px solid var(--chat-line); background: var(--chat-soft); padding: 8px;
}
.team-chat__composer input {
  flex: 1; min-width: 0; padding: 12px; border: none; outline: none;
  background: transparent; color: var(--chat-text); font: inherit;
}
.team-chat__composer input::placeholder { color: var(--chat-muted); }
.team-chat__composer:focus-within { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
.team-chat__composer button {
  border: 0; border-radius: 10px; background: var(--chat-accent); color: #fff;
  padding: 12px 22px; font: inherit; font-weight: 750; cursor: pointer;
}
.team-chat__composer button:disabled { opacity: .48; cursor: not-allowed; }
.team-chat__error { color: var(--chat-accent); }
.team-chat__foot { margin: 14px 0 0; color: var(--chat-muted); font-size: 12px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
@media (max-width: 600px) {
  .team-chat { padding: 16px; margin: 14px auto 32px; border-radius: 17px; }
  .team-chat__messages { height: 390px; padding-right: 9px; }
  .team-chat__bubble { max-width: 95%; }
  .team-chat__composer button { padding: 10px 13px; }
  .team-chat__by { flex-wrap: wrap; gap: 4px 12px; }
}

/* Identidad del chat: tarjeta independiente por encima de la conversación. */
.team-chat-root { width: min(1040px, 100%); min-width: 0; margin-inline: auto; }
.team-chat-root .team-chat { margin: 12px auto 64px; width: 100%; box-sizing: border-box; }
.team-chat-profile {
  box-sizing: border-box; width: 100%; margin-top: 24px; padding: 17px 20px;
  border: 1px solid var(--manager-line, #ded9dc); border-radius: 17px;
  background: var(--manager-card, #fff); color: var(--manager-ink, #20242b);
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px;
}
.team-chat-profile__copy { display: flex; flex-direction: column; gap: 4px; flex: 1 1 240px; min-width: 0; }
.team-chat-profile__copy strong { font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
.team-chat-profile__copy small { font-size: 12px; color: var(--manager-muted, #687080); }
.team-chat-profile .team-chat__tag { margin: 0 0 3px; color: var(--manager-accent, #b20c2a); }
.team-chat-profile__edit {
  border: 1px solid var(--manager-line, #ded9dc); border-radius: 11px;
  background: transparent; color: var(--manager-ink, #20242b); padding: 10px 15px;
  font: inherit; font-size: 13px; font-weight: 750; cursor: pointer;
}
.team-chat-profile__edit:hover { border-color: var(--manager-accent, #b20c2a); }
.team-chat-profile__form {
  flex: 1 1 100%; display: flex; flex-wrap: wrap; gap: 9px; align-items: center;
  padding-top: 10px; border-top: 1px solid var(--manager-line, #ded9dc);
}
.team-chat-profile__form input {
  flex: 1 1 230px; min-width: 0; border-radius: 9px; padding: 11px 12px;
  border: 1px solid var(--manager-line, #ded9dc);
  background: var(--manager-input, #fff); color: var(--manager-ink, #20242b);
  font: inherit; font-size: 13px;
}
.team-chat-profile__form button {
  border: 1px solid var(--manager-accent, #b20c2a); border-radius: 9px;
  padding: 10px 15px; background: var(--manager-accent, #b20c2a);
  color: #fff; font: inherit; font-size: 13px; font-weight: 750; cursor: pointer;
}
.team-chat-profile__form button:disabled { opacity: .55; cursor: not-allowed; }
.team-chat-profile__form .team-chat-profile__cancel {
  background: transparent; border-color: var(--manager-line, #ded9dc);
  color: var(--manager-ink, #20242b);
}
.team-chat-profile__hint, .team-chat-profile__error { width: 100%; margin: 0; font-size: 12px; color: var(--manager-muted, #687080); }
.team-chat-profile__error { color: var(--manager-accent, #b20c2a); }
:global(html.theme-dark .administration-page .team-chat-profile) {
  background: #211b20; border-color: #565057; color: #fff;
}
:global(html.theme-dark .administration-page .team-chat-profile__edit),
:global(html.theme-dark .administration-page .team-chat-profile__form .team-chat-profile__cancel) {
  background: transparent !important; color: #fff !important; border-color: #6a6069 !important;
}
:global(html.theme-dark .administration-page .team-chat-profile__form input) {
  background: #11182d !important; color: #fff !important; border-color: #555b6b !important;
}
:global(html.theme-dark .administration-page .team-chat-profile__form button:not(.team-chat-profile__cancel)) {
  background: #c51b3c !important; color: #fff !important;
}

/* Burbuja compacta inspirada en mensajería. Las acciones viven fuera de ella. */
.team-chat__messages {
  gap: 9px; padding: 17px 10px 17px 6px;
  overflow-x: hidden; overflow-y: auto;
  overscroll-behavior: contain; touch-action: pan-y;
}
.team-chat__entry {
  box-sizing: border-box; width: 100%; min-width: 0;
  display: flex; align-items: center; justify-content: flex-start; gap: 8px;
}
.team-chat__entry.is-own { flex-direction: row-reverse; }
.team-chat__bubble, .team-chat__bubble.is-own {
  align-self: auto; position: relative; flex: 0 1 auto;
  max-width: min(79%, 540px); min-width: 0;
  padding: 9px 12px 8px;
  border-radius: 16px 16px 16px 5px;
  box-shadow: 0 1px 3px rgba(0,0,0,.055);
}
.team-chat__bubble.is-own { border-radius: 16px 16px 5px 16px; }
.team-chat__entry.is-highlighted .team-chat__bubble { outline: 2px solid var(--chat-accent); outline-offset: 3px; }
.team-chat__by { display: flex; align-items: center; gap: 12px; justify-content: space-between; }
.team-chat__by strong { font-size: 11.5px; line-height: 1.25; }
.team-chat__meta { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.team-chat__meta time { font-size: 10px; opacity: .7; }
.team-chat__bubble p { margin: 5px 0 0; font-size: 13.5px; line-height: 1.42; }
.team-chat__quoted { margin-top: 7px; padding: 7px 9px; gap: 2px; }
.team-chat__quoted strong, .team-chat__quoted span { font-size: 11px; }
.team-chat__reply-action {
  flex: 0 0 auto; width: 33px; height: 33px; padding: 0;
  display: grid; place-items: center;
  border: 1px solid var(--chat-line); border-radius: 50%;
  background: var(--chat-bg); color: var(--chat-text);
  font-size: 20px; line-height: 1;
  opacity: 0; transform: translateY(3px);
  transition: opacity .15s, transform .15s, border-color .15s;
}
.team-chat__entry:hover .team-chat__reply-action,
.team-chat__entry:focus-within .team-chat__reply-action {
  opacity: 1; transform: translateY(0);
}
.team-chat__reply-action:hover { border-color: var(--chat-accent); }
.team-chat__seen-button {
  border: 0; background: transparent; color: inherit; opacity: .86;
  min-width: 27px; min-height: 24px; padding: 0 2px;
  font: inherit; font-size: 12px; font-weight: 850; cursor: pointer;
}
.team-chat__seen-button:hover,
.team-chat__seen-button[aria-expanded="true"] { opacity: 1; text-decoration: underline; }
.team-chat__seen-popover {
  position: absolute; z-index: 5; right: 0; bottom: calc(100% + 6px);
  width: max-content; max-width: min(260px, 85vw);
  display: flex; flex-direction: column; gap: 6px; padding: 11px 13px;
  border: 1px solid var(--chat-line); border-radius: 11px;
  background: var(--chat-bg); color: var(--chat-text);
  box-shadow: 0 9px 22px rgba(0,0,0,.15);
  font-size: 12px; overflow-wrap: anywhere;
}
.team-chat__seen-popover strong { font-size: 12px; color: var(--chat-accent); }
.team-chat__seen-popover span { max-width: 230px; white-space: normal; }
:global(html.theme-dark .administration-page .team-chat .team-chat__reply-action) {
  background: #29212b !important; color: #fff !important; border-color: #514450 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__seen-popover) {
  background: #211b20 !important; color: #fff !important; border-color: #514450 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__seen-button) {
  color: #ffe6eb !important; background: transparent !important;
}
@media (hover: none), (pointer: coarse) {
  .team-chat__reply-action { opacity: 1; transform: none; }
}
@media (max-width: 600px) {
  .team-chat-profile { padding: 14px; }
  .team-chat-profile__form button { flex: 1 1 auto; }
  .team-chat-root .team-chat { margin-bottom: 34px; }
  .team-chat__bubble, .team-chat__bubble.is-own { max-width: min(84%, 540px); padding: 9px 10px; }
  .team-chat__by { flex-wrap: wrap; gap: 3px 10px; }
  .team-chat__meta { margin-left: auto; }
  .team-chat__entry { gap: 5px; }
  .team-chat__reply-action { width: 29px; height: 29px; font-size: 18px; }
}


/* Indicador discreto, integrado al final del historial y sin persistencia. */
.team-chat__typing {
  align-self: flex-start; max-width: min(90%, 380px);
  display: inline-flex; align-items: center; gap: 10px;
  padding: 7px 12px 7px 8px; border: 1px solid var(--chat-line);
  border-radius: 15px 15px 15px 5px;
  background: var(--chat-bubble); color: var(--chat-muted);
  font-size: 12px; line-height: 1.35;
}
.team-chat__typing-name { overflow-wrap: anywhere; }
.team-chat__typing-dots {
  flex: 0 0 auto; display: inline-flex; align-items: center;
  justify-content: center; gap: 4px; min-width: 40px; height: 23px;
  border-radius: 13px; background: var(--chat-soft);
}
.team-chat__typing-dots i {
  width: 5px; height: 5px; border-radius: 50%;
  background: var(--chat-accent);
  animation: chat-typing-bounce 1.25s ease-in-out infinite;
}
.team-chat__typing-dots i:nth-child(2) { animation-delay: .16s; }
.team-chat__typing-dots i:nth-child(3) { animation-delay: .32s; }
@keyframes chat-typing-bounce {
  0%, 55%, 100% { transform: translateY(0); opacity: .5; }
  25% { transform: translateY(-3px); opacity: 1; }
}
:global(html.theme-dark .administration-page .team-chat .team-chat__typing) {
  background: #352b35 !important;
  border-color: #514450 !important;
  color: #dbd3dd !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__typing-dots) {
  background: #24202a !important;
}
@media (prefers-reduced-motion: reduce) {
  .team-chat__typing-dots i { animation: none; opacity: 1; }
}

/* Fotos circulares y tarjetas de imagen, visibles en ambas variantes del panel. */
.team-chat-profile__identity {
  flex: 1 1 250px; min-width: 0; display: flex; align-items: center; gap: 13px;
}
.team-chat-profile__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.team-chat-profile__actions .team-chat-profile__remove {
  color: var(--manager-muted, #687080);
}
.team-chat__avatar {
  flex: 0 0 auto; display: grid; place-items: center;
  width: 30px; height: 30px; overflow: hidden; border-radius: 50%;
  border: 1px solid var(--chat-line, #ded9dc);
  background: color-mix(in srgb, var(--chat-accent, #b20c2a) 12%, var(--chat-bg, #fff));
  color: var(--chat-accent, #b20c2a);
  font-size: 10px; font-weight: 800; line-height: 1;
  user-select: none;
}
.team-chat__avatar img { display: block; width: 100%; height: 100%; object-fit: cover; }
.team-chat__avatar--profile {
  width: 48px; height: 48px; font-size: 15px;
  --chat-bg: var(--manager-card, #fff);
  --chat-line: var(--manager-line, #ded9dc);
  --chat-accent: var(--manager-accent, #b20c2a);
}
.team-chat__avatar--message { width: 29px; height: 29px; }
.team-chat__image-link {
  display: block; width: fit-content; max-width: 100%;
  margin-top: 8px; overflow: hidden; border-radius: 10px;
  border: 1px solid rgba(138, 138, 155, .24);
  background: var(--chat-soft); line-height: 0;
}
.team-chat__shared-image {
  display: block; width: auto; max-width: min(100%, 300px);
  max-height: 300px; height: auto; object-fit: contain;
}
.team-chat__image-link:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 3px; }
.team-chat__media-preview {
  display: flex; gap: 11px; align-items: center;
  padding: 9px 11px; margin: 0 0 9px;
  border: 1px solid var(--chat-line); border-radius: 12px;
  background: var(--chat-soft); color: var(--chat-muted); font-size: 12px;
}
.team-chat__media-preview img {
  width: 56px; height: 50px; object-fit: cover; border-radius: 9px;
}
.team-chat__media-preview span { min-width: 0; flex: 1; }
.team-chat__media-preview button {
  flex: 0 0 auto; width: 31px; height: 31px; padding: 0;
  border: 1px solid var(--chat-line); border-radius: 8px;
  background: transparent; color: var(--chat-text); cursor: pointer;
}
.team-chat__composer .team-chat__attach {
  flex: 0 0 auto; padding: 0; width: 39px; height: 39px;
  display: grid; place-items: center;
  border-radius: 9px; background: transparent;
  border: 1px solid var(--chat-line); color: var(--chat-accent);
  font-size: 21px;
}
.team-chat__composer .team-chat__attach:hover:not(:disabled) {
  background: color-mix(in srgb, var(--chat-accent) 12%, transparent);
}
:global(html.theme-dark .administration-page .team-chat .team-chat__media-preview) {
  background: #18151b !important; color: #eee4eb !important;
  border-color: #514450 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__media-preview button),
:global(html.theme-dark .administration-page .team-chat .team-chat__composer .team-chat__attach) {
  background: transparent !important; border-color: #514450 !important; color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat-profile__identity .team-chat__avatar) {
  background: #352b35; color: #fff; border-color: #6b5362;
}
:global(html.theme-dark .administration-page .team-chat__avatar--message) {
  background: #352b35; color: #fff; border-color: #6b5362;
}
@media (max-width: 600px) {
  .team-chat-profile__actions { width: 100%; }
  .team-chat-profile__actions button { flex: 1 1 auto; }
  .team-chat__avatar--message { width: 26px; height: 26px; }
  .team-chat__entry { gap: 4px; }
  .team-chat__bubble, .team-chat__bubble.is-own { max-width: min(77%, 480px); }
  .team-chat__shared-image { max-width: min(100%, 235px); max-height: 245px; }
  .team-chat__composer .team-chat__attach { width: 34px; height: 34px; }
}


/* Acción destructiva visible, sin mezclarla con el campo de escritura. */
.team-chat__head-actions {
  display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
}
.team-chat__clear-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 36px; padding: 8px 12px;
  border: 1px solid var(--chat-line); border-radius: 10px;
  background: transparent; color: var(--chat-accent);
  font: inherit; font-size: 12px; font-weight: 750; cursor: pointer;
}
.team-chat__clear-button:hover:not(:disabled) {
  border-color: var(--chat-accent);
  background: color-mix(in srgb, var(--chat-accent) 9%, var(--chat-bg));
}
.team-chat__clear-button:disabled { cursor: not-allowed; opacity: .45; }
.team-chat__clear-button:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
.team-chat__notice {
  margin: 12px 0 0; padding: 10px 13px;
  border: 1px solid var(--chat-line); border-radius: 10px;
  background: var(--chat-soft); color: var(--chat-muted);
  font-size: 12px; line-height: 1.45;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__clear-button) {
  background: transparent !important; color: #ff879c !important;
  border-color: #62525e !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__clear-button:hover:not(:disabled)) {
  background: #39232d !important; border-color: #ff879c !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__notice) {
  background: #18151b !important; border-color: #514450 !important;
  color: #ddd0d9 !important;
}
@media (max-width: 600px) {
  .team-chat__head-actions { width: 100%; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; }
  .team-chat__clear-button { min-height: 39px; }
}

/* Photo/sticker media stay in the chat, never in a new browser tab. */
.team-chat__image-link { padding: 0; cursor: zoom-in; color: inherit; }
.team-chat__image-link.is-sticker {
  border: 0; background: transparent; border-radius: 0;
  max-width: 180px;
}
.team-chat__shared-image.is-sticker {
  max-width: min(100%, 174px); max-height: 174px;
  object-fit: contain; background: transparent;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.16));
}
.team-chat__bubble.is-sticker {
  background: transparent; border-color: transparent;
  box-shadow: none; padding: 6px 8px;
  color: var(--chat-text);
}
.team-chat__bubble.is-sticker .team-chat__quoted { background: var(--chat-soft); }
:global(html.theme-dark .administration-page .team-chat .team-chat__bubble.is-sticker) {
  background: transparent !important; border-color: transparent !important;
  color: #fff !important;
}
.team-chat__once-button {
  display: flex; align-items: center; gap: 12px;
  margin-top: 8px; min-height: 72px; width: min(270px, 100%);
  border: 1px dashed currentColor; border-radius: 13px;
  background: var(--chat-soft); color: var(--chat-text);
  padding: 12px 16px; font: inherit; font-size: 13px; font-weight: 700;
  text-align: left; cursor: pointer;
}
.team-chat__once-button span:first-child { font-size: 25px; }
.team-chat__once-button:disabled { opacity: .65; cursor: default; }
.team-chat__bubble.is-own .team-chat__once-button {
  background: rgba(255,255,255,.11); color: #fff;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__once-button) {
  background: #261d26 !important; color: #fff !important;
}
.team-chat__lightbox {
  position: fixed; inset: 0; z-index: 9999;
  display: grid; place-items: center; padding: 15px;
  background: rgba(4, 9, 23, .89);
}
.team-chat__lightbox-panel {
  display: flex; flex-direction: column; gap: 12px;
  max-width: min(100%, 950px); max-height: 95dvh; min-width: 0;
  padding: 12px; border: 1px solid #475266; border-radius: 18px;
  background: #141b29; color: #fff;
}
.team-chat__lightbox-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; padding: 2px 6px; font-size: 14px;
}
.team-chat__lightbox-head button {
  border: 1px solid #526073; border-radius: 9px; padding: 7px 12px;
  background: #303b4d; color: #fff; font: inherit; cursor: pointer;
}
.team-chat__lightbox-panel img {
  display: block; max-width: 100%; max-height: calc(95dvh - 120px);
  width: auto; height: auto; margin: 0 auto; object-fit: contain;
}
.team-chat__lightbox-panel p { margin: 0 6px 3px; color: #d5d9e4; font-size: 12px; }
.team-chat__actions { position: relative; flex: 0 0 auto; display: flex; align-items: center; gap: 3px; }
.team-chat__reaction-picker {
  position: absolute; z-index: 10; bottom: calc(100% + 6px);
  left: 0; display: flex; flex-wrap: wrap; width: max-content;
  max-width: min(260px, 70vw); gap: 3px; padding: 7px;
  border: 1px solid var(--chat-line); border-radius: 15px;
  background: var(--chat-bg); box-shadow: 0 9px 24px rgba(0,0,0,.2);
}
.team-chat__reaction-picker button {
  border: none; border-radius: 9px; width: 32px; height: 34px;
  background: transparent; font-size: 20px; cursor: pointer;
}
.team-chat__reaction-picker button:hover, .team-chat__reaction-picker button:focus-visible {
  background: var(--chat-soft); outline: 1px solid var(--chat-accent);
}
.team-chat__reactions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.team-chat__reactions button {
  border: 1px solid var(--chat-line); border-radius: 99px; padding: 3px 8px;
  font: inherit; font-size: 12px; cursor: pointer;
  color: var(--chat-text); background: var(--chat-soft);
}
.team-chat__reactions button.is-mine { border-color: var(--chat-accent); }
.team-chat__reactions button:disabled { cursor: default; }
.team-chat__reactions span { margin-left: 3px; font-size: 11px; }
.team-chat__bubble.is-own .team-chat__reactions button {
  background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.4); color: #fff;
}
.team-chat__media-preview .team-chat__once-toggle {
  width: auto; height: auto; padding: 8px 10px;
  font-size: 11px; font-weight: 750;
}
.team-chat__media-preview .team-chat__once-toggle[aria-pressed="true"] {
  background: var(--chat-accent); color: #fff;
}
.team-chat__composer .team-chat__sticker-attach { font-size: 25px; font-weight: 800; }
:global(html.theme-dark .administration-page .team-chat .team-chat__reaction-picker) {
  background: #211b20 !important; border-color: #565057 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__reaction-picker button),
:global(html.theme-dark .administration-page .team-chat .team-chat__reactions button) {
  color: #fff !important; background: #352b35 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__media-preview .team-chat__once-toggle[aria-pressed="true"]) {
  background: #c51b3c !important; color: #fff !important;
}
@media (hover: none), (pointer: coarse) {
  .team-chat__actions .team-chat__reply-action { opacity: 1; transform: none; }
}
@media (max-width: 600px) {
  .team-chat__actions { gap: 0; }
  .team-chat__actions .team-chat__reply-action { width: 26px; height: 28px; font-size: 17px; }
  .team-chat__media-preview { flex-wrap: wrap; }
  .team-chat__lightbox-panel img { max-height: calc(90dvh - 125px); }
}


/* Unified control icons: real line icons, never platform-dependent emoji glyphs. */
.team-chat__actions .team-chat__reply-action,
.team-chat__composer .team-chat__attach {
  display: inline-grid; place-items: center; line-height: 0;
}
.team-chat__actions .team-chat__reply-action svg,
.team-chat__composer .team-chat__attach svg {
  display: block; margin: auto; flex-shrink: 0;
}
.team-chat__once-button svg { flex-shrink: 0; }
.team-chat__media-preview .team-chat__once-toggle {
  display: inline-flex; justify-content: center; align-items: center; gap: 5px;
}

/* The emoji selector lives above the composer, inside the chat panel.
   This avoids clipping under the message scroller on mobile. */
.team-chat__emoji-tray, .team-chat__sticker-tray {
  border: 1px solid var(--chat-line); border-radius: 14px;
  background: var(--chat-bg); color: var(--chat-text);
  padding: 11px; margin: 0 0 10px; box-shadow: 0 6px 20px rgba(0,0,0,.08);
}
.team-chat__tray-head {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 9px; font-size: 13px;
}
.team-chat__tray-head button {
  display: grid; place-items: center; width: 31px; height: 31px;
  border: 1px solid var(--chat-line); border-radius: 9px;
  background: var(--chat-soft); color: var(--chat-text); cursor: pointer;
}
.team-chat__emoji-grid {
  display: grid; grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 4px; max-height: 190px; overflow-y: auto; overscroll-behavior: contain;
  padding: 5px; scrollbar-width: thin;
}
.team-chat__emoji-grid button {
  aspect-ratio: 1; display: grid; place-items: center;
  min-width: 0; padding: 0; border: 1px solid transparent;
  border-radius: 8px; background: transparent; cursor: pointer;
}
.team-chat__emoji-grid button span {
  display: grid; place-items: center; width: 100%; height: 100%;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  font-size: clamp(18px, 2vw, 25px); line-height: 1; text-align: center;
}
.team-chat__emoji-grid button:hover, .team-chat__emoji-grid button:focus-visible {
  background: var(--chat-soft); border-color: var(--chat-accent); outline: none;
}
.team-chat__sticker-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 8px; max-height: 232px; overflow-y: auto; overscroll-behavior: contain;
  padding: 4px;
}
.team-chat__new-sticker {
  min-height: 86px; border: 1px dashed var(--chat-accent); border-radius: 11px;
  background: var(--chat-soft); color: var(--chat-accent);
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 6px; font: inherit; font-size: 11px; cursor: pointer;
}
.team-chat__new-sticker:disabled { opacity: .5; cursor: not-allowed; }
.team-chat__saved-sticker { position: relative; min-width: 0; }
.team-chat__saved-sticker > button:first-child {
  display: grid; place-items: center; width: 100%; height: 86px;
  border: 1px solid var(--chat-line); border-radius: 11px;
  background: var(--chat-soft); cursor: pointer;
}
.team-chat__saved-sticker img {
  display: block; max-width: 93%; max-height: 75px;
  width: auto; height: auto; object-fit: contain;
}
.team-chat__saved-sticker > .team-chat__remove-sticker {
  position: absolute; right: 0; top: 0; width: 22px; height: 22px;
  display: grid; place-items: center; border: 1px solid var(--chat-line);
  border-radius: 0 10px 0 8px; background: var(--chat-bg);
  color: var(--chat-accent); cursor: pointer;
}
.team-chat__sticker-tray p, .team-chat__sticker-tray small {
  display: block; margin: 9px 3px 0; font-size: 11px;
  color: var(--chat-muted);
}
.team-chat__sticker-tray p[role="alert"] { color: var(--chat-accent); }
.team-chat__audio-player {
  width: min(290px, 100%); max-width: 100%; height: 41px;
  display: block; margin-top: 8px;
}
.team-chat__audio-preview {
  display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--chat-line); border-radius: 12px;
  background: var(--chat-soft); padding: 10px; margin: 0 0 9px;
  color: var(--chat-accent);
}
.team-chat__audio-preview audio { flex: 1; min-width: 0; height: 38px; }
.team-chat__audio-preview > button {
  display: grid; place-items: center; flex: 0 0 auto;
  border: 1px solid var(--chat-line); border-radius: 8px;
  background: transparent; color: var(--chat-text); height: 34px; width: 34px;
  cursor: pointer;
}
.team-chat__recording {
  display: flex; align-items: center; gap: 9px;
  margin: 0 0 9px; color: var(--chat-accent); font-size: 12px;
}
.team-chat__recording-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: #e31c42; box-shadow: 0 0 0 4px rgba(227,28,66,.12);
}
.team-chat__recording button {
  margin-left: auto; border: 1px solid var(--chat-line); border-radius: 9px;
  color: var(--chat-text); background: transparent; padding: 7px 10px;
  font: inherit; cursor: pointer;
}
.team-chat__camera-panel {
  box-sizing: border-box; margin: 14px 0 32px; padding: 16px 18px;
  border-radius: 18px; border: 1px solid var(--manager-line, #ded9dc);
  background: var(--manager-card, #fff); color: var(--manager-ink, #20242b);
}
.team-chat__camera-header {
  display: flex; flex-wrap: wrap; gap: 12px;
  align-items: center; justify-content: space-between;
}
.team-chat__camera-header strong {
  display: flex; align-items: center; gap: 9px;
  font-size: 15px; color: inherit;
}
.team-chat__camera-header p, .team-chat__camera-empty,
.team-chat__camera-panel > small {
  margin: 6px 0; color: var(--manager-muted, #687080); font-size: 12px; line-height: 1.5;
}
.team-chat__camera-header button {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 37px; border: 1px solid var(--manager-accent, #b20c2a);
  border-radius: 10px; background: var(--manager-accent, #b20c2a);
  color: #fff; padding: 8px 13px; font: inherit; font-size: 12px;
  font-weight: 750; cursor: pointer;
}
.team-chat__camera-header button:disabled { opacity: .5; cursor: not-allowed; }
.team-chat__camera-grid {
  display: flex; flex-wrap: wrap; gap: 10px; margin: 15px 0 8px;
}
.team-chat__camera-error { color: #e02045; font-size: 12px; }
:global(html.theme-dark .administration-page .team-chat__camera-panel) {
  background: #211b20; color: #fff; border-color: #565057;
}
:global(html.theme-dark .administration-page .team-chat__camera-panel p),
:global(html.theme-dark .administration-page .team-chat__camera-panel small) { color: #d2ced5; }
:global(html.theme-dark .administration-page .team-chat__camera-header button) {
  background: #c51b3c !important; color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__emoji-tray),
:global(html.theme-dark .administration-page .team-chat .team-chat__sticker-tray),
:global(html.theme-dark .administration-page .team-chat .team-chat__audio-preview) {
  background: #211b20 !important; color: #fff !important; border-color: #565057 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__emoji-grid button:hover),
:global(html.theme-dark .administration-page .team-chat .team-chat__saved-sticker > button:first-child) {
  background: #352b35 !important;
}
@media (max-width: 600px) {
  .team-chat__emoji-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); }
  .team-chat__camera-panel { padding: 12px; }
  .team-chat__camera-header button { width: 100%; }
  .team-chat__camera-grid > * { flex-basis: 45%; min-width: 130px; }
  .team-chat__composer { gap: 5px; }
  .team-chat__composer .team-chat__attach { width: 31px; height: 35px; }
}


/* Reaction counters reveal a server-authenticated list without adding/removing emojis. */
.team-chat__reaction-pill {
  display: inline-flex; align-items: center; border-radius: 99px;
  border: 1px solid var(--chat-line); background: var(--chat-soft);
  overflow: hidden;
}
.team-chat__reaction-pill.is-mine { border-color: var(--chat-accent); }
.team-chat__reactions .team-chat__reaction-pill > button {
  margin: 0; border: 0; border-radius: 0; padding: 4px 7px;
  background: transparent; color: var(--chat-text); cursor: pointer;
  font: inherit; font-size: 12px; line-height: 1.3;
}
.team-chat__reactions .team-chat__reaction-pill > button:disabled {
  opacity: .6; cursor: not-allowed;
}
.team-chat__reactions .team-chat__reaction-count {
  min-width: 29px; border-left: 1px solid var(--chat-line) !important;
  font-size: 11px !important; font-weight: 700 !important;
}
.team-chat__reactions .team-chat__reaction-count:hover,
.team-chat__reactions .team-chat__reaction-count[aria-expanded="true"] {
  background: color-mix(in srgb, var(--chat-accent) 13%, transparent);
}
.team-chat__reactors {
  flex: 1 1 100%; display: flex; align-items: flex-start;
  flex-wrap: wrap; gap: 5px 7px; padding: 7px 2px 2px;
  font-size: 11px; line-height: 1.4;
}
.team-chat__reactors strong { flex-basis: 100%; font-size: 11px; }
.team-chat__reactors span {
  display: inline-block; padding: 3px 7px; border-radius: 7px;
  background: var(--chat-quoted); color: inherit;
}
.team-chat__bubble.is-own .team-chat__reaction-pill {
  background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.4);
}
.team-chat__bubble.is-own .team-chat__reactions .team-chat__reaction-pill > button {
  background: transparent; color: #fff;
}
.team-chat__bubble.is-own .team-chat__reactions .team-chat__reaction-count {
  border-left-color: rgba(255,255,255,.35) !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__reaction-pill) {
  background: #352b35 !important; border-color: #615465 !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__reaction-pill > button) {
  background: transparent !important; color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__reactors span) {
  background: #3d303f !important; color: #fff !important;
}


/* Per-account block controls: compact, reversible, readable in both themes. */
.team-chat__blocked-list-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 35px; padding: 8px 12px; border: 1px solid var(--chat-line);
  border-radius: 10px; background: transparent; color: var(--chat-text);
  font: inherit; font-weight: 700; font-size: 12px; cursor: pointer;
}
.team-chat__blocked-list-button:hover,
.team-chat__blocked-list-button[aria-expanded="true"] {
  border-color: var(--chat-accent); color: var(--chat-accent);
}
.team-chat__blocked-panel {
  margin: 12px 0 10px; padding: 13px; border: 1px solid var(--chat-line);
  border-radius: 13px; background: var(--chat-soft); color: var(--chat-text);
}
.team-chat__blocked-panel-head {
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px; margin-bottom: 8px; font-size: 13px;
}
.team-chat__blocked-panel-head button {
  display: grid; place-items: center; width: 30px; height: 30px;
  border: 1px solid var(--chat-line); border-radius: 8px;
  background: transparent; color: inherit; cursor: pointer;
}
.team-chat__blocked-person {
  display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center;
  gap: 9px; padding: 9px 0; border-bottom: 1px solid var(--chat-line);
}
.team-chat__blocked-person span { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; }
.team-chat__blocked-person button,
.team-chat__person-menu button {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--chat-accent); border-radius: 8px;
  padding: 8px 12px; color: #fff; background: var(--chat-accent);
  font: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
}
.team-chat__blocked-person button:disabled,
.team-chat__person-menu button:disabled { opacity: .5; cursor: not-allowed; }
.team-chat__blocked-panel p,
.team-chat__blocked-panel small { color: var(--chat-muted); font-size: 12px; }
.team-chat__person-trigger {
  border: 0; background: transparent; color: inherit;
  padding: 3px 0; text-align: left; font: inherit;
  font-size: 11.5px; font-weight: 800; cursor: pointer;
}
.team-chat__person-trigger:hover,
.team-chat__person-trigger[aria-expanded="true"] { text-decoration: underline; }
.team-chat__person-menu {
  display: flex; flex-direction: column; align-items: flex-start; gap: 8px;
  margin: 8px 0 3px; padding: 10px; border: 1px solid var(--chat-line);
  border-radius: 10px; background: var(--chat-soft); color: var(--chat-text);
}
.team-chat__person-menu strong { font-size: 12px; }
.team-chat__person-menu small { color: var(--chat-muted); font-size: 11px; line-height: 1.4; }
.team-chat__bubble.is-own .team-chat__person-menu { background: rgba(255,255,255,.14); color: #fff; }
.team-chat__system-message {
  align-self: center; width: fit-content; max-width: min(93%, 500px);
  display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
  gap: 8px; margin: 8px auto; padding: 9px 12px;
  border: 1px solid var(--chat-line); border-radius: 99px;
  background: var(--chat-bg); color: var(--chat-muted);
  font-size: 12px; line-height: 1.4; text-align: center; overflow-wrap: anywhere;
}
.team-chat__system-message svg { flex-shrink: 0; color: var(--chat-accent); }
.team-chat__system-message time { font-size: 10px; opacity: .75; white-space: nowrap; }
:global(html.theme-dark .administration-page .team-chat .team-chat__blocked-panel),
:global(html.theme-dark .administration-page .team-chat .team-chat__person-menu) {
  background: #211b20 !important; border-color: #565057 !important;
  color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__blocked-list-button),
:global(html.theme-dark .administration-page .team-chat .team-chat__blocked-panel-head button) {
  background: transparent !important; border-color: #62525e !important;
  color: #fff !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__blocked-person button),
:global(html.theme-dark .administration-page .team-chat .team-chat__person-menu button) {
  background: #c51b3c !important; color: #fff !important; border-color: #c51b3c !important;
}
:global(html.theme-dark .administration-page .team-chat .team-chat__system-message) {
  background: #29212b !important; color: #ece4ed !important;
  border-color: #514450 !important;
}
@media (max-width: 600px) {
  .team-chat__blocked-panel { padding: 11px; }
  .team-chat__system-message { border-radius: 12px; }
  .team-chat__blocked-list-button { flex: 1 1 auto; }
}

</style>
