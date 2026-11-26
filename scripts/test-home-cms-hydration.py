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
# Parse actual H1 content (Vue scoped CSS can add attributes).
# Inspect only synthetic booleans, not full page HTML or payload.
import json
from html.parser import HTMLParser

class HeadingParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.headings = []
    def handle_starttag(self, tag, attrs):
        if tag == "h1":
            self.active = True
            self.headings.append("")
    def handle_endtag(self, tag):
        if tag == "h1":
            self.active = False
    def handle_data(self, data):
        if self.active:
            self.headings[-1] += data

last = {}
for _ in range(20):
    with urlopen(base + "/api/content/site", timeout=5) as response:
        slots = json.load(response)
    with urlopen(base + "/", timeout=5) as response:
        html = response.read().decode("utf-8")
    parser = HeadingParser()
    parser.feed(html)
    last = {
        "fixture_public_api": any(item.get("key") == "home.hero.title1" and item.get("textEs") == alpha for item in slots),
        "h1_count": len(parser.headings),
        "marker_in_visible_h1": any(alpha in heading for heading in parser.headings),
        "marker_anywhere_html": alpha in html,
    }
    if last["fixture_public_api"] and last["marker_in_visible_h1"]:
        break
    time.sleep(.2)
else:
    raise AssertionError("SSR H1 or fixture mismatch: " + str(last))
print("PASS gateway public CMS fixture and SSR visible H1", last)

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
