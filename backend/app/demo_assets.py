"""
Demo images for the fictional brand. Real deployments use fetched avatars and
store icons; these exist so logo similarity is measured on actual pixels.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from .config import settings
from .media_store import save_image

BRAND_FILL = (15, 92, 86)
RECOLOR_FILL = (61, 138, 128)
DOT = (159, 227, 214)
SIZE = 256


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def _font(size: int) -> ImageFont.ImageFont:
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def draw_logo(fill=BRAND_FILL) -> Image.Image:
    k = SIZE / 40
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=int(9 * k), fill=fill)
    pts = [(11 * k, 11.5 * k), (28.5 * k, 11.5 * k), (13.5 * k, 27 * k), (29 * k, 27 * k)]
    d.line(pts, fill="white", width=int(3.6 * k), joint="curve")
    r = 2.3 * k
    d.ellipse([29.5 * k - r, 11.5 * k - r, 29.5 * k + r, 11.5 * k + r], fill=DOT)
    return img


def _variant(kind: str, label: str) -> Image.Image:
    if kind in ("official", "copy"):
        img = draw_logo()
        if kind == "copy":  # re-encoded, slightly soft, as screenshots of a logo usually are
            img = img.resize((180, 180)).resize((SIZE, SIZE)).filter(ImageFilter.GaussianBlur(0.8))
        return img
    if kind == "recolor":
        return draw_logo(RECOLOR_FILL)
    if kind == "mirror":
        return ImageOps.mirror(draw_logo())
    if kind == "badge":
        img = draw_logo()
        d = ImageDraw.Draw(img)
        d.rectangle([0, int(SIZE * 0.75), SIZE, SIZE], fill=(124, 45, 18))
        d.text((SIZE / 2, SIZE * 0.875), "SUPPORT", fill="white", font=_font(34), anchor="mm")
        return img

    # monogram / unrelated: neutral tile with initials, colour seeded by the label
    h = int(hashlib.md5(label.encode()).hexdigest()[:6], 16)
    tone = 200 + h % 40
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    shape = d.ellipse if kind == "monogram" else d.rounded_rectangle
    if kind == "monogram":
        shape([0, 0, SIZE - 1, SIZE - 1], fill=(tone, tone, tone - 6))
    else:
        hue = [(214, 120, 70), (70, 110, 200), (120, 160, 80), (180, 90, 150)][h % 4]
        d.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=48, fill=hue)
    initials = "".join(w[0] for w in re.findall(r"[A-Za-z]+", label)[:2]).upper() or "?"
    d.text((SIZE / 2, SIZE / 2), initials, fill=(60, 60, 55) if kind == "monogram" else "white", font=_font(96), anchor="mm")
    return img


def ensure_brand_logo(brand_id: str) -> str:
    path = settings.media_dir / "brand" / f"{brand_id}.png"
    if not path.exists():
        save_image(f"brand/{brand_id}.png", draw_logo())
    return f"/media/brand/{brand_id}.png"


def ensure_avatar(kind: str, key: str, label: str) -> str:
    """Generate (once) and return the media path for a dataset avatar or icon."""
    name = f"{slug(key)}.png"
    path = settings.media_dir / "dataset" / name
    if not path.exists():
        save_image(f"dataset/{name}", _variant(kind, label))
    return f"/media/dataset/{name}"


def ensure_avatar_from_base(kind: str, key: str, base_path: Path, label: str) -> str:
    """
    Impersonator variants of a real brand image (the brand's own logo or verified app icon):
    copy (re-encoded), recolor (hue shifted), mirror, badge. Regenerated when the base changes.
    Falls back to a neutral monogram when no base image is available.
    """
    if not base_path.exists() or kind not in ("copy", "recolor", "mirror", "badge"):
        return ensure_avatar("monogram" if kind != "unrelated" else "unrelated", key, label)
    stamp = int(base_path.stat().st_mtime)
    name = f"{slug(key)}-{stamp}.png"
    path = settings.media_dir / "dataset" / name
    if not path.exists():
        img = Image.open(base_path).convert("RGBA").resize((SIZE, SIZE))
        if kind == "copy":
            img = img.resize((180, 180)).resize((SIZE, SIZE)).filter(ImageFilter.GaussianBlur(0.8))
        elif kind == "recolor":
            r, g, b, a = img.split()
            h, s, v = Image.merge("RGB", (r, g, b)).convert("HSV").split()
            h = h.point(lambda x: (x + 28) % 256)
            img = Image.merge("HSV", (h, s, v)).convert("RGB")
            img.putalpha(a)
        elif kind == "mirror":
            img = ImageOps.mirror(img)
        elif kind == "badge":
            d = ImageDraw.Draw(img)
            d.rectangle([0, int(SIZE * 0.75), SIZE, SIZE], fill=(124, 45, 18))
            d.text((SIZE / 2, SIZE * 0.875), "SUPPORT", fill="white", font=_font(34), anchor="mm")
        save_image(f"dataset/{name}", img)
    return f"/media/dataset/{name}"