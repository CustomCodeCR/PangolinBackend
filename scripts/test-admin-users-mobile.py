#!/usr/bin/env python3
"""Real Chrome responsive smoke for user management, with an isolated fake API.

Only test identities are served by localhost; no production sessions or databases.
Run after npm run build --prefix frontend, with selenium installed and Chrome available.
"""
import json
import mimetypes
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
SHOTS = ROOT / "artifacts" / "admin-users-mobile"
ACTIVE_ID = "00000000-0000-4000-8000-000000000101"
INACTIVE_ID = "00000000-0000-4000-8000-000000000102"
USERS = [
    {"id": ACTIVE_ID, "nombre": "Empresa activa de prueba",
     "correo": "activo@example.invalid", "role": "cliente", "activo": True},
    {"id": INACTIVE_ID, "nombre": "Empresa inactiva de prueba",
     "correo": "inactivo@example.invalid", "role": "administrador", "activo": False},
]

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_GET(self):
        route = self.path.split("?", 1)[0]
        if route.startswith("/api/"):
            if route == "/api/auth/me":
                return self.send_json({"id": "00000000-0000-4000-8000-000000000100",
                                       "nombre": "Admin temporal", "correo": "admin@example.invalid",
                                       "role": "administrador"})
            if route == "/api/admin/users":
                return self.send_json({"users": USERS, "total": len(USERS),
                                       "page": 1, "pageSize": 100, "totalPages": 1})
            if route == "/api/admin/quotes/official":
                return self.send_json({"total": 0, "items": []})
            if route == "/api/itinerarios":
                return self.send_json({"items": [], "totalPages": 1})
            if route in ("/api/admin/content/site", "/api/admin/content/news",
                         "/api/admin/content/comments", "/api/admin/content/media"):
                return self.send_json([])
            return self.send_json({"error": "Not mocked"}, 404)
        path = (DIST / route.lstrip("/")).resolve()
        if not path.is_relative_to(DIST.resolve()):
            return self.send_error(403)
        if not path.is_file():
            path = DIST / "index.html"
        if not path.is_file():
            return self.send_error(404, "Frontend dist not built")
        data = path.read_bytes()
        mime = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload, status=200):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

def metrics(browser):
    return browser.execute_script("""
      const wrap = document.querySelector('.manager-users-table-wrap');
      const table = document.querySelector('.manager-users-table');
      const rows = [...document.querySelectorAll('.manager-users-table tbody tr')];
      const trigger = rows[0].querySelector('td[data-label="Estado"] .cf-dropdown__trigger');
      const disabled = rows[0].querySelector('.manager-user-delete');
      const allowed = rows[1].querySelector('.manager-user-delete');
      const br = wrap.getBoundingClientRect();
      return {
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        wrapperWidth: wrap.clientWidth,
        wrapperScrollWidth: wrap.scrollWidth,
        wrapperRight: br.right,
        tableWidth: table.getBoundingClientRect().width,
        rows: rows.length,
        rowRight: rows.map(row => row.getBoundingClientRect().right),
        triggerWidth: trigger.getBoundingClientRect().width,
        triggerText: trigger.innerText.trim(),
        disabledDelete: disabled.disabled,
        enabledDelete: !allowed.disabled,
        gridColumns: getComputedStyle(rows[0]).gridTemplateColumns
      };
    """)

def main():
    if not (DIST / "index.html").is_file():
        raise AssertionError("Build the Vue frontend first")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    options = Options()
    for flag in ("--headless=new", "--no-sandbox", "--disable-gpu",
                 "--disable-dev-shm-usage", "--no-first-run", "--no-proxy-server"):
        options.add_argument(flag)
    browser = None
    try:
        browser = webdriver.Chrome(options=options)
        SHOTS.mkdir(parents=True, exist_ok=True)
        for width in (320, 375, 430, 768, 1024, 1280):
            browser.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                "width": width, "height": 870, "deviceScaleFactor": 1,
                "mobile": width < 1100
            })
            url = f"http://127.0.0.1:{server.server_port}/administracion?tab=usuarios"
            browser.get(url)
            WebDriverWait(browser, 18).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR, ".manager-users-table tbody tr")) == 2
            )
            measurement = metrics(browser)
            assert measurement["viewport"] == width, measurement
            assert measurement["documentWidth"] <= width + 1, measurement
            assert measurement["wrapperScrollWidth"] <= measurement["wrapperWidth"] + 1, measurement
            assert all(right <= width + 2 for right in measurement["rowRight"]), measurement
            assert measurement["disabledDelete"] and measurement["enabledDelete"], measurement
            assert measurement["triggerWidth"] >= 160, measurement
            if width <= 1024:
                assert len(measurement["gridColumns"].split()) in (1, 2), measurement
            else:
                assert measurement["gridColumns"] == "none", measurement
            if width in (320, 375, 768):
                browser.save_screenshot(str(SHOTS / f"usuarios-{width}.png"))

            status_trigger = browser.find_element(
                By.CSS_SELECTOR, '.manager-users-table tbody tr:first-child td[data-label="Estado"] .cf-dropdown__trigger'
            )
            browser.execute_script("arguments[0].scrollIntoView({block:'center'});", status_trigger)
            status_trigger.click()
            WebDriverWait(browser, 5).until(
                lambda d: bool(d.find_elements(By.CSS_SELECTOR, ".cf-dropdown__menu"))
            )
            popup = browser.execute_script("""
              const m = document.querySelector('.cf-dropdown__menu');
              const rect = m.getBoundingClientRect();
              const options = [...m.querySelectorAll('[role=option]')];
              return {width: rect.width, left: rect.left, right: rect.right,
                scrollWidth: m.scrollWidth, clientWidth: m.clientWidth,
                labels: options.map(x => x.textContent.trim())};
            """)
            assert popup["width"] >= min(190, width - 16) - 1, (width, popup)
            assert popup["left"] >= -1 and popup["right"] <= width + 1, (width, popup)
            assert popup["scrollWidth"] <= popup["clientWidth"] + 2, (width, popup)
            assert "Desactivado" in popup["labels"], popup
            if width in (320, 375):
                browser.save_screenshot(str(SHOTS / f"desplegable-{width}.png"))
            print(f"PASS admin responsive {width}px: sin scroll lateral, menú legible y botones estables", flush=True)
    finally:
        if browser:
            browser.quit()
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
