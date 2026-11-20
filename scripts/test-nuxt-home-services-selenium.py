#!/usr/bin/env python3
"""Regression: Nuxt SSR Home service tabs hydrate predictably on narrow screens.

Exercise the actual hybrid gateway, not only the standalone Vue preview.
A hard refresh while a service is open must restore six closed tabs; selecting
another service may never leave stale SSR panels or multiple expanded cards.
"""
import sys
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

BASE = sys.argv[1].rstrip("/")
ARTIFACTS = Path("artifacts/nuxt-hybrid-visual")
ARTIFACTS.mkdir(parents=True, exist_ok=True)

options = Options()
for arg in ("--headless=new", "--no-sandbox", "--disable-gpu",
            "--disable-dev-shm-usage", "--disable-extensions", "--no-first-run",
            "--window-size=1200,1000"):
    options.add_argument(arg)

SNAPSHOT = """
const root = document.querySelector('#servicios .service-accordion');
if (!root) return null;
const items = [...root.querySelectorAll('.service-accordion__item')];
const visible = items.filter(item => getComputedStyle(item).display !== 'none');
return {
  width: innerWidth,
  total: items.length,
  visible: visible.length,
  opened: items.flatMap((item, i) => item.classList.contains('is-open') ? [i] : []),
  panels: root.querySelectorAll('.service-accordion__panel').length,
  collapsed: root.classList.contains('is-collapsed'),
  selectedLabels: items.filter(item => item.classList.contains('is-open'))
    .map(item => item.querySelector('.service-accordion__trigger')?.textContent.trim()),
  overflow: document.documentElement.scrollWidth > innerWidth + 2
};
"""

with webdriver.Chrome(options=options) as driver:
    driver.set_page_load_timeout(40)
    wait = WebDriverWait(driver, 20)

    def snapshot():
        return driver.execute_script(SNAPSHOT)

    def settled():
        wait.until(lambda d: d.execute_script(
            "return document.readyState === 'complete' && "
            "document.querySelectorAll('#servicios .service-accordion__item').length === 6"
        ))
        # Let hydration and the compact media-query mount update finish.
        time.sleep(.35)
        result = snapshot()
        assert result and result["total"] == 6, f"Missing Home service tabs: {result}"
        return result

    def select(index):
        driver.execute_script(
            "document.querySelectorAll('#servicios .service-accordion__trigger')"
            "[arguments[0]].click()", index
        )

    def check_open(index, count):
        wait.until(lambda d: snapshot()["opened"] == [index])
        state = snapshot()
        assert state["panels"] == 1, f"Orphan or duplicate service panel: {state}"
        assert state["visible"] == count, f"Incorrect visible service window: {state}"
        assert not state["overflow"], f"Service overflow after selection: {state}"
        return state

    # The screenshots report failures around phone/tablet widths. 801 and
    # 1024 protect the desktop breakpoint without changing its default Air.
    for width in (390, 500, 620, 768, 800, 801, 1024):
        themes = ("light", "dark") if width in (390, 620, 800, 801) else ("dark",)
        driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
            "width": width, "height": 900, "deviceScaleFactor": 1, "mobile": False
        })
        for theme in themes:
            driver.get(BASE + "/")
            driver.execute_script(
                "localStorage.setItem('castrofallas-theme', arguments[0])", theme
            )
            driver.refresh()
            initial = settled()
            assert initial["width"] == width, f"Wrong emulated viewport: {initial}"
            assert initial["visible"] == 6 and initial["total"] == 6, (
                f"Reload must preserve all six tabs: {initial}"
            )
            assert not initial["overflow"], f"Unexpected horizontal overflow: {initial}"

            if width <= 800:
                assert initial["opened"] == [] and initial["panels"] == 0, (
                    f"Mobile refresh must begin COLLAPSED: {initial}"
                )
                assert initial["collapsed"], f"Closed mobile cards must be centered: {initial}"
                if width in (390, 620):
                    driver.execute_script(
                        "document.querySelector('#servicios').scrollIntoView({block:'start'})"
                    )
                    driver.save_screenshot(str(
                        ARTIFACTS / f"home-accordion-{width}-{theme}-collapsed.png"
                    ))

                # Stationary cursor after SSR hydration must NOT open the card.
                driver.execute_script("""
                  for (const pointerType of ['mouse', 'pen', 'touch']) {
                    document.querySelectorAll('#servicios .service-accordion__trigger')[1]
                      .dispatchEvent(new PointerEvent('pointerenter', {pointerType}));
                  }
                """)
                state = snapshot()
                assert state["opened"] == [] and state["panels"] == 0, (
                    f"Hover reopened a collapsed compact service: {state}"
                )

                count = 3 if driver.execute_script(
                    "return document.querySelector('#servicios .service-accordion').clientWidth"
                ) < 260 else 4
                select(5)
                check_open(5, count)
                # Real WebDriver click causes mouse movement and focus, not
                # merely a JS click. It must never reopen the old panel.
                fiscal = driver.find_elements(
                    By.CSS_SELECTOR, "#servicios .service-accordion__trigger"
                )[4]
                fiscal.click()
                check_open(4, count)
                assert snapshot()["panels"] == 1
                select(4)
                closed = snapshot()
                assert closed["opened"] == [] and closed["panels"] == 0, (
                    f"Collapsing kept an old service panel: {closed}"
                )
                assert closed["visible"] == 6 and closed["collapsed"], (
                    f"All six tabs must return after closing: {closed}"
                )

                select(0)
                check_open(0, count)
                # A hard reload when Air is open reproduces the original bug.
                driver.refresh()
                reloaded = settled()
                assert reloaded["opened"] == [] and reloaded["panels"] == 0, (
                    f"SSR refresh retained an expanded service: {reloaded}"
                )
                assert reloaded["visible"] == 6 and reloaded["collapsed"], (
                    f"SSR refresh must match six closed tabs: {reloaded}"
                )
                select(1)
                check_open(1, count)
                select(2)
                check_open(2, count)
            else:
                assert initial["opened"] == [0] and initial["panels"] == 1, (
                    f"Desktop must retain its Air default: {initial}"
                )
                assert not initial["collapsed"], f"Desktop should not be compact: {initial}"
                select(2)
                check_open(2, 6)
                driver.refresh()
                assert settled()["opened"] == [0], (
                    f"Desktop refresh changed the default service: {snapshot()}"
                )

            print(f"PASS Home SSR services: {width}px {theme}", flush=True)

print("PASS Home SSR hydration, reload, hover and service switching")
