<script setup lang="ts">
import {news} from '../content'
import SiteHeader from '../components/SiteHeader.vue'
import SiteFooter from '../components/SiteFooter.vue'
</script>
<template>
<div class="app-site">
  <section class="inner-hero inner-hero--news"><SiteHeader active="noticias" overlay /><div class="container inner-hero__copy"><p class="section-tag light-tag">ACTUALIDAD E INNOVACIÓN</p><h1>Los robots están ahora<br/>en las fábricas.</h1><p>Innovación y actualidad en las operaciones logísticas. Contenido de demostración.</p><a href="#actualidad" class="btn btn-primary">Explorar noticias <span>↓</span></a></div></section>
  <main id="actualidad" class="section-spacing"><div class="container"><div class="section-topline"><span class="section-tag">NOTICIAS</span><span class="small-muted">Artículos ilustrativos para el prototipo</span></div><h2 class="section-title">Lo que mueve <span>al mundo.</span></h2><div class="news-featured"><article v-for="(article,i) in news" :key="article.title" class="news-featured-card"><div class="news-featured-card__image"><img :src="article.image" :alt="article.title" loading="lazy"/></div><div class="news-featured-card__copy"><span class="section-tag">{{article.category}} · NOTICIA {{String(i+1).padStart(2,'0')}}</span><h3>{{article.title}}</h3><p>{{article.description}}</p><span class="demo-article-label">Contenido de muestra · Artículo pendiente</span></div></article></div></div></main>
  <div class="red-cta"><div class="container red-cta__inner"><div><p class="section-tag light-tag">¿NECESITÁS UNA SOLUCIÓN?</p><h2>Movemos tus proyectos.</h2></div><a href="/cotizaciones" class="btn btn-white">Solicitar cotización <span>↗</span></a></div></div>
  <SiteFooter />
</div>
</template>
