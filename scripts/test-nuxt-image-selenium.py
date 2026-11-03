#!/usr/bin/env python3
"""Audit same-origin images in public Nuxt pages using a real Chrome browser.

A normal HTML 200 response does not prove that image URLs load or decode.
Only test media served by this local stack, not unrelated third-party URLs.
"""
import sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1].rstrip("/")
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)

options = Options()
for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
            "--disable-dev-shm-usage", "--disable-extensions",
            "--no-first-run", "--window-size=1280,900"):
    options.add_argument(arg)

driver = webdriver.Chrome(options=options)
try:
    for index, route in enumerate((
        "/", "/nosotros", "/servicios", "/servicios/transporte-maritimo",
        "/servicios/bodegaje-general", "/noticias", "/empresas",
    )):
        driver.get(BASE + route)
        WebDriverWait(driver, 15).until(
            lambda d: d.execute_script("return document.readyState") == "complete"
        )
        result = driver.execute_async_script("""
          const done = arguments[arguments.length - 1];
          (async () => {
            const images = [...document.images].filter(img => {
              const url = new URL(img.currentSrc || img.src || '', location.href);
              return url.origin === location.origin && url.pathname !== location.pathname;
            });
            for (const img of images) img.loading = 'eager';
            await Promise.all(images.map(img => new Promise(resolve => {
              if (img.complete) return resolve();
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 12000);
            })));
            done({
              count: images.length,
              broken: images.filter(img => !img.complete || img.naturalWidth < 1)
                .map(img => img.currentSrc || img.src),
              status: document.title
            });
          })().catch(e => done({error: String(e)}));
        """)
        assert not result.get("error"), f"{route}: {result}"
        assert not result["broken"], f"Broken public media in {route}: {result['broken']}"
        driver.save_screenshot(str(ARTIFACTS / f"image-audit-{index}.png"))
        print(f"PASS images {route}: {result['count']} local images decoded", flush=True)
finally:
    driver.quit()
