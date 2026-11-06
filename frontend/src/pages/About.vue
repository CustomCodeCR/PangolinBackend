<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDownRight, ArrowUpRight, BadgeCheck, Handshake, Route, Scale, UsersRound } from '@lucide/vue'
import SiteMedia from '../components/SiteMedia.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import { siteText, siteVisual, siteCssImage } from '../siteCms'
import '../styles/about-editorial.css'

const { t, locale } = useI18n({ useScope: 'global' })
const values = computed(() => [0, 1, 2, 3, 4].map(index =>
  siteText('about.values.' + index, t('custom.about.values.' + index), locale.value)
))
const valueIcons = [Handshake, Scale, UsersRound, Route, BadgeCheck]

const labels = {
  es: {
    eyebrow: 'CONOCÉ NUESTRA EMPRESA',
    heroLead: 'Gestión, coordinación y supervisión del transporte de carga, en Costa Rica y el mundo.',
    explore: 'Nuestra historia',
    storyEyebrow: 'TRAYECTORIA',
    storyTitle: 'Experiencia que conecta cada etapa.',
    management: 'Gestión',
    coordination: 'Coordinación',
    supervision: 'Supervisión',
    visualStamp: 'Desde Costa Rica',
    valuesLead: 'Cinco principios que guían nuestra forma de trabajar.',
    ctaEyebrow: 'SIGAMOS CONECTANDO',
    ctaTitle: 'Tu próximo movimiento comienza aquí.',
    services: 'Conocer servicios',
    quotes: 'Solicitar cotización'
  },
  en: {
    eyebrow: 'GET TO KNOW OUR COMPANY',
    heroLead: 'Freight management, coordination and supervision in Costa Rica and around the world.',
    explore: 'Our story',
    storyEyebrow: 'OUR JOURNEY',
    storyTitle: 'Experience connecting every step.',
    management: 'Management',
    coordination: 'Coordination',
    supervision: 'Supervision',
    visualStamp: 'From Costa Rica',
    valuesLead: 'Five principles that guide the way we work.',
    ctaEyebrow: 'LET’S KEEP CONNECTING',
    ctaTitle: 'Your next move starts here.',
    services: 'Explore services',
    quotes: 'Request a quote'
  }
} as const
const copy = computed(() => String(locale.value).startsWith('en') ? labels.en : labels.es)

const pageRoot = ref<HTMLElement | null>(null)
let revealObserver: IntersectionObserver | undefined

onMounted(() => {
  if (!pageRoot.value || !('IntersectionObserver' in window) ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

  revealObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.classList.remove('cf-about-reveal--pending')
      revealObserver?.unobserve(entry.target)
    }
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' })

  for (const element of pageRoot.value.querySelectorAll<HTMLElement>('[data-about-reveal]')) {
    // Keep on-screen and server-rendered content visible during hydration.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.86) continue
    element.classList.add('cf-about-reveal--pending')
    revealObserver.observe(element)
  }
})
onBeforeUnmount(() => revealObserver?.disconnect())
</script>

<template>
  <div ref="pageRoot" class="app-site about-reference-page cf-about">
    <section
      class="inner-hero inner-hero--about cf-about-hero"
      :style="{ '--cms-about-hero': siteCssImage('about.hero.media', '/images/about-operations-enhanced.jpg') }"
      aria-labelledby="cf-about-title"
    >
      <SiteMedia
        v-if="siteVisual('about.hero.media', '/images/about-operations-enhanced.jpg').kind.startsWith('Video')"
        slot-key="about.hero.media"
        fallback="/images/about-operations-enhanced.jpg"
        background
      />
      <SiteHeader active="nosotros" overlay />
      <div class="container cf-about-hero__inner">
        <div class="cf-about-hero__content">
          <p class="cf-about-overline"><span aria-hidden="true"></span>{{ copy.eyebrow }}</p>
          <h1 id="cf-about-title">{{ siteText('about.hero.title', t('custom.about.title'), locale) }}</h1>
          <p class="cf-about-hero__lead">{{ copy.heroLead }}</p>
          <a class="cf-about-hero__explore" href="#nuestra-historia">
            <span>{{ copy.explore }}</span>
            <ArrowDownRight :size="19" aria-hidden="true" />
          </a>
        </div>
      </div>
      <div class="cf-about-hero__years" :aria-label="'48 ' + t('custom.about.years')">
        <strong>+48</strong>
        <span>{{ t('custom.about.years') }}</span>
      </div>
      <div class="cf-about-hero__rail" aria-hidden="true"><span>CASTRO FALLAS</span><span>LOGÍSTICA INTERNACIONAL</span></div>
    </section>

    <main>
      <section id="nuestra-historia" class="about-reference-intro cf-about-story" data-about-reveal>
        <div class="container cf-about-story__grid">
          <div class="cf-about-story__copy">
            <p class="cf-about-eyebrow">{{ copy.storyEyebrow }}</p>
            <h2>{{ copy.storyTitle }}</h2>
            <p class="cf-about-story__description">{{ siteText('about.intro', t('custom.about.introduction'), locale) }}</p>
            <ul class="cf-about-story__tags">
              <li>{{ copy.management }}</li>
              <li>{{ copy.coordination }}</li>
              <li>{{ copy.supervision }}</li>
            </ul>
          </div>
          <div class="cf-about-story__visual">
            <figure class="cf-about-story__primary">
              <SiteMedia slot-key="about.operations.media" fallback="/images/about-operations-enhanced.jpg" :alt="t('phrases.p139')" />
            </figure>
            <figure class="cf-about-story__secondary" aria-hidden="true">
              <img src="/images/ship.webp" alt="" loading="lazy" width="800" height="600" />
            </figure>
            <div class="cf-about-story__stamp"><span>{{ copy.visualStamp }}</span><ArrowUpRight :size="20" aria-hidden="true" /></div>
          </div>
        </div>
      </section>

      <section class="about-values-section cf-about-values" data-about-reveal aria-labelledby="cf-about-values-title">
        <div class="container">
          <div class="cf-about-values__heading">
            <div>
              <p class="cf-about-eyebrow">{{ t('custom.about.valuesEyebrow') }}</p>
              <h2 id="cf-about-values-title">{{ siteText('about.values.heading', t('custom.about.valuesTitle'), locale) }}</h2>
            </div>
            <p>{{ copy.valuesLead }}</p>
          </div>
          <div class="cf-about-values__grid">
            <article v-for="(value, index) in values" :key="index" class="cf-about-value">
              <span class="cf-about-value__number">{{ String(index + 1).padStart(2, '0') }}</span>
              <component :is="valueIcons[index]" class="cf-about-value__icon" :size="28" :stroke-width="1.6" aria-hidden="true" />
              <h3>{{ value }}</h3>
              <span class="cf-about-value__line" aria-hidden="true"></span>
            </article>
          </div>
        </div>
      </section>

      <section class="cf-about-cta" data-about-reveal aria-labelledby="cf-about-cta-title">
        <div class="container cf-about-cta__inner">
          <div>
            <p class="cf-about-eyebrow">{{ copy.ctaEyebrow }}</p>
            <h2 id="cf-about-cta-title">{{ copy.ctaTitle }}</h2>
          </div>
          <div class="cf-about-cta__links">
            <a href="/servicios" class="cf-about-cta__primary">{{ copy.services }}<ArrowUpRight :size="19" aria-hidden="true" /></a>
            <a href="/cotizaciones" class="cf-about-cta__secondary">{{ copy.quotes }}<ArrowUpRight :size="19" aria-hidden="true" /></a>
          </div>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>
