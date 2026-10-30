<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'

const props = defineProps<{ stream: MediaStream | null; name: string; self?: boolean }>()
const video = ref<HTMLVideoElement | null>(null)

watch([video, () => props.stream], ([element, stream]) => {
  if (!element) return
  element.srcObject = stream
  if (stream) void element.play().catch(() => {})
}, { immediate: true })

onUnmounted(() => { if (video.value) video.value.srcObject = null })
</script>

<template>
  <div class="chat-camera-tile">
    <video v-show="stream" ref="video" autoplay playsinline muted
      :aria-label="self ? 'Vista previa de tu cámara' : 'Cámara de ' + name" />
    <div v-if="!stream" class="chat-camera-tile__loading">Conectando video…</div>
    <span class="chat-camera-tile__name">{{ name }}{{ self ? ' · vos' : '' }}</span>
  </div>
</template>

<style scoped>
.chat-camera-tile {
  position: relative; width: min(100%, 265px); aspect-ratio: 4 / 3;
  border-radius: 12px; overflow: hidden; background: #101828; color: #fff;
  border: 1px solid rgba(255,255,255,.2); flex: 1 1 165px;
}
.chat-camera-tile video { width: 100%; height: 100%; object-fit: cover; background: #101828; }
.chat-camera-tile__loading { height: 100%; display: grid; place-items: center; color: #dae0ea; font-size: 12px; }
.chat-camera-tile__name {
  position: absolute; left: 8px; bottom: 8px; max-width: calc(100% - 16px);
  border-radius: 7px; padding: 5px 8px; background: rgba(0,0,0,.7);
  font-size: 11px; font-weight: 700; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
