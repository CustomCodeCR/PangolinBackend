#!/usr/bin/env python3
"""Regression: a failed LOCAL email resend never invalidates an earlier valid OTP.

Explicit opt-in, GitHub CI only: OTP_OUTBOX_FAILURE_TEST=1.
Uses LocalOutbox on 127.0.0.1, a newly seeded .test user, and NO Microsoft Graph.
No OTP, JWT, secrets, or user-identifying data are printed.
"""
import http.cookiejar
import os
from pathlib import Path
import runpy
import subprocess
import time
from urllib.request import HTTPCookieProcessor, build_opener
from uuid import uuid4

if __name__ != "__main__":
    raise RuntimeError("Run this isolated test as a script")

if os.environ.get("OTP_OUTBOX_FAILURE_TEST") != "1":
    raise SystemExit("Skipped: set OTP_OUTBOX_FAILURE_TEST=1 only in isolated CI")

root = Path(__file__).resolve().parent.parent
outbox = root / "backend" / "local-outbox"
smoke = runpy.run_path(str(root / "scripts" / "smoke-local.py"))
call = smoke["call"]
latest_otp = smoke["latest_otp"]
require = smoke["require"]

browser = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
status, ready = call(browser, "/api/health/ready")
require(status == 200 and ready.get("emailMode", "").lower() == "localoutbox",
        "This regression requires isolated Development LocalOutbox")
require(outbox.is_dir() and not outbox.is_symlink(),
        "Expected a real local-outbox directory on the CI host")

# Unique account ensures previous suites' 15-minute per-email quotas do not interfere.
email = "otp-resend-regression-" + uuid4().hex + "@castrofallas.test"
sql = (
    "INSERT INTO usuarios (correo, cliente_id, tipo_acceso, status) "
    "SELECT '" + email + "', uuid, 'usuario', TRUE "
    "FROM clientes WHERE codigo_dynamics = 'DYN001' "
    "ON CONFLICT (correo) DO NOTHING;"
)
subprocess.run(
    ["docker", "compose", "exec", "-T", "postgres",
     "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "login", "-c", sql],
    cwd=root, check=True, stdout=subprocess.DEVNULL
)

start = time.time()
status, first = call(browser, "/api/auth/request-otp", {"correo": email})
require(status == 200 and first.get("challengeId"),
        "First local OTP request must succeed")
otp = latest_otp(email, start)
require(otp is not None, "First OTP was not written to LocalOutbox")

# Simulate a local transport/storage failure without changing API settings or
# contacting a real provider. The file blocks Directory.CreateDirectory only
# during the second request; the original outbox is restored in finally.
backup = outbox.with_name("local-outbox-fault-backup-" + uuid4().hex)
outbox.rename(backup)
try:
    outbox.write_text("Temporary CI-only blocked LocalOutbox directory", encoding="utf-8")
    headers = {}
    status, second = call(browser, "/api/auth/request-otp",
                          {"correo": email}, response_headers=headers)
    require(status == 503 and second.get("code") == "email_unavailable",
            "The injected local delivery failure must return HTTP 503")
    require("challengeId" not in second, "Failed delivery exposed a challenge")
    require(1 <= int(headers.get("Retry-After", "0")) <= 60,
            "Second attempt must advertise the remaining cooldown")
finally:
    if outbox.is_file() and not outbox.is_symlink():
        outbox.unlink()
    backup.rename(outbox)

# The first token is still accepted despite the second send failing.
status, verified = call(browser, "/api/auth/verify-otp", {
    "challengeId": first["challengeId"], "codigo": otp
})
require(status == 200 and verified.get("user", {}).get("role") == "admin",
        "A failed resend incorrectly revoked the previous usable OTP")
print("PASS isolated LocalOutbox resend failure: previous OTP remains valid")
