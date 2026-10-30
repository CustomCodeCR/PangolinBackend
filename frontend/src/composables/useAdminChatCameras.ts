import { computed, ref } from 'vue'
import * as signalR from '@microsoft/signalr'

interface CameraParticipant { connectionId: string; userId: string; name: string }
interface CameraSignal {
  ownerId: string
  peerId: string
  senderId: string
  kind: 'offer' | 'answer' | 'ice'
  payload: string
}

// Every sender opens a separate, one-way WebRTC video connection to each viewer.
// The SignalR hub relays SDP/ICE only, never camera pixels or microphone audio.
// Best suited to a small team on the same LAN; no third-party TURN server is used.
export function useAdminChatCameras() {
  const localStream = ref<MediaStream | null>(null)
  const remoteStreams = ref<Record<string, MediaStream>>({})
  const cameraPeople = ref<CameraParticipant[]>([])
  const cameraBusy = ref(false)
  const cameraError = ref('')
  const supported = typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined'
  const outbound = new Map<string, RTCPeerConnection>()
  const incoming = new Map<string, RTCPeerConnection>()
  const pendingIce = new Map<string, RTCIceCandidateInit[]>()
  let hub: signalR.HubConnection | null = null

  const tiles = computed(() => cameraPeople.value.map(person => ({
    ...person, stream: remoteStreams.value[person.connectionId] ?? null
  })))

  async function signal(ownerId: string, peerId: string, kind: CameraSignal['kind'], payload: string) {
    if (!hub || hub.state !== signalR.HubConnectionState.Connected) return
    try { await hub.invoke('SendCameraSignal', ownerId, peerId, kind, payload) }
    catch { /* Peer may have disconnected. */ }
  }

  function initPeer(ownerId: string, peerId: string, isSender: boolean) {
    const pc = new RTCPeerConnection({ iceServers: [] })
    const queueKey = (isSender ? 'send:' + peerId : 'receive:' + ownerId)
    pc.onicecandidate = event => {
      if (event.candidate) void signal(ownerId, peerId, 'ice', JSON.stringify(event.candidate.toJSON()))
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== 'failed' && pc.connectionState !== 'closed') return
      if (isSender) outbound.delete(peerId)
      else {
        incoming.delete(ownerId)
        const next = { ...remoteStreams.value }
        delete next[ownerId]
        remoteStreams.value = next
      }
    }
    if (isSender && localStream.value) {
      localStream.value.getTracks().forEach(track => pc.addTrack(track, localStream.value!))
    } else {
      pc.ontrack = event => {
        const stream = event.streams[0] ?? new MediaStream([event.track])
        remoteStreams.value = { ...remoteStreams.value, [ownerId]: stream }
      }
    }
    if (!pendingIce.has(queueKey)) pendingIce.set(queueKey, [])
    return pc
  }

  async function flushIce(pc: RTCPeerConnection, key: string) {
    for (const candidate of pendingIce.get(key) ?? []) {
      try { await pc.addIceCandidate(candidate) } catch { /* Stale candidate. */ }
    }
    pendingIce.delete(key)
  }

  async function offerTo(peerId: string) {
    const ownerId = hub?.connectionId
    if (!ownerId || !localStream.value || peerId === ownerId || outbound.has(peerId)) return
    const pc = initPeer(ownerId, peerId, true)
    outbound.set(peerId, pc)
    try {
      await pc.setLocalDescription(await pc.createOffer())
      if (pc.localDescription) await signal(ownerId, peerId, 'offer', JSON.stringify(pc.localDescription))
    } catch {
      pc.close()
      outbound.delete(peerId)
    }
  }

  async function handleSignal(data: CameraSignal) {
    const self = hub?.connectionId
    if (!self || !data?.ownerId || !data.peerId || !data.payload) return
    if (data.ownerId === self && data.peerId !== self) {
      const pc = outbound.get(data.peerId)
      if (!pc) return
      const key = 'send:' + data.peerId
      if (data.kind === 'answer') {
        try {
          await pc.setRemoteDescription(JSON.parse(data.payload) as RTCSessionDescriptionInit)
          await flushIce(pc, key)
        } catch { /* Remote tab left or an invalid SDP was received. */ }
      } else if (data.kind === 'ice') {
        try {
          const ice = JSON.parse(data.payload) as RTCIceCandidateInit
          if (pc.remoteDescription) await pc.addIceCandidate(ice)
          else pendingIce.set(key, [...(pendingIce.get(key) ?? []), ice].slice(-35))
        } catch { /* Ignore invalid ICE data. */ }
      }
      return
    }
    if (data.peerId !== self || data.ownerId === self) return
    if (data.kind === 'offer') {
      incoming.get(data.ownerId)?.close()
      const pc = initPeer(data.ownerId, self, false)
      incoming.set(data.ownerId, pc)
      try {
        await pc.setRemoteDescription(JSON.parse(data.payload) as RTCSessionDescriptionInit)
        await flushIce(pc, 'receive:' + data.ownerId)
        await pc.setLocalDescription(await pc.createAnswer())
        if (pc.localDescription) await signal(data.ownerId, self, 'answer', JSON.stringify(pc.localDescription))
      } catch {
        pc.close()
        incoming.delete(data.ownerId)
      }
    } else if (data.kind === 'ice') {
      const pc = incoming.get(data.ownerId)
      const key = 'receive:' + data.ownerId
      try {
        const ice = JSON.parse(data.payload) as RTCIceCandidateInit
        if (pc?.remoteDescription) await pc.addIceCandidate(ice)
        else pendingIce.set(key, [...(pendingIce.get(key) ?? []), ice].slice(-35))
      } catch { /* Ignore invalid ICE data. */ }
    }
  }

  function forgetViewer(id: string) {
    outbound.get(id)?.close()
    outbound.delete(id)
    incoming.get(id)?.close()
    incoming.delete(id)
    pendingIce.delete('send:' + id)
    pendingIce.delete('receive:' + id)
    const next = { ...remoteStreams.value }
    delete next[id]
    remoteStreams.value = next
    cameraPeople.value = cameraPeople.value.filter(person => person.connectionId !== id)
  }

  function bindHub(connection: signalR.HubConnection) {
    hub = connection
    connection.on('CameraSnapshot', (people: CameraParticipant[]) => {
      cameraPeople.value = (people ?? []).filter(p => p.connectionId !== connection.connectionId)
    })
    connection.on('CameraStarted', (person: CameraParticipant) => {
      cameraPeople.value = [...cameraPeople.value.filter(p => p.connectionId !== person.connectionId), person]
    })
    connection.on('CameraStopped', (id: string) => forgetViewer(id))
    connection.on('CameraViewerJoined', (id: string) => { void offerTo(id) })
    connection.on('CameraViewerLeft', (id: string) => forgetViewer(id))
    connection.on('CameraSignal', (data: CameraSignal) => { void handleSignal(data) })
  }

  async function startCamera() {
    if (cameraBusy.value || localStream.value || !hub) return
    cameraError.value = ''
    if (!supported) {
      cameraError.value = 'Las cámaras requieren HTTPS o localhost, además de un navegador compatible.'
      return
    }
    if (hub.state !== signalR.HubConnectionState.Connected) {
      cameraError.value = 'El chat debe estar conectado para activar tu cámara.'
      return
    }
    cameraBusy.value = true
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 12, max: 15 } },
        audio: false
      })
      localStream.value = stream
      const viewers = await hub.invoke<string[]>('StartCamera')
      for (const peerId of viewers ?? []) void offerTo(peerId)
    } catch {
      stream?.getTracks().forEach(track => track.stop())
      localStream.value = null
      cameraError.value = 'No se pudo activar la cámara. Revisá permisos, conexión HTTPS y que no esté ocupada.'
    } finally { cameraBusy.value = false }
  }

  async function stopCamera(notify = true) {
    if (notify && hub?.state === signalR.HubConnectionState.Connected && localStream.value) {
      try { await hub.invoke('StopCamera') } catch { /* Server disconnect cleans presence. */ }
    }
    for (const pc of outbound.values()) pc.close()
    outbound.clear()
    localStream.value?.getTracks().forEach(track => track.stop())
    localStream.value = null
  }

  async function cleanup(notify = true) {
    await stopCamera(notify)
    for (const pc of incoming.values()) pc.close()
    incoming.clear()
    pendingIce.clear()
    remoteStreams.value = {}
    cameraPeople.value = []
  }

  return {
    localStream, tiles, cameraPeople, cameraBusy, cameraError, supported,
    bindHub, startCamera, stopCamera, cleanup
  }
}
