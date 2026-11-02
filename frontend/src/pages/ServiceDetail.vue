<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import IconSymbol from '../components/IconSymbol.vue'
import SiteFooter from '../components/SiteFooter.vue'
import SiteHeader from '../components/SiteHeader.vue'
import { servicePages } from '../content/servicePages'

const { locale } = useI18n({ useScope: 'global' })
const language = computed(() => locale.value.toLowerCase().startsWith('es') ? 'es' : 'en')
const page = computed(() => {
  const slug = window.location.pathname.replace(/\/+$/, '').split('/').pop()
  return servicePages.find(item => item.slug === slug) ?? servicePages[0]
})
const text = <T extends { es: string; en: string }>(value: T) => value[language.value]
</script>

<template>
  <div class="app-site service-detail-page">
    <SiteHeader active="soluciones" />
    <main>
      <section class="service-detail-hero">
        <div class="container service-detail-hero__inner">
          <nav class="service-detail-breadcrumbs" :aria-label="language === 'es' ? 'Migas de pan' : 'Breadcrumbs'">
            <a href="/home">{{ language === 'es' ? 'Inicio' : 'Home' }}</a>
            <span aria-hidden="true">/</span>
            <a href="/servicios">{{ language === 'es' ? 'Servicios' : 'Services' }}</a>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{{ text(page.title) }}</span>
          </nav>
          <div class="service-detail-hero__grid">
            <div class="service-detail-hero__copy">
              <p class="section-tag">{{ text(page.eyebrow) }}</p>
              <h1>{{ text(page.title) }}</h1>
              <p class="service-detail-hero__lead">{{ text(page.lead) }}</p>
              <p class="service-detail-location"><IconSymbol glyph="⌖" :size="18" />{{ text(page.location) }}</p>
              <a class="btn btn-primary" :href="`/cotizaciones?servicio=${page.slug}`">
                {{ text(page.quoteLabel) }} <IconSymbol glyph="↗" />
              </a>
            </div>
            <figure class="service-detail-hero__media">
              <img :src="page.image" :alt="text(page.imageAlt)" width="1120" height="630" fetchpriority="high" />
              <figcaption>{{ language === 'es' ? 'Soluciones logísticas de Grupo Castro Fallas' : 'Logistics solutions by Grupo Castro Fallas' }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section class="service-detail-content section-spacing">
        <div class="container">
          <div class="service-detail-content__intro">
            <p class="section-tag">{{ language === 'es' ? 'ASÍ TE ACOMPAÑAMOS' : 'HOW WE SUPPORT YOU' }}</p>
            <h2>{{ language === 'es' ? 'Una operación clara desde el primer paso.' : 'A clear operation from the first step.' }}</h2>
          </div>
          <div class="service-detail-content__grid">
            <article v-for="(section, index) in page.sections" :key="section.title.es" class="service-detail-card">
              <span class="service-detail-card__number">0{{ index + 1 }}</span>
              <h3>{{ text(section.title) }}</h3>
              <p>{{ text(section.body) }}</p>
            </article>
          </div>
          <section class="service-detail-faq" :aria-labelledby="'service-faq-title'">
            <p class="section-tag">{{ language === 'es' ? 'PREGUNTAS FRECUENTES' : 'FREQUENTLY ASKED QUESTIONS' }}</p>
            <h2 id="service-faq-title">{{ language === 'es' ? 'Respuestas sobre este servicio.' : 'Answers about this service.' }}</h2>
            <details v-for="faq in page.faqs" :key="faq.question.es" class="service-detail-faq__item">
              <summary>{{ text(faq.question) }}</summary>
              <p>{{ text(faq.answer) }}</p>
            </details>
          </section>
          <aside class="service-detail-contact">
            <div>
              <p class="section-tag">{{ language === 'es' ? '¿TENÉS UNA OPERACIÓN EN MENTE?' : 'PLANNING A SHIPMENT?' }}</p>
              <h2>{{ language === 'es' ? 'Revisemos los detalles.' : 'Let’s review the details.' }}</h2>
              <p>{{ language === 'es' ? 'La disponibilidad, la ruta y las condiciones se confirman con el equipo para cada solicitud.' : 'Availability, route and terms are confirmed with the team for each enquiry.' }}</p>
            </div>
            <a class="btn btn-primary" href="mailto:comercial@castrofallas.com">{{ language === 'es' ? 'Contactar a Castro Fallas' : 'Contact Castro Fallas' }} <IconSymbol glyph="↗" /></a>
          </aside>
        </div>
      </section>

    </main>
    <SiteFooter />
  </div>
</template>

<style scoped>
.service-detail-page { min-height: 100vh; }
.service-detail-hero { padding: 48px 0 76px; color: #fff; background: radial-gradient(ellipse at 12% 8%, rgba(178, 11, 45, .9), transparent 56%), linear-gradient(112deg, #2b111b 0%, #101728 75%); }
.service-detail-hero__inner { max-width: 1320px; }
.service-detail-breadcrumbs { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:46px; color:rgba(255,255,255,.72); font-size:13px; }
.service-detail-breadcrumbs a { color:inherit; text-decoration:underline; text-underline-offset:3px; }
.service-detail-breadcrumbs [aria-current="page"] { color:#fff; }
.service-detail-hero__grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(360px,.9fr); align-items:center; gap:clamp(38px,7vw,96px); }
.service-detail-hero__copy { max-width:670px; }
.service-detail-hero__copy .section-tag { color:#ff647b; letter-spacing:.16em; font-weight:800; }
.service-detail-hero h1 { max-width:700px; margin:18px 0 22px; color:#fff; font-size:clamp(42px,6vw,76px); line-height:.99; letter-spacing:-.045em; }
.service-detail-hero__lead { max-width:620px; color:#f4e9ec; font-size:clamp(17px,1.65vw,22px); line-height:1.6; }
.service-detail-location { display:flex; align-items:center; gap:9px; margin:26px 0 30px; color:#fff; font-weight:700; }
.service-detail-location :deep(svg) { color:#ff647b; }
.service-detail-hero__media { position:relative; overflow:hidden; min-height:360px; margin:0; border:1px solid rgba(255,255,255,.28); border-radius:28px; background:rgba(255,255,255,.08); box-shadow:0 22px 70px rgba(0,0,0,.25); }
.service-detail-hero__media img { display:block; width:100%; height:100%; min-height:360px; object-fit:cover; }
.service-detail-hero__media::after { position:absolute; inset:35% 0 0; content:""; background:linear-gradient(transparent,rgba(13,16,29,.65)); pointer-events:none; }
.service-detail-hero__media figcaption { position:absolute; z-index:1; right:22px; bottom:18px; left:22px; color:#fff; font-size:13px; font-weight:700; }
.service-detail-content { background:var(--surface,#f7f4f5); }
.service-detail-content__intro { max-width:740px; margin-bottom:38px; }
.service-detail-content__intro h2,.service-detail-contact h2 { margin:12px 0; color:var(--ink,#20242b); font-size:clamp(30px,4.3vw,52px); line-height:1.05; letter-spacing:-.035em; }
.service-detail-content__grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
.service-detail-card { min-height:245px; padding:30px; border:1px solid rgba(128,128,140,.28); border-radius:24px; background:color-mix(in srgb, var(--surface,#fff) 78%, transparent); box-shadow:0 12px 30px rgba(16,20,34,.06); }
.service-detail-card__number { color:#b20c2a; font-size:13px; font-weight:900; letter-spacing:.12em; }
.service-detail-card h3 { margin:34px 0 12px; color:var(--ink,#20242b); font-size:24px; }
.service-detail-card p,.service-detail-contact p { max-width:680px; color:var(--muted,#595b65); line-height:1.7; }
.service-detail-contact { display:flex; justify-content:space-between; align-items:center; gap:30px; margin-top:24px; padding:clamp(25px,4vw,48px); border:1px solid rgba(178,11,45,.25); border-radius:24px; background:linear-gradient(112deg,rgba(178,11,45,.09),rgba(255,255,255,.4)); }
.service-detail-faq { max-width:900px; margin:54px auto 30px; }
.service-detail-faq > .section-tag { color:#b20c2a; font-size:12px; font-weight:900; letter-spacing:.13em; }
.service-detail-faq h2 { margin:12px 0 24px; color:var(--ink,#20242b); font-size:clamp(28px,3.6vw,42px); line-height:1.08; letter-spacing:-.035em; }
.service-detail-faq__item { padding:20px 22px; border:1px solid rgba(128,128,140,.25); border-radius:16px; background:color-mix(in srgb,var(--surface,#fff) 86%,transparent); }
.service-detail-faq__item + .service-detail-faq__item { margin-top:10px; }
.service-detail-faq__item summary { color:var(--ink,#20242b); font-weight:800; cursor:pointer; }
.service-detail-faq__item p { margin:14px 0 0; color:var(--muted,#595b65); line-height:1.7; }
.service-detail-contact h2 { font-size:clamp(28px,3.6vw,42px); }
.service-detail-contact .section-tag { color:#b20c2a; font-size:12px; font-weight:900; letter-spacing:.13em; }
:global(html.theme-dark) .service-detail-content { --surface:#101728; --ink:#fff; --muted:#d4d6df; }
:global(html:not(.theme-dark)) .service-detail-content { --surface:#fff; --ink:#22242b; --muted:#585a64; }
:global(html.theme-dark) .service-detail-card { background:rgba(255,255,255,.055); border-color:rgba(255,255,255,.16); }
:global(html.theme-dark) .service-detail-contact { background:linear-gradient(112deg,rgba(178,11,45,.2),rgba(16,23,40,.8)); }
@media (max-width:800px) { .service-detail-hero { padding:76px 0 56px; } .service-detail-hero__grid { grid-template-columns:1fr; } .service-detail-hero__media,.service-detail-hero__media img { min-height:260px; } .service-detail-content__grid { grid-template-columns:1fr; } .service-detail-card { min-height:0; } .service-detail-card h3 { margin-top:24px; } .service-detail-contact { align-items:flex-start; flex-direction:column; } }
</style>
