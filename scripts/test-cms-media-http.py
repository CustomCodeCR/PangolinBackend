#!/usr/bin/env python3
"""HTTP integration check for published CMS media using disposable PostgreSQL and fake S3.

Must run only in an isolated CI environment. Never connect to a live database or S3.
The caller starts a temporary Docker container named cms-media-pg on port 15433.
"""
import base64
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from subprocess import DEVNULL, Popen, TimeoutExpired, run
from threading import Thread
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, Request, build_opener
import json
import os
import re
import time
import uuid

ROOT = Path(__file__).resolve().parent.parent
BASE = "http://127.0.0.1:15000"
OUTBOX = ROOT / "backend" / "local-outbox"
# Deliberately hardcoded to an isolated loopback port/container, never user config.
PG_CONTAINER = "cms-media-pg"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YmFxTYAAAAASUVORK5CYII="
)
PHOTO = (ROOT / "frontend/public/images/cover-logistics.jpeg").read_bytes()
PHOTO_WEBP = (ROOT / "frontend/public/images/cover-logistics.webp").read_bytes()


def require(ok, message):
    if not ok:
        raise AssertionError(message)


class FakeS3(BaseHTTPRequestHandler):
    """Minimal loopback object store that ignores SigV4; no real S3/MinIO calls."""
    objects = {}
    downloads = 0
    heads = 0
    puts = 0
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def _object_key(self):
        return urlsplit(self.path).path

    def _send(self, status, body=b"", headers=None):
        self.send_response(status)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _request_body(self):
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            chunks = []
            while True:
                n = int(self.rfile.readline().split(b";", 1)[0].strip(), 16)
                if n == 0:
                    while self.rfile.readline().strip():
                        pass
                    break
                chunks.append(self.rfile.read(n))
                self.rfile.read(2)
            return b"".join(chunks)
        return self.rfile.read(int(self.headers.get("Content-Length", "0")))

    def do_PUT(self):
        body = self._request_body()
        FakeS3.puts += 1
        # Serve canonical fixture bytes; AWS S3 transfer checksums/chunking
        # are outside this test. The PUT path identifies expected format.
        key = self._object_key()
        if key.endswith(".jpeg"):
            self.objects[key] = PHOTO
        elif re.search(r"\.w\d+\.webp$", key):
            self.objects[key] = PHOTO_WEBP
        else:
            self.objects[key] = PNG
        self._send(200, headers={"ETag": '"test-object"', "x-amz-request-id": "ci-only"})

    def do_HEAD(self):
        FakeS3.heads += 1
        key = self._object_key()
        if key not in self.objects:
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        raw = self.objects[key]
        self.send_response(200)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("ETag", '"test-object"')
        self.end_headers()

    def do_GET(self):
        key = self._object_key()
        if key not in self.objects:
            self._send(404, b"<Error><Code>NoSuchKey</Code></Error>",
                       {"Content-Type": "application/xml"})
            return
        FakeS3.downloads += 1
        raw = self.objects[key]
        headers = {"Content-Type": "image/png", "ETag": '"test-object"',
                   "Last-Modified": "Fri, 13 Nov 2026 00:00:00 GMT"}
        match = re.fullmatch(r"bytes=(\d+)-(\d+)", self.headers.get("Range", ""))
        if match:
            a, b = int(match[1]), min(int(match[2]), len(raw) - 1)
            if a > b:
                self._send(416)
                return
            headers["Content-Range"] = f"bytes {a}-{b}/{len(raw)}"
            self._send(206, raw[a:b + 1], headers)
        else:
            self._send(200, raw, headers)

    def do_DELETE(self):
        self.objects.pop(self._object_key(), None)
        self._send(204)


def call(opener, route, payload=None, *, method=None, headers=None, raw=None):
    h = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        raw = json.dumps(payload).encode("utf-8")
        h["Content-Type"] = "application/json"
    request = Request(BASE + route, data=raw, headers=h, method=method)
    try:
        with opener.open(request, timeout=15) as resp:
            return resp.status, dict(resp.headers.items()), resp.read()
    except HTTPError as exc:
        return exc.code, dict(exc.headers.items()), exc.read()


def check_status(opener, route, expected, **kwargs):
    status, headers, body = call(opener, route, **kwargs)
    require(status == expected, f"{route}: expected HTTP {expected}, received {status}")
    return headers, body


def json_call(opener, route, expected, payload=None, *, method=None):
    _, body = check_status(opener, route, expected, payload=payload, method=method)
    return json.loads(body) if body else {}


def wait_for_backend(proc):
    visitor = build_opener()
    for _ in range(90):
        require(proc.poll() is None, "Backend exited before readiness")
        try:
            status, _, _ = call(visitor, "/api/health/ready")
            if status == 200:
                return
        except OSError:
            pass
        time.sleep(1)
    raise AssertionError("Backend readiness timed out")


def login_admin():
    admin = build_opener(HTTPCookieProcessor(CookieJar()))
    started = time.time()
    challenge = json_call(admin, "/api/auth/request-otp", 200,
                          {"correo": "demo.usuario@castrofallas.test"}, method="POST")
    otp = None
    for _ in range(25):
        for path in sorted(OUTBOX.glob("otp-*.eml"), key=lambda p: p.stat().st_mtime, reverse=True):
            if path.stat().st_mtime < started - 2:
                continue
            msg = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
            if "demo.usuario@castrofallas.test" not in str(msg.get("To", "")).lower():
                continue
            body = (msg.get_body(preferencelist=("plain",)) or msg).get_content()
            match = re.search(r"\b\d{6}\b", body)
            if match:
                otp = match[0]
                break
        if otp:
            break
        time.sleep(0.2)
    require(otp is not None, "LocalOutbox did not produce test OTP")
    json_call(admin, "/api/auth/verify-otp", 200,
              {"challengeId": challenge["challengeId"], "codigo": otp}, method="POST")
    return admin


def multipart_image():
    boundary = "CMS-TEST-" + uuid.uuid4().hex
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"name\"\r\n\r\nCI test image\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"kind\"\r\n\r\nImagen\r\n".encode(),
        (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
         f"filename=\"ci.png\"\r\nContent-Type: image/png\r\n\r\n").encode(),
        PNG,
        f"\r\n--{boundary}--\r\n".encode(),
    ]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def multipart_photo():
    boundary = "CMS-WEBP-" + uuid.uuid4().hex
    parts = [
        (f'--{boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n'
         'Responsive test photo\r\n').encode(),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n'
         'Imagen\r\n').encode(),
        (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; '
         'filename="ci-photo.jpeg"\r\nContent-Type: image/jpeg\r\n\r\n').encode(),
        PHOTO,
        (f'\r\n--{boundary}--\r\n').encode(),
    ]
    return b"".join(parts), f"multipart/form-data; boundary={boundary}"


def test_http_cycle(admin):
    visitor = build_opener()
    media_id = news_id = None
    try:
        body, kind = multipart_image()
        hdrs, content = check_status(admin, "/api/admin/content/media/upload", 201,
                                     method="POST", raw=body, headers={"Content-Type": kind})
        uploaded = json.loads(content)
        media_id = uploaded["id"]
        url = f"/api/content/media/{media_id}/file"
        admin_url = f"/api/admin/content/media/{media_id}/file"
        require(uploaded["src"] == url, "Uploaded media URL mismatch")
        # A tiny PNG has no smaller variant; width requests fall back to original.
        # Publication authorization still applies to that fallback.
        heads_before_draft = FakeS3.heads
        hdrs, _ = check_status(visitor, url, 404)
        check_status(visitor, url + "?width=360", 404)
        require(FakeS3.heads == heads_before_draft,
                "Draft access must fail before querying S3 for any variant")
        require("no-store" in hdrs.get("Cache-Control", ""), "Draft media must be no-store")
        news = {"title": "CI media cache " + uuid.uuid4().hex[:8],
                "category": "PRUEBAS", "description": "Temporary test-only item",
                "body": "Temporary body", "image": url, "published": True}
        created = json_call(admin, "/api/admin/content/news", 201, news, method="POST")
        news_id = created["id"]
        h200, content = check_status(visitor, url, 200)
        require(content == PNG, "Published image payload mismatch")
        etag = h200.get("ETag")
        require(etag and etag.startswith('"cms-'), "Published image missing CMS ETag")
        fallback_h, fallback_bytes = check_status(visitor, url + "?width=360", 200)
        require(fallback_bytes == PNG and fallback_h.get("ETag") == etag and
                fallback_h.get("Content-Type", "").startswith("image/png"),
                "Unoptimized old media must fall back to its original bytes, MIME and ETag")
        require("private" in h200.get("Cache-Control", "") and
                "no-cache" in h200.get("Cache-Control", ""), "Public media must revalidate")
        fetches = FakeS3.downloads
        h304, content = check_status(visitor, url, 304, headers={"If-None-Match": etag})
        require(content == b"" and h304.get("ETag") == etag, "Invalid 304 response")
        require(FakeS3.downloads == fetches, "304 fetched media from object storage")
        hrange, partial = check_status(visitor, url, 206,
                                       headers={"Range": "bytes=0-3", "If-None-Match": etag})
        require(partial == PNG[:4] and hrange.get("Content-Range") == f"bytes 0-3/{len(PNG)}",
                "Range must return 206 and correct first four bytes")
        hadmin, admin_body = check_status(admin, admin_url, 200)
        require(admin_body == PNG and "no-store" in hadmin.get("Cache-Control", ""),
                "Private admin image must not be cached")
        require("ETag" not in hadmin, "Admin media cannot expose a public validator")
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, published=False), method="PUT")
        h404, _ = check_status(visitor, url, 404, headers={"If-None-Match": etag})
        require("no-store" in h404.get("Cache-Control", ""), "Revoked media must be no-store")
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, published=True), method="PUT")
        check_status(visitor, url, 304, headers={"If-None-Match": etag})
        expired_at = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, expiresAt=expired_at), method="PUT")
        h_expired, _ = check_status(visitor, url, 404, headers={"If-None-Match": etag})
        require("no-store" in h_expired.get("Cache-Control", ""),
                "Expired public media must not be cacheable")
        _, news_bytes = check_status(visitor, "/api/content/news", 200)
        require(news_id not in [entry["id"] for entry in json.loads(news_bytes)],
                "Expired news must disappear from public listing")
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, expiresAt=None), method="PUT")
        check_status(visitor, url, 304, headers={"If-None-Match": etag})
        json_call(admin, "/api/admin/content/news/" + news_id, 200, dict(news, published=False), method="PUT")
        slot = "/api/admin/content/site/about.gallery.0.media"
        json_call(admin, slot, 200, {"mediaId": media_id}, method="PUT")
        check_status(visitor, url, 404, headers={"If-None-Match": etag})
        json_call(admin, slot + "/publish", 200, method="POST")
        check_status(visitor, url, 304, headers={"If-None-Match": etag})
        json_call(admin, slot + "/restore", 200, method="POST")
        check_status(visitor, url, 404, headers={"If-None-Match": etag})
        print("PASS CMS media E2E: news and editor publication lifecycles")
    finally:
        if news_id:
            check_status(admin, "/api/admin/content/news/" + news_id, 204, method="DELETE")
        if media_id:
            check_status(admin, "/api/admin/content/media/" + media_id, 204, method="DELETE")


def test_webp_variants(admin):
    visitor = build_opener()
    media_id = news_id = None
    try:
        body, content_type = multipart_photo()
        _, uploaded_bytes = check_status(admin, "/api/admin/content/media/upload", 201,
                                         method="POST", raw=body,
                                         headers={"Content-Type": content_type})
        uploaded = json.loads(uploaded_bytes)
        media_id = uploaded["id"]
        url = f"/api/content/media/{media_id}/file"
        variant = url + "?width=360"
        require(uploaded["src"] == url, "Upload must retain canonical original URL")
        require(any(f"/media/{media_id.replace('-', '')}.jpeg.w360.webp" in key
                    for key in FakeS3.objects), "Upload did not generate WebP 360")
        heads_before_draft = FakeS3.heads
        h_draft, _ = check_status(visitor, variant, 404)
        require(FakeS3.heads == heads_before_draft,
                "Unpublished variant must be rejected before S3 HEAD")
        require("no-store" in h_draft.get("Cache-Control", ""),
                "Unpublished WebP must not be cacheable")
        news = {"title": "CI WebP image " + uuid.uuid4().hex[:8],
                "category": "PRUEBAS", "description": "Fake S3 WebP fixture",
                "body": "Local test", "image": url, "published": True}
        created = json_call(admin, "/api/admin/content/news", 201, news, method="POST")
        news_id = created["id"]
        original_h, original_bytes = check_status(visitor, url, 200)
        require(original_bytes == PHOTO and original_h.get("Content-Type", "").startswith("image/jpeg"),
                "Original JPEG bytes/MIME must remain intact")
        response_h, variant_bytes = check_status(visitor, variant, 200)
        require(variant_bytes == PHOTO_WEBP and response_h.get("Content-Type", "").startswith("image/webp"),
                "WebP content type/payload not returned")
        require("private" in response_h.get("Cache-Control", "") and
                "no-cache" in response_h.get("Cache-Control", ""),
                "WebP must be private and revalidated before every request")
        tag = response_h.get("ETag")
        require(tag and "-w360-webp-" in tag and tag != original_h.get("ETag"),
                "Variant ETag must be distinct from original")
        downloads_before = FakeS3.downloads
        check_status(visitor, variant, 304, headers={"If-None-Match": tag})
        require(FakeS3.downloads == downloads_before, "Conditional WebP should not download S3 bytes")
        _, segment = check_status(visitor, variant, 206,
                                  headers={"Range": "bytes=0-3", "If-None-Match": tag})
        require(segment == PHOTO_WEBP[:4], "WebP range must bypass 304 and return four bytes")
        check_status(visitor, url + "?width=123", 400)
        check_status(admin, f"/api/admin/content/media/{media_id}/file", 200)
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, published=False), method="PUT")
        heads_before_revocation = FakeS3.heads
        h_revoked, _ = check_status(visitor, variant, 404, headers={"If-None-Match": tag})
        require(FakeS3.heads == heads_before_revocation,
                "Revoked variant must be rejected before S3 HEAD")
        require("no-store" in h_revoked.get("Cache-Control", ""),
                "Revoked variant must return 404 with no-store")
        json_call(admin, "/api/admin/content/news/" + news_id, 200,
                  dict(news, published=True), method="PUT")
        check_status(visitor, variant, 304, headers={"If-None-Match": tag})
        print("PASS CMS responsive WebP: upload -> 360 variant -> 200/304/206 -> 404 revocation")
    finally:
        if news_id:
            check_status(admin, "/api/admin/content/news/" + news_id, 204, method="DELETE")
        if media_id:
            check_status(admin, "/api/admin/content/media/" + media_id, 204, method="DELETE")
            require(not any(media_id.replace('-', '') in key for key in FakeS3.objects),
                    "Deleting a media row must delete original and WebP derivatives")


def test_legacy_backfill(admin):
    # This fixture models a historical media row by uploading a JPEG and
    # removing the disposable FakeS3 derivatives before testing backfill.
    # No real S3 keys, private user records or database servers are accessed.
    visitor = build_opener()
    media_id = news_id = None
    try:
        raw, mime = multipart_photo()
        _, payload = check_status(admin, "/api/admin/content/media/upload", 201,
                                  method="POST", raw=raw,
                                  headers={"Content-Type": mime})
        uploaded = json.loads(payload)
        media_id = uploaded["id"]
        uuid_hex = media_id.replace("-", "")
        prefix = f"/cms-test/media/{uuid_hex}.jpeg"
        original_bytes = FakeS3.objects[prefix]
        require(original_bytes == PHOTO, "Original fixture was not stored intact")
        derivatives = [k for k in FakeS3.objects
                       if k.startswith(prefix + ".w") and k.endswith(".webp")]
        require(derivatives, "Fixture must begin with generated WebP variants")
        for key in derivatives:
            del FakeS3.objects[key]

        route = f"/api/admin/content/media/{media_id}/webp-backfill"
        before = FakeS3.puts
        h_forbidden, _ = check_status(visitor, route, 401,
                                      payload={"apply": False}, method="POST")
        require("no-store" not in h_forbidden.get("Cache-Control", "") or
                FakeS3.puts == before, "Anonymous inventory unexpectedly wrote S3")
        inventory = json_call(admin, route, 200, {"apply": False}, method="POST")
        require(inventory["mode"] == "dry-run" and
                360 in inventory["missingWidths"] and
                inventory["originalPreserved"],
                "Legacy dry-run failed to identify missing derivatives")
        require(FakeS3.puts == before and FakeS3.objects[prefix] == PHOTO,
                "Dry-run must never upload or modify original")
        apply = json_call(admin, route, 200, {"apply": True}, method="POST")
        require(apply["mode"] == "apply" and
                360 in apply["generatedWidths"] and apply["originalPreserved"],
                "Explicit backfill did not generate missing WebP")
        require(FakeS3.objects[prefix] == PHOTO, "Backfill mutated original JPEG")
        webp_key = prefix + ".w360.webp"
        require(webp_key in FakeS3.objects,
                "Backfill did not persist WebP variant")
        puts_after = FakeS3.puts
        again = json_call(admin, route, 200, {"apply": True}, method="POST")
        require(again["generatedWidths"] == [] and
                360 in again["existingWidths"] and FakeS3.puts == puts_after,
                "Repeated backfill must not rewrite existing variants")

        url = f"/api/content/media/{media_id}/file"
        news = {"title": "Legacy WebP " + uuid.uuid4().hex[:8],
                "category": "PRUEBAS", "description": "Old CMS image fixture",
                "body": "Local fake-only test", "image": url, "published": True}
        news_id = json_call(admin, "/api/admin/content/news", 201, news, method="POST")["id"]
        _, original_body = check_status(visitor, url, 200)
        webp_headers, webp_body = check_status(visitor, url + "?width=360", 200)
        require(original_body == PHOTO and webp_body == PHOTO_WEBP and
                webp_headers.get("Content-Type", "").startswith("image/webp"),
                "Public backfilled WebP or preserved JPEG was incorrect")
        token = webp_headers["ETag"]
        json_call(admin, f"/api/admin/content/news/{news_id}", 200,
                  dict(news, published=False), method="PUT")
        heads_before_revoked = FakeS3.heads
        check_status(visitor, url + "?width=360", 404,
                     headers={"If-None-Match": token})
        require(FakeS3.heads == heads_before_revoked,
                "Revoked historical derivative accessed S3 before auth")
        print("PASS legacy CMS backfill: admin-only dry-run, generate missing, idempotence, 404 revocation")
    finally:
        if news_id:
            check_status(admin, f"/api/admin/content/news/{news_id}", 204, method="DELETE")
        if media_id:
            check_status(admin, f"/api/admin/content/media/{media_id}", 204, method="DELETE")
            require(not any(media_id.replace("-", "") in k for k in FakeS3.objects),
                    "Deleting old media must clean generated WebP objects")


def main():
    require(os.getenv("CI") == "true" and os.getenv("CMS_MEDIA_TEST_ISOLATED") == "1",
            "Refusing to run outside explicitly isolated CI")
    server = ThreadingHTTPServer(("127.0.0.1", 19091), FakeS3)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    env = os.environ.copy()
    env.update({
        "ASPNETCORE_ENVIRONMENT": "Development",
        "ASPNETCORE_URLS": BASE,
        "ConnectionStrings__Postgres": "Host=127.0.0.1;Port=15433;Database=login;Username=postgres;Password=ci-media-test-only",
        "Auth__OtpPepper": "a" * 64,
        "Auth__JwtSigningKey": "b" * 64,
        "Auth__SecureCookie": "false",
        "Development__ApplySchema": "true",
        "Email__Mode": "LocalOutbox",
        "Storage__Endpoint": "http://127.0.0.1:19091",
        "Storage__Bucket": "cms-test",
        "Storage__AccessKey": "ci-fake",
        "Storage__SecretKey": "ci-fake",
        "CmsMedia__ResponsiveWebpEnabled": "true",
        "CmsMedia__ExistingImageBackfillEnabled": "true",
        "DholeTracking__Enabled": "false",
        "Redis__ConnectionString": "",
        "Mongo__ConnectionString": "",
    })
    proc = Popen(["dotnet", "run", "--no-build", "-c", "Release", "--no-launch-profile"],
                 cwd=ROOT / "backend", env=env, stdout=DEVNULL, stderr=DEVNULL)
    try:
        wait_for_backend(proc)
        seed = (ROOT / "backend" / "Database" / "SeedLocal.sql").read_text()
        run(["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
             "-U", "postgres", "-d", "login"], input=seed, text=True, check=True,
            stdout=DEVNULL)
        # Reuse one authenticated session across all CMS test cases.
        # Each OTP request is rate-limited; test isolation must not trip 429.
        admin = login_admin()
        test_http_cycle(admin)
        test_webp_variants(admin)
        test_legacy_backfill(admin)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except TimeoutExpired:
            proc.kill()
            proc.wait()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
