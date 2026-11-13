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


def require(ok, message):
    if not ok:
        raise AssertionError(message)


class FakeS3(BaseHTTPRequestHandler):
    """Minimal loopback object store that ignores SigV4; no real S3/MinIO calls."""
    objects = {}
    downloads = 0
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
        # Serve a canonical fixture; storage transport encoding is outside this test.
        self.objects[self._object_key()] = PNG
        self._send(200, headers={"ETag": '"test-object"', "x-amz-request-id": "ci-only"})

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


def test_http_cycle():
    admin = login_admin()
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
        hdrs, _ = check_status(visitor, url, 404)
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
        print("PASS CMS media E2E: draft 404, published 200, 304, 206, admin privacy, unpublished/expired 404")
    finally:
        if news_id:
            check_status(admin, "/api/admin/content/news/" + news_id, 204, method="DELETE")
        if media_id:
            check_status(admin, "/api/admin/content/media/" + media_id, 204, method="DELETE")


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
        test_http_cycle()
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
