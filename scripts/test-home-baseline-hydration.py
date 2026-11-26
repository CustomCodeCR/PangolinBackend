#!/usr/bin/env python3
"""Characterize baseline hydration with the same disposable CMS as PR 361.
Warnings are observations here, not a claim that hydration is correct.
"""
import json
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
for _ in range(20):
    with urlopen(base + "/api/content/site", timeout=5) as response:
        slots = json.load(response)
    if any(item.get("key") == "home.hero.title1" and item.get("textEs") == alpha for item in slots):
        break
    time.sleep(.2)
else:
    raise AssertionError("Synthetic CMS fixture not active")
with urlopen(base + "/", timeout=5) as response:
    html = response.read().decode("utf-8")
assert alpha not in html and beta not in html, "Expected unchanged static baseline"
for mode in ("refresh", "failure"):
    options = Options()
    for arg in ("--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--window-size=1200,900"):
        options.add_argument(arg)
    options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
    with webdriver.Chrome(options=options) as driver:
        driver.set_page_load_timeout(40)
        driver.execute_cdp_cmd("Network.enable", {})
        driver.execute_cdp_cmd("Network.setExtraHTTPHeaders", {"headers":{"X-Pangolin-CI-CMS":mode}})
        wait = WebDriverWait(driver, 20)
        def title():
            return driver.execute_script("return document.querySelector('h1')?.textContent || ''")
        def settled():
            wait.until(lambda d: d.execute_script(
                "return performance.getEntriesByName(location.origin + '/api/content/site').length > 0 && "
                "document.querySelectorAll('#servicios .service-accordion__item.is-open').length === 1"))
        def report(stage):
            messages = [entry["message"] for entry in driver.get_log("browser")
                        if "hydration" in entry["message"].lower() and "mismatch" in entry["message"].lower()]
            print("MEASURE baseline hydration", json.dumps({
                "mode":mode,"stage":stage,"mismatch_count":len(messages)
            }), flush=True)
        driver.get(base + "/")
        settled()
        if mode == "refresh":
            wait.until(lambda d: beta in title())
        else:
            assert alpha not in title() and beta not in title() and title().strip()
        report("initial Spanish mount")
        if mode == "refresh":
            driver.execute_script("localStorage.setItem('user-locale','en')")
            driver.refresh()
            settled()
            wait.until(lambda d: english in title())
            report("English reload")
print("PASS baseline diagnostic completed; mismatch counts are observations, not acceptance")
