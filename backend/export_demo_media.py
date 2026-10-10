"""
Export the demo images to frontend/data/demo-media, where the Node.js server serves them.

The fictional brand's logo and every simulated account's avatar are drawn here with
Pillow, once, so the deployed server and this reference engine compare identical
pixels. Run again after editing the datasets:

    .venv\\Scripts\\python export_demo_media.py
"""

import json

from app.config import settings
from app.demo_assets import _variant, draw_logo, slug

OUT = settings.data_dir / "demo-media"


def main() -> None:
    (OUT / "brand").mkdir(parents=True, exist_ok=True)
    (OUT / "dataset").mkdir(parents=True, exist_ok=True)
    draw_logo().save(OUT / "brand" / "demo-logo.png", "PNG")

    rows: list[tuple[str, dict, str]] = []
    for p in json.loads((settings.data_dir / "social_profiles.json").read_text(encoding="utf-8")):
        rows.append((f"{p['platform']}-{p['handle']}", p, p["display_name"]))
    for name in ("store_snapshot.json", "apk_sites.json"):
        for a in json.loads((settings.data_dir / name).read_text(encoding="utf-8")):
            rows.append((f"{a['platform']}-{a['package_id']}", a, a["title"]))

    for key, row, label in rows:
        kind = row["avatar"]
        if row.get("base_brand"):
            # Derived from a real brand's logo at runtime; this is the fallback when that logo is missing.
            kind = "monogram" if kind != "unrelated" else "unrelated"
        _variant(kind, label).save(OUT / "dataset" / f"{slug(key)}.png", "PNG")
    print(f"Wrote {len(rows)} avatars and the demo logo to {OUT}")


if __name__ == "__main__":
    main()
