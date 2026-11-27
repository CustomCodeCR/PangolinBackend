#!/usr/bin/env python3
"""Offline HTML preview of the newest LocalOutbox OTP email, including CID graphics.

Only reads local .eml files. Never sends mail or contacts Microsoft.
The generated HTML contains a sensitive one-time code: delete it after review.
"""
from __future__ import annotations

import base64
from email import policy
from email.parser import BytesParser
from pathlib import Path
import re
import sys
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
OUTBOX = ROOT / "backend" / "local-outbox"


def main() -> int:
    messages = list(OUTBOX.glob("otp-*.eml"))
    if not messages:
        print("No hay correos OTP en backend/local-outbox.")
        return 1
    latest = max(messages, key=lambda path: path.stat().st_mtime)
    email = BytesParser(policy=policy.default).parsebytes(latest.read_bytes())
    html_part = email.get_body(preferencelist=("html",))
    if html_part is None:
        print("El correo más reciente no contiene HTML.")
        return 1

    html = html_part.get_content()
    embedded: dict[str, str] = {}
    for part in email.walk():
        content_id = part.get("Content-ID")
        if not content_id:
            continue
        content = part.get_payload(decode=True)
        if not content:
            continue
        media_type = part.get_content_type()
        if not media_type.startswith("image/"):
            continue
        key = content_id.strip().strip("<>").lower()
        embedded[key] = f"data:{media_type};base64,{base64.b64encode(content).decode('ascii')}"

    def expand_cid(match: re.Match[str]) -> str:
        quote, cid = match.group(1), match.group(2)
        data = embedded.get(cid.lower())
        return f"src={quote}{data or 'cid:' + cid}{quote}"

    html = re.sub(r"""src=(["'])cid:([^"']+)\1""", expand_cid, html, flags=re.I)
    output = OUTBOX / "vista-previa-otp.html"
    output.write_text(html, encoding="utf-8")
    print(f"Vista previa con imagenes embebidas: {output}")
    print("Por seguridad, borrá este HTML al terminar: contiene un código de un solo uso.")
    webbrowser.open(output.resolve().as_uri())
    return 0


if __name__ == "__main__":
    sys.exit(main())
