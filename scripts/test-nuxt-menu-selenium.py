#!/usr/bin/env python3
"""Real Chrome geometry/interaction test for Nuxt/Vue navigation in two themes."""
import sys
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE = sys.argv[1].rstrip("/")
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)

for width, height, label in [(1440, 900, "desktop"), (390, 844, "mobile")]:
    for theme in ("light", "dark"):
        options = Options()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--disable-extensions")
        options.add_argument("--no-first-run")
        options.add_argument(f"--window-size={width},{height}")
        driver = webdriver.Chrome(options=options)
        try:
            driver.set_window_size(width, height)
            driver.get(BASE + "/servicios/transporte-maritimo")
            driver.execute_script(
                "localStorage.setItem('castrofallas-theme', arguments[0])", theme
            )
            driver.refresh()
            wait = WebDriverWait(driver, 20)
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".nav-dropdown--services")))
            if width < 1081:
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".nav-dropdown--services .nav-dropdown__trigger"))).click()
            transport_trigger = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".services-transport-group__trigger")))
            # La página actual es un transporte; el menú recuerda esa selección
            # y normalmente ya lo expande. Un segundo clic lo cerraría.
            if transport_trigger.get_attribute("aria-expanded") != "true":
                transport_trigger.click()
            active = wait.until(EC.presence_of_element_located((
                By.CSS_SELECTOR,
                '.services-transport-group__submenu a[href*="transporte-maritimo"][aria-current="page"]'
            )))
            # Un enlace al final de un panel desplazable puede no reportarse
            # visible hasta que se ubique dentro del área accesible.
            driver.execute_script("arguments[0].scrollIntoView({block:'nearest'})", active)
            try:
                wait.until(lambda d: active.is_displayed())
            except Exception:
                driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}.png"))
                diagnostics = driver.execute_script("""
                  const group = document.querySelector('.services-transport-group');
                  const menu = document.querySelector('.services-nav-dropdown__menu');
                  const flyout = document.querySelector('.services-transport-group__submenu');
                  const active = document.querySelector('a[aria-current="page"]');
                  return {
                    groupClass: group?.className,
                    servicesMenuDisplay: menu && getComputedStyle(menu).display,
                    transportDisplay: flyout && getComputedStyle(flyout).display,
                    transportHeight: flyout?.getBoundingClientRect().height,
                    activeDisplay: active && getComputedStyle(active).display,
                    activeRect: active?.getBoundingClientRect().toJSON(),
                    panelRect: menu?.getBoundingClientRect().toJSON(),
                    panelScrollTop: menu?.scrollTop
                  };
                """)
                print(f"DEBUG menu {label} {theme}: {diagnostics}", flush=True)
                raise
            time.sleep(.25)
            measures = driver.execute_script("""
              const el = document.querySelector('.services-transport-group__submenu');
              const panel = document.querySelector('.services-nav-dropdown__menu');
              const r = el.getBoundingClientRect();
              const p = panel.getBoundingClientRect();
              return {
                submenuX: r.left, submenuRight: r.right,
                panelX: p.left, panelRight: p.right,
                screenWidth: window.innerWidth,
                submenuPosition: getComputedStyle(el).position,
                panelOverflowX: getComputedStyle(panel).overflowX,
                dark: document.documentElement.classList.contains('theme-dark')
              };
            """)
            assert measures["dark"] == (theme == "dark"), f"Wrong theme: {measures}"
            assert measures["submenuPosition"] == "static", f"Flyout not inline: {measures}"
            assert measures["submenuX"] >= -2, f"Left clipping: {measures}"
            assert measures["submenuRight"] <= measures["screenWidth"] + 2, f"Right clipping: {measures}"
            assert measures["panelX"] >= -2, f"Main panel beyond viewport: {measures}"
            assert measures["panelRight"] <= measures["screenWidth"] + 2, f"Main panel clipped: {measures}"
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-transportes.png"))
            print(f"PASS navigation {label} {theme}: {measures}", flush=True)

            # Banderas: SVG reales, no emojis dependientes del sistema operativo.
            settings_button = driver.find_element(By.CSS_SELECTOR, ".header-settings__trigger")
            driver.execute_script(
                "arguments[0].scrollIntoView({block:'nearest'}); arguments[0].click()",
                settings_button,
            )
            wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".header-settings__panel")))
            current_flag = driver.find_element(By.CSS_SELECTOR, ".header-settings__panel .language-switcher__current svg.language-flag")
            assert current_flag.is_displayed(), "La bandera actual no se ve"
            current_button = driver.find_element(By.CSS_SELECTOR, ".header-settings__panel .language-switcher__current")
            driver.execute_script("arguments[0].click()", current_button)
            flag_options = wait.until(lambda d: d.find_elements(
                By.CSS_SELECTOR, ".header-settings__panel .language-switcher__menu svg.language-flag"
            ))
            assert len(flag_options) == 2 and all(flag.is_displayed() for flag in flag_options), (
                "Español y English deben mostrar sus banderas SVG"
            )
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-idiomas.png"))
            print(f"PASS flags SVG {label} {theme}", flush=True)
        finally:
            driver.quit()
print("PASS all four responsive theme/viewport menu checks")
