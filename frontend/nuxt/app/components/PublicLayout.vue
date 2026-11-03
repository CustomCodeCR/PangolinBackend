<template>
  <div class="site-shell">
    <header class="site-header">
      <nav class="site-nav" aria-label="Navegación principal">
        <a class="brand" href="/" aria-label="Grupo Castro Fallas, inicio"><img src="/images/logo.png" alt="" width="50" height="50" /> <span>Grupo Castro Fallas</span></a>
        <div class="nav-links">
          <a href="/">Inicio</a>
          <a href="/nosotros">Nosotros</a>
          <a href="/servicios">Servicios</a>
          <a href="/noticias">Noticias</a>
          <a href="/cotizaciones">Cotizaciones</a>
        </div>
      </nav>
    </header>
    <slot />
    <footer class="site-footer">
      <p><strong>Grupo Castro Fallas</strong> · Logística y comercio exterior en Costa Rica.</p>
      <p>Consultas: <a href="mailto:comercial@castrofallas.com">comercial@castrofallas.com</a> · <a href="tel:+50622726772">+506 2272-6772</a></p>
    </footer>
  </div>
</template>
