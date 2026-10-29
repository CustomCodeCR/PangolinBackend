<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as signalR from '@microsoft/signalr'
import { authState } from '../services/auth'

interface ChatReply { id: string; name: string; text: string }
interface ChatMessage { id: string; userId: string; name: string; email: string; text: string; sentAt: string; replyTo?: ChatReply | null }
interface ReadReceipt { userId: string; name: string; lastReadAt: string }
interface TypingStatus { connectionId: string; userId: string; name: string; isTyping: boolean; expiresAt: string; updatedAt: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (event: 'unread-change', count: number): void }>()
const messages = ref<ChatMessage[]>([])
const receipts = ref<ReadReceipt[]>([])
const draft = ref('')
const nickname = ref('')
const nicknameInput = ref('')
const nicknameEditing = ref(false)
const nicknameSaving = ref(false)
const nicknameError = ref('')
const chatNames = ref<Record<string, string>>({})
const expandedSeenId = ref<string | null>(null)
const remoteTyping = ref<Record<string, TypingStatus>>({})
const typingClock = ref(Date.now())
let typingSweepTimer: ReturnType<typeof setInterval> | null = null
let typingIdleTimer: ReturnType<typeof setTimeout> | null = null
let typingActive = false
let typingLastSignalAt = 0
const replyTarget = ref<ChatMessage | null>(null)
const input = ref<HTMLInputElement | null>(null)
const highlightedId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
const status = ref('Conectando…')
const online = ref(0)
const sending = ref(false)
const error = ref('')
const list = ref<HTMLElement | null>(null)
const chatPanel = ref<HTMLElement | null>(null)
const lastReadAt = ref(0)
let connection: signalR.HubConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let active = true

const currentUserId = computed(() => String(authState.user?.id ?? '').toLowerCase())
const currentEmail = computed(() => (authState.user?.correo ?? '').toLowerCase())
const storageKey = computed(() => 'castrofallas-admin-chat-read:' + (currentUserId.value || currentEmail.value))
const nicknameStorageKey = computed(() => 'castrofallas-admin-chat-nickname:' + (currentUserId.value || currentEmail.value))
const typingNames = computed(() => {
  const names = new Map<string, string>()
  for (const state of Object.values(remoteTyping.value)) {
    const userId = state.userId.toLowerCase()
    if (!state.isTyping || userId === currentUserId.value || Date.parse(state.expiresAt) <= typingClock.value) continue
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
  return props.visible && document.visibilityState === 'visible' &&
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
const unread = computed(() => messages.value.filter(message =>
  !isOwn(message) && Date.parse(message.sentAt) > lastReadAt.value
).length)
watch(unread, value => emit('unread-change', value), { immediate: true })

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
  // Si la rueda se usa sobre el encabezado o el compositor, también desplaza
  // los mensajes y no la página que está detrás.
  const overMessages = event.target instanceof Node && element.contains(event.target)
  if (!overMessages) {
    element.scrollTop += event.deltaY
    event.preventDefault()
    return
  }
  const atTop = element.scrollTop <= 1 && event.deltaY < 0
  const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1 && event.deltaY > 0
  if (element.scrollHeight <= element.clientHeight + 1 || atTop || atBottom) event.preventDefault()
}
function canMarkRead() { return props.visible && document.visibilityState === 'visible' }
function markVisibleRead() {
  if (!canMarkRead()) return
  const newest = messages.value.at(-1)
  if (!newest) return
  persistLastRead(Date.parse(newest.sentAt))
  if (connection?.state === signalR.HubConnectionState.Connected) {
    void connection.invoke('MarkSeen', newest.id).catch(() => { /* Reintentar cuando haya conexión */ })
  }
}
function receivedMessage(message: ChatMessage) {
  if (messages.value.some(item => item.id === message.id)) return
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
async function send() {
  const text = draft.value.trim()
  if (!text || text.length > 500 || sending.value || connection?.state !== signalR.HubConnectionState.Connected) return
  sending.value = true
  error.value = ''
  stopTyping()
  const target = replyTarget.value
  try {
    if (target) await connection.invoke('ReplyToMessage', text, target.id)
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
  if (!canSendTyping()) stopTyping()
  if (canMarkRead()) { scrollBottom(); markVisibleRead() }
}
watch(() => props.visible, showing => { if (showing) onVisibility(); else stopTyping() })
onMounted(() => {
  if (authState.user?.role !== 'administrador' || authState.previewRole) {
    status.value = 'Requiere una sesión administradora real.'
    return
  }
  initializeLastRead()
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
  void nextTick(() => chatPanel.value?.addEventListener('wheel', trapChatWheel, { passive: false }))
  window.addEventListener('focus', onVisibility)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', startChat)

  const hub = new signalR.HubConnectionBuilder()
    .withUrl('/api/hubs/admin-chat', { withCredentials: true })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Error)
    .build()
  connection = hub
  hub.on('ChatProfile', (profile: { displayName: string; customName: string | null }) => {
    if (!active) return
    nickname.value = savedNickname() ?? profile.customName ?? ''
    if (currentUserId.value && profile.displayName) {
      chatNames.value = { ...chatNames.value, [currentUserId.value]: profile.displayName }
    }
  })
  hub.on('NicknameChanged', (userId: string, name: string) => {
    if (!active) return
    chatNames.value = { ...chatNames.value, [userId.toLowerCase()]: name }
  })
  hub.on('History', (history: ChatMessage[], seen: ReadReceipt[]) => {
    if (!active) return
    messages.value = history.slice(-60)
    receipts.value = seen ?? []
    if (canMarkRead()) { scrollBottom(); markVisibleRead() }
  })
  hub.on('Message', (message: ChatMessage) => { if (active) receivedMessage(message) })
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
    remoteTyping.value = {}
  })
  hub.onreconnected(() => { status.value = 'En línea'; markVisibleRead() })
  hub.onclose(() => {
    status.value = 'Desconectado'
    stopTyping()
    remoteTyping.value = {}
    scheduleRetry()
  })
  void startChat()
})
onUnmounted(() => {
  active = false
  emit('unread-change', 0)
  stopTyping()
  if (typingSweepTimer) clearInterval(typingSweepTimer)
  if (retryTimer) clearTimeout(retryTimer)
  if (highlightTimer) clearTimeout(highlightTimer)
  chatPanel.value?.removeEventListener('wheel', trapChatWheel)
  window.removeEventListener('focus', onVisibility)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('online', startChat)
  if (connection) void connection.stop()
})
</script>

<template>
  <div class="team-chat-root">
    <section class="team-chat-profile" aria-label="Nombre visible en el chat">
      <div class="team-chat-profile__copy">
        <span class="team-chat__tag">TU IDENTIDAD EN EL CHAT</span>
        <strong>{{ chatNames[currentUserId] || authState.user?.nombre || authState.user?.correo || 'Administrador' }}</strong>
        <small>Solo cambia cómo te ven aquí. Tu cuenta y permisos siguen iguales.</small>
      </div>
      <button v-if="!nicknameEditing" class="team-chat-profile__edit" type="button" @click="openNicknameEditor">
        <span aria-hidden="true">✎</span> {{ nickname ? 'Cambiar apodo' : 'Elegir apodo' }}
      </button>
      <form v-else class="team-chat-profile__form" @submit.prevent="saveNickname">
        <label class="sr-only" for="team-chat-nickname">Tu nombre para el chat</label>
        <input id="team-chat-nickname" v-model="nicknameInput" maxlength="32" autocomplete="nickname"
          placeholder="Tu nombre para el chat (2 a 32 caracteres)" :disabled="nicknameSaving" />
        <button type="submit" :disabled="nicknameSaving || status !== 'En línea'">{{ nicknameSaving ? 'Guardando…' : 'Guardar' }}</button>
        <button type="button" class="team-chat-profile__cancel" @click="nicknameEditing = false">Cancelar</button>
        <p v-if="nicknameError" class="team-chat-profile__error" role="alert">{{ nicknameError }}</p>
        <p class="team-chat-profile__hint">Dejá el campo vacío para volver al nombre de tu cuenta.</p>
      </form>
    </section>
    <section ref="chatPanel" class="team-chat" aria-label="Chat entre administradores">
    <header class="team-chat__head">
      <div>
        <p class="team-chat__tag">CANAL PRIVADO · EXPERIMENTAL</p>
        <h2>Chat del equipo</h2>
        <p>Mensajería en vivo entre administradores. El historial se borra al reiniciar el backend.</p>
      </div>
      <div class="team-chat__presence" role="status">
        <span class="team-chat__light" :class="{ 'is-offline': status !== 'En línea' }" />
        {{ status }} <small v-if="online">· {{ online }} conectado{{ online === 1 ? '' : 's' }}</small>
      </div>
    </header>
    <div ref="list" class="team-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
      <div v-if="!messages.length" class="team-chat__empty">
        <span>✳</span><strong>Este canal está esperando su primer mensaje.</strong>
        <p>Probalo con otro administrador desde otra computadora o navegador.</p>
      </div>
      <div v-for="message in messages" :key="message.id" :data-chat-id="message.id"
        class="team-chat__entry" :class="{ 'is-own': isOwn(message), 'is-highlighted': highlightedId === message.id }">
        <article class="team-chat__bubble" :class="{ 'is-own': isOwn(message) }">
          <div class="team-chat__by">
            <strong>{{ displayName(message) }}</strong>
            <span class="team-chat__meta">
              <time :datetime="message.sentAt">{{ clock(message.sentAt) }}</time>
              <button v-if="isOwn(message)" type="button" class="team-chat__seen-button"
                :aria-expanded="expandedSeenId === message.id"
                :aria-label="'Ver quién leyó este mensaje: ' + seenNames(message).length"
                title="Ver quién lo leyó" @click="toggleSeen(message.id)">✓✓</button>
            </span>
          </div>
          <button v-if="message.replyTo" class="team-chat__quoted" type="button"
            :aria-label="'Ir al mensaje original de ' + message.replyTo.name"
            @click="jumpToOriginal(message.replyTo.id)">
            <strong>↪ {{ message.replyTo.name }}</strong>
            <span>{{ message.replyTo.text }}</span>
          </button>
          <p>{{ message.text }}</p>
          <div v-if="isOwn(message) && expandedSeenId === message.id" class="team-chat__seen-popover" role="status">
            <strong>Lecturas</strong>
            <span v-if="!seenNames(message).length">Todavía nadie lo ha visto</span>
            <span v-for="name in seenNames(message)" :key="name">✓ {{ name }}</span>
          </div>
        </article>
        <button class="team-chat__reply-action" type="button"
          :title="'Responder a ' + displayName(message)"
          :aria-label="'Responder al mensaje de ' + displayName(message)"
          @click="replyToMessage(message)">↩</button>
      </div>
    </div>
    <div v-if="replyTarget" class="team-chat__reply-banner" role="status">
      <div class="team-chat__reply-banner-copy">
        <strong>↩ Respondiendo a {{ replyTarget.name || replyTarget.email }}</strong>
        <span>{{ quoteText(replyTarget.text) }}</span>
      </div>
      <button type="button" aria-label="Cancelar respuesta" title="Cancelar respuesta" @click="cancelReply">✕</button>
    </div>
    <form class="team-chat__composer" @submit.prevent="send">
      <label class="sr-only" for="team-chat-input">Escribir mensaje</label>
      <input id="team-chat-input" ref="input" v-model="draft" maxlength="500" autocomplete="off"
        placeholder="Escribí un mensaje al equipo…" :disabled="status !== 'En línea'" />
      <button type="submit" :disabled="status !== 'En línea' || !draft.trim() || sending">
        {{ sending ? 'Enviando…' : 'Enviar ↗' }}
      </button>
    </form>
    <p v-if="error" class="team-chat__error" role="alert">{{ error }}</p>
    <p class="team-chat__foot">Solo administradores autenticados · {{ messages.length }} mensajes en este historial temporal.</p>
    </section>
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

</style>
