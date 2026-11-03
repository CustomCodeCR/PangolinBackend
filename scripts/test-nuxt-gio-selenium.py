#!/usr/bin/env python3
"""Chrome E2E: legacy GIO is available in migrated Nuxt pages, with guest safety.

Only reads public pages or opens UI. Quote/tracking submission is not attempted.
"""
import sys
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE = sys.argv[1].rstrip("/")
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)

for width, height, viewport in ((1440, 900, "desktop"), (390, 844, "mobile")):
    for theme in ("light", "dark"):
        opts = Options()
        for flag in ("--headless=new", "--no-sandbox", "--disable-gpu",
                     "--disable-dev-shm-usage", "--disable-extensions",
                     "--no-first-run", f"--window-size={width},{height}"):
            opts.add_argument(flag)
        driver = webdriver.Chrome(options=opts)
        try:
            driver.set_window_size(width, height)
            driver.get(BASE + "/")
            driver.execute_script("localStorage.setItem('castrofallas-theme', arguments[0])", theme)
            driver.refresh()
            wait = WebDriverWait(driver, 25)
            for index, route in enumerate(("/", "/servicios", "/noticias")):
                driver.get(BASE + route)
                mascot = wait.until(EC.element_to_be_clickable(
                    (By.CSS_SELECTOR, ".site-assistant__mascot")
                ))
                assert len(driver.find_elements(By.CSS_SELECTOR, ".site-assistant")) == 1, (
                    f"GIO missing/duplicated on {route}"
                )
                assert mascot.get_attribute("aria-expanded") == "false"
                wait.until(lambda d: d.execute_script("""
                  const image = document.querySelector('.site-assistant__figure-base');
                  return !!image?.complete && image.naturalWidth > 0;
                """))
                measures = driver.execute_script("""
                  const root = document.querySelector('.site-assistant__mascot');
                  const bounds = root.getBoundingClientRect();
                  const img = root.querySelector('img.site-assistant__figure-base');
                  return {
                    x: bounds.left, right: bounds.right,
                    y: bounds.top, bottom: bounds.bottom,
                    viewport: innerWidth, viewportHeight: innerHeight,
                    imageGood: img?.complete && img.naturalWidth > 0
                  };
                """)
                assert measures["imageGood"], f"GIO mascot image not decoded on {route}: {measures}"
                assert measures["x"] >= -1 and measures["right"] <= width + 1, (
                    f"GIO button outside viewport {route}: {measures}"
                )
                assert measures["bottom"] <= height + 1, (
                    f"GIO button below viewport {route}: {measures}"
                )
                mascot.click()
                panel = wait.until(EC.visibility_of_element_located((
                    By.CSS_SELECTOR, ".site-assistant__panel"
                )))
                assert mascot.get_attribute("aria-expanded") == "true"
                quick = wait.until(lambda d: d.find_elements(
                    By.CSS_SELECTOR, ".site-assistant__quick button"
                ))
                assert len(quick) == 4, f"Missing quick actions on {route}"
                if index == 0:
                    # Reuse the existing quote workflow. Opening it must never
                    # send a request without user confirmation or authorization.
                    quick[0].click()
                    wait.until(EC.visibility_of_element_located((
                        By.CSS_SELECTOR, ".gio-ops"
                    )))
                    assert len(driver.find_elements(By.CSS_SELECTOR, ".gio-ops__bar")) == 1, (
                        f"Existing GIO quote workflow not mounted on {route}"
                    )
                # GIO has a 940 ms entrance transition. CSS transforms
                # temporarily enlarge the panel while its animation runs.
                # Check the settled dimensions, not a transitional frame.
                wait.until(lambda d: "site-assistant--settled" in (
                    d.find_element(By.CSS_SELECTOR, ".site-assistant").get_attribute("class") or ""
                ))
                panel_rect = driver.execute_script("""
                  const r = document.querySelector('.site-assistant__panel').getBoundingClientRect();
                  return {left:r.left, right:r.right, top:r.top, bottom:r.bottom};
                """)
                assert panel_rect["left"] >= -2 and panel_rect["right"] <= width + 2, (
                    f"GIO conversation panel clipped at {route}: {panel_rect}"
                )
                driver.save_screenshot(str(ARTIFACTS / f"gio-{viewport}-{theme}-{index}.png"))
                wait.until(EC.element_to_be_clickable((
                    By.CSS_SELECTOR, ".site-assistant__close"
                ))).click()
                wait.until(EC.invisibility_of_element_located((
                    By.CSS_SELECTOR, ".site-assistant__panel"
                )))
                print(f"PASS GIO {viewport}/{theme} {route}: visible, media decoded, opens/closes", flush=True)
        finally:
            driver.quit()
print("PASS GIO public Nuxt guest interactions in desktop/mobile and light/dark")
