"""All actual editor locations: isolated CI PostgreSQL + authenticated HTTP.

Called by smoke-local.py only with the hosted-runner opt-in. Never run against
a shared database. Each media record refers to a repository fixture path.
"""
import json
import os
from pathlib import Path
from urllib.parse import quote
from urllib.request import build_opener
from uuid import uuid4


def verify_all_slots(admin, call, require):
    require(os.environ.get("CI") == "true" and
            os.environ.get("GITHUB_ACTIONS") == "true" and
            os.environ.get("CMS_ALL_SLOTS_CI") == "1",
            "All-slot writes are restricted to the isolated CI fixture.")
    catalog = json.loads(Path(os.environ["CMS_ALL_SLOTS_CATALOG"]).read_text())
    require(isinstance(catalog, list) and len(catalog) >= 400, "Missing generated catalog")
    keys = {row["key"] for row in catalog}
    require(len(keys) == len(catalog), "Duplicate catalog keys")
    require(all(row["type"] in ("text", "media") for row in catalog), "Invalid slot type")
    visitor = build_opener()
    status, existing = call(admin, "/api/admin/content/site")
    require(status == 200 and isinstance(existing, list), "Cannot read existing CMS slots")
    content_fields = ("draftEs", "draftEn", "draftMediaId", "publishedEs",
                      "publishedEn", "publishedMediaId")
    require(not any(row.get("key") in keys and any(row.get(f) is not None for f in content_fields)
                    for row in existing), "Refusing to overwrite nonempty CMS locations")
    def public():
        headers = {}
        status, data = call(visitor, "/api/content/site", response_headers=headers)
        require(status == 200 and isinstance(data, list), "Public CMS response failed")
        require(headers.get("Cache-Control") == "no-store", "Public CMS must not cache drafts")
        mapped = {row["key"]: row for row in data}
        require(len(mapped) == len(data), "Duplicate public CMS locations")
        return mapped
    baseline = public()
    require(not keys.intersection(baseline), "Public test locations must start empty")
    token = uuid4().hex[:12]
    touched = []
    media_ids = []
    expected = {}
    def route(key):
        return "/api/admin/content/site/" + quote(key, safe="")
    try:
        for slot in catalog:
            key = slot["key"]
            if slot["type"] == "text":
                es, en = "CI ES " + token + " " + key, "CI EN " + token + " " + key
                payload = {"textEs": es, "textEn": en, "mediaId": None}
                expected[key] = {"textEs": es, "textEn": en, "mediaSrc": None, "mediaKind": None}
                invalid = {"textEs": "wrong type", "textEn": None, "mediaId": str(uuid4())}
            else:
                src = "/images/cover-logistics.jpeg?cms-test=" + token + "-" + key
                status, media = call(admin, "/api/admin/content/media",
                                     {"name": "CI " + token + " " + key, "kind": "Imagen", "src": src})
                require(status == 201 and media.get("id"), "Media fixture failed: " + key)
                media_ids.append(media["id"])
                payload = {"textEs": None, "textEn": None, "mediaId": media["id"]}
                expected[key] = {"textEs": None, "textEn": None, "mediaSrc": src, "mediaKind": "Imagen"}
                invalid = {"textEs": "wrong type", "textEn": None, "mediaId": None}
            status, _ = call(admin, route(key), invalid, "PUT")
            require(status == 400, "Wrong slot type accepted: " + key)
            touched.append(key)
            status, row = call(admin, route(key), payload, "PUT")
            require(status == 200 and row.get("key") == key and
                    row.get("draftEs") == payload["textEs"] and
                    row.get("draftEn") == payload["textEn"] and
                    row.get("draftMediaId") == payload["mediaId"] and
                    all(row.get(f) is None for f in content_fields[3:]),
                    "Draft contract failed: " + key)
        require(public() == baseline, "Draft batch changed public content")
        print("PASS: every generated CMS location accepts only its own type; all drafts remain private.")
        for key in touched:
            status, row = call(admin, route(key) + "/publish", method="POST")
            require(status == 200 and row.get("key") == key, "Publish failed: " + key)
        actual = public()
        require(set(actual) == set(baseline) | keys, "Unexpected public location set")
        for key, fields in expected.items():
            require(all(actual[key].get(f) == val for f, val in fields.items()), "Public value mismatch: " + key)
        require(all(actual[key] == val for key, val in baseline.items()), "Unrelated published content changed")
        print("PASS: all", len(keys), "locations publish their unique expected values.")
    finally:
        failures = []
        for key in touched:
            try:
                status, row = call(admin, route(key) + "/restore", method="POST")
                if status != 200 or any(row.get(f) is not None for f in content_fields):
                    failures.append("restore " + key)
            except Exception:
                failures.append("restore " + key)
        status, library = call(admin, "/api/admin/content/media")
        require(status == 200 and set(media_ids).issubset({item["id"] for item in library}),
                "Restore removed media records unexpectedly")
        for mid in media_ids:
            try:
                status, _ = call(admin, "/api/admin/content/media/" + mid, method="DELETE")
                if status != 204:
                    failures.append("delete fixture media " + mid)
            except Exception:
                failures.append("delete fixture media " + mid)
        require(not failures, "Fixture cleanup failures: " + ", ".join(failures[:10]))
        require(public() == baseline, "Restore did not return public content to baseline")
    print("PASS: all", len(keys), "locations restored; fixture media retained through restore and then cleaned.")
