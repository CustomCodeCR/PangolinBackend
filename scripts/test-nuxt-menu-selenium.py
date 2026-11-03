#!/usr/bin/env python3
"""Chrome checks: compact service categories and SVG flags across themes/viewports."""
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
        for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-extensions",
                    "--no-first-run", f"--window-size={width},{height}"):
            options.add_argument(arg)
        driver = webdriver.Chrome(options=options)
        try:
            driver.set_window_size(width, height)
            driver.get(BASE + "/servicios/transporte-maritimo")
            driver.execute_script("localStorage.setItem('castrofallas-theme', arguments[0])", theme)
            driver.refresh()
            wait = WebDriverWait(driver, 20)
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".nav-dropdown--services")))
            if width < 801:
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR, ".nav-dropdown--services > .nav-dropdown__trigger"
            ))).click()

            # The current transport route MUST open the correct category.
            buttons = driver.find_elements(By.CSS_SELECTOR, ".services-switcher__tab")
            assert len(buttons) == 2, f"Expected exactly two service categories, got {len(buttons)}"
            assert buttons[1].get_attribute("aria-pressed") == "true", "Current transport category not selected"
            active = wait.until(EC.visibility_of_element_located((
                By.CSS_SELECTOR,
                '#services-transport-panel a[href*="transporte-maritimo"][aria-current="page"]'
            )))
            driver.execute_script("arguments[0].scrollIntoView({block:'nearest'})", active)
            time.sleep(.2)
            measures = driver.execute_script("""
              const panel = document.querySelector('.services-switcher');
              const links = document.querySelector('#services-transport-panel');
              const drawer = document.querySelector('.site-header--menu-open');
              const p = panel.getBoundingClientRect(), l = links.getBoundingClientRect();
              return {
                screenWidth: innerWidth, panelLeft: p.left, panelRight: p.right,
                panelHeight: p.height, panelOverflowY: getComputedStyle(panel).overflowY,
                linksLeft: l.left, linksRight: l.right, linkCount: links.querySelectorAll('a').length,
                drawerScroll: drawer ? getComputedStyle(drawer).overflowY : '',
                dark: document.documentElement.classList.contains('theme-dark')
              };
            """)
            assert measures["dark"] == (theme == "dark"), f"Theme mismatch: {measures}"
            assert measures["panelLeft"] >= -2 and measures["panelRight"] <= measures["screenWidth"] + 2, f"Service menu clipped: {measures}"
            assert measures["linksLeft"] >= -2 and measures["linksRight"] <= measures["screenWidth"] + 2, f"Transport links clipped: {measures}"
            assert measures["linkCount"] == 6, f"Lost a transport service: {measures}"
            assert measures["panelHeight"] <= (440 if width > 1080 else 1200), f"Unexpectedly oversized menu: {measures}"
            if width < 801:
                assert measures["panelOverflowY"] == "visible", f"Nested mobile scroll remains: {measures}"
                assert measures["drawerScroll"] == "auto", f"Mobile drawer should own scroll: {measures}"

            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-transportes.png"))

            # Categories must be reversible without losing any service link.
            buttons[0].click()
            wait.until(EC.visibility_of_element_located((
                By.CSS_SELECTOR, '#services-general-panel a[href*="almacenamiento-fiscal"]'
            )))
            assert len(driver.find_elements(By.CSS_SELECTOR, '#services-general-panel a')) == 4
            buttons[1].click()
            wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR,
                '#services-transport-panel a[href*="transporte-maritimo"]')))
            assert driver.find_element(By.CSS_SELECTOR,
                '#services-transport-panel a[href*="transporte-maritimo"]').get_attribute("aria-current") == "page"
            print(f"PASS service menu {label} {theme}: {measures}", flush=True)

            # SVG flags must be visible inside Settings on Linux/Windows/iOS.
            settings = driver.find_element(By.CSS_SELECTOR, ".header-settings__trigger")
            driver.execute_script("arguments[0].scrollIntoView({block:'nearest'}); arguments[0].click()", settings)
            wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".header-settings__panel")))
            current = driver.find_element(By.CSS_SELECTOR,
                ".header-settings__panel .language-switcher__current svg.language-flag")
            assert current.is_displayed(), "Current flag SVG absent"
            dropdown = driver.find_element(By.CSS_SELECTOR,
                ".header-settings__panel .language-switcher__current")
            driver.execute_script("arguments[0].click()", dropdown)
            flags = wait.until(lambda d: d.find_elements(By.CSS_SELECTOR,
                ".header-settings__panel .language-switcher__menu svg.language-flag"))
            assert len(flags) == 2 and all(flag.is_displayed() for flag in flags), "Two flags SVG not displayed"
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-idiomas.png"))
            print(f"PASS language flags {label} {theme}", flush=True)
        except Exception:
            driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}.png"))
            raise
        finally:
            driver.quit()
print("PASS all four screen/theme navigation and language checks")
