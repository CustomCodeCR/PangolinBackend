<script setup lang="ts">
import SiteHeader from '@legacy/components/SiteHeader.vue'
import SiteFooter from '@legacy/components/SiteFooter.vue'
import companies from '../../../../seo/companies.json'
const items=Object.entries(companies).map(([slug,c])=>({...c,url:'/empresas/'+slug}))
usePublicSeo({path:'/empresas',title:'Empresas de Grupo Castro Fallas | Costa Rica',description:'Conozca Aduanera Castro Fallas, Transporte Castro Fallas y Neriteka, empresas vinculadas a Grupo Castro Fallas.',schema:[{'@type':'ItemList',name:'Empresas del grupo',itemListElement:items.map((x,i)=>({'@type':'ListItem',position:i+1,name:x.name,url:'https://www.logisticacastrofallas.com'+x.url}))}]})
</script>
<template>
<div class="app-site">
  <SiteHeader active="nosotros"/>
  <main class="container companies-seo">
    <nav aria-label="Ruta de navegación"><a href="/">Inicio</a> / Empresas</nav>
    <p class="section-tag">Grupo Castro Fallas</p>
    <h1>Empresas del grupo</h1>
    <p class="companies-seo__lead">Conozca las empresas vinculadas a Grupo Castro Fallas y su información corporativa.</p>
    <section class="companies-seo__grid">
      <article v-for="company in items" :key="company.url" class="companies-seo__card">
        <h2><a :href="company.url">{{ company.name }}</a></h2>
        <p>{{ company.description }}</p>
        <a :href="company.url">Conocer empresa →</a>
      </article>
    </section>
  </main>
  <SiteFooter/>
</div>
</template>
<style scoped>
.companies-seo{padding-top:60px;padding-bottom:90px;min-height:65vh}
.companies-seo h1{font-size:clamp(34px,5vw,58px);margin:15px 0}
.companies-seo__lead{font-size:20px;line-height:1.7;max-width:850px}
.companies-seo__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px;margin:35px 0}
.companies-seo__card{padding:25px;border:1px solid rgba(150,150,150,.35);border-radius:12px}
.companies-seo__card h2{font-size:23px}
.companies-seo__card p{line-height:1.7}
</style>