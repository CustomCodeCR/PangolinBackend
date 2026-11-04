#!/usr/bin/env python3
"""Compare the same compiled Vue pages through legacy Nginx and hybrid Nginx.

These read-only, guest-session tests intentionally do not exercise authenticated
mutations or invent a login. Those require an isolated real backend test fixture.
"""
import sys
from urllib.parse import urlsplit
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

LEGACY, HYBRID = [x.rstrip("/") for x in sys.argv[1:3]]
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
PAGES = (
    ("/bienvenidos", "login-screen"),
    ("/cotizaciones?servicio=Maritime", "quote-access-status--blocked"),
    ("/cotizaciones/nuevo", "quote-access-status--blocked"),
    ("/tracking", "quote-access-status--blocked"),
    ("/itinerario", None),
    ("/administracion", None),
    ("/administracion/cotizaciones-oficiales", None),
    ("/admin/contenido", None),
    ("/admin/usuarios", None),
)

def snapshot(driver, base, route, marker):
    driver.get(base + route)
    # Guest-only protected routes must complete their authorization redirect
    # before we inspect the DOM. Otherwise we may sample a half-loaded page.
    target_paths = (
        ("/", "/home") if route == "/itinerario"
        else ("/bienvenidos",) if route.startswith(("/administracion", "/admin/"))
        else None
    )
    if target_paths:
        WebDriverWait(driver, 25).until(
            lambda d: urlsplit(d.current_url).path in target_paths
        )
    # Redirects are asynchronous because the frontend checks /api/auth/me.
    def ready(d):
        state = d.execute_script("""
          const root = document.querySelector('#app');
          const pending = root?.querySelector('[aria-busy="true"]');
          return document.readyState === 'complete' &&
            (document.querySelector('.login-screen') ||
             document.querySelector('.quote-access-status--blocked') ||
             document.querySelector('.home-hero') ||
             (root && root.textContent.trim().length > 40 && !pending));
        """)
        if not state:
            return False
        if marker:
            return d.find_elements("css selector", "." + marker) or False
        # For a protected redirect, allow the browser to finish the route change.
        return True

    WebDriverWait(driver, 25).until(ready)
    if marker:
        WebDriverWait(driver, 10).until(
            lambda d: d.find_element("css selector", "." + marker).is_displayed()
        )
    result = driver.execute_script("""
       const pick = s => !!document.querySelector(s);
       const u = new URL(location.href);
       const h1 = document.querySelector('main h1, h1');
       return {
         path: u.pathname,
         pageTitle: document.title,
         heading: h1?.textContent?.trim().replace(/\s+/g, ' ') || '',
         login: pick('.login-screen'),
         deniedQuote: pick('.quote-access-status--blocked'),
         loginPassword: pick('input[type="password"]'),
         quoteFormVisible: pick('.official-panel, .official-success'),
         images: [...document.images].filter(img => img.currentSrc || img.src).map(img => ({
             path: new URL(img.currentSrc || img.src, location.href).pathname,
             good: img.complete && img.naturalWidth > 0
         })),
         badServerPage: /502 Bad Gateway|503 Service Unavailable|404 · Página no encontrada/.test(
           document.body?.innerText?.slice(0,400) || '')
       }
    """)
    assert not result["badServerPage"], f"Server error at {base + route}: {result}"
    if marker:
        assert result["login"] or result["deniedQuote"], f"Guest access exposed restricted content: {base + route}"
        assert not result["quoteFormVisible"], f"Guest could see authenticated quote form: {base + route}"
    # Redirected public Home has its own full CMS image audit. On private
    # pages, explicitly decode the published logo instead of confusing
    # pending lazy loading with a broken file.
    if result["path"] not in ("/", "/home"):
        media = driver.execute_async_script("""
          const done = arguments[arguments.length - 1];
          const imgs = [...document.images].filter(
            img => (img.currentSrc || img.src).includes('/api/content/media/')
          );
          if (!imgs.length) return done({count:0, broken:[]});
          Promise.all(imgs.map(img => new Promise(resolve => {
            img.loading = 'eager';
            if (img.complete) return resolve();
            img.addEventListener('load', resolve, {once:true});
            img.addEventListener('error', resolve, {once:true});
            setTimeout(resolve, 8000);
          }))).then(() => done({
            count: imgs.length,
            broken: imgs.filter(img => !img.complete || img.naturalWidth < 1).map(img => img.src)
          }));
        """)
        assert not media["broken"], f"CMS media unavailable at {base + route}: {media}"
    return result

for width, height, viewport in ((1280, 900, "desktop"), (390, 844, "mobile")):
    opts = Options()
    for flag in ("--headless=new", "--no-sandbox", "--disable-gpu",
                 "--disable-dev-shm-usage", "--disable-extensions", "--no-first-run"):
        opts.add_argument(flag)
    driver = webdriver.Chrome(options=opts)
    try:
        driver.set_window_size(width, height)
        for i, (route, marker) in enumerate(PAGES):
            old = snapshot(driver, LEGACY, route, marker)
            new = snapshot(driver, HYBRID, route, marker)
            # Different hosts may canonicalize '/home' to '/', but private routes
            # themselves must never switch to an unrelated SSR page.
            normalize = lambda s: "/" if s == "/home" else s
            assert normalize(old["path"]) == normalize(new["path"]), (
                f"Navigation regression {route}: legacy={old['path']}, hybrid={new['path']}"
            )
            if old["path"] not in ("/", "/home"):
                for key in ("heading", "login", "deniedQuote", "quoteFormVisible"):
                    assert old[key] == new[key], (
                        f"Private page parity failure {route} ({key}): {old[key]} != {new[key]}"
                    )
            if i in (0, 1, 2, 3):
                driver.save_screenshot(str(ARTIFACTS / f"private-hybrid-{viewport}-{i}.png"))
            print(f"PASS guest parity {viewport} {route}: {old['path']} => {new['path']}", flush=True)
    finally:
        driver.quit()
print("PASS compiled Vue private pages match through both gateways as guests")
