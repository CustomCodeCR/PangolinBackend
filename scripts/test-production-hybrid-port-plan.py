#!/usr/bin/env python3
"""Validate the opt-in Argos WWW port plan using fixture secrets only.

This test never starts or stops containers. Docker Compose is only asked to
render the production configuration with two different host-port assignments.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "deploy/docker-compose.images.yml"
GATEWAY = ROOT / "deploy/nuxt-hybrid-gateway.conf"

# Do not load /opt/dhole/.env or use credentials from the operator's machine.
FIXTURE = {
    "PANGOLIN_IMAGE_TAG": "sha-test-not-a-release",
    "PANGOLIN_POSTGRES_PASSWORD": "not-a-real-password",
    "PANGOLIN_AUTH_OTP_PEPPER": "a" * 64,
    "PANGOLIN_AUTH_JWT_SIGNING_KEY": "b" * 64,
    "FENNEC_HOST": "example.test",
    "FENNEC_WWW_HOST": "www.example.test",
    "DHOLE_NETWORK": "dhole",
    "TRAEFIK_ROUTER_PREFIX": "prod",
    "PANGOLIN_TRAEFIK_ENABLED": "true",
    "PANGOLIN_NUXT_TRAEFIK_ENABLED": "true",
    "PANGOLIN_NUXT_LOCAL_PORT": "8182",
}


def render(legacy_port: int, hybrid_port: int) -> dict:
    env = dict(os.environ)
    env.update(FIXTURE)
    env.update({
        "PANGOLIN_LOCAL_PORT": str(legacy_port),
        "PANGOLIN_HYBRID_LOCAL_PORT": str(hybrid_port),
    })
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "config", "--format", "json"],
        cwd=ROOT, env=env, text=True, capture_output=True, check=False,
    )
    if result.returncode:
        raise AssertionError("Compose validation failed: " + result.stderr)
    return json.loads(result.stdout)


def host_ports(service: dict) -> set[tuple[str, str, int]]:
    return {
        (str(p.get("host_ip", "")), str(p["published"]), int(p["target"]))
        for p in service.get("ports", [])
    }


def check_layout(legacy: int, hybrid: int) -> None:
    services = render(legacy, hybrid)["services"]
    assert host_ports(services["frontend"]) == {("127.0.0.1", str(legacy), 80)}
    assert host_ports(services["seo-gateway"]) == {("127.0.0.1", str(hybrid), 80)}
    assert host_ports(services["frontend-nuxt"]) == {("127.0.0.1", "8182", 3000)}
    assert not host_ports(services["backend"]), "The backend must not publish a host port"
    nuxt = services["frontend-nuxt"]
    assert "no-new-privileges:true" in {v.replace("=", ":", 1) for v in nuxt.get("security_opt", [])}
    assert set(nuxt.get("cap_drop", [])) == {"ALL"}
    assert not nuxt.get("cap_add") and not nuxt.get("privileged")
    assert nuxt.get("read_only") is True, "Nuxt root filesystem must be read-only"
    assert not nuxt.get("tmpfs"), "Do not introduce unneeded writable temporary mounts"
    assert not nuxt.get("volumes"), "Do not introduce unneeded Nuxt volume mounts"
    print("PASS Nuxt Compose read-only root filesystem")
    print("PASS Nuxt Compose runtime privilege restrictions")
    backend = services["backend"]
    assert "no-new-privileges:true" in {v.replace("=", ":", 1) for v in backend.get("security_opt", [])}
    assert set(backend.get("cap_drop", [])) == {"ALL"}
    assert not backend.get("cap_add") and not backend.get("privileged")
    print("PASS backend Compose runtime privilege restrictions")
    all_ports = [p[1] for name in ("frontend", "seo-gateway", "frontend-nuxt")
                 for p in host_ports(services[name])]
    assert len(all_ports) == len(set(all_ports)), "Duplicate host port"
    for name in ("frontend", "seo-gateway"):
        labels = services[name]["labels"]
        assert str(labels["traefik.enable"]).lower() == "true"
    nuxt_labels = services["seo-gateway"]["labels"]
    legacy_labels = services["frontend"]["labels"]
    assert str(nuxt_labels["traefik.http.routers.prod-pangolin-nuxt-www.priority"]) == "1100"
    assert str(legacy_labels["traefik.http.routers.prod-pangolin-www.priority"]) == "1000"
    assert "www.example.test" in nuxt_labels["traefik.http.routers.prod-pangolin-nuxt-www.rule"]
    assert "example.test" not in nuxt_labels["traefik.http.routers.prod-pangolin-nuxt-www.rule"].replace("www.example.test", "")
    assert "pangolin-internal" in services["seo-gateway"]["networks"]
    assert "pangolin-internal" in services["frontend"]["networks"]
    print(f"PASS frontend={legacy}, gateway={hybrid}, Nuxt direct=8182, loopback only")


check_layout(8180, 8183)  # Existing production behavior, unchanged by the PR
check_layout(8184, 8180)  # Manually activated, single WWW port on hybrid

gateway_text = GATEWAY.read_text(encoding="utf-8")
assert "location ^~ /assets/" in gateway_text
legacy_assets = gateway_text.split("location ^~ /assets/", 1)[1].split("location / {", 1)[0]
assert "proxy_pass http://pangolin_legacy;" in legacy_assets
assert "location ~ ^/(administracion|admin|cotizaciones|tracking|itinerario|bienvenidos)" in gateway_text
assert "location = /api/public-news" in gateway_text
assert "location ^~ /api/" in gateway_text
print("PASS hybrid forwards private Vue assets, authenticated routes, and API")


# Check the actual deployment workflow without dispatching it or running Docker
# operations against production. Extract the preflight shell and test it with a
# fake Docker executable that records arguments and fails the image pull.
import tempfile

workflow = (ROOT / ".github/workflows/pangolin-images.yml").read_text(encoding="utf-8")
publish_job = workflow.split("\n  publish:\n", 1)[1].split("\n  deploy:\n", 1)[0]
deploy_job = workflow.split("\n  deploy:\n", 1)[1]
assert "    if: ${{ github.ref == 'refs/heads/main' }}" in publish_job
assert "    if: ${{ github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.deploy)) }}" in deploy_job
pull_step = deploy_job.split("      - name: Pull all precompiled application and gateway images before database changes\n", 1)[1].split("\n      - name:", 1)[0]
script = "\n".join(line[10:] for line in pull_step.split("        run: |\n", 1)[1].splitlines() if line.startswith("          "))
assert "set -euo pipefail" in script
assert "pull backend frontend frontend-nuxt seo-gateway" in script
assert deploy_job.index(pull_step) < deploy_job.index("Provision isolated pangolin PostgreSQL role")
# Use only a private temporary fake executable; do not run any real image pull.
with tempfile.TemporaryDirectory() as directory:
    temp = Path(directory)
    fake = temp / "docker"
    fake.write_text("""#!/bin/sh
printf '%s\\n' "$*" >> "$TEST_CALLS"
case "$*" in
  *"pull backend frontend frontend-nuxt seo-gateway") exit "${TEST_PULL_RC:-0}" ;;
  "image inspect postgres:16-alpine") exit 0 ;;
  *) exit 99 ;;
esac
""", encoding="utf-8")
    fake.chmod(0o700)
    calls = temp / "calls"
    env = {"PATH": str(temp) + ":/usr/bin:/bin", "TEST_CALLS": str(calls),
           "DHOLE_ENV_FILE": "/fixture/only.env", "COMPOSE_FILE": "/fixture/compose.yml"}
    for failure in (False, True):
        calls.write_text("")
        result = subprocess.run(["bash", "-c", script + "\necho PREFLIGHT_PASSED"],
                                env=dict(env, TEST_PULL_RC="17" if failure else "0"),
                                text=True, capture_output=True)
        observed = calls.read_text().splitlines()
        assert observed[0].endswith("pull backend frontend frontend-nuxt seo-gateway")
        if failure:
            assert result.returncode == 17
            assert len(observed) == 1
            assert "PREFLIGHT_PASSED" not in result.stdout
        else:
            assert result.returncode == 0
            assert observed[1:] == ["image inspect postgres:16-alpine"]
            assert "PREFLIGHT_PASSED" in result.stdout
print("PASS production workflow main-only guards and gateway pre-pull failure stops preflight")
