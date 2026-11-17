#!/usr/bin/env python3
"""Chrome editorial CMS smoke, only callable inside isolated MinIO/Postgres CI.

Uses one seeded admin JWT from the existing fake-only OTP harness and an
ephemeral Vite dev server proxied to the isolated backend on loopback.
Never prints credentials, captures secrets, or reaches real CMS/storage.
"""
import os
from pathlib import Path
from subprocess import Popen, DEVNULL, TimeoutExpired
from time import monotonic, sleep
from urllib.request import urlopen
from http.cookiejar import CookieJar
from urllib.request import HTTPCookieProcessor


def editor_smoke(admin, helper, webp_enabled):
    assert isinstance(webp_enabled, bool), "WebP mode must be explicit"
    assert os.getenv("CI") == "true"
    assert os.getenv("CMS_REAL_MINIO_ISOLATED") == "1"
    assert os.getenv("CMS_REAL_MINIO_EDITOR_UI_TEST") == "1"
    assert os.getenv("RUNNER_TEMP")
    from selenium import webdriver
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.common.exceptions import StaleElementReferenceException

    origin = "http://127.0.0.1:5173"
    root = Path(__file__).resolve().parent.parent
    title = "CI editor CMS aislado " + helper.uuid.uuid4().hex[:10]
    updated_title = title + " actualizado"
    created_news_id = None
    created_media_id = None
    driver = None

    env = os.environ.copy()
    env.update({
        "VITE_API_PROXY_TARGET": "http://127.0.0.1:15000",
        "VITE_CMS_RESPONSIVE_WEBP_ENABLED": "true" if webp_enabled else "false",
    })
    vite = Popen(["npm", "run", "dev", "--", "--host", "127.0.0.1",
                  "--port", "5173", "--strictPort"],
                 cwd=root / "frontend", env=env, stdout=DEVNULL, stderr=DEVNULL)
    try:
        deadline = monotonic() + 35
        while monotonic() < deadline:
            if vite.poll() is not None:
                raise AssertionError("Isolated Vite process exited before readiness")
            try:
                with urlopen(origin + "/", timeout=1.5) as response:
                    if response.status == 200:
                        break
            except OSError:
                sleep(.25)
        else:
            raise AssertionError("Vite did not become ready on loopback")

        cookie_jar = next((h.cookiejar for h in admin.handlers
                           if isinstance(h, HTTPCookieProcessor)), None)
        assert isinstance(cookie_jar, CookieJar), "Test admin cookie jar missing"
        cookies = list(cookie_jar)
        assert cookies, "Isolated test admin has no session cookie"

        options = Options()
        for option in ("--headless=new", "--no-sandbox", "--disable-gpu",
                       "--disable-dev-shm-usage", "--no-first-run",
                       "--disable-background-networking", "--window-size=1440,1100"):
            options.add_argument(option)
        driver = webdriver.Chrome(options=options)
        wait = WebDriverWait(driver, 25)

        def submit_editor():
            button = driver.find_element(By.CSS_SELECTOR, ".manager-form button.manager-submit")
            driver.execute_script(
                "arguments[0].scrollIntoView({behavior:'instant',block:'center'});", button)
            sleep(.2)
            # Keyboard activation exercises the real native submit button.
            # Selenium mouse-click is unreliable in this long scrolling form.
            button.send_keys(Keys.ENTER)

        def choose_publication(label):
            # Prefer the live form's visible field over the prop-generated
            # aria-label: the FieldDropdown implementation can vary by build.
            field = wait.until(lambda d: next(
                (el for el in d.find_elements(
                    By.CSS_SELECTOR, ".manager-form .manager-select-field")
                 if "Estado de publicación" in el.text), None))
            trigger = field.find_element(By.CSS_SELECTOR, 'button[role="combobox"]')
            driver.execute_script(
                "arguments[0].scrollIntoView({behavior:'instant',block:'center'});", trigger)
            sleep(.15)
            trigger.click()
            options = wait.until(lambda d: d.find_elements(
                By.CSS_SELECTOR, '[role="listbox"] [role="option"]'))
            choice = next((item for item in options if label in item.text), None)
            assert choice, "Publication option missing: " + label
            choice.click()

        driver.get(origin + "/")
        for cookie in cookies:
            driver.add_cookie({
                "name": cookie.name, "value": cookie.value,
                "path": cookie.path or "/", "secure": False
            })
        driver.get(origin + "/administracion")
        wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, ".manager-heading"))
        wait.until(lambda d: d.find_elements(By.CSS_SELECTOR, ".manager-subtabs button:nth-child(2)"))
        driver.find_element(By.CSS_SELECTOR, ".manager-subtabs button:nth-child(2)").click()
        wait.until(lambda d: d.find_elements(By.CSS_SELECTOR,
                                             '.manager-form form input[placeholder="Título de la noticia"]'))

        form = driver.find_element(By.CSS_SELECTOR, ".manager-form form")
        form.find_element(By.CSS_SELECTOR, 'input[placeholder="Título de la noticia"]').send_keys(title)
        form.find_element(By.CSS_SELECTOR, 'textarea[placeholder="Resumen breve de la noticia"]').send_keys(
            "Resumen editorial ficticio para prueba aislada de WebP.")
        upload = form.find_element(By.CSS_SELECTOR, 'input[type="file"]')
        upload.send_keys(str(root / "frontend" / "public" / "images" / "cover-logistics.jpeg"))
        wait.until(lambda d: "Se subirá a MinIO" in d.find_element(
            By.CSS_SELECTOR, ".manager-form").text)
        assert "Este borrador no aparecerá" in form.text, "Draft must be the default"
        submit_editor()
        wait.until(lambda d: "Noticia guardada como borrador" in d.find_element(
            By.CSS_SELECTOR, ".manager-feedback").text)

        def find_created(expected_title):
            items = helper.json_call(admin, "/api/admin/content/news", 200)
            return next((item for item in items if item["title"] == expected_title), None)

        created = find_created(title)
        assert created and created["published"] is False, "UI did not save private draft"
        created_news_id = created["id"]
        image_url = created["image"]
        import re
        match = re.fullmatch(r"/api/content/media/([0-9a-f-]{36})/file", image_url, re.I)
        assert match, "Editorial upload must store a canonical MinIO media URL"
        created_media_id = match[1]
        helper.check_status(helper.build_opener(), image_url, 404)
        helper.check_status(helper.build_opener(), image_url + "?width=360", 404)
        print("PASS isolated editor Chrome: create news draft + new image via MinIO", flush=True)

        def editor_row(expected_title):
            # Vue replaces list nodes on API refresh; a transient stale
            # reference during polling is not a failed publication/deletion.
            try:
                return next((item for item in driver.find_elements(
                    By.CSS_SELECTOR, ".manager-list .manager-item")
                    if expected_title in item.text), None)
            except StaleElementReferenceException:
                return None

        wait.until(lambda d: editor_row(title) is not None)
        row = editor_row(title)
        row.find_element(By.CSS_SELECTOR, 'button[aria-label="Editar"]').click()
        field = driver.find_element(By.CSS_SELECTOR, '.manager-form form input[placeholder="Título de la noticia"]')
        field.clear()
        field.send_keys(updated_title)
        choose_publication("Publicada")
        wait.until(lambda d: "Esta noticia aparecerá en la web" in
                   d.find_element(By.CSS_SELECTOR, ".manager-form form").text)
        submit_editor()
        wait.until(lambda d: "Noticia publicada" in
                   d.find_element(By.CSS_SELECTOR, ".manager-feedback").text)

        public = helper.json_call(helper.build_opener(), "/api/content/news", 200)
        assert any(n["id"] == created_news_id and n["title"] == updated_title
                   for n in public), "Published UI news not visible publicly"
        if webp_enabled:
            h, image = helper.check_status(
                helper.build_opener(), image_url + "?width=360", 200)
            assert h.get("Content-Type", "").startswith("image/webp") and (
                image[:4] == b"RIFF" and image[8:12] == b"WEBP"), (
                    "Published editorial upload lacks WebP derivative")
        else:
            # OFF rejects ?width and serves the unmodified original via /file.
            helper.check_status(
                helper.build_opener(), image_url + "?width=360", 400)
            h, image = helper.check_status(
                helper.build_opener(), image_url, 200)
            assert h.get("Content-Type", "").startswith("image/jpeg") and (
                image == helper.PHOTO), (
                    "WebP OFF must preserve JPEG bytes at the canonical URL")

        # Real public Vue UI with the same backend/MinIO and compiled Vite flag.
        # Inspect only the fictitious published image; no admin screenshots.
        editor_window = driver.current_window_handle
        driver.switch_to.new_window("tab")
        try:
            driver.set_window_size(390, 900)
            driver.get(origin + "/noticias")

            def image_state(d):
                for elem in d.find_elements(
                        By.CSS_SELECTOR, ".news-editorial-hero__slide img"):
                    result = d.execute_script("""
                        const img = arguments[0];
                        return {src: img.getAttribute('src'),
                                srcset: img.getAttribute('srcset'),
                                currentSrc: img.currentSrc,
                                ready: img.complete && img.naturalWidth > 0};
                    """, elem)
                    if image_url in (result["src"] or "") and result["ready"]:
                        return result
                return False

            state = wait.until(image_state)
            if webp_enabled:
                assert state["srcset"] and "?width=" in state["currentSrc"], (
                    "WebP ON must render responsive public CMS image")
            else:
                assert not state["srcset"] and "?width=" not in state["currentSrc"], (
                    "WebP OFF must render only original public CMS image")
            assert image_url in state["src"], "CMS canonical src changed"
            print(f"PASS isolated public Chrome + editorial MinIO WebP="
                  f"{'ON' if webp_enabled else 'OFF'}: correct image selection",
                  flush=True)
        finally:
            driver.close()
            driver.switch_to.window(editor_window)
            driver.set_window_size(1440, 1100)

        print(f"PASS isolated editor Chrome WebP={'ON' if webp_enabled else 'OFF'}: "
              "edit title, publish, verify original/variant", flush=True)

        wait.until(lambda d: editor_row(updated_title) is not None)
        editor_row(updated_title).find_element(By.CSS_SELECTOR,
                                               'button[aria-label="Editar"]').click()
        choose_publication("Borrador")
        submit_editor()
        wait.until(lambda d: "borrador" in d.find_element(
            By.CSS_SELECTOR, ".manager-feedback").text.lower())
        helper.check_status(helper.build_opener(), image_url + "?width=360", 404)
        assert not any(n["id"] == created_news_id for n in helper.json_call(
            helper.build_opener(), "/api/content/news", 200)), (
            "Unpublished news must disappear from public listing")
        print("PASS isolated editor Chrome: unpublish + immediate variant 404", flush=True)

        wait.until(lambda d: editor_row(updated_title) is not None)
        editor_row(updated_title).find_element(By.CSS_SELECTOR,
                                               'button[aria-label="Eliminar"]').click()
        driver.switch_to.alert.accept()
        wait.until(lambda d: editor_row(updated_title) is None)
        assert find_created(updated_title) is None, "News deletion via UI failed"
        created_news_id = None
        helper.check_status(admin, f"/api/admin/content/media/{created_media_id}",
                            204, method="DELETE")
        created_media_id = None
        print("PASS isolated editor Chrome: delete news via UI + remove orphan-free media", flush=True)
    finally:
        if driver:
            driver.quit()
        if created_news_id:
            status, _, _ = helper.call(
                admin, f"/api/admin/content/news/{created_news_id}", method="DELETE")
            helper.require(status in (204, 404), "Unexpected status cleaning isolated news")
        if created_media_id:
            status, _, _ = helper.call(
                admin, f"/api/admin/content/media/{created_media_id}", method="DELETE")
            helper.require(status in (204, 404), "Unexpected status cleaning isolated media")
        vite.terminate()
        try:
            vite.wait(timeout=8)
        except TimeoutExpired:
            vite.kill()
            vite.wait()
