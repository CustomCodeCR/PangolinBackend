#!/usr/bin/env python3
"""Test-only SSR text handoff using the synthetic hybrid gateway backend."""
import sys
import time
from urllib.request import urlopen
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

base = sys.argv[1].rstrip("/")
alpha = "CMS HOME SSR ALPHA"
beta = "CMS HOME BROWSER BETA"
english = "CMS HOME EN FIXTURE"
# Wait for the signal-driven fixture to become active.
for _ in range(20):
    with urlopen(base + "/", timeout=5) as response:
        html = response.read().decode("utf-8")
    if "<h1>" + alpha in html:
        break
    time.sleep(.2)
else:
    raise AssertionError("Synthetic published title absent from visible SSR H1")

def run(mode):
    options = Options()
    for arg in ("--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--window-size=1200,900"):
        options.add_argument(arg)
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    with webdriver.Chrome(options=options) as driver:
        driver.set_page_load_timeout(40)
        driver.execute_cdp_cmd("Network.enable", {})
        driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers":{"X-Pangolin-CI-CMS":mode}})
        driver.get(base + "/")
        wait = WebDriverWait(driver, 20)
        def title():
            return driver.execute_script("return document.querySelector('h1')?.textContent || ''")
        wait.until(lambda d: d.execute_script(
            "return performance.getEntriesByName(location.origin + '/api/content/site').length > 0"))
        wait.until(lambda d: (beta if mode == "refresh" else alpha) in title())
        # Confirm the browser mounted and the interactive accordion works.
        wait.until(lambda d: d.execute_script(
            "return document.querySelectorAll('#servicios .service-accordion__item.is-open').length === 1"))
        if mode == "refresh":
            driver.execute_script("localStorage.setItem('user-locale','en')")
            driver.refresh()
            wait.until(lambda d: english in title())
        else:
            assert alpha in title(), "Failed browser fetch replaced published SSR text"
        failures = [entry["message"] for entry in driver.get_log("browser")
                    if "hydration" in entry["message"].lower() and
                    "mismatch" in entry["message"].lower()]
        assert not failures, "Hydration mismatch: " + str(failures)
        print("PASS Home CMS browser", mode, "SSR handoff and mounted interaction")

run("refresh")
run("failure")
