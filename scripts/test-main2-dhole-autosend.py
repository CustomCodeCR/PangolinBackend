#!/usr/bin/env python3
"""Offline-only contract check for the opt-in main-2 local Dhole auto-send overlay.
Never starts Docker or reaches Dhole/Graph. Uses fictional secrets only.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "-f", "compose.yaml",
    "-f", "compose.nuxt-preview.yaml",
    "-f", "compose.nuxt-local-hybrid.yaml",
    "-f", "compose.main2-hybrid.yaml",
]
PREVIEW = ["-f", "compose.dhole-main2-preview.yaml"]
AUTOSEND = ["-f", "compose.dhole-main2-autosend.yaml"]
ENV = {
    **os.environ,
    "POSTGRES_PASSWORD": "fictional-only-postgres",
    "AUTH_OTP_PEPPER": "a" * 64,
    "AUTH_JWT_SIGNING_KEY": "b" * 64,
    "DHOLE_LOCAL_PREVIEW_KEY": "fictional-preview-not-real",
    "DHOLE_PILOT_POST_KEY": "dh_ext_" + "c" * 64,
    "DHOLE_MAIN2_AUTOSEND_START_UTC": "2026-11-24T10:00:00Z",
}
def config(files, env):
    result = subprocess.run(
        ["docker", "compose", *files, "config", "--format", "json"],
        cwd=ROOT, env=env, capture_output=True, text=True
    )
    if result.returncode:
        raise RuntimeError("Compose validation failed (no secrets printed).")
    return json.loads(result.stdout)

base = config(FILES, ENV)["services"]["backend"]["environment"]
preview = config(FILES + PREVIEW, ENV)["services"]["backend"]["environment"]
sending = config(FILES + PREVIEW + AUTOSEND, ENV)["services"]["backend"]["environment"]
true_flags = (
    "Features__OfficialQuotesEnabled",
    "DholeCatalogs__FormEnabled",
    "DholeCatalogs__SubmissionEnabled",
    "DholeSubmission__DirectOutboxEnabled",
    "DholeSubmission__ClientCreateIdempotencyEnabled",
    "DholeSubmission__WorkerEnabled",
    "DholeSubmission__DispatcherEnabled",
    "DholeSubmission__ClaimPreviewEnabled",
    "DholeSubmission__OutcomePreviewEnabled",
    "DholeSubmission__PostEnabled",
    "DholeSubmission__ApplicantContactSharingApproved",
    "DholeSubmission__AllNewQuotesEnabled",
    "DholeSubmission__TemporaryCatalogsEnabled",
    "DholeSubmission__ManualCommercialReviewEnabled",
    "DholeSubmission__AcceptCreationReceiptEnabled",
    "DholeSubmission__ConfirmationEmailEnabled",
)
for setting in true_flags:
    assert sending.get(setting) == "true", f"Autosend missing {setting}"
assert base.get("DholeSubmission__WorkerEnabled") != "true"
assert preview.get("DholeSubmission__WorkerEnabled") != "true"
assert sending["DholeSubmission__PilotQuoteId"] == ""
assert sending["DholeSubmission__NewQuotesStartUtc"] == ENV["DHOLE_MAIN2_AUTOSEND_START_UTC"]
assert sending["DholeSubmission__VerificationEnabled"] == "false"
assert sending["DholeSubmission__TemporaryCatalogsValidUntilUtc"] == ""
assert sending["DholeSubmission__ApiKey"] == ENV["DHOLE_PILOT_POST_KEY"]
assert sending["Email__Mode"] == "Graph"
assert not any("compose.dhole-main2-autosend.yaml" in x for x in FILES + PREVIEW)
assert "DHOLE_MAIN2_AUTOSEND_ENABLED" in (ROOT / "scripts/start-main2-hybrid.ps1").read_text()
without_cutoff = dict(ENV)
without_cutoff.pop("DHOLE_MAIN2_AUTOSEND_START_UTC")
failed = subprocess.run(
    ["docker", "compose", *(FILES + PREVIEW + AUTOSEND), "config", "--quiet"],
    cwd=ROOT, env=without_cutoff, capture_output=True, text=True
)
assert failed.returncode != 0, "Missing fixed UTC cutoff must fail closed"
print("PASS: default OFF; explicit fresh-scope auto-send; no pilot UUID; no historical backlog; no real calls.")
