<script setup lang="ts">
import SiteHeader from '@legacy/components/SiteHeader.vue'
import SiteFooter from '@legacy/components/SiteFooter.vue'
import companies from '../../../../seo/companies.json'
type Company=(typeof companies)[keyof typeof companies]
const slug=String(useRoute().params.slug||'')
const company=(companies as Record<string,Company>)[slug]
if(!company) throw createError({statusCode:404,statusMessage:'Empresa no encontrada'})
const path='/empresas/'+slug
const url='https://www.logisticacastrofallas.com'+path
usePublicSeo({path,title:company.title,description:company.description,schema:[
{'@type':'Organization','@id':url+'#organizacion',name:company.name,description:company.description,url,parentOrganization:{'@id':'https://www.logisticacastrofallas.com/#organizacion'}},
{'@type':'BreadcrumbList',itemListElement:[
{'@type':'ListItem',position:1,name:'Inicio',item:'https://www.logisticacastrofallas.com/'},
{'@type':'ListItem',position:2,name:'Empresas',item:'https://www.logisticacastrofallas.com/empresas'},
{'@type':'ListItem',position:3,name:company.name,item:url}]}]})
</script>
<template>
<div class="app-site">
  <SiteHeader active="nosotros"/>
  <main class="container company-seo">
    <nav aria-label="Ruta de navegación"><a href="/">Inicio</a> / <a href="/empresas">Empresas</a> / {{ company.name }}</nav>
    <p class="section-tag">Empresa de Grupo Castro Fallas</p>
    <h1>{{ company.name }}</h1>
    <p class="company-seo__lead">{{ company.intro }}</p>
    <a class="company-seo__cta" href="mailto:comercial@castrofallas.com">Consultar al equipo comercial →</a>
    <section>
      <h2>Información relacionada</h2>
      <ul><li v-for="item in company.related" :key="item.href"><a :href="item.href">{{ item.name }}</a></li></ul>
    </section>
    <section>
      <h2>Preguntas frecuentes</h2>
      <article v-for="item in company.faq" :key="item.q" class="company-seo__faq">
        <h3>{{ item.q }}</h3><p>{{ item.a }}</p>
      </article>
    </section>
    <p><a href="/empresas">Ver todas las empresas del grupo</a></p>
  </main>
  <SiteFooter/>
</div>
</template>
<style scoped>
.company-seo{padding-top:60px;padding-bottom:90px;min-height:65vh}
.company-seo h1{font-size:clamp(34px,5vw,58px);margin:15px 0}
.company-seo h2{font-size:clamp(25px,3vw,34px);margin:40px 0 15px}
.company-seo h3{font-size:20px}
.company-seo__lead{font-size:20px;line-height:1.7;max-width:900px}
.company-seo__cta{display:inline-block;margin:16px 0;background:#a30a26;color:white;padding:13px 20px;border-radius:8px;text-decoration:none}
.company-seo__faq{border-bottom:1px solid rgba(150,150,150,.35);padding:10px 0}
.company-seo p,.company-seo li{line-height:1.75}
</style>