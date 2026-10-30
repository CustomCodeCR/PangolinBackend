<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ExternalLink, Facebook, Play } from '@lucide/vue'
import InstagramGlyph from './InstagramGlyph.vue'
import { useI18n } from 'vue-i18n'
import { subscribeToChanges } from '../services/realtime'

type LatestReel = {
  permalink: string
  thumbnailUrl: string | null
  publishedAt: string
  videoSrc?: string | null
}

const { t } = useI18n({ useScope: 'global' })
const profileUrl = 'https://www.instagram.com/grupocastrofallas1/'
const facebookProfile = 'https://www.facebook.com/grupocastrofallas1'
type Network = 'instagram' | 'facebook'
type FacebookVideo = { permalink: string; videoSrc: string | null; publishedAt: string }
const activeNetwork = ref<Network>('instagram')
const isFacebook = computed(() => activeNetwork.value === 'facebook')
const activeProfile = computed(() => isFacebook.value ? facebookProfile : profileUrl)
const activeKey = computed(() => isFacebook.value ? 'custom.home.facebook' : 'custom.home.instagram')
const facebookVideo = ref<FacebookVideo | null>(null)
const facebookLoaded = ref(false)
const facebookPlaying = ref(false)
const facebookVideoFailed = ref(false)
const playingNative = ref(false)
const isHovered = ref(false)
const hasFocus = ref(false)
const inView = ref(false)
let visibilityObserver: IntersectionObserver | undefined
let rotationTimer: ReturnType<typeof setInterval> | undefined

const reel = ref<LatestReel | null>(null)
const isPlaying = ref(false)
const videoFailed = ref(false)
const loaded = ref(false)
const reelSection = ref<HTMLElement | null>(null)
let reelObserver: IntersectionObserver | undefined
let reelRequested = false
const abortController = new AbortController()

// Only trust a Reel URL from the company's own server. Never embed arbitrary URLs.
const reelUrl = computed(() => {
  const value = reel.value?.permalink
  if (!value || !/^https:\/\/www\.instagram\.com\/reel\/[\w-]+\/$/.test(value)) return null
  return value
})
const embedUrl = computed(() => reelUrl.value ? `${reelUrl.value}embed/` : null)
const facebookUrl = computed(() => {
  const value = facebookVideo.value?.permalink
  if (!value) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'www.facebook.com' || url.username || url.password || url.port) return null
    if (url.pathname.startsWith('/reel/') || url.pathname.startsWith('/videos/') ||
        url.pathname.startsWith('/grupocastrofallas1/videos/') ||
        (url.pathname === '/watch/' && url.searchParams.has('v'))) return value
  } catch { /* invalid URL */ }
  return null
})
const facebookEmbed = computed(() => facebookUrl.value
  ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(facebookUrl.value)}&show_text=false&width=207`
  : null)
const facebookSrc = computed(() => {
  const src = facebookVideo.value?.videoSrc
  return !facebookVideoFailed.value && typeof src === 'string' &&
    /^\/api\/content\/media\/[0-9a-f-]{36}\/file$/i.test(src) ? src : null
})
const videoSrc = computed(() => {
  const src = reel.value?.videoSrc
  if (videoFailed.value || typeof src !== 'string') return null
  if (/^\/api\/content\/media\/[0-9a-f-]{36}\/file$/i.test(src)) return src
  // Meta returns signed HTTPS URLs on a small set of video CDN domains.
  // No Instagram access tokens are ever included in the DOM.
  try {
    const url = new URL(src)
    const host = url.hostname.toLowerCase()
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null
    if (host === 'fbcdn.net' || host.endsWith('.fbcdn.net') ||
        host === 'cdninstagram.com' || host.endsWith('.cdninstagram.com'))
      return url.href
  } catch { /* Invalid or untrusted URL. */ }
  return null
})

async function loadLatestReel() {
  try {
    const response = await fetch('/api/social/instagram/latest-reel', {
      signal: abortController.signal,
      cache: 'no-store'
    })
    if (!response.ok) return
    const payload = await response.json() as { reel?: LatestReel | null }
    videoFailed.value = false
    reel.value = payload.reel ?? null
  } catch {
    // The home page must remain usable when Meta is unavailable or not configured.
  } finally {
    loaded.value = true
  }
}

async function loadFacebookVideo() {
  try {
    const response = await fetch('/api/social/facebook/featured-video', {
      signal: abortController.signal, cache: 'no-store'
    })
    if (!response.ok) return
    const data = await response.json() as { video?: FacebookVideo | null }
    facebookVideoFailed.value = false
    facebookVideo.value = data.video ?? null
  } catch { /* Missing Facebook content must not block Home. */ }
  finally { facebookLoaded.value = true }
}
function switchNetwork(network: Network) {
  if (activeNetwork.value === network) return
  reelSection.value?.querySelectorAll('video').forEach(video => video.pause())
  isPlaying.value = false
  facebookPlaying.value = false
  playingNative.value = false
  activeNetwork.value = network
  resetRotation()
}
function resetRotation() {
  if (rotationTimer) clearInterval(rotationTimer)
  rotationTimer = setInterval(() => {
    if (!inView.value || document.hidden || isHovered.value || hasFocus.value ||
        playingNative.value || isPlaying.value || facebookPlaying.value) return
    switchNetwork(activeNetwork.value === 'instagram' ? 'facebook' : 'instagram')
  }, 8500)
}
const stopSiteUpdates = subscribeToChanges('site', () => {
  // Do not start a background request before the visitor approaches Instagram.
  if (!reelRequested) return
  // When an admin publishes a different Reel, return to the preview and refresh.
  isPlaying.value = false
  facebookPlaying.value = false
  playingNative.value = false
  videoFailed.value = false
  void loadLatestReel()
  void loadFacebookVideo()
})
function requestReel() {
  if (reelRequested) return
  reelRequested = true
  void loadLatestReel()
  void loadFacebookVideo()
}

onMounted(() => {
  resetRotation()
  // Preserve the section's layout, but postpone its network request until near view.
  if (typeof IntersectionObserver === 'undefined' || !reelSection.value) {
    inView.value = true
    requestReel()
    return
  }
  visibilityObserver = new IntersectionObserver(entries => {
    inView.value = entries.some(entry => entry.isIntersecting)
  }, { threshold: 0.35 })
  visibilityObserver.observe(reelSection.value)
  reelObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return
    reelObserver?.disconnect()
    requestReel()
  }, { rootMargin: '500px 0px' })
  reelObserver.observe(reelSection.value)
})
onUnmounted(() => {
  reelObserver?.disconnect()
  visibilityObserver?.disconnect()
  if (rotationTimer) clearInterval(rotationTimer)
  stopSiteUpdates()
  abortController.abort()
})
</script>

<template>
  <section id="instagram" ref="reelSection" class="home-instagram-section" :aria-label="t('custom.home.socialAria')"
    @pointerenter="isHovered = true" @pointerleave="isHovered = false"
    @focusin="hasFocus = true" @focusout="hasFocus = false">
    <div class="container home-instagram-section__inner">
      <div class="home-instagram-section__copy">
        <div class="home-instagram-section__heading">
          <div class="home-social-switcher" :class="{ 'is-facebook': isFacebook }"
            role="tablist" :aria-label="t('custom.home.socialSelect')">
            <button class="home-social-switcher__button home-social-switcher__instagram"
              :class="{ 'is-active': !isFacebook }" type="button" role="tab"
              :aria-selected="!isFacebook" aria-controls="social-featured-video"
              :tabindex="isFacebook ? -1 : 0"
              @click="switchNetwork('instagram')"
              @keydown.down.prevent="switchNetwork('facebook')"
              @keydown.right.prevent="switchNetwork('facebook')">
              <InstagramGlyph :size="39" :stroke-width="1.9" aria-hidden="true" />
              <span class="sr-only">Instagram</span>
            </button>
            <button class="home-social-switcher__button home-social-switcher__facebook"
              :class="{ 'is-active': isFacebook }" type="button" role="tab"
              :aria-selected="isFacebook" aria-controls="social-featured-video"
              :tabindex="isFacebook ? 0 : -1"
              @click="switchNetwork('facebook')"
              @keydown.up.prevent="switchNetwork('instagram')"
              @keydown.left.prevent="switchNetwork('instagram')">
              <Facebook :size="39" :stroke-width="1.9" aria-hidden="true" />
              <span class="sr-only">Facebook</span>
            </button>
          </div>
          <Transition name="social-copy" mode="out-in">
            <div :key="activeNetwork">
              <p>{{ t('custom.home.instagram.follow') }}</p>
              <h2 :class="{ 'home-instagram-section__title--facebook': isFacebook }">{{ isFacebook ? 'Facebook' : 'Instagram' }}</h2>
            </div>
          </Transition>
        </div>

        <Transition name="social-copy" mode="out-in">
          <div :key="activeNetwork" class="home-instagram-section__details">
            <p class="home-instagram-section__description">{{ t(activeKey + '.description') }}</p>
            <a class="home-instagram-section__profile" :class="{ 'home-instagram-section__profile--facebook': isFacebook }"
              :href="activeProfile" target="_blank" rel="noopener noreferrer">
              {{ t(activeKey + '.profile') }}
              <ExternalLink :size="19" aria-hidden="true" />
            </a>
          </div>
        </Transition>
      </div>

      <div id="social-featured-video" class="home-instagram-section__viewer"
        role="tabpanel" :aria-label="t(activeKey + '.reel')">
        <Transition name="social-reel" mode="out-in">
          <div :key="activeNetwork" class="home-instagram-section__reel">
          <template v-if="!isFacebook">
        <template v-if="videoSrc && reelUrl">
          <video class="home-instagram-section__native-video" :key="videoSrc" :src="videoSrc"
            controls playsinline preload="metadata" :aria-label="t('custom.home.instagram.reel')"
            @play="playingNative = true" @pause="playingNative = false"
            @ended="playingNative = false" @error="videoFailed = true">
            {{ t('custom.home.instagram.open') }}
          </video>
          <a class="home-instagram-section__open home-instagram-section__open--native"
            :href="reelUrl" target="_blank" rel="noopener noreferrer">
            Instagram <ExternalLink :size="13" aria-hidden="true" />
          </a>
        </template>
        <iframe v-else-if="isPlaying && embedUrl" class="home-instagram-section__embed"
          :src="embedUrl" :title="t('custom.home.instagram.reel')"
          loading="lazy" allow="encrypted-media; picture-in-picture"
          scrolling="no"
          referrerpolicy="strict-origin-when-cross-origin"></iframe>
        <template v-else-if="reelUrl">
          <img v-if="reel?.thumbnailUrl" :src="reel.thumbnailUrl"
            :alt="t('custom.home.instagram.reel')" loading="lazy" referrerpolicy="no-referrer" />
          <div v-else class="home-instagram-section__placeholder">
            <InstagramGlyph :size="56" aria-hidden="true" />
            <span>@grupocastrofallas1</span>
          </div>
          <div class="home-instagram-section__reel-head" aria-hidden="true">
            <span class="home-instagram-section__avatar"><InstagramGlyph :size="19" /></span>
            <span><strong>grupocastrofallas1</strong><small>Reels</small></span>
          </div>
          <button class="home-instagram-section__play" type="button"
            :aria-label="t('custom.home.instagram.play')" @click="isPlaying = true">
            <Play :size="30" fill="currentColor" aria-hidden="true" />
          </button>
          <a class="home-instagram-section__open" :href="reelUrl" target="_blank" rel="noopener noreferrer">
            {{ t('custom.home.instagram.open') }} <ExternalLink :size="13" aria-hidden="true" />
          </a>
        </template>
        <a v-else class="home-instagram-section__placeholder home-instagram-section__placeholder--link"
          :href="profileUrl" target="_blank" rel="noopener noreferrer">
          <InstagramGlyph :size="54" aria-hidden="true" />
          <strong>@grupocastrofallas1</strong>
          <span>{{ loaded ? t('custom.home.instagram.unavailable') : t('custom.home.instagram.loading') }}</span>
          <ExternalLink :size="19" aria-hidden="true" />
        </a>

          </template>
          <template v-else>
            <template v-if="facebookSrc && facebookUrl">
              <video class="home-instagram-section__native-video" :key="facebookSrc" :src="facebookSrc"
                controls playsinline preload="metadata" :aria-label="t('custom.home.facebook.reel')"
                @play="playingNative = true" @pause="playingNative = false"
                @ended="playingNative = false" @error="facebookVideoFailed = true">
                {{ t('custom.home.facebook.open') }}
              </video>
              <a class="home-instagram-section__open home-instagram-section__open--native"
                :href="facebookUrl" target="_blank" rel="noopener noreferrer">
                Facebook <ExternalLink :size="13" aria-hidden="true" />
              </a>
            </template>
            <iframe v-else-if="facebookPlaying && facebookEmbed"
              class="home-instagram-section__embed home-instagram-section__embed--facebook"
              :src="facebookEmbed" :title="t('custom.home.facebook.reel')"
              loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen"
              allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
            <template v-else-if="facebookUrl">
              <div class="home-instagram-section__placeholder home-instagram-section__placeholder--facebook">
                <Facebook :size="54" aria-hidden="true" />
                <strong>Grupo Castro Fallas</strong>
                <span>{{ t('custom.home.facebook.preview') }}</span>
              </div>
              <button class="home-instagram-section__play" type="button"
                :aria-label="t('custom.home.facebook.play')" @click="facebookPlaying = true">
                <Play :size="30" fill="currentColor" aria-hidden="true" />
              </button>
              <a class="home-instagram-section__open" :href="facebookUrl" target="_blank" rel="noopener noreferrer">
                {{ t('custom.home.facebook.open') }} <ExternalLink :size="13" aria-hidden="true" />
              </a>
            </template>
            <a v-else class="home-instagram-section__placeholder home-instagram-section__placeholder--link home-instagram-section__placeholder--facebook"
              :href="facebookProfile" target="_blank" rel="noopener noreferrer">
              <Facebook :size="54" aria-hidden="true" />
              <strong>Grupo Castro Fallas</strong>
              <span>{{ facebookLoaded ? t('custom.home.facebook.unavailable') : t('custom.home.facebook.loading') }}</span>
              <ExternalLink :size="19" aria-hidden="true" />
            </a>
          </template>
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-instagram-section {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  /* Home uses a continuous shared page background. Default text must contrast
     with the light gradient rather than assume the section has a dark fill. */
  color: #1c2333;
  background: radial-gradient(ellipse at -8% 5%, rgba(169, 13, 55, .29), transparent 52%),
    linear-gradient(113deg, #150b18 0%, #060d1c 64%, #020a1a 100%);
}
.home-instagram-section::before {
  content: '';
  position: absolute;
  z-index: -1;
  width: 48vw;
  height: 48vw;
  max-width: 630px;
  max-height: 630px;
  left: -23vw;
  bottom: -29vw;
  border: 1px solid rgba(206, 18, 66, .23);
  border-radius: 50%;
  box-shadow: 0 0 0 18px rgba(145, 9, 46, .05), 0 0 0 36px rgba(145, 9, 46, .04),
    0 0 0 54px rgba(145, 9, 46, .03);
  pointer-events: none;
}
.home-instagram-section__inner {
  display: grid;
  grid-template-columns: minmax(0, 370px) 207px;
  justify-content: center;
  align-items: start;
  gap: clamp(42px, 7vw, 100px);
  padding-top: clamp(64px, 7vw, 90px);
  padding-bottom: clamp(64px, 7vw, 90px);
}
.home-instagram-section__copy { min-width: 0; padding-top: 24px; }
.home-instagram-section__heading { display: flex; align-items: flex-start; gap: 25px; }
.home-instagram-section__icon {
  flex: 0 0 73px;
  width: 73px;
  height: 73px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: linear-gradient(135deg, #bd233f, #83045f);
}
.home-instagram-section__heading p { margin: 0; font-size: clamp(24px, 2.3vw, 32px); line-height: 1.2; }
.home-instagram-section__heading h2 {
  margin: 1px 0 0;
  font-size: clamp(38px, 4vw, 51px);
  letter-spacing: -.045em;
  /* Extra descent room protects the lower curve of the 'g' on all widths. */
  line-height: 1.26;
  padding-bottom: .12em;
  margin-bottom: -.12em;
  font-weight: 850;
  background: linear-gradient(90deg, #ff4049 2%, #cc1794 85%);
  color: transparent;
  background-clip: text;
}
.home-instagram-section__description {
  margin: 27px 0 25px 98px;
  max-width: 296px;
  font-size: clamp(15px, 1.4vw, 18px);
  line-height: 1.6;
  color: #303447;
}
.home-instagram-section__profile {
  margin-left: 98px;
  max-width: 296px;
  min-height: 50px;
  border-radius: 999px;
  padding: 11px 20px;
  border: 1px solid #e43774;
  box-shadow: inset -1px 0 #b900ee;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 750;
  color: #1c2333;
  transition: background-color .2s, transform .2s;
}
.home-instagram-section__profile:hover,
.home-instagram-section__profile:focus-visible { background: rgba(222, 30, 109, .16); transform: translateY(-2px); }
/* The rest of Home deliberately stays transparent so the page-wide gradient
   has no seams. In dark mode restore high-contrast light foregrounds here. */
:global(html.theme-dark) .home-instagram-section { color: #fff; }
:global(html.theme-dark) .home-instagram-section__description { color: #f0eef5; }
:global(html.theme-dark) .home-instagram-section__profile { color: #fff; }
.home-instagram-section__reel {
  position: absolute;
  inset: 0;
  width: 100%;
  aspect-ratio: 9 / 16;
  overflow: hidden;
  background: linear-gradient(155deg, #3e1534, #061226 70%);
  border: 1px solid #bc7487;
  border-radius: 12px;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, .05), 0 10px 42px rgba(0, 0, 0, .35);
}
.home-instagram-section__reel > img, .home-instagram-section__embed, .home-instagram-section__native-video {
  width: 100%; height: 100%; display: block; object-fit: cover; border: 0;
}
/* Experimental Instagram fallback: crop the cross-origin embed as a whole.
   At the card's 9:16 aspect ratio, magnifying around the centre keeps most
   of the video visible while clipping Instagram's white header/footer and
   scrollbars. We cannot edit the iframe's internal content. Do not apply this
   to the native MP4 / authorized Meta video player. */
.home-instagram-section__embed {
  position: absolute;
  inset: 0;
  transform: translateY(1.5%) scale(1.52);
  transform-origin: center center;
  background: #020717;
}
.home-instagram-section__native-video { background: #020717; }
.home-instagram-section__open--native { top: 9px; right: 9px; bottom: auto; z-index: 1; }
.home-instagram-section__reel-head {
  position: absolute; top: 12px; left: 10px; right: 10px;
  display: flex; align-items: center; gap: 7px;
  padding-top: 8px; border-top: 2px solid #fffc;
  text-shadow: 0 1px 6px #000;
  pointer-events: none;
}
.home-instagram-section__avatar { border-radius: 50%; background: #fff; color: #ad174b; width: 27px; height: 27px; display: grid; place-items: center; }
.home-instagram-section__reel-head strong { display: block; font-size: 10px; }
.home-instagram-section__reel-head small { display: block; font-size: 9px; }
.home-instagram-section__play {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 66px; height: 66px; display: grid; place-items: center;
  border: 2px solid #fff; border-radius: 50%;
  background: rgba(0, 0, 0, .51); color: #fff;
}
.home-instagram-section__play:hover, .home-instagram-section__play:focus-visible { background: #aa164b; }
.home-instagram-section__open {
  position: absolute; right: 10px; bottom: 10px;
  display: flex; align-items: center; gap: 5px;
  padding: 6px 9px; border-radius: 8px;
  background: #060b1ce6; font-size: 10px; font-weight: 700;
}
.home-instagram-section__placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; width: 100%; height: 100%; padding: 17px; text-align: center;
  color: #fff;
}
.home-instagram-section__placeholder--link:hover { background: #ffffff0e; }
.home-instagram-section__placeholder strong { overflow-wrap: anywhere; font-size: 13px; }
.home-instagram-section__placeholder span { color: #e5d8e8; font-size: 12px; line-height: 1.45; }
@media (max-width: 680px) {
  .home-instagram-section__inner { grid-template-columns: minmax(0, 1fr); justify-items: center; gap: 34px; padding-block: 56px; }
  .home-instagram-section__copy { padding: 0; width: min(100%, 380px); }
  .home-instagram-section__heading { justify-content: center; align-items: center; gap: 18px; }
  .home-instagram-section__icon { width: 61px; height: 61px; flex-basis: 61px; }
  .home-instagram-section__heading p { font-size: 24px; }
  .home-instagram-section__heading h2 { font-size: clamp(34px, 9vw, 44px); }
  .home-instagram-section__description { text-align: center; margin: 22px auto 18px; max-width: 315px; }
  .home-instagram-section__profile { margin-inline: auto; width: min(100%, 315px); }
  .home-instagram-section__reel { width: min(205px, 65vw); }
}
@media (prefers-reduced-motion: reduce) {
  .home-instagram-section__profile { transition: none; }
}

/* Network icons swap positions without changing the copy column's layout. */
.home-social-switcher { position: relative; flex: 0 0 73px; width: 73px; height: 73px; }
.home-social-switcher__button {
  position: absolute; top: 0; left: 0; width: 73px; height: 73px;
  display: grid; place-items: center; border: 0; border-radius: 50%;
  padding: 0; cursor: pointer; background: transparent; opacity: .42;
  transition: transform .68s cubic-bezier(.22,1,.36,1), opacity .48s ease, box-shadow .48s ease;
}
.home-social-switcher__button:focus-visible { outline: 3px solid #e43774; outline-offset: 3px; }
.home-social-switcher__instagram { color: #a10861; transform: translateY(0) scale(1); }
.home-social-switcher__facebook { color: #1877f2; transform: translateY(91px) scale(.83); }
.home-social-switcher.is-facebook .home-social-switcher__instagram { transform: translateY(91px) scale(.83); }
.home-social-switcher.is-facebook .home-social-switcher__facebook { transform: translateY(0) scale(1); }
.home-social-switcher__instagram.is-active { color: #fff; opacity: 1; background: linear-gradient(135deg,#bd233f,#83045f); }
.home-social-switcher__facebook.is-active { color: #fff; opacity: 1; background: linear-gradient(135deg,#2587f5,#1057a7); }
.home-social-switcher__button:not(.is-active):hover { opacity: .83; }
.home-instagram-section__title--facebook { background: linear-gradient(90deg,#217cf0,#1261bd)!important; background-clip: text!important; }
.home-instagram-section__profile--facebook { border-color: #2583ed; box-shadow: inset -1px 0 #1877f2; }
.home-instagram-section__profile--facebook:hover,
.home-instagram-section__profile--facebook:focus-visible { background: rgba(24,119,242,.13); }
.home-instagram-section__viewer { position: relative; width: 100%; aspect-ratio: 9 / 16; }
.home-instagram-section__viewer .home-instagram-section__reel { width: 100%; height: 100%; }
.home-instagram-section__embed--facebook { transform: none; background: #091628; }
.home-instagram-section__placeholder--facebook { background: linear-gradient(155deg,#214b8a,#07152f); }
.social-copy-enter-active,.social-copy-leave-active { transition: opacity .24s ease, transform .24s ease; }
.social-copy-enter-from { opacity: 0; transform: translateY(8px); }
.social-copy-leave-to { opacity: 0; transform: translateY(-8px); }
.social-reel-enter-active,.social-reel-leave-active { transition: opacity .31s ease, transform .31s ease; }
.social-reel-enter-from { opacity: 0; transform: translateY(12px) scale(.985); }
.social-reel-leave-to { opacity: 0; transform: translateY(-12px) scale(.985); }
@media (max-width: 680px) {
  .home-social-switcher { width: 61px; flex-basis: 61px; height: 123px; }
  .home-social-switcher__button { width: 61px; height: 61px; }
  .home-social-switcher__button :deep(svg) { width: 33px; height: 33px; }
  .home-social-switcher__facebook { transform: translateY(72px) scale(.83); }
  .home-social-switcher.is-facebook .home-social-switcher__instagram { transform: translateY(72px) scale(.83); }
  .home-instagram-section__viewer { width: min(205px,65vw); }
  .home-instagram-section__viewer .home-instagram-section__reel { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .home-social-switcher__button,.social-copy-enter-active,.social-copy-leave-active,
  .social-reel-enter-active,.social-reel-leave-active { transition: none!important; }
}

</style>
