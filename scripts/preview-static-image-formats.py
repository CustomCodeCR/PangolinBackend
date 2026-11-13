#!/usr/bin/env python3
"""CI-only comparison of static image variants. Never writes to public assets.

The CMS media endpoint is intentionally NOT included here: it requires a
separate permission-aware design and original-file retention.
"""
from pathlib import Path
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
SOURCES = (
    "frontend/public/images/gio-assistant-base.png",
    "frontend/public/images/gio-assistant-hand.png",
    "frontend/public/images/about-operations-enhanced.jpg",
    "frontend/public/images/cover-logistics.jpeg",
)


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def run(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, text=True)


def dimensions(path):
    output = run("identify", "-ping", "-format", "%w %h", str(path)).stdout.strip()
    width, height = (int(value) for value in output.split())
    return width, height


def is_opaque(path):
    return run("identify", "-ping", "-format", "%[opaque]", str(path)).stdout.strip().lower() == "true"


def size_kib(value):
    return round(value / 1024, 1)


def main():
    require(os.environ.get("CI") == "true" and os.environ.get("IMAGE_REVIEW_ONLY") == "1",
            "Image variant audit is restricted to isolated CI")
    require(os.environ.get("RUNNER_TEMP"), "RUNNER_TEMP is required")
    out = (Path(os.environ["RUNNER_TEMP"]).resolve() / "image-variant-review").resolve()
    require(not out.is_relative_to(ROOT), "Never write generated variants inside repository")
    out.mkdir(parents=True, exist_ok=True)
    rows = []
    markdown = [
        "# Static image variant comparison (not deployed)",
        "",
        "The images below are a visual/size experiment. They are not served by the site.",
        "CMS uploads are excluded because their access depends on live publication status.",
        "",
        "| Source | Dimensions | Original KiB | WebP KiB | WebP saved | AVIF KiB | AVIF saved |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for relative in SOURCES:
        source = ROOT / relative
        require(source.is_file(), "Expected image missing: " + relative)
        basename = source.name.rsplit(".", 1)[0]
        webp = out / (basename + ".webp")
        avif = out / (basename + ".avif")
        # Decode only into temporary files to verify dimensions and alpha.
        decoded_webp = out / (basename + ".webp-decoded.png")
        decoded_avif = out / (basename + ".avif-decoded.png")
        run("cwebp", "-quiet", "-q", "82", "-m", "6", "-alpha_q", "100",
            "-metadata", "none", str(source), "-o", str(webp))
        run("avifenc", "-s", "6", "--min", "24", "--max", "34",
            str(source), str(avif))
        run("dwebp", str(webp), "-o", str(decoded_webp))
        run("avifdec", str(avif), str(decoded_avif))
        expected = dimensions(source)
        require(dimensions(decoded_webp) == expected, "WebP dimensions changed: " + relative)
        require(dimensions(decoded_avif) == expected, "AVIF dimensions changed: " + relative)
        if not is_opaque(source):
            require(not is_opaque(decoded_webp), "WebP lost alpha: " + relative)
            require(not is_opaque(decoded_avif), "AVIF lost alpha: " + relative)
        original_bytes = source.stat().st_size
        webp_bytes = webp.stat().st_size
        avif_bytes = avif.stat().st_size
        row = {
            "source": relative, "width": expected[0], "height": expected[1],
            "has_transparency": not is_opaque(source),
            "original_bytes": original_bytes,
            "webp_bytes": webp_bytes, "avif_bytes": avif_bytes,
            "webp_savings_percent": round(100 * (1 - webp_bytes / original_bytes), 1),
            "avif_savings_percent": round(100 * (1 - avif_bytes / original_bytes), 1),
        }
        rows.append(row)
        markdown.append(
            "| " + source.name + " | " + str(expected[0]) + "×" + str(expected[1]) +
            " | " + str(size_kib(original_bytes)) + " | " + str(size_kib(webp_bytes)) +
            " | " + str(row["webp_savings_percent"]) + "% | " +
            str(size_kib(avif_bytes)) + " | " + str(row["avif_savings_percent"]) + "% |"
        )
        # The generated files are review artifacts, not changes to the repository.
        decoded_webp.unlink()
        decoded_avif.unlink()
    markdown += [
        "",
        "## Review gates before any website change",
        "",
        "1. Compare mascot transparency, hand animation alignment, colors and details on light/dark themes and mobile.",
        "2. Use a browser with WebP/AVIF support and keep original URL fallback.",
        "3. Audit the real CMS separately using permission checks before every access, no public CDN TTL for unpublished media.",
        "4. Preserve all originals. Never replace uploaded CMS objects or write variants into MinIO as part of this CI.",
        "",
        "Saving percentages are offline file-size estimates, not PageSpeed or transfer measurements.",
    ]
    (out / "report.md").write_text("\n".join(markdown) + "\n", encoding="utf8")
    (out / "report.json").write_text(json.dumps(rows, indent=2) + "\n", encoding="utf8")
    print("\n".join(markdown))


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print("Image review failed: " + str(exc), file=sys.stderr)
        sys.exit(1)
