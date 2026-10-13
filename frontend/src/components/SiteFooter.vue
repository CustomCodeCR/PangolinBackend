<template>
  <footer class="site-footer">
    <div class="container footer-top">
      <div class="footer-identity"><a href="/home"><img src="/images/logo.png" alt="Castro Fallas" /></a><p>{{ $t('phrases.p099') }}</p></div>
      <div><h3>{{ $t('phrases.p096') }}</h3><a href="tel:+50622726772">+506 2272-6772</a><a href="mailto:comercial@castrofallas.com">comercial@castrofallas.com</a></div>
      <div><h3>{{ $t('phrases.p097') }}</h3><a href="/servicios">{{ $t('navLinks.soluciones') }}</a><a href="/tracking">{{ $t('custom.home.trackingTitle') }}</a><a href="/cotizaciones">{{ $t('phrases.p098') }}</a></div>
    </div>
    <div class="container footer-legal" style="display:flex;flex-direction:column;align-items:center;text-align:center"><nav style="display:flex;width:100%;justify-content:center;text-align:center"><a href="/privacidad">{{ $t('legal.footerPrivacy') }}</a><span aria-hidden="true">·</span><a href="/terminos">{{ $t('legal.footerTerms') }}</a><span aria-hidden="true">·</span><a href="/cookies">{{ $t('legal.footerCookies') }}</a><span aria-hidden="true">·</span><a href="/licencias">{{ $t('legal.footerLicenses') }}</a></nav></div>
    <div class="container footer-bottom"><span>© {{ new Date().getFullYear() }} Castro Fallas</span><span>{{ $t('phrases.p100') }}</span></div>
  </footer>
</template>
