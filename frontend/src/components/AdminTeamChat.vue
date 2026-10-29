<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import * as signalR from '@microsoft/signalr'
import { authState } from '../services/auth'

interface ChatMessage { id: string; userId: string; name: string; email: string; text: string; sentAt: string }
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const status = ref('Conectando…')
const online = ref(0)
const sending = ref(false)
const error = ref('')
const list = ref<HTMLElement | null>(null)
let connection: signalR.HubConnection | null = null
let active = true
function scrollBottom() { void nextTick(() => { list.value?.scrollTo({ top: list.value.scrollHeight, behavior: 'smooth' }) }) }
function append(message: ChatMessage) {
  if (messages.value.some(item => item.id === message.id)) return
  messages.value = [...messages.value.slice(-59), message]
  scrollBottom()
}
function clock(iso: string) { return new Date(iso).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' }) }
async function send() {
  const text = draft.value.trim()
  if (!text || text.length > 500 || sending.value || connection?.state !== signalR.HubConnectionState.Connected) return
  sending.value = true
  error.value = ''
  try { await connection.invoke('SendMessage', text); draft.value = '' }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo enviar el mensaje.' }
  finally { sending.value = false }
}
onMounted(async () => {
  if (authState.user?.role !== 'administrador' || authState.previewRole) { status.value = 'Requiere una sesión administradora real.'; return }
  const hub = new signalR.HubConnectionBuilder()
    .withUrl('/api/hubs/admin-chat', { withCredentials: true })
    .withAutomaticReconnect([0, 1000, 3000, 8000, 15000])
    .configureLogging(signalR.LogLevel.Error)
    .build()
  connection = hub
  hub.on('History', (history: ChatMessage[]) => { if (!active) return; messages.value = history.slice(-60); scrollBottom() })
  hub.on('Message', (message: ChatMessage) => { if (active) append(message) })
  hub.on('Presence', (count: number) => { if (active) online.value = count })
  hub.onreconnecting(() => { status.value = 'Reconectando…' })
  hub.onreconnected(() => { status.value = 'En línea' })
  hub.onclose(() => { status.value = 'Desconectado' })
  try { await hub.start(); if (!active) { await hub.stop(); return }; status.value = 'En línea' }
  catch { status.value = 'No se pudo conectar. Revisá que el backend esté activo.' }
})
onUnmounted(() => { active = false; if (connection) void connection.stop() })
</script>

<template>
  <section class="team-chat" aria-label="Chat entre administradores">
    <header class="team-chat__head">
      <div><p class="team-chat__tag">CANAL PRIVADO · EXPERIMENTAL</p><h2>Chat del equipo <span>✦</span></h2><p>Mensajería en vivo entre cuentas administradoras. Sin historial permanente.</p></div>
      <div class="team-chat__presence"><span class="team-chat__light" />{{ status }} <small v-if="online">· {{ online }} conectado{{ online === 1 ? '' : 's' }}</small></div>
    </header>
    <div ref="list" class="team-chat__messages" role="log" aria-live="polite" aria-relevant="additions">
      <div v-if="!messages.length" class="team-chat__empty"><span>✳</span><strong>Este canal está esperando su primer mensaje.</strong><p>Probalo con otro administrador conectado desde otra computadora o navegador.</p></div>
      <article v-for="message in messages" :key="message.id" class="team-chat__bubble" :class="{ 'is-own': message.email.toLowerCase() === authState.user?.correo.toLowerCase() }">
        <div class="team-chat__by"><strong>{{ message.name || message.email }}</strong><time :datetime="message.sentAt">{{ clock(message.sentAt) }}</time></div>
        <p>{{ message.text }}</p>
      </article>
    </div>
    <form class="team-chat__composer" @submit.prevent="send">
      <label class="sr-only" for="team-chat-input">Escribir mensaje</label>
      <input id="team-chat-input" v-model="draft" maxlength="500" autocomplete="off" placeholder="Escribí un mensaje al equipo…" :disabled="status !== 'En línea'" />
      <button type="submit" :disabled="status !== 'En línea' || !draft.trim() || sending">{{ sending ? 'Enviando…' : 'Enviar ↗' }}</button>
    </form>
    <p v-if="error" class="team-chat__error" role="alert">{{ error }}</p>
    <p class="team-chat__foot">Solo administradores autenticados. Los mensajes se borran al reiniciar el backend.</p>
  </section>
</template>

<style scoped>
.team-chat{max-width:1040px;margin:24px auto 64px;padding:28px;border:1px solid rgba(135,150,183,.23);border-radius:24px;background:#101b2e;color:#f5f7ff;box-shadow:0 24px 70px #09102329}
.team-chat__head{display:flex;justify-content:space-between;align-items:start;gap:18px;flex-wrap:wrap;padding-bottom:22px;border-bottom:1px solid #ffffff19}
.team-chat__tag{color:#ff8f9c;letter-spacing:.18em;font-size:11px;font-weight:800}
.team-chat__head h2{margin:8px 0;font-size:clamp(24px,3vw,36px);letter-spacing:-.03em}.team-chat__head h2 span{color:#ef5369}
.team-chat__head p:not(.team-chat__tag){color:#bac4d8;margin:0;font-size:14px}
.team-chat__presence{border:1px solid #ffffff24;border-radius:50px;padding:10px 15px;font-size:12px;color:#d6deef}
.team-chat__presence small{font-size:12px}.team-chat__light{display:inline-block;width:8px;height:8px;border-radius:50%;background:#52dc9a;margin-right:8px;box-shadow:0 0 12px #52dc9a}
.team-chat__messages{height:min(54vh,480px);min-height:290px;overflow:auto;display:flex;flex-direction:column;gap:14px;padding:24px 3px}
.team-chat__bubble{align-self:flex-start;max-width:min(80%,550px);padding:13px 17px;background:#253650;border:1px solid #ffffff17;border-radius:16px 16px 16px 5px;overflow-wrap:anywhere}
.team-chat__bubble.is-own{align-self:flex-end;background:#75283e;border-radius:16px 16px 5px 16px}
.team-chat__by{display:flex;gap:20px;align-items:center;justify-content:space-between;font-size:12px;color:#f9dce2}.team-chat__by time{color:#b9c5d7;white-space:nowrap}
.team-chat__bubble p{margin:9px 0 0;white-space:pre-wrap;line-height:1.5;font-size:14px}
.team-chat__empty{margin:auto;text-align:center;color:#aebbd0}.team-chat__empty span{display:block;font-size:40px;color:#ea6479}.team-chat__empty strong{display:block;color:#f1f3fb;margin:15px 0 8px}
.team-chat__composer{display:flex;gap:12px;background:#1a2942;padding:9px;border:1px solid #ffffff1f;border-radius:16px}
.team-chat__composer input{flex:1;min-width:0;background:transparent;color:white;border:0;outline:none;padding:12px;font:inherit}
.team-chat__composer button{background:#dc3c5d;border:0;border-radius:10px;color:white;padding:12px 22px;font:inherit;font-weight:700;cursor:pointer}
.team-chat__composer button:disabled{opacity:.5;cursor:not-allowed}.team-chat__error{color:#ffb3c2}.team-chat__foot{margin:14px 0 0;font-size:12px;color:#a6b7d0}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.team-chat{margin:14px;padding:16px;border-radius:18px}.team-chat__messages{height:400px}.team-chat__bubble{max-width:92%}.team-chat__composer button{padding:10px 14px}}
</style>
