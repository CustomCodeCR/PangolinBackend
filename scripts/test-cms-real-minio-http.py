#!/usr/bin/env python3
"""Full CMS HTTP publication cycle against disposable PostgreSQL and real MinIO.

CI-only: both servers use explicit loopback ports; no network storage, production
secrets or user content. The helper reuses the existing isolated auth/HTTP code.
"""
import importlib.util
import json
import os
from pathlib import Path
from subprocess import DEVNULL, Popen, TimeoutExpired, run

# The existing harness filename contains hyphens; load it by its fixed
# repository path, not via Python's conventional module-name import.
spec = importlib.util.spec_from_file_location(
    "test_cms_media_http", Path(__file__).with_name("test-cms-media-http.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load the isolated CMS HTTP helper")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def test_real_minio_publication(admin, webp_enabled):
    visitor = helper.build_opener()
    media_id = news_id = None
    try:
        raw, content_type = helper.multipart_photo()  # repository JPEG, no real CMS media
        _, uploaded_body = helper.check_status(
            admin, "/api/admin/content/media/upload", 201, method="POST",
            raw=raw, headers={"Content-Type": content_type})
        uploaded = json.loads(uploaded_body)
        media_id = uploaded["id"]
        url = f"/api/content/media/{media_id}/file"
        require(uploaded["src"] == url, "Upload must preserve the canonical CMS URL")

        # Unpublished images must not be served, even if both MinIO objects exist.
        helper.check_status(visitor, url, 404)
        helper.check_status(visitor, url + "?width=360", 404)

        news = {
            "title": "Isolated real-MinIO image " + helper.uuid.uuid4().hex[:8],
            "category": "PRUEBAS",
            "description": "Disposable localhost CMS test only",
            "body": "No production content or user credentials",
            "image": url,
            "published": True,
        }
        news_id = helper.json_call(
            admin, "/api/admin/content/news", 201, news, method="POST")["id"]

        original_h, original = helper.check_status(visitor, url, 200)
        require(original == helper.PHOTO and
                original_h.get("Content-Type", "").startswith("image/jpeg"),
                "Real MinIO did not serve the unchanged JPEG original")

        for width in (360, 720):
            if not webp_enabled:
                # The backend deliberately rejects width parameters when OFF.
                # The public frontend must use the unchanged URL without ?width.
                helper.check_status(visitor, url + f"?width={width}", 400)
                continue
            headers, response_bytes = helper.check_status(
                visitor, url + f"?width={width}", 200)
            require(headers.get("Content-Type", "").startswith("image/webp") and
                    response_bytes[:4] == b"RIFF" and
                    response_bytes[8:12] == b"WEBP" and
                    12 < len(response_bytes) < len(original),
                    f"Real MinIO {width}px WebP missing, invalid or not smaller")
            etag = headers.get("ETag")
            require(etag and etag != original_h.get("ETag"),
                    "WebP derivative must have a distinct ETag")
            helper.check_status(visitor, url + f"?width={width}", 304,
                                headers={"If-None-Match": etag})
            _, first4 = helper.check_status(
                visitor, url + f"?width={width}", 206,
                headers={"Range": "bytes=0-3", "If-None-Match": etag})
            require(first4 == response_bytes[:4],
                    "MinIO range request must match the selected representation")

        # Media referenced by a news item cannot be deleted, even in draft.
        helper.check_status(admin, f"/api/admin/content/media/{media_id}", 409,
                            method="DELETE")
        helper.json_call(admin, f"/api/admin/content/news/{news_id}", 200,
                         dict(news, published=False), method="PUT")
        helper.check_status(visitor, url, 404)
        helper.check_status(visitor, url + "?width=360", 404)
        helper.check_status(visitor, url + "?width=720", 404)
        helper.check_status(admin, f"/api/admin/content/media/{media_id}", 409,
                            method="DELETE")
        print(f"PASS real MinIO + PostgreSQL CMS HTTP WebP={'ON' if webp_enabled else 'OFF'}: "
              "upload, publish, original/variant, ETag/Range, unpublish, references")
    finally:
        if news_id:
            helper.check_status(admin, f"/api/admin/content/news/{news_id}", 204,
                                method="DELETE")
        if media_id:
            helper.check_status(admin, f"/api/admin/content/media/{media_id}", 204,
                                method="DELETE")
            helper.check_status(visitor, f"/api/content/media/{media_id}/file", 404)


def stop_backend(proc):
    if proc is None:
        return
    if proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except TimeoutExpired:
        proc.kill()
        proc.wait()


def restart_backend(runner, env, mode):
    # Restart only the ephemeral backend. PostgreSQL and MinIO persist.
    stop_backend(runner["proc"])
    runner["proc"] = None
    env["CmsMedia__ResponsiveWebpEnabled"] = mode
    runner["proc"] = Popen(
        ["dotnet", "run", "--no-build", "-c", "Release", "--no-launch-profile"],
        cwd=helper.ROOT / "backend", env=env,
        stdout=DEVNULL, stderr=DEVNULL)
    helper.wait_for_backend(runner["proc"])


def test_persisted_media_rollback(admin, runner, env):
    """ON -> OFF -> ON with the same published news and existing MinIO objects."""
    require(env.get("CmsMedia__ResponsiveWebpEnabled") == "true",
            "Rollback fixture must begin with WebP ON")
    visitor = helper.build_opener()
    raw, content_type = helper.multipart_photo()
    _, body = helper.check_status(
        admin, "/api/admin/content/media/upload", 201, method="POST",
        raw=raw, headers={"Content-Type": content_type})
    media_id = json.loads(body)["id"]
    url = f"/api/content/media/{media_id}/file"
    news = {
        "title": "CI persistent rollback " + helper.uuid.uuid4().hex[:8],
        "category": "PRUEBAS", "description": "Isolated switch test",
        "body": "Keep database and MinIO unchanged across backend restarts",
        "image": url, "published": True,
    }
    news_id = helper.json_call(
        admin, "/api/admin/content/news", 201, news, method="POST")["id"]

    # Capture bytes and validators before changing either feature flag.
    original_headers, original_bytes = helper.check_status(visitor, url, 200)
    variant_headers, variant_bytes = helper.check_status(
        visitor, url + "?width=360", 200)
    require(original_bytes == helper.PHOTO and
            original_headers.get("Content-Type", "").startswith("image/jpeg"),
            "Original bytes must match before rollback")
    require(variant_headers.get("Content-Type", "").startswith("image/webp") and
            variant_bytes[:4] == b"RIFF" and variant_bytes[8:12] == b"WEBP",
            "Pre-rollback WebP variant must exist")

    restart_backend(runner, env, "false")
    off_headers, off_bytes = helper.check_status(visitor, url, 200)
    require(off_bytes == original_bytes and
            off_headers.get("ETag") == original_headers.get("ETag"),
            "Rollback to OFF must preserve the original and ETag")
    helper.check_status(visitor, url + "?width=360", 400)
    visible = helper.json_call(visitor, "/api/content/news", 200)
    require(any(item["id"] == news_id for item in visible),
            "Rollback OFF must preserve the published news")

    # Re-enable without re-uploading or regenerating assets.
    restart_backend(runner, env, "true")
    resumed_headers, resumed_bytes = helper.check_status(
        visitor, url + "?width=360", 200)
    require(resumed_bytes == variant_bytes and
            resumed_headers.get("ETag") == variant_headers.get("ETag"),
            "Re-enabling must serve the byte-identical existing WebP variant")
    _, resumed_original = helper.check_status(visitor, url, 200)
    require(resumed_original == original_bytes,
            "Re-enabling must not modify the original")

    helper.check_status(
        admin, f"/api/admin/content/news/{news_id}", 204, method="DELETE")
    helper.check_status(
        admin, f"/api/admin/content/media/{media_id}", 204, method="DELETE")
    helper.check_status(visitor, url, 404)
    print("PASS real MinIO persistent rollback: ON -> OFF -> ON, original and "
          "published news preserved, existing WebP restored byte-for-byte",
          flush=True)


def main():
    require(os.getenv("CI") == "true" and
            os.getenv("CMS_REAL_MINIO_ISOLATED") == "1" and
            os.getenv("CMS_REAL_MINIO_HTTP_TEST") == "1" and
            os.getenv("RUNNER_TEMP"),
            "Refusing to run without all isolated CI guards")
    for env_name in ("Storage__Endpoint", "Storage__AccessKey",
                     "Storage__SecretKey", "PANGOLIN_S3_ENDPOINT",
                     "PANGOLIN_S3_ACCESS_KEY", "PANGOLIN_S3_SECRET_KEY"):
        require(not os.environ.get(env_name),
                f"Refusing inherited storage credential/configuration: {env_name}")

    mode = os.getenv("CMS_REAL_MINIO_TEST_WEBP_ENABLED")
    require(mode in ("true", "false"), "Explicit isolated WebP test mode required")
    webp_enabled = mode == "true"

    env = os.environ.copy()
    env.update({
        "ASPNETCORE_ENVIRONMENT": "Development",
        "ASPNETCORE_URLS": helper.BASE,  # loopback-only 127.0.0.1:15000
        "ConnectionStrings__Postgres": (
            "Host=127.0.0.1;Port=15433;Database=login;"
            "Username=postgres;Password=ci-media-test-only"),
        "Auth__OtpPepper": "a" * 64,
        "Auth__JwtSigningKey": "b" * 64,
        "Auth__SecureCookie": "false",
        "Development__ApplySchema": "true",
        "Email__Mode": "LocalOutbox",
        "Storage__Endpoint": "http://127.0.0.1:19119",
        "Storage__Bucket": "cms-webp-http-ci",
        "Storage__AccessKey": "ci-webp-only",
        "Storage__SecretKey": "ci-webp-disposable-password-only",
        "CmsMedia__ResponsiveWebpEnabled": mode,
        "CmsMedia__ExistingImageBackfillEnabled": "false",
        "DholeTracking__Enabled": "false",
        "Redis__ConnectionString": "",
        "Mongo__ConnectionString": "",
    })
    runner = {"proc": Popen(
        ["dotnet", "run", "--no-build", "-c", "Release", "--no-launch-profile"],
        cwd=helper.ROOT / "backend", env=env, stdout=DEVNULL, stderr=DEVNULL)}
    try:
        helper.wait_for_backend(runner["proc"])
        seed = (helper.ROOT / "backend" / "Database" / "SeedLocal.sql").read_text()
        run(["docker", "exec", "-i", helper.PG_CONTAINER, "psql",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "login"],
            input=seed, text=True, check=True, stdout=DEVNULL)
        admin = helper.login_admin()
        test_real_minio_publication(admin, webp_enabled)
        if os.getenv("CMS_REAL_MINIO_EDITOR_UI_TEST") == "1":
            editor_spec = importlib.util.spec_from_file_location(
                "test_cms_real_minio_editor",
                Path(__file__).with_name("test-cms-real-minio-editor.py"))
            if editor_spec is None or editor_spec.loader is None:
                raise RuntimeError("Could not load isolated browser editor test")
            editor_module = importlib.util.module_from_spec(editor_spec)
            editor_spec.loader.exec_module(editor_module)
            editor_module.editor_smoke(admin, helper, webp_enabled)
        if webp_enabled:
            test_persisted_media_rollback(admin, runner, env)
    finally:
        stop_backend(runner["proc"])


if __name__ == "__main__":
    main()
