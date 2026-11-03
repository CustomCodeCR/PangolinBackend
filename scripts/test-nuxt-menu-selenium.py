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

for width, height, label in [(1440, 900, "desktop"), (1180, 820, "laptop"), (896, 800, "compact"), (390, 844, "mobile")]:
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
            if width <= 1080:
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR, ".nav-dropdown--services > .nav-dropdown__trigger"
            ))).click()
            menu = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".services-megamenu")))
            # The phone drawer slides in for 240 ms. Check its FINAL geometry,
            # not the temporary off-screen position during the entrance.
            if width <= 1080:
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
            assert len(right.find_elements(By.TAG_NAME, "button")) == 1 if width <= 1080 else True
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
            if width <= 1080:
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

            # Regression: keep the ORIGINAL compact red menu height and layout.
            # Opening it must not push the About title, years or photo down,
            # and the picture must never paint in front of the open menu.
            if width <= 1080:
                driver.get(BASE + "/nosotros")
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".about-image-card")))
                driver.execute_script("document.documentElement.style.scrollBehavior = 'auto'; window.scrollTo(0, 0)")
                before_scroll = driver.execute_script("return window.scrollY")
                before = driver.execute_script("""
                  const rect = selector => {
                    const r = document.querySelector(selector).getBoundingClientRect();
                    return {top:r.top, left:r.left};
                  };
                  return {
                    title: rect('.about-hero__copy h1'),
                    years: rect('.about-hero__copy .big-years'),
                    image: rect('.about-image-card')
                  };
                """)
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
                wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, ".site-header--menu-open")))
                overlay = driver.execute_script("""
                  const h = document.querySelector('body > .site-header--menu-open');
                  if (!h) return {error: 'Compact header was not teleported'};
                  const nav = h.querySelector('.main-nav');
                  const root = document.getElementById('app') || document.getElementById('__nuxt');
                  const rect = selector => {
                    const r = document.querySelector(selector).getBoundingClientRect();
                    return {top:r.top, left:r.left};
                  };
                  const r = h.getBoundingClientRect();
                  const n = nav.getBoundingClientRect();
                  const coverage = selector => {
                    const a = document.querySelector(selector).getBoundingClientRect();
                    const left = Math.max(r.left, a.left);
                    const right = Math.min(r.right, a.right);
                    const top = Math.max(r.top, a.top);
                    const bottom = Math.min(r.bottom, a.bottom);
                    if (right - left < 4 || bottom - top < 4) return {overlaps:false, covered:true};
                    const hit = document.elementFromPoint((left+right)/2, (top+bottom)/2);
                    return {overlaps:true, covered:hit === h || h.contains(hit)};
                  };
                  return {
                    position: getComputedStyle(h).position,
                    overflowY: getComputedStyle(h).overflowY,
                    top:r.top, left:r.left, right:r.right, bottom:r.bottom,
                    navBottom:n.bottom, viewportWidth:innerWidth,
                    viewportHeight:innerHeight, rootInert:!!root?.inert,
                    title:rect('.about-hero__copy h1'),
                    years:rect('.about-hero__copy .big-years'),
                    image:rect('.about-image-card'),
                    titleCoverage:coverage('.about-hero__copy h1'),
                    imageCoverage:coverage('.about-image-card')
                  };
                """)
                assert overlay.get("position") == "fixed", f"Compact menu is not fixed: {overlay}"
                assert -2 <= overlay["top"] <= 2, f"Menu starts below the viewport: {overlay}"
                assert overlay["left"] >= -2 and overlay["right"] >= overlay["viewportWidth"] - 2, f"Menu width changed: {overlay}"
                assert overlay["bottom"] <= overlay["navBottom"] + 32, f"Menu was stretched to the whole screen: {overlay}"
                assert overlay["bottom"] <= overlay["viewportHeight"] + 2, f"Menu overflows the viewport: {overlay}"
                assert overlay["overflowY"] in ("auto", "scroll"), f"Long menu cannot scroll: {overlay}"
                assert overlay["rootInert"], f"Page is interactive behind the open menu: {overlay}"
                for key in ("title", "years", "image"):
                    for axis in ("top", "left"):
                        assert abs(overlay[key][axis] - before[key][axis]) <= 3, (
                            f"About {key} moved after opening menu ({axis}): {before} => {overlay}"
                        )
                assert overlay["titleCoverage"]["covered"], f"About title covers menu: {overlay}"
                assert overlay["imageCoverage"]["covered"], f"About photo covers menu: {overlay}"
                driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-about-nav-overlay.png"))
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
                wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".site-header--menu-open")))
                after_scroll = driver.execute_script("return window.scrollY")
                assert abs(after_scroll - before_scroll) <= 3, (
                    f"Page scroll changed after mobile menu closed: {before_scroll} => {after_scroll}"
                )
                print(f"PASS original About menu format and fixed hero {label}/{theme}: {overlay}", flush=True)
        except Exception:
            driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}.png"))
            raise
        finally:
            driver.quit()
print("PASS all eight mega-menu and locale combinations")
