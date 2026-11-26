#!/usr/bin/env python3
"""CI-only local email and simulated S3 checks against restricted runtime image."""
import importlib.util
import json
import os
import time
from pathlib import Path
from threading import Thread
from http.server import ThreadingHTTPServer

if os.getenv("CI") != "true" or os.getenv("PANGOLIN_RESTRICTED_MAIL_MEDIA_FIXTURE") != "1":
    raise SystemExit("Refusing to run outside the disposable runtime fixture")

spec = importlib.util.spec_from_file_location(
    "cms_fixture", Path(__file__).with_name("test-cms-media-http.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot import existing CMS fixture")
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
helper.BASE = "http://backend-mail-cms:5000"
helper.OUTBOX = Path("/outbox")

server = ThreadingHTTPServer(("0.0.0.0", 19091), helper.FakeS3)
Thread(target=server.serve_forever, daemon=True).start()
try:
    ready = False
    for _ in range(60):
        try:
            status, _, raw = helper.call(helper.build_opener(), "/api/health/ready")
            if status == 200:
                data = json.loads(raw)
                if data.get("postgres") == "ok" and data.get("emailMode") == "LocalOutbox":
                    ready = True
                    break
        except (OSError, ValueError):
            pass
        time.sleep(1)
    helper.require(ready, "Restricted LocalOutbox fixture is not ready")
    admin = helper.login_admin()
    helper.check_status(admin, "/api/auth/me", 200)
    print("PASS restricted backend LocalOutbox OTP generation and login")
    helper.test_http_cycle(admin)
    helper.test_webp_variants(admin)
    helper.test_partial_webp_storage_failure(admin)
    helper.check_status(admin, "/api/auth/logout", 204, method="POST", payload={})
    helper.check_status(admin, "/api/auth/me", 401)
    print("PASS restricted backend CMS simulated S3 and local email lifecycle")
finally:
    server.shutdown()
    server.server_close()
