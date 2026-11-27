#!/usr/bin/env python3
"""Read-only guard for the frontend build-tool/runtime dependency boundary.

Not a vulnerability fix or a replacement for the full npm audit.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


lock = json.loads((FRONTEND / "package-lock.json").read_text(encoding="utf-8"))
packages = lock["packages"]
direct = packages[""].get("dependencies", {})

# The two advisories currently originate from the toolchain, not direct
# browser runtime dependencies. Verify *every* installed copy is dev-only.
for name in ("picomatch", "minimatch"):
    require(name not in direct, f"{name} became a direct runtime dependency")
    matches = {
        path: item for path, item in packages.items()
        if path == f"node_modules/{name}" or path.endswith(f"/node_modules/{name}")
    }
    require(matches, f"Expected lockfile dependency {name} is missing; review this guard")
    for path, package in matches.items():
        require(package.get("dev") is True,
                f"{path}@{package.get('version')} is no longer dev-only")
        print(f"LOCK dev-only: {path}@{package['version']}")

# Inspect the *final* stage, not the build stage, of each production Dockerfile.
# Tight copy-only allowlists fail closed if runtime deployment steps change.
def final_stage(path: Path) -> tuple[str, list[str]]:
    source = path.read_text(encoding="utf-8")
    stages = [line.strip() for line in source.splitlines()]
    boundaries = [i for i, line in enumerate(stages)
                  if line.upper().startswith("FROM ")]
    require(len(boundaries) >= 2, f"{path.name} must be a multi-stage build")
    lines = [line for line in stages[boundaries[-1]:]
             if line and not line.startswith("#")]
    copies = [line for line in lines if line.upper().startswith("COPY ")]
    require(not any(line.upper().startswith(("RUN NPM", "RUN YARN", "RUN PNPM"))
                    for line in lines),
            f"{path.name} must not install build dependencies in final stage")
    return lines[0], copies


image, copies = final_stage(FRONTEND / "Dockerfile")
require(image == "FROM nginx:alpine", "Vue runtime must remain a static Nginx image")
require(copies == [
    "COPY --from=build /app/dist /usr/share/nginx/html",
    "COPY nginx.conf /etc/nginx/conf.d/default.conf",
], "Vue final image copy allowlist changed; re-review build dependency boundary")
print("RUNTIME Vue: final Nginx stage copies only dist and nginx config")

image, copies = final_stage(FRONTEND / "nuxt" / "Dockerfile")
require(image == "FROM node:22-alpine", "Nuxt runtime base image changed; review")
require(copies == [
    "COPY --from=build /workspace/nuxt/.output ./.output",
], "Nuxt final image copy allowlist changed; re-review Node build dependency boundary")
print("RUNTIME Nuxt: final Node stage copies only built .output")

print("PASS build dependencies remain dev-only in frontend lockfile and "
      "do not enter final Docker images via node_modules COPY.")
print("LIMITATION: static checks cannot prove that generated bundles contain "
      "no vulnerable code; full npm audit must remain enabled.")
