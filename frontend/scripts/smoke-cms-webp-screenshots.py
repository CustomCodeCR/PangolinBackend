#!/usr/bin/env python3
"""Capture CMS QA screenshots only after the fictitious hero image is rendered.

This intentionally fails on a blank, unrendered hero rather than publishing a
misleading screenshot from a fresh Chrome process. All requests must remain on
the Node fixture's ephemeral loopback server; no real CMS or admin sessions.
"""
from io import BytesIO
import os
from pathlib import Path
from statistics import pstdev
import sys
from time import sleep
from urllib.parse import urlparse

from PIL import Image
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def hero_row_variation(image, viewport):
    """Fixture-specific photographic signal: avoids blank gradient screenshots."""
    if viewport == "desktop":
        rect = (0.75, 0.90, 0.42, 0.66)
    else:
        rect = (0.65, 0.90, 0.28, 0.52)
    width, height = image.size
    x0, x1, y0, y1 = (
        round(width * rect[0]), round(width * rect[1]),
        round(height * rect[2]), round(height * rect[3]))
    region = image.convert("RGB").crop((x0, y0, x1, y1))
    sample = region.resize((1, region.height))
    rows = [sum(sample.getpixel((0, y))) / 3 for y in range(sample.height)]
    return pstdev(rows)


def main():
    require(len(sys.argv) == 4, "Expected origin, screenshot dir and WebP mode")
    origin, target, mode = sys.argv[1:]
    u = urlparse(origin)
    require(os.environ.get("CI") == "true" and
            os.environ.get("RUNNER_TEMP") and
            os.environ.get("CMS_WEBP_BROWSER_FLAG") == mode and
            mode in ("true", "false"), "Isolated CI screenshot guard failed")
    require(u.scheme == "http" and u.hostname == "127.0.0.1" and
            u.port is not None and u.path in ("", "/") and
            not u.username and not u.password, "Screenshot origin must be loopback")
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    directory = Path(target).resolve()
    require(directory.is_relative_to(root), "Screenshots must stay in ephemeral CI storage")
    directory.mkdir(parents=True, exist_ok=True)
    options = Options()
    for flag in (
        "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
        "--disable-dev-shm-usage", "--disable-background-networking",
        "--disable-extensions", "--no-first-run", "--force-device-scale-factor=1"
    ):
        options.add_argument(flag)
    options.add_argument("--window-size=1280,900")
    driver = webdriver.Chrome(options=options)
    driver.set_script_timeout(12)
    try:
        driver.execute_cdp_cmd("Emulation.setEmulatedMedia", {
            "features": [{"name": "prefers-reduced-motion", "value": "reduce"}]
        })
        for viewport, width in (("mobile", 390), ("desktop", 1280)):
            driver.set_window_rect(width=width, height=900)
            driver.execute_cdp_cmd("Emulation.setDeviceMetricsOverride", {
                "width": width, "height": 900, "deviceScaleFactor": 1,
                "mobile": False
            })
            for theme in ("light", "dark"):
                driver.get(origin + "/noticias?cmsTheme=" + theme)
                def loaded(d):
                    return d.execute_script("""
                        const hero = document.querySelector(
                            '.news-editorial-hero__slide img');
                        if (!hero || !hero.complete || hero.naturalWidth <= 0)
                            return null;
                        const rect = hero.getBoundingClientRect();
                        if (rect.width < 200 || rect.height < 200) return null;
                        const style = getComputedStyle(hero);
                        if (style.display === 'none' || style.visibility !== 'visible')
                            return null;
                        return {
                          src: hero.getAttribute('src'),
                          srcset: hero.getAttribute('srcset'),
                          currentSrc: hero.currentSrc,
                          width: hero.naturalWidth
                        };
                    """)
                state = WebDriverWait(driver, 25).until(loaded)
                require("/api/content/media/" in (state["src"] or ""),
                        "Screenshot loaded an unexpected/non-CMS hero")
                query = urlparse(state["currentSrc"]).query
                if mode == "true":
                    require(query.startswith("width="),
                            "Screenshot WebP ON did not select a derivative")
                else:
                    require(query == "", "Screenshot WebP OFF requested variant")

                decoded = driver.execute_async_script("""
                    const img = document.querySelector('.news-editorial-hero__slide img');
                    const done = arguments[arguments.length - 1];
                    img.decode().then(
                      () => requestAnimationFrame(
                        () => requestAnimationFrame(() => done(true))),
                      () => done(false));
                """)
                require(decoded, "CMS hero image could not be decoded")
                outfile = directory / f"{mode}-{viewport}-{theme}.png"
                passed = False
                for attempt in range(4):
                    raw = driver.get_screenshot_as_png()
                    image = Image.open(BytesIO(raw))
                    require(image.width == width, "Screenshot viewport width changed")
                    variation = hero_row_variation(image, viewport)
                    if variation >= 8.0:
                        outfile.write_bytes(raw)
                        passed = True
                        break
                    sleep(0.6)
                require(passed, f"Hero appears blank: {viewport}/{theme}/"
                        f"WebP={mode}, photographic row variation={variation:.2f}")
                print(f"PASS image-ready screenshot {outfile.name}: "
                      f"currentSrc={query or 'original'}, "
                      f"photoVariation={variation:.2f}", flush=True)
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
