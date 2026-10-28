#!/usr/bin/env python3
"""Regression Chrome: news cards at responsive breakpoints, full article on mobile.
Local mock data, no production account, database, cookies or tracking provider.
Run after npm run build --prefix frontend, with Selenium + Chrome installed.
"""
import json
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"
SHOTS = ROOT / "artifacts" / "news-responsive"
NEWS = [
    {
        "id": f"00000000-0000-4000-8000-00000000000{index}",
        "title": f"Noticia de prueba {index} sobre logística internacional",
        "description": "Resumen de prueba sobre información logística.",
        "body": "Primer párrafo de ejemplo para verificar la lectura.\n\nSegundo párrafo de ejemplo que debe permanecer visible en móvil.",
        "image": "/images/cover-logistics.jpeg",
        "category": "Logística",
        "author": "Autor de pruebas",
        "publishedAt": "2026-10-27T12:00:00Z",
        "published": True,
    }
    for index in range(1, 4)
]

class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def json_response(self, data, status=200):
        payload = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/api/content/news":
            return self.json_response(NEWS)
        if route == "/api/content/comments":
            return self.json_response([])
        if route == "/api/content/site":
            return self.json_response({})
        if route == "/api/auth/me":
            return self.json_response({"error": "No autenticado"}, 401)
        if route.startswith("/api/"):
            return self.json_response({"error": "Not mocked"}, 404)
        path = (DIST / route.lstrip("/")).resolve()
        if not path.is_relative_to(DIST.resolve()):
            return self.send_error(403)
        if not path.is_file():
            path = DIST / "index.html"
        if not path.is_file():
            return self.send_error(404, "Build frontend before Chrome smoke")
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(path))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

def viewport(browser, width):
    browser.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
        "width": width, "height": 870, "deviceScaleFactor": 1, "mobile": width < 1100
    })

def news_metrics(browser):
    return browser.execute_script("""
        const layout = document.querySelector('#servicios .services-news-layout');
        const services = document.querySelector('#servicios .services-main');
        const sidebar = document.querySelector('#servicios .home-news-sidebar');
        const list = document.querySelector('#servicios .home-news-sidebar__list');
        const group = document.querySelector('#servicios .home-news-sidebar__group:first-child');
        const second = document.querySelector('#servicios .home-news-sidebar__group:nth-child(2)');
        const cards = [...group.querySelectorAll('.home-hero-news__card')];
        const lr = list.getBoundingClientRect(), sr = sidebar.getBoundingClientRect();
        return {
            width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
            gridColumns: getComputedStyle(layout).gridTemplateColumns.split(' ').length,
            sidebarTop: sr.top, servicesBottom: services.getBoundingClientRect().bottom,
            sidebarWidth: sr.width, layoutWidth: layout.getBoundingClientRect().width,
            listLeft: lr.left, listRight: lr.right,
            direction: getComputedStyle(group).flexDirection,
            secondDisplay: second ? getComputedStyle(second).display : 'missing',
            cards: cards.map(el => {
                const b = el.getBoundingClientRect();
                return {left:b.left, right:b.right, width:b.width, height:b.height};
            })
        };
    """)

def main():
    if not (DIST / "index.html").is_file():
        raise AssertionError("Frontend dist is missing")
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    browser = None
    try:
        options = Options()
        for flag in ("--headless=new", "--no-sandbox", "--disable-gpu",
                     "--disable-dev-shm-usage", "--no-first-run",
                     "--no-proxy-server"):
            options.add_argument(flag)
        browser = webdriver.Chrome(options=options)
        SHOTS.mkdir(parents=True, exist_ok=True)
        origin = f"http://127.0.0.1:{server.server_port}"
        for width in (390, 650, 651, 768, 820, 950, 1024, 1100, 1101, 1440):
            viewport(browser, width)
            browser.get(origin + "/")
            WebDriverWait(browser, 20).until(
                lambda d: len(d.find_elements(By.CSS_SELECTOR,
                    '#servicios .home-news-sidebar__group:first-child .home-hero-news__card')) == 3)
            m = news_metrics(browser)
            assert m["width"] == width, m
            assert m["documentWidth"] <= width + 1, m
            assert len(m["cards"]) == 3, m
            if 651 <= width <= 1100:
                assert m["gridColumns"] == 1, m
                assert m["sidebarTop"] >= m["servicesBottom"] - 2, m
                assert m["sidebarWidth"] >= m["layoutWidth"] - 3, m
                assert m["direction"] == "row", m
                assert m["secondDisplay"] == "none", m
                assert all(card["height"] >= 100 and card["width"] >= 60
                           and card["left"] >= m["listLeft"] - 2
                           and card["right"] <= m["listRight"] + 2
                           for card in m["cards"]), m
            if width in (390, 650, 651, 820, 1024, 1100, 1101, 1440):
                browser.execute_script(
                    "document.querySelector('#servicios').scrollIntoView({block:'start'});")
                browser.save_screenshot(str(SHOTS / f"portada-noticias-{width}.png"))
            print(f"PASS inicio noticias responsive {width}px", flush=True)

        for width in (390, 720):
            viewport(browser, width)
            browser.get(origin + "/noticias?article=" + NEWS[0]["id"])
            WebDriverWait(browser, 20).until(
                lambda d: bool(d.find_elements(By.CSS_SELECTOR,
                    ".news-article-page__reading .news-article-page__content")))
            m = browser.execute_script("""
                const r = document.querySelector('.news-article-page__reading');
                const h = document.querySelector('.news-article-page__handle');
                const image = r.querySelector('.news-article-page__side-image');
                const content = r.querySelector('.news-article-page__content');
                return {
                    width: window.innerWidth, documentWidth: document.documentElement.scrollWidth,
                    maxHeight: getComputedStyle(r).maxHeight,
                    overflowY: getComputedStyle(r).overflowY,
                    handleDisplay: h ? getComputedStyle(h).display : 'none',
                    imageBottom: image.getBoundingClientRect().bottom,
                    contentTop: content.getBoundingClientRect().top,
                    bodyText: content.textContent
                };
            """)
            assert m["width"] == width and m["documentWidth"] <= width + 1, m
            assert m["maxHeight"] == "none" and m["overflowY"] == "visible", m
            assert m["handleDisplay"] == "none", m
            assert m["imageBottom"] <= m["contentTop"] + 4, m
            assert "Segundo párrafo" in m["bodyText"], m
            browser.save_screenshot(str(SHOTS / f"articulo-completo-{width}.png"))
            print(f"PASS artículo abierto y completo en móvil {width}px", flush=True)
    finally:
        if browser:
            browser.quit()
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
