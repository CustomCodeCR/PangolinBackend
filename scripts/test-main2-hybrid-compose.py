#!/usr/bin/env python3
"""Guard the optional main-2 LAN gateway port plan without starting Docker."""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FULL = [
    "-f", "compose.yaml",
    "-f", "compose.nuxt-preview.yaml",
    "-f", "compose.nuxt-local-hybrid.yaml",
    "-f", "compose.main2-hybrid.yaml",
]
ENV = os.environ.copy()
# Fixtures for Compose validation ONLY, never real credentials.
ENV.update({
    "POSTGRES_PASSWORD": "fixture-postgres-not-real",
    "AUTH_OTP_PEPPER": "a" * 64,
    "AUTH_JWT_SIGNING_KEY": "b" * 64,
    "FRONTEND_HOST_PORT": "5174",
    "FRONTEND_BIND_IP": "127.0.0.1",
    "NUXT_LOCAL_GATEWAY_BIND_IP": "127.0.0.1",
    "NUXT_LOCAL_GATEWAY_PORT": "8083",
    "NUXT_MAIN2_PORT": "5173",
})

def config(files, env):
    result = subprocess.run(
        ["docker", "compose", *files, "config", "--format", "json"],
        cwd=ROOT, env=env, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise RuntimeError("Docker Compose config failed:\n" + result.stderr)
    return json.loads(result.stdout)

def bindings(svc):
    return {
        (p.get("host_ip", ""), str(p["published"]), int(p["target"]))
        for p in svc.get("ports", [])
    }

original = config(["-f", "compose.yaml"], ENV | {"FRONTEND_HOST_PORT": "5173"})
assert ("127.0.0.1", "5173", 5173) in bindings(original["services"]["frontend"]), (
    "compose.yaml alone must preserve legacy Vite on 5173"
)
assert "nuxt-local-gateway" not in original["services"], (
    "The main-2 hybrid launch must be opt-in, not silently enabled in base Compose"
)

hybrid = config(FULL, ENV)
services = hybrid["services"]
vite = bindings(services["frontend"])
gateway = bindings(services["nuxt-main2-gateway"])
alternate = bindings(services["nuxt-local-gateway"])
assert vite == {("127.0.0.1", "5174", 5173)}, f"Vite port mismatch: {vite}"
assert gateway == {("127.0.0.1", "5173", 80)}, f"Main nginx must own only 5173: {gateway}"
assert alternate == {("127.0.0.1", "8083", 80)}, f"Alternate nginx must own only 8083: {alternate}"
assert ("127.0.0.1", "8082", 3000) in bindings(services["frontend-nuxt"]), (
    "Nuxt direct preview must stay on 8082"
)
for svc_name in ("backend", "postgres"):
    assert all(host == "127.0.0.1" for host, _, _ in bindings(services[svc_name])), (
        f"Private service {svc_name} unexpectedly published on LAN"
    )

# Prove a concrete LAN IPv4 is published for gateway ONLY, without opening Vite/API.
lan = config(FULL, ENV | {"NUXT_LOCAL_GATEWAY_BIND_IP": "192.168.1.26"})
assert bindings(lan["services"]["nuxt-main2-gateway"]) == {
    ("192.168.1.26", "5173", 80)
}, "LAN main entrypoint not bound to the explicit interface"
assert bindings(lan["services"]["nuxt-local-gateway"]) == {
    ("192.168.1.26", "8083", 80)
}, "LAN alternate entrypoint not bound to the explicit interface"
assert bindings(lan["services"]["frontend"]) == vite, "Vite unexpectedly exposed on LAN"
for launcher in ("scripts/start-main2-hybrid.ps1", "scripts/start-main2-hybrid.sh"):
    text = (ROOT / launcher).read_text(encoding="utf-8")
    assert "down -v" not in text, f"Launcher must never delete volumes: {launcher}"
    assert "--force-recreate" in text, f"Launcher must recreate stale gateways: {launcher}"
    assert ("docker inspect" in text), f"Launcher must verify actual port bindings: {launcher}"

print("PASS main-2: isolated nginx 5173 and 8083, Vite 5174, legacy fallback; LAN isolated")

if "--runtime" in __import__("sys").argv:
    proxies = ("nuxt-main2-gateway", "nuxt-local-gateway")
    def docker(*args):
        result = subprocess.run(
            ["docker", *args], cwd=ROOT, env=ENV,
            text=True, capture_output=True, check=False,
        )
        if result.returncode:
            raise RuntimeError("Docker command failed: " + " ".join(args) + "\\n" + result.stderr)
        return result.stdout.strip()
    try:
        docker("compose", *FULL, "up", "-d", "--no-deps", "--force-recreate", *proxies)
        for service, port in (("nuxt-main2-gateway", "5173"), ("nuxt-local-gateway", "8083")):
            cid = docker("compose", *FULL, "ps", "-q", service)
            assert cid, f"Container absent: {service}"
            mapping = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Ports}}", cid))
            assert mapping["80/tcp"] == [{"HostIp": "127.0.0.1", "HostPort": port}], (
                f"{service} has wrong actual host mapping: {mapping}"
            )
        print("PASS real Docker runtime publishes both fixed localhost ports")
    finally:
        subprocess.run(["docker", "compose", *FULL, "stop", *proxies], cwd=ROOT, env=ENV, capture_output=True)
        subprocess.run(["docker", "compose", *FULL, "rm", "-f", *proxies], cwd=ROOT, env=ENV, capture_output=True)

