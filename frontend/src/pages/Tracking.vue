<script setup lang="ts">
import IconSymbol from '../components/IconSymbol.vue'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import WorldGlobe from '../components/WorldGlobe.vue'
</script>

<template>
  <div class="app-site">
    <SiteHeader active="embarque" />
    <main class="tracking-page">
      <div class="container tracking-grid">
        <div class="tracking-copy">
          <a class="back-link" href="/home#embarque">{{ $t('phrases.p079') }}</a>
          <p class="section-tag">{{ $t('phrases.p080') }}</p>
          <h1>{{ $t('phrases.p021') }} <span>{{ $t('phrases.p022') }}</span></h1>
          <p>{{ $t('phrases.p081') }}</p>
          <div class="demo-note"><span class="demo-note-icon">i</span><span><strong>{{ $t('phrases.p064') }}</strong>{{ $t('phrases.p082') }}</span></div>
          <a class="btn btn-primary" href="/cotizaciones">{{ $t('phrases.p038') }} <IconSymbol glyph="↗" /></a>
        </div>
        <WorldGlobe />
      </div>
    </main>
    <SiteFooter />
  </div>
</template>
