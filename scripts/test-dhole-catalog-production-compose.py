#!/usr/bin/env python3
"""Verify that Dhole catalog settings reach ONLY the production backend.

No production host, upstream Dhole API or real secrets are accessed.
Docker Compose renders fixture-only configuration; no containers are started.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "deploy/docker-compose.images.yml"
PREFIX = "PANGOLIN_DHOLE_CATALOGS_"
SETTING_NAMES = {
    "ENABLED": "DholeCatalogs__Enabled",
    "API_KEY": "DholeCatalogs__ApiKey",
    "FORM_ENABLED": "DholeCatalogs__FormEnabled",
    "SUBMISSION_ENABLED": "DholeCatalogs__SubmissionEnabled",
    "ITINERARIES_ENABLED": "DholeCatalogs__ItinerariesEnabled",
}
BASE_FIXTURE = {
    "PANGOLIN_IMAGE_TAG": "sha-ci-fixture",
    "PANGOLIN_POSTGRES_PASSWORD": "fixture-pg-only",
    "PANGOLIN_AUTH_OTP_PEPPER": "a" * 64,
    "PANGOLIN_AUTH_JWT_SIGNING_KEY": "b" * 64,
    "FENNEC_HOST": "example.test",
    "FENNEC_WWW_HOST": "www.example.test",
}


def render(overrides: dict[str, str]) -> dict:
    # Clear inherited catalog flags so this validates secure defaults regardless
    # of the runner's unrelated environment. Never load /opt/dhole/.env.
    env = {k: v for k, v in os.environ.items() if not k.startswith(PREFIX)}
    env.update(BASE_FIXTURE)
    env.update({PREFIX + key: value for key, value in overrides.items()})
    run = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "config", "--format", "json"],
        cwd=ROOT, env=env, text=True, capture_output=True, check=False,
    )
    if run.returncode:
        # Never echo interpolated configuration or potentially sensitive data.
        raise AssertionError("Fixture-only production Compose could not render.")
    return json.loads(run.stdout)["services"]


def check_backend_only(services: dict, expected: dict[str, str]) -> None:
    backend = services["backend"]["environment"]
    for key, backend_key in SETTING_NAMES.items():
        assert backend.get(backend_key) == expected[key], (
            "Incorrect backend catalog binding: " + backend_key
        )
    for service in ("frontend", "frontend-nuxt", "seo-gateway"):
        assert not any(k.startswith("DholeCatalogs__") for k in
                       services[service].get("environment", {})), (
            "Dhole catalog secrets leaked outside backend"
        )


defaults = {
    "ENABLED": "false", "API_KEY": "", "FORM_ENABLED": "false",
    "SUBMISSION_ENABLED": "false", "ITINERARIES_ENABLED": "false",
}
check_backend_only(render({}), defaults)
print("PASS production defaults: Dhole catalogs remain opt-out")

read_only = {**defaults, "ENABLED": "true", "API_KEY": "ci-not-a-real-api-key"}
check_backend_only(render(read_only), read_only)
print("PASS read-only catalog access can be enabled independently")

staged = {
    **read_only, "FORM_ENABLED": "true",
    "SUBMISSION_ENABLED": "true", "ITINERARIES_ENABLED": "true",
}
check_backend_only(render(staged), staged)
print("PASS form, server-side submission and itineraries are explicit opt-ins")
