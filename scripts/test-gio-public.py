#!/usr/bin/env python3
"""Public GIO API checks. Run against the CI development backend WITHOUT GROQ_API_KEY."""
import json
from urllib.error import HTTPError
from urllib.request import Request, urlopen

URL = "http://127.0.0.1:5000/api/assistant/chat"

def run(payload, expected):
    req = Request(URL, data=json.dumps(payload).encode("utf-8"),
                  headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(req, timeout=10) as response:
            code, body = response.status, response.read().decode("utf-8")
    except HTTPError as exc:
        code, body = exc.code, exc.read().decode("utf-8")
    assert code == expected, f"Expected {expected}, got {code}: {body[:200]}"
    return json.loads(body) if body else {}

# Check the no-key response before validation cases consume the per-IP window.
result = run({"question": "What does ETA mean?", "language": "en"}, 503)
assert result.get("code") == "ai_not_configured", result
run({"question": "  "}, 400)
run({"question": "x" * 801}, 400)
run({"question": "Hello", "language": "fr"}, 400)
# Oversized content must be rejected before consuming the per-IP request quota.
run({"question": "Hello", "history": [{"role": "visitor", "content": "x" * 20000}]}, 413)
run({"question": "Hello", "history": [{"role": "visitor", "content": "x" * 501}]}, 400)
# Five requests consume the window; the next request must be limited.
run({"question": "Hello again"}, 429)
print("GIO public API validation and rate limiting passed")
