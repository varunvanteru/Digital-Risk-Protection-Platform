"""
Build a manual upload for Hostinger Node.js hosting: the frontend/ app (website,
API and data) as a zip. Only needed when not deploying from GitHub.

Includes only files git tracks or would track (no node_modules, .next or
.env.local), so local settings and secrets never reach the server. Hostinger
installs dependencies and runs `npm run build` itself.

    python scripts/package_frontend.py            -> dist/impostr-frontend.zip
"""

import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
OUT = ROOT / "dist" / "impostr-frontend.zip"

files = subprocess.run(
    ["git", "ls-files", "--cached", "--others", "--exclude-standard", "--", "."],
    cwd=FRONTEND,
    capture_output=True,
    text=True,
    check=True,
).stdout.splitlines()
files = [f for f in files if (FRONTEND / f).is_file()]

for required in ("package.json", "package-lock.json", "server.js", "next.config.ts", "data/labelled_cases.json"):
    if required not in files:
        sys.exit(f"Missing {required}; refusing to build an incomplete package")
leaked = [f for f in files if Path(f).name.startswith(".env")]
if leaked:
    sys.exit(f"Refusing to package local env files: {leaked}")

OUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):
        z.write(FRONTEND / f, f)  # forward-slash paths, so it unpacks correctly on Linux
print(f"{OUT} ({len(files)} files, {OUT.stat().st_size // 1024} KB)")
