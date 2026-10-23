<script setup lang="ts">
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
import servicePages from '../../seo/service-pages.json'

type ServicePage = {
  shortName: string
  kicker: string
  heading: string
  intro: string
  sectionTitle: string
  paragraphs: string[]
  highlights: string[]
}
const path = window.location.pathname.replace(/\/+$/, '') || '/'
const service = (servicePages as Record<string, ServicePage>)[path]
const otherServices = Object.entries(servicePages)
  .filter(([url]) => url !== path)
  .map(([url, item]) => ({ url, name: item.shortName }))
</script>

<template>
  <div class="app-site seo-service-page">
    <SiteHeader active="soluciones" />
    <main v-if="service">
      <section class="seo-service-hero">
        <div class="container">
          <nav class="seo-service-crumb" aria-label="Ruta de navegación">
            <a href="/">Inicio</a><span aria-hidden="true">/</span>
            <a href="/servicios">Servicios</a><span aria-hidden="true">/</span>
            <span aria-current="page">{{ service.shortName }}</span>
          </nav>
          <p class="section-tag light-tag">{{ service.kicker }}</p>
          <h1>{{ service.heading }}</h1>
          <p class="seo-service-intro">{{ service.intro }}</p>
          <a class="btn btn-primary" href="/cotizaciones">Solicitar cotización <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section class="section-spacing seo-service-details">
        <div class="container seo-service-columns">
          <article class="seo-service-copy">
            <h2>{{ service.sectionTitle }}</h2>
            <p v-for="paragraph in service.paragraphs" :key="paragraph">{{ paragraph }}</p>
          </article>
          <aside class="seo-service-highlights" aria-label="Características del servicio">
            <h2>¿Qué incluye la coordinación?</h2>
            <ul>
              <li v-for="item in service.highlights" :key="item">{{ item }}</li>
            </ul>
            <a href="/cotizaciones">Conversar sobre mi carga <span aria-hidden="true">→</span></a>
          </aside>
        </div>
      </section>
      <section class="seo-service-related section-spacing">
        <div class="container">
          <h2>Conocé nuestros otros servicios</h2>
          <nav aria-label="Otros servicios logísticos">
            <a v-for="item in otherServices" :key="item.url" :href="item.url">{{ item.name }} <span aria-hidden="true">↗</span></a>
          </nav>
          <p><a href="/servicios">Ver todas las soluciones logísticas</a></p>
        </div>
      </section>
    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.seo-service-hero {
  padding: clamp(42px, 6vw, 88px) 0 clamp(65px, 8vw, 110px);
  color: #fff;
  background: linear-gradient(105deg, rgba(26, 30, 51, .97), rgba(134, 14, 39, .9)), url('/images/services-crane.webp') center / cover;
}
.seo-service-crumb { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; font-size: 12px; margin-bottom: 50px; color: #fff; opacity: .9; }
.seo-service-crumb a { text-decoration: underline; text-underline-offset: 4px; }
.seo-service-hero h1 { max-width: 860px; margin: 12px 0 22px; font-weight: 900; letter-spacing: -.04em; line-height: 1.12; font-size: clamp(34px, 5vw, 64px); }
.seo-service-intro { max-width: 780px; line-height: 1.8; font-size: clamp(16px, 2vw, 20px); margin-bottom: 32px; color: #fff; }
.seo-service-columns { display: grid; grid-template-columns: 1.7fr 1fr; gap: clamp(26px, 5vw, 80px); align-items: start; }
.seo-service-copy h2, .seo-service-related h2 { font-size: clamp(25px, 3vw, 38px); line-height: 1.25; letter-spacing: -.03em; margin: 0 0 24px; color: #ad0925; }
.seo-service-copy p { color: #4e5563; font-size: 16px; line-height: 1.9; margin: 0 0 22px; }
.seo-service-highlights { background: #fbf4f5; border-radius: 24px; padding: clamp(24px, 3vw, 38px); }
.seo-service-highlights h2 { font-size: 20px; line-height: 1.4; color: #222936; margin: 0 0 20px; }
.seo-service-highlights ul { padding-left: 20px; line-height: 1.8; color: #343a45; }
.seo-service-highlights li { margin-bottom: 12px; }
.seo-service-highlights a, .seo-service-related p a { font-weight: 800; color: #a90c24; text-decoration: underline; text-underline-offset: 4px; }
.seo-service-related { background: #f8f9fb; }
.seo-service-related nav { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.seo-service-related nav a { background: #fff; border: 1px solid #e8e9eb; padding: 19px 22px; border-radius: 12px; color: #303644; display: flex; align-items: center; justify-content: space-between; font-weight: 700; line-height: 1.5; }
.seo-service-related nav a:hover, .seo-service-related nav a:focus-visible { border-color: #b10e28; color: #a70b24; }
.seo-service-related p { margin-top: 30px; }
:global(html.dark) .seo-service-details,
:global(body.dark) .seo-service-details,
:global(html[data-theme="dark"]) .seo-service-details { background: #151a25; }
:global(html.dark) .seo-service-copy p,
:global(body.dark) .seo-service-copy p,
:global(html[data-theme="dark"]) .seo-service-copy p { color: #e5e7eb; }
:global(html.dark) .seo-service-highlights,
:global(body.dark) .seo-service-highlights,
:global(html[data-theme="dark"]) .seo-service-highlights { background: #242c3a; }
:global(html.dark) .seo-service-highlights h2,
:global(html.dark) .seo-service-highlights li,
:global(body.dark) .seo-service-highlights h2,
:global(body.dark) .seo-service-highlights li,
:global(html[data-theme="dark"]) .seo-service-highlights h2,
:global(html[data-theme="dark"]) .seo-service-highlights li { color: #fff; }
@media (max-width: 760px) {
  .seo-service-columns { grid-template-columns: 1fr; }
  .seo-service-related nav { grid-template-columns: 1fr; }
  .seo-service-crumb { margin-bottom: 28px; }
}
</style>
