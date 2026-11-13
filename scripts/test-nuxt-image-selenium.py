#!/usr/bin/env python3
"""Audit decoded HTML images, CSS backgrounds and published CMS media on Nuxt.

CSS backgrounds and media selected in the visual editor are intentionally
tested, not just the default <img> fallbacks.
"""
import sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1].rstrip("/")
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)
CMS_MEDIA = "/api/content/media/11111111-1111-1111-1111-111111111111/file"

options = Options()
for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
            "--disable-dev-shm-usage", "--disable-extensions",
            "--no-first-run", "--window-size=1280,900"):
    options.add_argument(arg)

driver = webdriver.Chrome(options=options)
driver.set_script_timeout(40)
try:
    for index, route in enumerate((
        "/", "/nosotros", "/servicios", "/servicios/transporte-maritimo",
        "/servicios/bodegaje-general", "/noticias", "/empresas",
    )):
        driver.get(BASE + route)
        WebDriverWait(driver, 20).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        if route == "/":
            # Verify the CMS-published media actually replaces the fallback in
            # the Nuxt client, including the hero CSS background.
            WebDriverWait(driver, 20).until(
                lambda d: d.execute_script("""
                  const logo = document.querySelector('a.site-brand img');
                  const hero = document.querySelector('.home-hero');
                  return logo?.getAttribute('src')?.includes('/api/content/media/') &&
                    hero && getComputedStyle(hero).backgroundImage.includes('/api/content/media/');
                """)
            )
            # Static JPEG fallback selects modern formats. CMS media must never
            # inherit static sources, since publication is permission-checked.
            about = driver.execute_script("""
              const img = document.querySelector('.home-about-preview__image img');
              const picture = img?.closest('picture');
              return {
                original: img?.getAttribute('src') || '',
                selected: img?.currentSrc || '',
                sources: [...(picture?.querySelectorAll('source') || [])]
                  .map(source => source.getAttribute('srcset'))
              };
            """)
            assert about["original"], f"Missing About image: {about}"
            if about["original"] == "/images/about-operations-enhanced.jpg":
                assert about["selected"].endswith((".avif", ".webp")), (
                    f"Static About fallback was not optimized: {about}"
                )
                assert len(about["sources"]) == 2, f"Missing static AVIF/WebP alternatives: {about}"
            else:
                assert not about["sources"], (
                    f"CMS-managed About media received static image sources: {about}"
                )
        if route == "/servicios":
            WebDriverWait(driver, 20).until(
                lambda d: d.execute_script("""
                  return [...document.querySelectorAll('.complementary-card img')]
                    .some(img => img.src.includes('/api/content/media/'));
                """)
            )

        report = driver.execute_async_script("""
          const done = arguments[arguments.length - 1];
          (async () => {
            const images = [...document.images].filter(img => {
              const address = img.currentSrc || img.src;
              if (!address) return false;
              return new URL(address, location.href).origin === location.origin;
            });
            for (const img of images) img.loading = 'eager';
            await Promise.all(images.map(img => new Promise(resolve => {
              if (img.complete) return resolve();
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 12000);
            })));
            const cssUrls = new Set();
            const cssUrlPattern = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/g;
            for (const element of document.querySelectorAll('*')) {
              const bg = getComputedStyle(element).backgroundImage;
              if (!bg || bg === 'none') continue;
              for (const match of bg.matchAll(cssUrlPattern)) {
                const raw = (match[1] || match[2] || match[3] || '').trim();
                if (!raw) continue;
                const url = new URL(raw, location.href);
                if (url.origin === location.origin) cssUrls.add(url.href);
              }
            }
            const cssResults = await Promise.all([...cssUrls].map(url => (
              new Promise(resolve => {
                const probe = new Image();
                const timeout = setTimeout(() => resolve({url, good:false}), 12000);
                probe.onload = () => { clearTimeout(timeout); resolve({url, good:probe.naturalWidth>0}); };
                probe.onerror = () => { clearTimeout(timeout); resolve({url, good:false}); };
                probe.src = url;
              })
            )));
            done({
              images: images.length,
              backgrounds: cssResults.length,
              broken: images.filter(img => !img.complete || img.naturalWidth < 1)
                .map(img => img.currentSrc || img.src),
              brokenCss: cssResults.filter(item => !item.good).map(item => item.url),
              cmsHtml: images.filter(img => (img.currentSrc || img.src).includes('/api/content/media/')).length,
              cmsCss: cssResults.filter(item => item.url.includes('/api/content/media/')).length
            });
          })().catch(e => done({error: String(e)}));
        """)
        assert not report.get("error"), f"{route}: {report}"
        assert not report["broken"], f"Broken images in {route}: {report['broken']}"
        assert not report["brokenCss"], f"Broken CSS backgrounds in {route}: {report['brokenCss']}"
        if route == "/":
            assert report["cmsHtml"] > 0 and report["cmsCss"] > 0, (
                f"Nuxt failed to render CMS published image and hero background: {report}"
            )
        if route == "/servicios":
            assert report["cmsHtml"] > 0, f"Service CMS media missing: {report}"
        driver.save_screenshot(str(ARTIFACTS / f"image-audit-{index}.png"))
        print(f"PASS media {route}: {report}", flush=True)
finally:
    driver.quit()
print("PASS image decoding, CSS backgrounds and CMS-published media on Nuxt")
