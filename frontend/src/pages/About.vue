<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

const { t } = useI18n({ useScope: 'global' })
const values = computed(() => [0, 1, 2, 3, 4].map(index => t(`custom.about.values.${index}`)))
const selectedValue = ref<number | null>(null)
</script>

<template>
  <div class="app-site about-reference-page">
    <section class="inner-hero inner-hero--about">
      <SiteHeader active="nosotros" overlay />
      <div class="container inner-hero__copy about-hero__copy">
        <h1>{{ $t('custom.about.title') }}</h1>
        <div class="big-years"><strong>+48</strong><span>{{ $t('custom.about.years') }}</span></div>
      </div>
    </section>
    <main>
      <section class="section-spacing about-reference-intro">
        <div class="container about-intro-grid">
          <div class="about-reference-copy"><p>{{ $t('custom.about.introduction') }}</p></div>
          <div class="about-image-card"><img src="/images/about-operations-enhanced.jpg" :alt="$t('phrases.p139')" loading="lazy" /><div class="image-stamp">COSTA RICA <IconSymbol glyph="↗" /></div></div>
        </div>
      </section>
      <section class="about-values-section section-spacing">
        <div class="container">
          <p class="section-tag">{{ $t('custom.about.valuesEyebrow') }}</p>
          <h2 class="about-values-title">{{ $t('custom.about.valuesTitle') }}</h2>
          <div class="about-values-grid">
            <button v-for="(value, index) in values" :key="value" class="about-value-card" :class="{ 'is-selected': selectedValue === index }" type="button" :aria-pressed="selectedValue === index" @click="selectedValue = selectedValue === index ? null : index">
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              <strong>{{ value }}</strong>
            </button>
          </div>
        </div>
      </section>


    </main>
    <SiteFooter />
  </div>
</template>
