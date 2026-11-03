#!/usr/bin/env python3
"""Guard rendering parity of migrated public routes against compiled Vue.

The test uses a shared published-CMS fixture and the same mock backend. It is
a functional DOM comparison, not a substitute for visual review on real iOS.
"""
import sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

LEGACY, HYBRID = [x.rstrip("/") for x in sys.argv[1:3]]
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
ROUTES = (
    "/", "/nosotros", "/servicios", "/noticias",
    "/servicios/almacenamiento-fiscal", "/servicios/bodegaje-general",
    "/servicios/agenciamiento-aduanal", "/servicios/consolidadora-de-carga",
    "/servicios/transporte-maritimo", "/servicios/transporte-terrestre",
    "/servicios/transporte-aereo", "/servicios/transporte-internacional",
    "/servicios/transporte-local", "/servicios/transporte-panama-costa-rica"
)

def snapshot(driver, base, route):
    driver.get(base + route)
    WebDriverWait(driver, 25).until(lambda d: d.execute_script("""
      const h1 = document.querySelector('h1');
      return document.readyState === 'complete' &&
        h1 && h1.textContent.trim().length > 0;
    """))
    # The CMS fixture replaces the logo on BOTH apps after hydration. Compare
    # only after that async request, not on two different loading frames.
    WebDriverWait(driver, 20).until(lambda d: d.execute_script("""
      return document.querySelector('a.site-brand img')?.getAttribute('src')
        ?.includes('/api/content/media/');
    """))
    result = driver.execute_script("""
      const heading = document.querySelector('h1');
      const normalize = s => (s || '').trim().replace(/\s+/g, ' ');
      const main = document.querySelector('main') || document.body;
      const links = [...document.querySelectorAll('a[href]')].map(a => {
        try {
          const u = new URL(a.getAttribute('href'), location.href);
          return u.origin === location.origin ? u.pathname : '';
        } catch { return ''; }
      }).filter(x => x.startsWith('/'));
      const unique = [...new Set(links)].sort();
      const logo = document.querySelector('a.site-brand img');
      const hero = document.querySelector('.home-hero');
      return {
        route: location.pathname,
        h1: normalize(heading?.textContent),
        mainExists: !!main,
        serviceLinks: unique.filter(x => x.startsWith('/servicios/')),
        authLinks: unique.filter(x => ['/bienvenidos','/cotizaciones','/tracking'].includes(x)),
        logoCms: logo?.getAttribute('src')?.includes('/api/content/media/') || false,
        heroCms: hero ? getComputedStyle(hero).backgroundImage.includes('/api/content/media/') : null,
        errorScreen: /502 Bad Gateway|503 Service Unavailable|404 · Página no encontrada/.test(
          document.body.innerText.slice(0, 400)
        )
      };
    """)
    assert not result["errorScreen"], f"Error in {base + route}: {result}"
    assert result["logoCms"], f"Published CMS logo did not load: {base + route}"
    assert result["mainExists"], f"Missing main on {base + route}"
    return result

opts = Options()
for flag in ("--headless=new", "--no-sandbox", "--disable-gpu",
             "--disable-dev-shm-usage", "--disable-extensions", "--no-first-run"):
    opts.add_argument(flag)

driver = webdriver.Chrome(options=opts)
try:
    driver.set_window_size(1366, 900)
    for index, route in enumerate(ROUTES):
        old = snapshot(driver, LEGACY, route)
        if index < 4:
            driver.save_screenshot(str(ARTIFACTS / f"public-vue-{index}.png"))
        new = snapshot(driver, HYBRID, route)
        if index < 4:
            driver.save_screenshot(str(ARTIFACTS / f"public-nuxt-{index}.png"))
        assert old["h1"] == new["h1"], (
            f"H1 changed after migration {route}: Vue={old['h1']!r}, Nuxt={new['h1']!r}"
        )
        assert old["serviceLinks"] == new["serviceLinks"], (
            f"Service link destinations changed on {route}: "
            f"legacy={old['serviceLinks']}, hybrid={new['serviceLinks']}"
        )
        assert old["authLinks"] == new["authLinks"], (
            f"Login/quotes/tracking links changed on {route}"
        )
        if route == "/":
            assert old["heroCms"] and new["heroCms"], (
                f"Published CMS hero background not present in both apps: {old}, {new}"
            )
        print(f"PASS public parity {route}: H1, internal links, published CMS assets", flush=True)
finally:
    driver.quit()
print("PASS reused public Vue components preserve content and destinations in Nuxt hybrid")
