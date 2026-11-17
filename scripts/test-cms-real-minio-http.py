#!/usr/bin/env python3
"""Full CMS HTTP publication cycle against disposable PostgreSQL and real MinIO.

CI-only: both servers use explicit loopback ports; no network storage, production
secrets or user content. The helper reuses the existing isolated auth/HTTP code.
"""
import json
import os
from pathlib import Path
from subprocess import DEVNULL, Popen, TimeoutExpired, run

import test_cms_media_http as helper


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def test_real_minio_publication(admin):
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
            headers, webp = helper.check_status(visitor, url + f"?width={width}", 200)
            require(headers.get("Content-Type", "").startswith("image/webp") and
                    webp[:4] == b"RIFF" and webp[8:12] == b"WEBP" and
                    12 < len(webp) < len(original),
                    f"Real MinIO {width}px variant missing, malformed or not smaller")
            etag = headers.get("ETag")
            require(etag and etag != original_h.get("ETag"),
                    "WebP variant must have a distinct ETag")
            helper.check_status(visitor, url + f"?width={width}", 304,
                                headers={"If-None-Match": etag})
            _, first4 = helper.check_status(visitor, url + f"?width={width}", 206,
                                            headers={"Range": "bytes=0-3",
                                                     "If-None-Match": etag})
            require(first4 == b"RIFF", "MinIO WebP range must return exact bytes")

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
        print("PASS real MinIO + PostgreSQL CMS HTTP: upload, publish, JPEG/WebP, "
              "ETag/Range, unpublish, and referenced-media delete protection")
    finally:
        if news_id:
            helper.check_status(admin, f"/api/admin/content/news/{news_id}", 204,
                                method="DELETE")
        if media_id:
            helper.check_status(admin, f"/api/admin/content/media/{media_id}", 204,
                                method="DELETE")
            helper.check_status(visitor, f"/api/content/media/{media_id}/file", 404)


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
        "CmsMedia__ResponsiveWebpEnabled": "true",
        "CmsMedia__ExistingImageBackfillEnabled": "false",
        "DholeTracking__Enabled": "false",
        "Redis__ConnectionString": "",
        "Mongo__ConnectionString": "",
    })
    proc = Popen(
        ["dotnet", "run", "--no-build", "-c", "Release", "--no-launch-profile"],
        cwd=helper.ROOT / "backend", env=env, stdout=DEVNULL, stderr=DEVNULL)
    try:
        helper.wait_for_backend(proc)
        seed = (helper.ROOT / "backend" / "Database" / "SeedLocal.sql").read_text()
        run(["docker", "exec", "-i", helper.PG_CONTAINER, "psql",
             "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "login"],
            input=seed, text=True, check=True, stdout=DEVNULL)
        admin = helper.login_admin()
        test_real_minio_publication(admin)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except TimeoutExpired:
            proc.kill()
            proc.wait()


if __name__ == "__main__":
    main()
