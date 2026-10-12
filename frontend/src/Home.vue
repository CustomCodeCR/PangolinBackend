<script setup lang="ts">
import {computed, ref} from 'vue'
import SiteHeader from './components/SiteHeader.vue'
import SiteFooter from './components/SiteFooter.vue'
import WorldGlobe from './components/WorldGlobe.vue'
import {homeNews, services, faqs, type ServiceKey} from './content'
const activeService=ref<ServiceKey>('Air')
const selectedService=computed(()=>services.find(s=>s.key===activeService.value) ?? services[0])
const expandedFaq=ref<number|null>(0)
const promises=[{title:'Logística + Aduanas',subtitle:'Un solo equipo para acompañar tu operación.',icon:'↗'},{title:'Conexiones internacionales',subtitle:'Unimos destinos con soluciones a la medida.',icon:'◎'},{title:'Atención cercana',subtitle:'Personas que entienden tu negocio.',icon:'✦'}]
</script>
<template>
<div class="app-site">
  <section class="home-hero"><SiteHeader overlay active="servicios"/>
    <div class="container home-hero__content"><p class="section-tag light-tag"><span class="tag-line"></span> GRUPO CASTRO FALLAS</p><h1>Conectamos tu carga<br/><span>con el mundo.</span></h1><p>Soluciones logísticas, aduaneras y de transporte internacional con atención cercana y experiencia regional.</p><div class="hero-actions"><a href="#servicios" class="btn btn-primary">Explorar servicios <span>↗</span></a><a href="mailto:comercial@castrofallas.com" class="btn btn-outline-light">Hablar con nosotros <span>↗</span></a></div></div>
    <div class="hero-vertical-text">LOGÍSTICA SIN FRONTERAS · COSTA RICA</div><div class="hero-bottom-gradient"></div>
  </section>
  <main>
    <section class="news-band-section" aria-label="Noticias destacadas"><div class="container"><div class="news-band"><div class="news-band-header"><span>NEWS &nbsp; NOTICIAS &nbsp; NEWS &nbsp; NOTICIAS</span><a href="/noticias">VER TODAS ↗</a></div><div class="news-band-grid"><a v-for="item in homeNews" :key="item.title" href="/noticias" class="news-band-tile"><img :src="item.image" :alt="item.title" loading="lazy"/><div class="news-band-tile__overlay"><small>{{item.category}}</small><strong>{{item.title}}</strong></div></a></div><div class="news-band-bottom" aria-hidden="true">NEWS &nbsp; NOTICIAS &nbsp; NEWS &nbsp; NOTICIAS &nbsp; NEWS</div></div></div></section>
    <section id="servicios" class="services-section section-spacing"><div class="container"><p class="section-tag center">NUESTROS SERVICIOS</p><h2 class="section-title centered">Soluciones logísticas <span>para cada necesidad.</span></h2><p class="section-desc centered">Conectamos tus cargas con diferentes destinos de forma segura, eficiente y confiable.</p>
      <div class="service-select" role="tablist" aria-label="Tipo de transporte"><button v-for="service in services" :key="service.key" class="service-tab" :class="{'service-tab--active':activeService===service.key}" type="button" role="tab" :aria-selected="activeService===service.key" @click="activeService=service.key"><span class="service-tab__icon">{{service.icon}}</span><span>{{service.label}}</span></button></div>
      <div class="service-feature" :key="selectedService.key"><img :src="selectedService.photo" :alt="selectedService.title" loading="lazy"/><div class="service-feature__gradient"></div><span class="service-feature__vertical">{{selectedService.label}}</span><div class="service-feature__content"><span class="section-tag light-tag">SERVICIO DESTACADO · {{selectedService.label}}</span><h3>{{selectedService.title}}</h3><p>{{selectedService.detail}}</p><a class="btn btn-white" :href="`/cotizaciones?servicio=${selectedService.key}`">Cotizar este servicio <span>↗</span></a></div><div class="service-feature__index">0{{services.findIndex(s=>s.key===activeService)+1}} / 03</div></div>
    </div></section>
    <section class="stats-band"><div class="container stats-grid"><div><strong>+25</strong><span>Oficinas<br/>a nivel mundial</span></div><div><strong>#1</strong><span>Consolidados terrestres<br/>Panamá – CRC</span></div><div><strong>+105</strong><span>Rutas de transporte<br/>internacional</span></div><div><strong>24/7</strong><span>Atención al cliente</span></div></div></section>
    <section id="embarque" class="tracking-section section-spacing"><div class="container tracking-home-grid"><div class="tracking-home-copy"><p class="section-tag">CONEXIONES SIN FRONTERAS</p><h2 class="section-title">Consulta tu<br/><span>embarque.</span></h2><p class="section-desc">Explorá nuestro globo interactivo y descubrí cómo conectamos a Costa Rica con el mundo.</p><a class="btn btn-primary" href="/tracking">Rastrear ahora <span>↗</span></a><small>Visualización de muestra: seguimiento real pendiente de integración.</small></div><WorldGlobe /></div></section>
    <section id="soluciones" class="experience-section section-spacing"><div class="container"><div class="experience-intro"><div><p class="section-tag">UNA EXPERIENCIA QUE NOS RESPALDA</p><h2 class="section-title">Experiencia para<br/>mover tu <span>negocio.</span></h2></div><div class="experience-intro__card"><span class="experience-icon">↗</span><h3>Logística + Aduanas.</h3><p>Un solo equipo para acompañar tu operación.</p></div></div>
      <div class="promise-grid"><article v-for="(p,i) in promises" :key="p.title" class="promise-card"><div class="promise-card__top"><span>{{p.icon}}</span><small>0{{i+1}}</small></div><h3>{{p.title}}</h3><p>{{p.subtitle}}</p><div class="promise-card__dash"></div></article></div><div class="carousel-dots" aria-label="Tres pilares de servicio"><span class="active"></span><span></span><span></span></div>
    </div></section>
    <section class="faq-section section-spacing"><div class="faq-background"></div><div class="container faq-content"><p class="section-tag light-tag center">TE AYUDAMOS A RESOLVER TUS DUDAS</p><h2 class="section-title centered white-title">Información útil para tu<br/>operación.</h2><div class="faq-list"><div v-for="(faq,i) in faqs" :key="faq.q" class="faq-item" :class="{'faq-item--open':expandedFaq===i}"><button :aria-expanded="expandedFaq===i" type="button" @click="expandedFaq=expandedFaq===i?null:i"><span>{{faq.q}}</span><strong>{{expandedFaq===i?'−':'+'}}</strong></button><div v-if="expandedFaq===i" class="faq-answer">{{faq.a}}</div></div></div></div></section>
    <section class="home-last-cta"><div class="container home-last-cta__inner"><div><p class="section-tag">EMPECEMOS A MOVER TU CARGA</p><h2>Tu próximo destino<br/><span>empieza aquí.</span></h2></div><a href="/cotizaciones" class="btn btn-primary">Solicitá una cotización <span>↗</span></a></div></section>
  </main><SiteFooter />
</div>
</template>
