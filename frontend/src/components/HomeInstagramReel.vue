<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ExternalLink, Play } from '@lucide/vue'
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
const reel = ref<LatestReel | null>(null)
const isPlaying = ref(false)
const loaded = ref(false)
const abortController = new AbortController()

// Only trust a Reel URL from the company's own server. Never embed arbitrary URLs.
const reelUrl = computed(() => {
  const value = reel.value?.permalink
  if (!value || !/^https:\/\/www\.instagram\.com\/reel\/[\w-]+\/$/.test(value)) return null
  return value
})
const embedUrl = computed(() => reelUrl.value ? `${reelUrl.value}embed/` : null)
const videoSrc = computed(() => {
  const src = reel.value?.videoSrc
  return typeof src === 'string' && /^\/api\/content\/media\/[0-9a-f-]{36}\/file$/i.test(src) ? src : null
})

async function loadLatestReel() {
  try {
    const response = await fetch('/api/social/instagram/latest-reel', {
      signal: abortController.signal,
      cache: 'no-store'
    })
    if (!response.ok) return
    const payload = await response.json() as { reel?: LatestReel | null }
    reel.value = payload.reel ?? null
  } catch {
    // The home page must remain usable when Meta is unavailable or not configured.
  } finally {
    loaded.value = true
  }
}

const stopSiteUpdates = subscribeToChanges('site', () => {
  // When an admin publishes a different Reel, return to the preview and refresh.
  isPlaying.value = false
  void loadLatestReel()
})
onMounted(() => { void loadLatestReel() })
onUnmounted(() => { stopSiteUpdates(); abortController.abort() })
</script>

<template>
  <section id="instagram" class="home-instagram-section" :aria-label="t('custom.home.instagram.aria')">
    <div class="container home-instagram-section__inner">
      <div class="home-instagram-section__copy">
        <div class="home-instagram-section__heading">
          <span class="home-instagram-section__icon"><InstagramGlyph :size="39" :stroke-width="1.9" aria-hidden="true" /></span>
          <div>
            <p>{{ t('custom.home.instagram.follow') }}</p>
            <h2>Instagram</h2>
          </div>
        </div>

        <p class="home-instagram-section__description">{{ t('custom.home.instagram.description') }}</p>
        <a class="home-instagram-section__profile" :href="profileUrl" target="_blank" rel="noopener noreferrer">
          {{ t('custom.home.instagram.profile') }}
          <ExternalLink :size="19" aria-hidden="true" />
        </a>
      </div>

      <div class="home-instagram-section__reel" :aria-label="t('custom.home.instagram.reel')">
        <template v-if="videoSrc && reelUrl">
          <video class="home-instagram-section__native-video" :key="videoSrc" :src="videoSrc"
            controls playsinline preload="metadata" :aria-label="t('custom.home.instagram.reel')">
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
  position: relative;
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
</style>
