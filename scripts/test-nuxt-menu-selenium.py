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
            # Large-logo regression from PR #143, with responsive collision guard.
            brand = driver.execute_script("""
              const img = document.querySelector('.site-header .site-brand img');
              const toggle = document.querySelector('.site-header .menu-toggle');
              if (!img || !toggle) return null;
              const a = img.getBoundingClientRect(), t = toggle.getBoundingClientRect();
              return {width:a.width, height:a.height, right:a.right,
                toggleLeft:t.left, toggleDisplay:getComputedStyle(toggle).display};
            """)
            assert brand, f"Header brand missing: {label}/{theme}"
            expected_width = 144 if width <= 1080 else 157.5
            maximum_height = 56 if width <= 1080 else 66
            assert abs(brand["width"] - expected_width) <= 2, (
                f"Logo size lost in {label}/{theme}: {brand}"
            )
            assert brand["height"] <= maximum_height + 1, (
                f"Logo overflows header in {label}/{theme}: {brand}"
            )
            if width <= 1080:
                assert brand["toggleDisplay"] != "none", f"Menu toggle hidden: {label}/{theme}"
                assert brand["right"] <= brand["toggleLeft"] - 8, (
                    f"Large logo overlaps menu toggle in {label}/{theme}: {brand}"
                )
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
            if width <= 800:
                assert measures["menuLeft"] >= 8 and measures["menuRight"] <= width - 8, f"Phone submenu escapes right drawer: {measures}"
            else:
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

            # Regression: preserve the original phone SIDE DRAWER and medium red menu.
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
                # The original phone drawer slides in for 240ms. Assert the
                # settled right-edge geometry, not an intermediate frame.
                if width <= 800:
                    wait.until(lambda d: d.execute_script("""
                      const h = document.querySelector('body > .site-header--menu-open');
                      if (!h) return false;
                      const r = h.getBoundingClientRect();
                      const left = innerWidth - Math.min(innerWidth * .76, 360);
                      return Math.abs(r.left - left) <= 3 && Math.abs(r.right - innerWidth) <= 3;
                    """))
                overlay = driver.execute_script("""
                  const h = document.querySelector('body > .site-header--menu-open');
                  if (!h) return {error: 'Compact header was not teleported'};
                  const nav = h.querySelector('.main-nav');
                  const root = document.getElementById('app') || document.getElementById('__nuxt');
                  const backdrop = document.querySelector('body > .mobile-nav-backdrop');
                  const backdropHit = document.elementFromPoint(12, innerHeight * .55);
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
                    backdropVisible:!!backdrop && getComputedStyle(backdrop).display !== 'none',
                    backdropCoversPage:backdrop === backdropHit,
                    title:rect('.about-hero__copy h1'),
                    years:rect('.about-hero__copy .big-years'),
                    image:rect('.about-image-card'),
                    titleCoverage:coverage('.about-hero__copy h1'),
                    imageCoverage:coverage('.about-image-card')
                  };
                """)
                assert overlay.get("position") == "fixed", f"Compact menu is not fixed: {overlay}"
                assert -2 <= overlay["top"] <= 2, f"Menu starts below the viewport: {overlay}"
                assert overlay["right"] >= overlay["viewportWidth"] - 2, f"Menu right edge changed: {overlay}"
                if width <= 800:
                    # The original phone navigation is a RIGHT-side drawer, not
                    # a full-width menu: preserve its 76vw/360px width and dimmer.
                    expected_left = overlay["viewportWidth"] - min(overlay["viewportWidth"] * .76, 360)
                    assert abs(overlay["left"] - expected_left) <= 4, f"Phone drawer width/position changed: {overlay}"
                    assert overlay["bottom"] >= overlay["viewportHeight"] - 2, f"Phone drawer no longer fills screen height: {overlay}"
                    assert overlay["backdropVisible"] and overlay["backdropCoversPage"], f"Page dimmer missing behind phone drawer: {overlay}"
                else:
                    assert overlay["left"] >= -2 and overlay["left"] <= 2, f"Compact menu no longer spans the top: {overlay}"
                    assert overlay["bottom"] <= overlay["navBottom"] + 32, f"Compact menu was stretched to the whole screen: {overlay}"
                    assert overlay["bottom"] <= overlay["viewportHeight"] + 2, f"Compact menu overflows the viewport: {overlay}"
                    assert not overlay["backdropVisible"], f"Phone-only backdrop shown on tablet: {overlay}"
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

            # Regression: editorial News deliberately fades its CLOSED header.
            # When the menu opens that gradient must become opaque red and
            # keep the same viewport positioning as every other public page.
            if width <= 1080:
                driver.get(BASE + "/noticias")
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
                header_color = wait.until(lambda d: d.execute_script("""
                  const h = document.querySelector('body > .site-header--menu-open');
                  if (!h) return false;
                  const s = getComputedStyle(h);
                  return s.position === 'fixed' &&
                    s.backgroundColor === 'rgb(159, 9, 33)' &&
                    s.backgroundImage === 'none';
                """))
                assert header_color, f"News opened menu is not solid red: {label}/{theme}"
                driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-news-opaque-nav.png"))
                print(f"PASS News opaque red menu {label}/{theme}", flush=True)

                # Cargo is available to guests on the official quote screen.
                # Test menu geometry without submitting any quote.
                driver.get(BASE + "/cotizaciones")
                wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".official-panel")))
                wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
                cargo = wait.until(EC.element_to_be_clickable((
                    By.CSS_SELECTOR,
                    ".main-nav .nav-dropdown:not(.nav-dropdown--services) > button.nav-dropdown__trigger"
                )))
                cargo.click()
                cargo_panel = wait.until(EC.visibility_of_element_located((
                    By.CSS_SELECTOR,
                    ".main-nav .nav-dropdown:not(.nav-dropdown--services) > .nav-dropdown__menu"
                )))
                assert len(cargo_panel.find_elements(By.TAG_NAME, "a")) == 3, "Cargo must keep all three destinations"
                cargo_geometry = wait.until(lambda d: d.execute_script("""
                  const h = document.querySelector('body > .site-header--menu-open');
                  const cargo = document.querySelector('.main-nav .nav-dropdown:not(.nav-dropdown--services) > .nav-dropdown__menu');
                  if (!h || !cargo) return false;
                  const last = [...cargo.querySelectorAll('a')].at(-1);
                  const lastRect = last.getBoundingClientRect();
                  const bounds = h.getBoundingClientRect();
                  const visibleBottom = Math.min(bounds.bottom, innerHeight);
                  if (lastRect.bottom > visibleBottom - 4) return false;
                  const s = getComputedStyle(cargo);
                  const ink = getComputedStyle(last).color;
                  return {
                    bottom: lastRect.bottom, viewportBottom: visibleBottom,
                    scrollTop: h.scrollTop,
                    background: s.backgroundColor,
                    hasGlow: s.backgroundImage.includes('radial-gradient'),
                    hasBlur: s.backdropFilter.includes('blur'),
                    ink
                  };
                """))
                assert cargo_geometry["hasGlow"] and cargo_geometry["hasBlur"], f"Cargo glass finish missing: {cargo_geometry}"
                expected_ink = 'rgb(255, 255, 255)' if theme == 'dark' else 'rgb(32, 36, 43)'
                assert cargo_geometry["ink"] == expected_ink, f"Cargo text not readable in {theme}: {cargo_geometry}"
                expected_surface = '0.48' if theme == 'dark' else '0.96'
                assert expected_surface in cargo_geometry["background"], f"Cargo card not using theme palette: {cargo_geometry}"
                driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-cargo-visible.png"))
                print(f"PASS Cargo three links and themed glass {label}/{theme}: {cargo_geometry}", flush=True)
        except Exception:
            driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}.png"))
            raise
        finally:
            driver.quit()
print("PASS all eight mega-menu and locale combinations")

# An authenticated administrator has extra navigation rows (Administracion
# and Cuenta), which the guest-only regression above does not exercise.
# Mock only /api/auth/me in the test browser; no real session or permissions
# are modified. BOTH color themes must share the same Cargo geometry.
for theme in ("light", "dark"):
    options = Options()
    for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
                "--disable-dev-shm-usage", "--disable-extensions",
                "--no-first-run", "--window-size=960,590"):
        options.add_argument(arg)
    driver = webdriver.Chrome(options=options)
    try:
        driver.set_window_size(960, 590)
        driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": """
          (() => {
            const originalFetch = window.fetch.bind(window);
            window.fetch = (resource, init) => {
              const url = typeof resource === 'string' ? resource : resource?.url;
              if (url && new URL(url, location.origin).pathname === '/api/auth/me') {
                return Promise.resolve(new Response(
                  JSON.stringify({user:{role:'administrador', correo:'visual-test@example.invalid', nombre:'UI regression test'}}),
                  {status:200, headers:{'Content-Type':'application/json'}}
                ));
              }
              return originalFetch(resource, init);
            };
          })();
        """})
        driver.get(BASE + "/noticias")
        driver.execute_script("localStorage.setItem('castrofallas-theme', arguments[0])", theme)
        driver.refresh()
        wait = WebDriverWait(driver, 22)
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".nav-admin-entry")))
        wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".header-profile__trigger")))
        wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
        wait.until(EC.element_to_be_clickable((
            By.CSS_SELECTOR,
            ".main-nav .nav-dropdown:not(.nav-dropdown--services) > button.nav-dropdown__trigger"
        ))).click()
        geometry = wait.until(lambda d: d.execute_script("""
          const h = document.querySelector('body > .site-header--menu-open');
          const p = h?.querySelector('.main-nav .nav-dropdown:not(.nav-dropdown--services) > .nav-dropdown__menu');
          const admin = h?.querySelector('.nav-admin-entry');
          const actions = h?.querySelector('.header-account-tools');
          const last = p?.querySelector('a:last-child');
          if (!h || !p || !admin || !actions || !last) return false;
          const panel = p.getBoundingClientRect();
          const adminBounds = admin.getBoundingClientRect();
          const actionsBounds = actions.getBoundingClientRect();
          const lastBounds = last.getBoundingClientRect();
          const bottom = Math.min(innerHeight, h.getBoundingClientRect().bottom);
          if (lastBounds.bottom > bottom - 3 || actionsBounds.bottom > bottom - 3) return false;
          return {
            position:getComputedStyle(p).position,
            height:panel.height,
            panelBottom:panel.bottom,
            adminTop:adminBounds.top,
            actionsTop:actionsBounds.top,
            actionsBottom:actionsBounds.bottom,
            bottom,
            scrollTop:h.scrollTop,
            links:p.querySelectorAll('a').length,
            viewportWidth:innerWidth,
            viewportHeight:innerHeight
          };
        """))
        assert geometry["viewportWidth"] > 800 and geometry["viewportWidth"] <= 1080, f"Wrong regression breakpoint: {geometry}"
        assert geometry["viewportHeight"] < 500, f"Window is not short: {geometry}"
        assert geometry["position"] == "relative", f"{theme} Cargo escapes layout flow: {geometry}"
        assert geometry["links"] == 3, f"{theme} Cargo links are missing: {geometry}"
        assert geometry["adminTop"] >= geometry["panelBottom"] - 3, (
            f"{theme} Cargo overlays Administracion: {geometry}"
        )
        assert geometry["actionsTop"] >= geometry["adminTop"], f"{theme} Account controls overlap Admin: {geometry}"
        assert geometry["scrollTop"] > 0, f"{theme} compact header did not scroll: {geometry}"
        driver.save_screenshot(str(ARTIFACTS / f"admin-compact-short-{theme}-cargo.png"))
        print(f"PASS admin Cargo same layout and scrolling in {theme}: {geometry}", flush=True)
    except Exception:
        driver.save_screenshot(str(ARTIFACTS / f"debug-admin-compact-short-{theme}.png"))
        raise
    finally:
        driver.quit()

# Short-window regression: browser heights such as the reported 487px cannot
# fit every navigation row simultaneously. Reveal the Cargo choices AND
# bottom actions inside the header, never by scrolling the background page.
for width, height, label in [(896, 590, "compact-short"), (390, 590, "phone-short")]:
    for theme in ("light", "dark"):
        options = Options()
        for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--disable-extensions",
                    "--no-first-run", f"--window-size={width},{height}"):
            options.add_argument(arg)
        driver = webdriver.Chrome(options=options)
        try:
            driver.set_window_size(width, height)
            driver.get(BASE + "/cotizaciones")
            driver.execute_script("localStorage.setItem('castrofallas-theme', arguments[0])", theme)
            driver.refresh()
            wait = WebDriverWait(driver, 22)
            wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".official-panel")))
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".menu-toggle"))).click()
            wait.until(EC.element_to_be_clickable((
                By.CSS_SELECTOR,
                ".main-nav .nav-dropdown:not(.nav-dropdown--services) > button.nav-dropdown__trigger"
            ))).click()
            geometry = wait.until(lambda d: d.execute_script("""
              const header = document.querySelector('body > .site-header--menu-open');
              const panel = header?.querySelector('.main-nav .nav-dropdown:not(.nav-dropdown--services) > .nav-dropdown__menu');
              const actions = header?.querySelector('.header-account-tools');
              const lastCargo = panel?.querySelector('a:last-child');
              if (!header || !lastCargo || !actions) return false;
              const b = header.getBoundingClientRect();
              const maxBottom = Math.min(innerHeight, b.bottom);
              const cargoRect = lastCargo.getBoundingClientRect();
              const actionsRect = actions.getBoundingClientRect();
              if (cargoRect.bottom > maxBottom - 3 || actionsRect.bottom > maxBottom - 3) return false;
              return {
                viewportHeight:innerHeight,
                scrollTop:header.scrollTop,
                cargoBottom:cargoRect.bottom,
                actionsBottom:actionsRect.bottom,
                viewportBottom:maxBottom,
                lockedPageScroll:-(parseFloat(document.body.style.top) || 0),
                bodyPosition:getComputedStyle(document.body).position,
                menuPosition:getComputedStyle(header).position,
                cargoLinks:panel.querySelectorAll('a').length
              };
            """))
            assert geometry["cargoLinks"] == 3, f"Cargo links lost at short viewport: {geometry}"
            assert geometry["menuPosition"] == "fixed", f"Header shifted into page flow: {geometry}"
            assert geometry["viewportHeight"] < 500, f"Short viewport simulation not reproduced: {geometry}"
            assert geometry["scrollTop"] > 0, f"Header failed to scroll towards lower actions: {geometry}"
            assert geometry["bodyPosition"] == "fixed", f"Background not locked during menu: {geometry}"
            driver.save_screenshot(str(ARTIFACTS / f"{label}-{theme}-cargo-and-actions-visible.png"))
            # The body uses position:fixed while the drawer is open, so window.scrollY
            # can read zero despite no visual movement. Check scroll restoration
            # after closing instead of comparing scrollY while locked.
            wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, ".site-header--menu-open .menu-toggle"))).click()
            wait.until(lambda d: not d.execute_script(
                "return !!document.querySelector('body > .site-header--menu-open')"))
            restored = driver.execute_script("return window.scrollY")
            assert abs(restored - geometry["lockedPageScroll"]) <= 3, (
                f"Background scroll not restored after closing: {geometry}, restored={restored}"
            )
            print(f"PASS short viewport Cargo, footer and scroll restore {label}/{theme}: {geometry}", flush=True)
        except Exception:
            driver.save_screenshot(str(ARTIFACTS / f"debug-{label}-{theme}-short.png"))
            raise
        finally:
            driver.quit()

