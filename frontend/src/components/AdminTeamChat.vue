<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import * as signalR from '@microsoft/signalr'
import { authState } from '../services/auth'

interface ChatReply { id: string; name: string; text: string }
interface ChatMessage { id: string; userId: string; name: string; email: string; text: string; sentAt: string; replyTo?: ChatReply | null }
interface ReadReceipt { userId: string; name: string; lastReadAt: string }

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (event: 'unread-change', count: number): void }>()
const messages = ref<ChatMessage[]>([])
const receipts = ref<ReadReceipt[]>([])
const draft = ref('')
const replyTarget = ref<ChatMessage | null>(null)
const input = ref<HTMLInputElement | null>(null)
const highlightedId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
const status = ref('Conectando…')
const online = ref(0)
const sending = ref(false)
const error = ref('')
const list = ref<HTMLElement | null>(null)
const lastReadAt = ref(0)
let connection: signalR.HubConnection | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let active = true

const currentUserId = computed(() => String(authState.user?.id ?? '').toLowerCase())
const currentEmail = computed(() => (authState.user?.correo ?? '').toLowerCase())
const storageKey = computed(() => 'castrofallas-admin-chat-read:' + (currentUserId.value || currentEmail.value))

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
function seenBy(message: ChatMessage): string {
  const names = receipts.value
    .filter(receipt => receipt.userId.toLowerCase() !== message.userId.toLowerCase()
      && Date.parse(receipt.lastReadAt) >= Date.parse(message.sentAt))
    .map(receipt => receipt.name)
  return names.length ? 'Visto por ' + names.slice(0, 2).join(', ') + (names.length > 2 ? ' y ' + (names.length - 2) + ' más' : '') : 'Sin vistos aún'
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
    markVisibleRead()
  } catch {
    if (active) { status.value = 'Sin conexión · reintentando'; scheduleRetry() }
  }
}
function onVisibility() {
  if (canMarkRead()) { scrollBottom(); markVisibleRead() }
}
watch(() => props.visible, showing => { if (showing) onVisibility() })
onMounted(() => {
  if (authState.user?.role !== 'administrador' || authState.previewRole) {
    status.value = 'Requiere una sesión administradora real.'
    return
  }
  initializeLastRead()
  window.addEventListener('focus', onVisibility)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', startChat)

  const hub = new signalR.HubConnectionBuilder()
    .withUrl('/api/hubs/admin-chat', { withCredentials: true })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Error)
    .build()
  connection = hub
  hub.on('History', (history: ChatMessage[], seen: ReadReceipt[]) => {
    if (!active) return
    messages.value = history.slice(-60)
    receipts.value = seen ?? []
    if (canMarkRead()) { scrollBottom(); markVisibleRead() }
  })
  hub.on('Message', (message: ChatMessage) => { if (active) receivedMessage(message) })
  hub.on('Seen', (receipt: ReadReceipt) => { if (active) receivedReceipt(receipt) })
  hub.on('Presence', (count: number) => { if (active) online.value = count })
  hub.onreconnecting(() => { status.value = 'Reconectando…' })
  hub.onreconnected(() => { status.value = 'En línea'; markVisibleRead() })
  hub.onclose(() => { status.value = 'Desconectado'; scheduleRetry() })
  void startChat()
})
onUnmounted(() => {
  active = false
  emit('unread-change', 0)
  if (retryTimer) clearTimeout(retryTimer)
  if (highlightTimer) clearTimeout(highlightTimer)
  window.removeEventListener('focus', onVisibility)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('online', startChat)
  if (connection) void connection.stop()
})
</script>

<template>
  <section class="team-chat" aria-label="Chat entre administradores">
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
      <article v-for="message in messages" :key="message.id" :data-chat-id="message.id"
        class="team-chat__bubble" :class="{ 'is-own': isOwn(message), 'is-highlighted': highlightedId === message.id }">
        <div class="team-chat__by">
          <strong>{{ message.name || message.email }}</strong>
          <time :datetime="message.sentAt">{{ clock(message.sentAt) }}</time>
        </div>
        <button v-if="message.replyTo" class="team-chat__quoted" type="button"
          :aria-label="'Ir al mensaje original de ' + message.replyTo.name"
          @click="jumpToOriginal(message.replyTo.id)">
          <strong>↪ {{ message.replyTo.name }}</strong>
          <span>{{ message.replyTo.text }}</span>
        </button>
        <p>{{ message.text }}</p>
        <footer class="team-chat__bubble-footer">
          <small v-if="isOwn(message)" class="team-chat__seen">{{ seenBy(message) }}</small>
          <button class="team-chat__reply-action" type="button" :aria-label="'Responder al mensaje de ' + (message.name || message.email)"
            @click="replyToMessage(message)">↩ Responder</button>
        </footer>
      </article>
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
</style>
