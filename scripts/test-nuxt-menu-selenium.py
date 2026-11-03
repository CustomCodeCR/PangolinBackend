#!/usr/bin/env python3
"""Chrome: two-column service navigation, mobile drill-down and SVG language flags."""
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
TRANSPORT_LINKS = 6
GENERAL_LINKS = 4

for width, height, label in [(1440, 900, "desktop"), (1180, 820, "laptop"), (390, 844, "mobile")]:
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
            wait = WebDriverWait(driver, 22)
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".nav-dropdown--services")))
            if width <= 800:
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR, ".nav-dropdown--services > .nav-dropdown__trigger"
            ))).click()
            menu = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".services-megamenu")))
            # The phone drawer slides in for 240 ms. Check its FINAL geometry,
            # not the temporary off-screen position during the entrance.
            if width <= 800:
                wait.until(lambda d: d.execute_script("""
                  const h = document.querySelector('.site-header--menu-open');
                  if (!h) return false;
                  const r = h.getBoundingClientRect();
                  return r.left >= -1 && r.right <= innerWidth + 1;
                """))
                time.sleep(.08)
            group_button = driver.find_element(By.CSS_SELECTOR, ".services-megamenu__group-trigger")
            assert group_button.get_attribute("aria-expanded") == "true", "Transportes should open on current transport page"
            right = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#services-transport-panel")))
            assert len(right.find_elements(By.TAG_NAME, "a")) == TRANSPORT_LINKS, "Transport destinations missing"
            assert len(right.find_elements(By.TAG_NAME, "button")) == 1 if width <= 800 else True
            active = right.find_element(By.CSS_SELECTOR, 'a[href*="transporte-maritimo"][aria-current="page"]')
            assert active.is_displayed(), "Current transport not displayed"

            measures = driver.execute_script("""
              const m = document.querySelector('.services-megamenu');
              const r = document.querySelector('.services-megamenu__detail');
              const l = document.querySelector('.services-megamenu__rail');
              const b = m.getBoundingClientRect(), d = r.getBoundingClientRect();
              return {
                viewport: innerWidth,
                menuLeft: b.left, menuRight: b.right, menuHeight: b.height,
                headerRect: document.querySelector('.site-header--menu-open')?.getBoundingClientRect().toJSON(),
                parentRect: m.closest('.nav-dropdown--services')?.getBoundingClientRect().toJSON(),
                navRect: m.closest('.main-nav')?.getBoundingClientRect().toJSON(),
                detailLeft: d.left, detailRight: d.right,
                railDisplay: getComputedStyle(l).display,
                detailDisplay: getComputedStyle(r).display,
                menuOverflowY: getComputedStyle(m).overflowY,
                dark: document.documentElement.classList.contains('theme-dark'),
                thirdLevel: !!r.querySelector('a button, .services-transport-group__submenu')
              };
            """)
            assert measures["dark"] == (theme == "dark"), f"Theme mismatch: {measures}"
            assert measures["menuLeft"] >= 26 and measures["menuRight"] <= width - 26, f"Menu lacks viewport breathing room: {measures}"
            if width > 1080:
                assert measures["menuRight"] - measures["menuLeft"] <= 630, f"Desktop menu should be narrower: {measures}"
            assert measures["detailLeft"] >= -2 and measures["detailRight"] <= width + 2, f"Right panel outside viewport: {measures}"
            assert not measures["thirdLevel"], "Right column must contain final links only"
            if width > 1080:
                assert measures["railDisplay"] != "none", f"Desktop navigation column invisible: {measures}"
                assert measures["detailLeft"] >= measures["menuLeft"] + 220, f"Desktop right side is not a separate column: {measures}"
                assert measures["menuHeight"] <= 550, f"Desktop dropdown too tall: {measures}"
                assert len(menu.find_elements(By.CSS_SELECTOR, ".services-megamenu__rail a")) == GENERAL_LINKS + 1
            else:
                assert measures["railDisplay"] == "none", f"Mobile second level must replace categories, not stack: {measures}"
                assert measures["menuOverflowY"] == "visible", f"Nested mobile scrollbar found: {measures}"
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-transportes.png"))

            # On mobile the only return action reveals all original top-level links.
            if width <= 1080:
                back = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".services-megamenu__back")))
                back.click()
                left = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".services-megamenu__rail")))
                assert len(left.find_elements(By.CSS_SELECTOR, "a")) == GENERAL_LINKS + 1, "Missing top-level services"
                assert group_button.get_attribute("aria-expanded") == "false", "Back must collapse Transportes"
                group_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".services-megamenu__group-trigger")))
                group_button.click()
                wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "#services-transport-panel")))
            else:
                # Desktop: the left Transportes control toggles the right pane.
                group_button.click()
                wait.until(lambda d: d.find_element(
                    By.CSS_SELECTOR, ".services-megamenu__group-trigger"
                ).get_attribute("aria-expanded") == "false")
                assert not right.is_displayed(), "Right column remains visible after closing"
                small = menu.rect
                assert small["width"] <= 325, f"Collapsed dropdown is too wide: {small}"
                driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-transportes-cerrado.png"))
                group_button.click()
                wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "#services-transport-panel")))
                assert group_button.get_attribute("aria-expanded") == "true", "Transportes did not reopen"
            print(f"PASS mega-menu {label}/{theme}: {measures}", flush=True)

            # Preserve the pre-existing Spain/UK SVG flags in Settings.
            settings = driver.find_element(By.CSS_SELECTOR, ".header-settings__trigger")
            driver.execute_script("arguments[0].scrollIntoView({block:'nearest'}); arguments[0].click()", settings)
            wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".header-settings__panel")))
            current = driver.find_element(By.CSS_SELECTOR,
                ".header-settings__panel .language-switcher__current svg.language-flag")
            assert current.is_displayed(), "Current SVG flag missing"
            driver.execute_script("arguments[0].click()", driver.find_element(
                By.CSS_SELECTOR, ".header-settings__panel .language-switcher__current"))
            flags = wait.until(lambda d: d.find_elements(
                By.CSS_SELECTOR, ".header-settings__panel .language-switcher__menu svg.language-flag"))
            assert len(flags) == 2 and all(flag.is_displayed() for flag in flags), "SVG flags not displayed"
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-idiomas.png"))
            print(f"PASS flags {label}/{theme}", flush=True)

            # A non-transport service opens only the first column; the right
            # side must not be permanently visible until the user asks for it.
            driver.get(BASE + "/servicios/bodegaje-general")
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".nav-dropdown--services")))
            if width <= 800:
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR, ".nav-dropdown--services > .nav-dropdown__trigger"
            ))).click()
            group = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".services-megamenu__group-trigger")))
            assert group.get_attribute("aria-expanded") == "false", "Right column opened by default on general service"
            detail = driver.find_element(By.CSS_SELECTOR, "#services-transport-panel")
            assert not detail.is_displayed(), "Transport links always visible on general service"
            assert driver.find_element(By.CSS_SELECTOR,
                '.services-megamenu__rail a[href*="bodegaje-general"][aria-current="page"]').is_displayed()
            group.click()
            wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "#services-transport-panel")))
            assert group.get_attribute("aria-expanded") == "true", "Manual expand must reveal transport links"
            print(f"PASS manual expand from general service {label}/{theme}", flush=True)
        except Exception:
            driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}.png"))
            raise
        finally:
            driver.quit()
print("PASS all six mega-menu and locale combinations")
