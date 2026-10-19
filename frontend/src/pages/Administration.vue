<script setup lang="ts">
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import ContentManager from './ContentManager.vue'
</script>

<template>
  <div class="app-site administration-page">
    <section class="administration-hero">
      <SiteHeader active="administracion" overlay />
      <div class="container administration-hero__copy">
        <p class="section-tag light-tag"><span class="tag-line"></span> CASTRO FALLAS · PANEL DE CONTROL</p>
        <h1>Administración</h1>
        <p>Gestiona el contenido del sitio y las cuentas desde un solo lugar.</p>
      </div>
    </section>
    <main>
      <ContentManager embedded />
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.app-site.administration-page { background: #fff8f8 !important; background-image: none !important; color: #20242b; }
:global(html.theme-dark .app-site.administration-page) { background: #171316 !important; background-image: none !important; color: #fff; }
:global(html .administration-page > main) { background: transparent !important; background-image: none !important; }

.administration-hero {
  position: relative;
  min-height: 360px;
  color: #fff;
  background: transparent;
}
.administration-hero::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 0;
  background: linear-gradient(105deg, rgba(165, 11, 41, .94), rgba(113, 13, 36, .82) 47%, rgba(35, 21, 29, .94));
  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 42%, rgba(0, 0, 0, .82) 62%, rgba(0, 0, 0, .42) 82%, transparent 100%);
  mask-image: linear-gradient(180deg, #000 0%, #000 42%, rgba(0, 0, 0, .82) 62%, rgba(0, 0, 0, .42) 82%, transparent 100%);
}
.administration-hero__copy { position: relative; z-index: 2; padding-top: 92px; padding-bottom: 56px; }
.administration-hero__copy .section-tag { margin-bottom: 17px; }
.administration-hero__copy h1 { margin: 0; font-size: clamp(42px, 6vw, 76px); line-height: 1; letter-spacing: -.055em; }
.administration-hero__copy > p:last-child { margin: 20px 0 0; max-width: 600px; color: rgba(255,255,255,.88); font-size: clamp(15px, 1.5vw, 19px); }
@media (max-width: 800px) {
  .administration-hero { min-height: 300px; }
  .administration-hero__copy { padding-top: 82px; padding-bottom: 40px; }
}
</style>
