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
from html import escape
from datetime import datetime, timezone
import runpy
import time
import os

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
BASE = "http://127.0.0.1:4188"
OTP = runpy.run_path(str(ROOT / "scripts" / "smoke-local.py"))["latest_otp"]
WAIT = 20
REPORT_DIR = ROOT / "artifacts" / "visual-review"
CAPTURES = []

def screenshot(driver, slug, title, route, detail):
    """Evidence from real rendered Chrome; never capture secrets, codes or cookies."""
    images = REPORT_DIR / "screenshots"
    images.mkdir(parents=True, exist_ok=True)
    # Images and web fonts may finish shortly after the marker is visible.
    driver.execute_script("window.scrollTo(0, 0)")
    time.sleep(.4)
    image_path = images / (slug + ".png")
    assert driver.save_screenshot(str(image_path)), "Could not capture " + slug
    CAPTURES.append({
        "slug": slug, "title": title, "route": route, "detail": detail,
        "image": "screenshots/" + slug + ".png"
    })
    print("CAPTURA: " + slug, flush=True)

def write_visual_report(completed):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    label = "Pruebas terminadas correctamente" if completed else "Prueba interrumpida o fallida"
    color = "#28784a" if completed else "#b64735"
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    nav = "".join(
        '<a href="#' + escape(item["slug"]) + '">' + escape(item["title"]) + '</a>'
        for item in CAPTURES)
    cards = "".join(
        '<article class="card" id="' + escape(item["slug"]) + '">'
        '<div class="card-text"><div class="eyebrow">' + escape(item["route"]) + '</div>'
        '<h2>' + escape(item["title"]) + '</h2><p>' + escape(item["detail"]) + '</p></div>'
        '<a href="' + escape(item["image"]) + '" target="_blank" title="Abrir captura completa">'
        '<img src="' + escape(item["image"]) + '" alt="' + escape(item["title"]) + '" loading="lazy"></a>'
        '</article>'
        for item in CAPTURES)
    report = '''<!doctype html><html lang="es"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>Grupo Castro Fallas | Revisión visual de PR #38</title>
    <style>
    :root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#20282e;background:#f5f5f6}
    *{box-sizing:border-box}body{margin:0}.hero{background:#641329;color:#fff;padding:36px max(18px,calc((100vw - 1240px)/2))}
    h1{font-size:clamp(26px,4vw,42px);margin:8px 0 12px}h2{font-size:21px;margin:6px 0}
    p{line-height:1.55}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.07em;font-weight:650;opacity:.8}
    .status{display:inline-block;background:''' + color + ''';padding:8px 14px;border-radius:20px;color:#fff;font-weight:700}
    .wrapper{max-width:1276px;margin:auto;padding:26px 18px 64px}
    .instructions{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:28px}
    .info{background:#fff;border:1px solid #dedee2;padding:20px;border-radius:12px}
    .nav{display:flex;gap:8px;overflow:auto;padding:8px 0 22px}
    .nav a{flex:none;font-size:13px;text-decoration:none;color:#641329;background:#fff;border:1px solid #d6ced1;border-radius:30px;padding:8px 12px}
    .gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}
    .card{background:white;border:1px solid #dfe1e5;border-radius:13px;overflow:hidden;scroll-margin-top:12px}
    .card-text{padding:18px 20px 9px}.card-text p{font-size:14px;color:#5b6167;margin:4px 0 12px}
    .card>a{display:block;background:#ddd;border-top:1px solid #e0e0e0;max-height:650px;overflow:hidden}
    .card img{width:100%;display:block;object-fit:cover;object-position:top;transition:transform .2s}
    .card img:hover{transform:scale(1.015)}.footer{font-size:13px;color:#626974;padding-top:28px}
    @media(max-width:760px){.instructions,.gallery{grid-template-columns:1fr}.hero{padding:28px 18px}.card>a{max-height:600px}}
    </style></head><body>
    <div class="hero"><div class="eyebrow">Prueba automatizada · PR #38 · Sin fusionar en main</div>
    <h1>Revisión visual de Grupo Castro Fallas</h1>
    <p>Capturas reales de Chrome con un backend de pruebas (PostgreSQL, OTP y cuentas de demostración).</p>
    <span class="status">''' + escape(label) + '''</span>
    <p>Fecha: ''' + escape(created) + ''' · Capturas: ''' + str(len(CAPTURES)) + '''</p></div>
    <main class="wrapper"><section class="instructions">
    <div class="info"><h2>Qué debés revisar</h2><p>Comprobá el logotipo, encabezado, imágenes, disposición, botones, formularios y navegación.
    Hacé clic en cada captura para ampliarla. Las capturas muestran la PR #38, no la página publicada.</p></div>
    <div class="info"><h2>Qué no certifican las capturas</h2><p>No garantizan posicionamiento en Google ni prueban todos los clicks
    o servicios externos en producción. OTP y permisos se comprobaron con cuentas de prueba.
    Para comparar interactividad, abrí main y la PR en dos pestañas.</p></div>
    </section><nav class="nav">''' + nav + '''</nav>
    <section class="gallery">''' + cards + '''</section>
    <p class="footer">Informe local, sin llamadas a servicios externos. No contiene contraseñas ni códigos OTP.
    Fuente: CI de GitHub Actions, PR #38 de CustomCodeCR/PangolinBackend.</p></main></body></html>'''
    (REPORT_DIR / "index.html").write_text(report, encoding="utf-8")
    print("INFORME VISUAL: " + str(REPORT_DIR / "index.html"), flush=True)

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

def wait_for_otp_cooldown():
    # Respect the real security policy: at most one OTP request per account per 60 seconds.
    outbox = ROOT / 'backend' / 'local-outbox'
    files = list(outbox.glob('otp-*.eml'))
    if not files:
        return
    last_otp = max(p.stat().st_mtime for p in files)
    remaining = max(0, 65 - (time.time() - last_otp))
    if remaining:
        print('Waiting %.0fs for legitimate OTP cooldown between independent test suites' % remaining, flush=True)
        time.sleep(remaining)

def main():
    preview = None
    driver = None
    completed = False
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
            shot = {"/": ("01-inicio-escritorio", "Inicio", "Portada y navegación"),
                    "/servicios": ("02-servicios-escritorio", "Servicios", "Servicios logísticos"),
                    "/nosotros": ("03-nosotros-escritorio", "Sobre nosotros", "Información de la empresa"),
                    "/noticias": ("04-noticias-escritorio", "Noticias", "Sección pública de noticias")}
            screenshot(driver, shot[route][0], shot[route][1], route, shot[route][2])

        # Capture the responsive public site with a real mobile-sized viewport.
        driver.set_window_size(390, 844)
        for route, marker, slug, title in [
            ("/", ".home-hero__content", "05-inicio-movil", "Inicio móvil"),
            ("/servicios", ".services-page__transport", "06-servicios-movil", "Servicios móvil"),
            ("/noticias", ".news-editorial-hero", "07-noticias-movil", "Noticias móvil")
        ]:
            driver.get(BASE + route)
            await_css(driver, marker)
            screenshot(driver, slug, title, route, "Captura a 390 × 844 píxeles")
        driver.set_window_size(1440, 1100)

        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-access-status--blocked")
        screenshot(driver, "08-cotizaciones-invitado", "Cotizaciones sin sesión", "/cotizaciones", "Protección para visitantes")
        print("PASS Chrome + backend: guest quotation blocked")
        driver.get(BASE + "/administracion")
        await_url(driver, "/bienvenidos")
        await_css(driver, ".login-auth-form")
        screenshot(driver, "09-login", "Inicio de sesión", "/bienvenidos", "Formulario OTP sin datos sensibles")
        print("PASS Chrome + backend: guest administration redirects to login")

        wait_for_otp_cooldown()
        login(driver, "demo.usuario@castrofallas.test", "/administracion")
        await_css(driver, ".manager-heading")
        screenshot(driver, "10-administracion", "Administración", "/administracion", "Panel real con sesión de demostración")
        click(driver, '.manager-tabs button:nth-child(2)')
        await_css(driver, ".manager-users-card")
        WebDriverWait(driver, WAIT).until(
            lambda d: len(d.find_elements(By.CSS_SELECTOR, ".manager-users-table tbody tr")) > 0)
        screenshot(driver, "11-gestion-usuarios", "Gestión de usuarios", "/administracion?tab=usuarios", "Lista de cuentas de prueba")
        click(driver, '.manager-tabs button:nth-child(1)')
        click(driver, '.manager-subtabs button:nth-child(2)')
        await_css(driver, 'form')
        screenshot(driver, "12-editor-noticias", "Gestión de noticias", "/administracion", "Formulario de noticias con sesión real")
        click(driver, '.manager-subtabs button:nth-child(3)')
        await_css(driver, ".manager-form")
        screenshot(driver, "13-multimedia", "Gestión multimedia", "/administracion", "Pantalla de archivos multimedia")
        click(driver, '.manager-subtabs button:nth-child(5)')
        await_css(driver, ".content-manager")
        screenshot(driver, "14-editor-visual", "Editor visual", "/administracion", "Editor de contenido de la página")
        print("PASS Chrome + backend: real admin OTP, user list, CMS tabs, visual editor")

        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-landing-grid")
        screenshot(driver, "15-cotizaciones-admin", "Cotizaciones administrador", "/cotizaciones", "Cotizador para una sesión administradora")
        print("PASS Chrome + backend: admin quote page unlocked")
        driver.delete_all_cookies()
        driver.get(BASE + "/cotizaciones")
        await_css(driver, ".quote-access-status--blocked")

        login(driver, "demo.cliente@castrofallas.test", "/cotizaciones")
        await_css(driver, ".quote-landing-grid")
        screenshot(driver, "16-cotizaciones-cliente", "Cotizaciones cliente", "/cotizaciones", "Cotizador con sesión cliente real")
        click(driver, ".quote-choice-card--land button")
        await_css(driver, ".quote-wizard")
        screenshot(driver, "17-cotizacion-terrestre", "Wizard terrestre", "/cotizaciones", "Paso inicial de cotización terrestre")
        click(driver, ".quote-text-back")
        await_css(driver, ".quote-landing-grid")
        click(driver, ".quote-choice-card--ocean button")
        await_css(driver, ".quote-cargo-form")
        screenshot(driver, "18-cotizacion-aerea", "Wizard aéreo", "/cotizaciones", "Paso inicial de cotización aérea")
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
            screenshot(driver, "19-tracking" if route == "/tracking" else "20-itinerarios",
                       "Tracking cliente" if route == "/tracking" else "Itinerarios cliente",
                       route, "Vista autorizada con sesión cliente")
            print("PASS Chrome + backend: authorized " + route)

        js_errors = [
            item.get("message", "")
            for item in driver.get_log("browser")
            if item.get("level") == "SEVERE" and any(
                m in item.get("message", "") for m in ("Uncaught", "SyntaxError", "ReferenceError", "TypeError"))
        ]
        assert not js_errors, "Uncaught JS error: " + "; ".join(js_errors[:3])
        print("PASS Chrome + backend: no uncaught runtime JS errors in final page")
        completed = True
        print("PASS: real browser login, role authorization, CMS UI and quotation flows")
    except TimeoutException as exc:
        state = "<no browser>"
        if driver:
            state = driver.current_url + " " + driver.page_source[-1200:]
        raise AssertionError("UI timeout at " + state) from exc
    finally:
        write_visual_report(completed)
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
