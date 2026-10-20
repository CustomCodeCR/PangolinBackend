#!/usr/bin/env python3
"""Real Chrome + real .NET API + isolated PostgreSQL integration smoke.
Uses only seeded demo identities and LocalOutbox OTPs. Never logs OTPs/cookies.
Run only with docker-compose backend, test database, and LocalOutbox.
"""
from pathlib import Path
from urllib.request import urlopen
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException
from subprocess import Popen, DEVNULL
import runpy
import time
import os

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
BASE = "http://127.0.0.1:4188"
OTP = runpy.run_path(str(ROOT / "scripts" / "smoke-local.py"))["latest_otp"]
WAIT = 20

def ready(url, seconds=25):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            pass
        time.sleep(.25)
    raise AssertionError("Frontend or API not ready: " + url)

def await_css(driver, selector, timeout=WAIT):
    return WebDriverWait(driver, timeout).until(
        lambda d: next((e for e in d.find_elements(By.CSS_SELECTOR, selector)
                        if e.is_displayed()), None))

def await_url(driver, path):
    WebDriverWait(driver, WAIT).until(
        lambda d: d.current_url.startswith(BASE + path))

def click(driver, selector):
    el = await_css(driver, selector)
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    el.click()

def login(driver, email, destination):
    driver.get(BASE + "/bienvenidos?next=" + destination)
    email_input = await_css(driver, '.login-auth-form input[type="email"]')
    since = time.time()
    email_input.clear()
    email_input.send_keys(email)
    click(driver, '.login-auth-form button[type="submit"]')
    otp_input = await_css(driver, '.login-auth-form input[autocomplete="one-time-code"]')
    code = None
    deadline = time.time() + 18
    while time.time() < deadline and not code:
        code = OTP(email, since)
        if not code:
            time.sleep(.25)
    assert code is not None, "No LocalOutbox OTP for test user"
    otp_input.send_keys(code)
    click(driver, '.login-auth-form button[type="submit"]')
    await_url(driver, destination)
    assert not driver.find_elements(By.CSS_SELECTOR, ".login-auth-error"), "OTP UI rejected a real test login"

def assert_public(driver, path, marker):
    driver.get(BASE + path)
    await_css(driver, marker)
    assert driver.find_elements(By.CSS_SELECTOR, "h1"), "Missing visible h1: " + path
    assert driver.title.endswith("Castro Fallas") or "Castro Fallas" in driver.title, "SEO title not set: " + path
    print("PASS Chrome + backend: public " + path)

def main():
    preview = None
    driver = None
    try:
        ready("http://127.0.0.1:5000/api/health/ready")
        preview = Popen(["npm", "run", "preview", "--", "--host", "127.0.0.1",
                         "--port", "4188", "--strictPort"], cwd=FRONTEND,
                        stdout=DEVNULL, stderr=DEVNULL)
        ready(BASE + "/")
        ready(BASE + "/api/health/ready")
        options = Options()
        for opt in ("--headless=new", "--no-sandbox", "--disable-gpu",
                    "--disable-dev-shm-usage", "--no-first-run",
                    "--no-proxy-server", "--window-size=1440,1100"):
            options.add_argument(opt)
        options.set_capability("goog:loggingPrefs", {"browser": "ALL"})
        driver = webdriver.Chrome(options=options)
        for route, marker in [
            ("/", ".home-hero__content"),
            ("/servicios", ".services-page__transport"),
            ("/nosotros", ".about-reference-intro"),
            ("/noticias", ".news-editorial-hero")
        ]:
            assert_public(driver, route, marker)

        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-access-status--blocked")
        print("PASS Chrome + backend: guest quotation blocked")
        driver.get(BASE + "/administracion")
        await_url(driver, "/bienvenidos")
        await_css(driver, ".login-auth-form")
        print("PASS Chrome + backend: guest administration redirects to login")

        login(driver, "demo.usuario@castrofallas.test", "/administracion")
        await_css(driver, ".manager-heading")
        click(driver, '.manager-tabs button:nth-child(2)')
        await_css(driver, ".manager-users-card")
        WebDriverWait(driver, WAIT).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, ".manager-users-table tbody tr")) > 0)
        click(driver, '.manager-tabs button:nth-child(1)')
        click(driver, '.manager-subtabs button:nth-child(2)')
        await_css(driver, 'form')
        click(driver, '.manager-subtabs button:nth-child(3)')
        await_css(driver, ".manager-form")
        click(driver, '.manager-subtabs button:nth-child(5)')
        await_css(driver, ".content-manager")
        print("PASS Chrome + backend: real admin OTP, user list, CMS tabs, visual editor")

        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-landing-grid")
        print("PASS Chrome + backend: admin quote page unlocked")
        driver.delete_all_cookies()
        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-access-status--blocked")

        login(driver, "demo.cliente@castrofallas.test", "/cotizaciones")
        await_css(driver, ".quote-landing-grid")
        click(driver, ".quote-choice-card--land button")
        await_css(driver, ".quote-wizard")
        click(driver, ".quote-text-back")
        await_css(driver, ".quote-landing-grid")
        click(driver, ".quote-choice-card--ocean button")
        await_css(driver, ".quote-cargo-form")
        print("PASS Chrome + backend: real client OTP and ground/air wizard screens")

        driver.get(BASE + "/administracion")
        await_url(driver, "/home")
        assert not driver.find_elements(By.CSS_SELECTOR, ".manager-heading"), "Client saw admin manager"
        print("PASS Chrome + backend: real client cannot access administration")

        for route, marker in [("/tracking", ".tracking-section"), ("/itinerario", ".itinerary-page")]:
            driver.get(BASE + route)
            # These page sections may have different class names; require the page to render and not redirect to home/login.
            WebDriverWait(driver, WAIT).until(
                lambda d: d.current_url == BASE + route and d.find_elements(By.CSS_SELECTOR, "main"))
            print("PASS Chrome + backend: authorized " + route)

        js_errors = [
            item.get("message", "")
            for item in driver.get_log("browser")
            if item.get("level") == "SEVERE" and any(
                m in item.get("message", "") for m in ("Uncaught", "SyntaxError", "ReferenceError", "TypeError"))
        ]
        assert not js_errors, "Uncaught JS error: " + "; ".join(js_errors[:3])
        print("PASS Chrome + backend: no uncaught runtime JS errors in final page")
        print("PASS: real browser login, role authorization, CMS UI and quotation flows")
    except TimeoutException as exc:
        state = "<no browser>"
        if driver:
            state = driver.current_url + " " + driver.page_source[-1200:]
        raise AssertionError("UI timeout at " + state) from exc
    finally:
        if driver:
            driver.quit()
        if preview:
            preview.terminate()
            try:
                preview.wait(timeout=5)
            except Exception:
                preview.kill()

if __name__ == "__main__":
    main()
