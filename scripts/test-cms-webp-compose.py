#!/usr/bin/env python3
"""Verify CMS WebP remains default-off but can be enabled in an isolated local QA stack.

Only renders Docker Compose configuration. It never starts containers, uses real
credentials, contacts S3/MinIO, migrates a database or touches production.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ["-f", "compose.yaml", "-f", "compose.nuxt-preview.yaml",
           "-f", "compose.nuxt-local-hybrid.yaml"]
BASE_ENV = os.environ.copy()
BASE_ENV.update({
    "POSTGRES_PASSWORD": "cms-qa-fixture-only",
    "AUTH_OTP_PEPPER": "a" * 64,
    "AUTH_JWT_SIGNING_KEY": "b" * 64,
    "FRONTEND_BIND_IP": "127.0.0.1",
    "FRONTEND_HOST_PORT": "5174",
})
for key in ("CMS_RESPONSIVE_WEBP_BACKEND", "CMS_RESPONSIVE_WEBP_FRONTEND"):
    BASE_ENV.pop(key, None)


def render(env):
    command = ["docker", "compose", *COMPOSE, "config", "--format", "json"]
    result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                            capture_output=True, check=False)
    if result.returncode:
        raise RuntimeError("Compose validation failed: " + result.stderr)
    return json.loads(result.stdout)["services"]


def assert_flag(actual, expected, context):
    assert str(actual).lower() == expected, f"{context}: expected {expected}, got {actual!r}"


def check(services, enabled):
    expected = "true" if enabled else "false"
    assert_flag(services["backend"]["environment"].get("CmsMedia__ResponsiveWebpEnabled"),
                expected, "backend WebP upload generation")
    assert_flag(services["frontend"]["environment"].get("VITE_CMS_RESPONSIVE_WEBP_ENABLED"),
                expected, "local Vite responsive srcset")
    assert_flag(services["frontend-nuxt"]["build"]["args"].get("VITE_CMS_RESPONSIVE_WEBP_ENABLED"),
                expected, "Nuxt SSR build")
    assert_flag(services["frontend-legacy-preview"]["build"]["args"].get("VITE_CMS_RESPONSIVE_WEBP_ENABLED"),
                expected, "legacy SPA preview build")
    assert_flag(services["frontend-legacy-preview"]["build"]["args"]["VITE_OFFICIAL_QUOTES_ENABLED"],
                "true", "official quotes cannot be disabled by the WebP preview")
    assert services["backend"]["environment"]["Development__ApplySchema"] == "true", (
        "Only the local development backend is eligible for this QA workflow"
    )


check(render(BASE_ENV), enabled=False)
enabled_env = BASE_ENV | {
    "CMS_RESPONSIVE_WEBP_BACKEND": "true",
    "CMS_RESPONSIVE_WEBP_FRONTEND": "true",
}
check(render(enabled_env), enabled=True)

# Production must not get this local opt-in through its checked-in release
# configuration; deployment requires a separate reviewed rollout.
for name in ("deploy/docker-compose.images.yml", "compose.production.yaml"):
    deployment = (ROOT / name).read_text(encoding="utf-8")
    assert "CmsMedia__ResponsiveWebpEnabled:" not in deployment, (
        f"{name} must not automatically enable CMS WebP production generation"
    )

# The WWW deployment uses already-built GHCR images, NOT compose.production.yaml.
# An opt-in in Docker build args cannot be rolled back by changing a runtime
# environment variable alone. Fail closed if any release stage changes.
for name in ("frontend/Dockerfile", "frontend/nuxt/Dockerfile"):
    dockerfile = (ROOT / name).read_text(encoding="utf-8")
    assert "ARG VITE_CMS_RESPONSIVE_WEBP_ENABLED=false" in dockerfile, (
        f"{name} must keep default-off in production image builds"
    )
workflow = (ROOT / ".github/workflows/pangolin-images.yml").read_text(
    encoding="utf-8")
assert "VITE_CMS_RESPONSIVE_WEBP_ENABLED=true" not in workflow, (
    "GHCR release workflow must not activate WebP public srcset implicitly"
)
# Check the actual WWW runtime Compose as well as the non-GHCR candidate.
release = (ROOT / "deploy/docker-compose.images.yml").read_text(encoding="utf-8")
assert "CmsMedia__ResponsiveWebpEnabled:" not in release, (
    "WWW release must not enable new upload conversion without staging"
)
assert "VITE_CMS_RESPONSIVE_WEBP_ENABLED" not in release, (
    "Runtime Compose cannot change a compile-time Vue/Nuxt flag"
)
print("PASS CMS WebP: local backend/Vite/Nuxt opt-in, default-off, "
      "actual GHCR WWW release unchanged")
