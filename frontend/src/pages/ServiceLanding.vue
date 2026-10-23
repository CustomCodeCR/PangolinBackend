<script setup lang="ts">
import routeSeo from '../../seo/routes.json'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'

type Landing = { heading: string; intro: string; details: string[]; image: string; imageAlt: string; imageWidth: number; imageHeight: number }
const route = routeSeo[window.location.pathname as keyof typeof routeSeo] as { landing?: Landing } | undefined
const landing = route?.landing
</script>

<template>
  <div v-if="landing" class="app-site">
    <SiteHeader active="soluciones" />
    <main class="container section-spacing" style="min-height: 55vh">
      <p class="section-tag">Grupo Castro Fallas · Costa Rica</p>
      <h1 class="section-title">{{ landing.heading }}</h1>
      <p class="section-desc">{{ landing.intro }}</p>
      <img :src="landing.image" :alt="landing.imageAlt" :width="landing.imageWidth" :height="landing.imageHeight" loading="eager" decoding="async" style="display:block;width:min(100%, 960px);height:auto;border-radius:18px;margin:32px auto" />
      <section aria-label="Detalles del servicio" class="section-desc">
        <p v-for="detail in landing.details" :key="detail">{{ detail }}</p>
      </section>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">
        <a class="btn btn-primary" href="/cotizaciones">Solicitar cotización</a>
        <a class="btn btn-outline" href="/servicios">Ver todos los servicios</a>
      </div>
      <nav aria-label="Otros servicios" style="display:flex;gap:9px 18px;flex-wrap:wrap;margin-top:32px">
        <a href="/servicios/agencia-aduanal">Agencia aduanal</a>
        <a href="/servicios/transporte-maritimo">Transporte marítimo</a>
        <a href="/servicios/transporte-terrestre">Transporte terrestre</a>
        <a href="/servicios/transporte-aereo">Transporte aéreo</a>
        <a href="/servicios/consolidado-lcl">Carga consolidada LCL</a>
      </nav>
    </main>
    <SiteFooter />
  </div>
</template>
