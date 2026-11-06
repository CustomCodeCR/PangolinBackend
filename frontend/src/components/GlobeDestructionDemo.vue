<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * Opt-in cinematic visual gag, not part of shipment tracking.
 * Activated only by ?globeDestruction=1 on this experimental branch.
 */
const props = defineProps<{ sourceCanvas: HTMLCanvasElement | null }>()
const stage = ref<'ready' | 'incoming' | 'impact' | 'broken'>('ready')
const fragments = ref<HTMLCanvasElement[]>([])
const leftFragment = ref<HTMLCanvasElement | null>(null)
const rightFragment = ref<HTMLCanvasElement | null>(null)
const bounds = ref({ left: 0, top: 0, width: 0, height: 0 })
const timers: number[] = []
let originalOpacity = ''

function schedule(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
function clearTimers() {
  while (timers.length) window.clearTimeout(timers.pop())
}
function restoreSource() {
  if (props.sourceCanvas) props.sourceCanvas.style.opacity = originalOpacity
}
function captureAndSplit() {
  const source = props.sourceCanvas
  const container = source?.parentElement
  if (!source || !container || !leftFragment.value || !rightFragment.value) {
    stage.value = 'broken'
    return
  }
  const rect = source.getBoundingClientRect()
  const holderRect = container.getBoundingClientRect()
  bounds.value = {
    left: rect.left - holderRect.left,
    top: rect.top - holderRect.top,
    width: rect.width,
    height: rect.height
  }
  for (const target of [leftFragment.value, rightFragment.value]) {
    target.width = source.width
    target.height = source.height
    target.getContext('2d')?.drawImage(source, 0, 0)
  }
  // Snapshot both halves before hiding the continuously painted source canvas.
  originalOpacity = source.style.opacity
  source.style.opacity = '0'
  stage.value = 'impact'
  schedule(() => { stage.value = 'broken' }, 720)
}
function play() {
  clearTimers()
  restoreSource()
  stage.value = 'ready'
  // Give the normal renderer a frame before capturing its newest image.
  schedule(() => {
    stage.value = 'incoming'
    schedule(captureAndSplit, 1500)
  }, 100)
}
onMounted(() => { nextTick(play) })
onBeforeUnmount(() => { clearTimers(); restoreSource() })
</script>

<template>
  <div class="destruction" :class="'destruction--' + stage" aria-label="Animación ficticia de destrucción del globo">
    <span class="destruction__missile" aria-hidden="true">
      <svg viewBox="0 0 145 64" role="presentation">
        <path d="M12 34 L41 23 L47 12 L65 27 L107 27 Q130 32 139 34 Q130 38 107 41 L65 41 L47 56 L41 44 Z" fill="#cdd4df" stroke="#4c596b" stroke-width="3"/>
        <path d="M68 27 L93 27 L99 41 L68 41 Z" fill="#ac1735"/>
        <path d="M35 27 L10 17 L19 33 L10 49 L35 42 Z" fill="#8b93a0"/>
        <circle cx="113" cy="34" r="4" fill="#ffcc73"/>
      </svg>
      <span class="destruction__exhaust"></span>
    </span>

    <div class="destruction__fragments" :style="{
      left: bounds.left + 'px', top: bounds.top + 'px',
      width: bounds.width + 'px', height: bounds.height + 'px'
    }" aria-hidden="true">
      <canvas ref="leftFragment" class="destruction__half destruction__half--left"></canvas>
      <canvas ref="rightFragment" class="destruction__half destruction__half--right"></canvas>
    </div>
    <div class="destruction__flash" aria-hidden="true"></div>
    <div class="destruction__shockwave" aria-hidden="true"></div>
    <div class="destruction__smoke" aria-hidden="true">
      <i v-for="n in 12" :key="n" :style="{ '--n': n }"></i>
    </div>
    <div class="destruction__embers" aria-hidden="true">
      <i v-for="n in 18" :key="n" :style="{ '--n': n }"></i>
    </div>
    <button class="destruction__replay" type="button" @click.stop="play">
      ↻ Repetir destrucción
    </button>
  </div>
</template>

<style scoped>
.destruction{position:absolute;inset:0;z-index:8;pointer-events:none;overflow:hidden;isolation:isolate}
.destruction__missile{position:absolute;top:20%;left:-35%;width:145px;height:64px;opacity:0;z-index:6;filter:drop-shadow(0 0 9px #ed5c35)}
.destruction__missile svg{display:block;width:100%;height:100%}
.destruction__exhaust{position:absolute;width:120px;height:24px;right:100%;top:23px;transform-origin:right;background:linear-gradient(90deg,transparent,#f44319 45%,#ffdc76);filter:blur(6px);border-radius:100%}
.destruction--incoming .destruction__missile{opacity:1;animation:missile-flight 1.5s cubic-bezier(.15,.45,.8,.9) forwards}
@keyframes missile-flight{0%{left:-35%;top:14%;transform:scale(.6) rotate(12deg)}100%{left:calc(50% - 90px);top:calc(50% - 36px);transform:scale(.8) rotate(12deg)}}
.destruction__fragments{position:absolute;opacity:0;z-index:3;filter:drop-shadow(0 12px 18px #0008)}
.destruction__half{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}
.destruction__half--left{clip-path:polygon(0 0,50% 0,48% 17%,52% 35%,47% 52%,51% 72%,49% 100%,0 100%)}
.destruction__half--right{clip-path:polygon(50% 0,100% 0,100% 100%,49% 100%,51% 72%,47% 52%,52% 35%,48% 17%)}
.destruction--impact .destruction__fragments,.destruction--broken .destruction__fragments{opacity:1}
.destruction--impact .destruction__half--left,.destruction--broken .destruction__half--left{animation:break-left 2.2s cubic-bezier(.1,.7,.3,1) forwards}
.destruction--impact .destruction__half--right,.destruction--broken .destruction__half--right{animation:break-right 2.2s cubic-bezier(.1,.7,.3,1) forwards}
@keyframes break-left{to{transform:translate(-28%,22%) rotate(-23deg);opacity:.55}}
@keyframes break-right{to{transform:translate(29%,27%) rotate(24deg);opacity:.55}}
.destruction__flash{position:absolute;inset:0;background:radial-gradient(circle,#fffbe2 0%,#ffc360 12%,#ed3f17 27%,transparent 59%);opacity:0;z-index:7}
.destruction--impact .destruction__flash{animation:flash .8s ease-out forwards}
@keyframes flash{0%{opacity:1;transform:scale(.25)}40%{opacity:.92;transform:scale(1.4)}100%{opacity:0;transform:scale(2.3)}}
.destruction__shockwave{position:absolute;top:50%;left:50%;width:50px;height:50px;transform:translate(-50%,-50%) scale(.1);border:14px solid #ffbc71;border-radius:50%;opacity:0;box-shadow:0 0 30px #e43116;z-index:5}
.destruction--impact .destruction__shockwave{animation:shockwave .85s ease-out forwards}
@keyframes shockwave{0%{opacity:1;transform:translate(-50%,-50%) scale(.1)}100%{opacity:0;transform:translate(-50%,-50%) scale(16)}}
.destruction__smoke{position:absolute;inset:0;z-index:5;opacity:0;filter:blur(10px)}
.destruction--impact .destruction__smoke,.destruction--broken .destruction__smoke{opacity:1}
.destruction__smoke i{--angle:calc(var(--n)*30deg);position:absolute;left:calc(50% - 85px);top:calc(50% - 85px);width:170px;height:170px;border-radius:45% 55% 52% 48%;background:radial-gradient(circle at 44% 42%,#74777c 0%,#313239 47%,#10131b 75%,transparent 77%);opacity:.9;transform:rotate(var(--angle)) translateX(0) scale(.3);animation:smoke-spread 4.8s ease-out forwards;animation-delay:calc(var(--n)*55ms)}
@keyframes smoke-spread{25%{opacity:.9}100%{transform:rotate(var(--angle)) translateX(min(30vw,160px)) scale(1.9);opacity:.65}}
.destruction__embers{position:absolute;inset:0;z-index:6;opacity:0}
.destruction--impact .destruction__embers,.destruction--broken .destruction__embers{opacity:1}
.destruction__embers i{position:absolute;top:50%;left:50%;width:5px;height:5px;border-radius:50%;background:#ffba45;box-shadow:0 0 12px #ff6a22;animation:ember 2s ease-out forwards;animation-delay:calc(var(--n)*25ms)}
@keyframes ember{to{transform:rotate(calc(var(--n)*49deg)) translateX(calc(55px + var(--n)*9px));opacity:0}}
.destruction__replay{position:absolute;bottom:16px;right:16px;z-index:10;pointer-events:auto;padding:10px 14px;border-radius:999px;border:1px solid #ffffff55;background:#171923dd;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer}
.destruction__replay:focus-visible{outline:3px solid #ffb44f;outline-offset:3px}
@media (prefers-reduced-motion:reduce){
 .destruction__missile,.destruction__shockwave,.destruction__flash,.destruction__smoke i,.destruction__embers i,.destruction__half{animation-duration:.01ms!important}
}
</style>
