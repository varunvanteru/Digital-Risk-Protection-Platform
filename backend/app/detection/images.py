"""
Logo / icon similarity.

Shape: perceptual hash (pHash) Hamming distance, also against the mirrored
official logo. Colour: hue-histogram intersection. A recolour keeps the shape
and changes the colour; a mirror matches only the flipped logo.
"""

from __future__ import annotations

import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import httpx
import imagehash
from PIL import Image, ImageOps

from ..config import settings
from ..tls import tls_context


@dataclass
class ImageMatch:
    score: float  # 0..1
    shape: float
    colour: float
    kind: str  # copy | mirror | recolor | similar | different


def _flatten(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
    return Image.alpha_composite(bg, img).convert("RGB").resize((256, 256))


def load_image(ref: str) -> Image.Image | None:
    """Load from a local media path ("/media/...") or an http(s) URL. Returns None on failure."""
    try:
        if ref.startswith("http"):
            r = httpx.get(ref, timeout=settings.source_timeout_s, follow_redirects=True, verify=tls_context())
            r.raise_for_status()
            return _flatten(Image.open(io.BytesIO(r.content)))
        path = settings.media_dir / ref.removeprefix("/media/")
        return _flatten(Image.open(path))
    except Exception:
        return None


@lru_cache(maxsize=512)
def _cached(ref: str) -> Image.Image | None:
    return load_image(ref)


def _shape_similarity(a: Image.Image, b: Image.Image) -> float:
    d = imagehash.phash(a) - imagehash.phash(b)
    # 64-bit hash: <= 4 bits apart is a copy; around 28+ bits is unrelated.
    return max(0.0, min(1.0, 1 - (d - 4) / 24))


def _colour_similarity(a: Image.Image, b: Image.Image) -> float:
    def hist(img: Image.Image) -> list[float]:
        hsv = img.convert("HSV").resize((64, 64))
        h, s, v = hsv.split()
        bins = [0.0] * 18
        for hue, sat, val in zip(h.getdata(), s.getdata(), v.getdata()):
            if sat > 60 and val > 50:  # ignore white, grey and black
                bins[hue * 18 // 256] += 1
        total = sum(bins) or 1.0
        return [x / total for x in bins]

    ha, hb = hist(a), hist(b)
    if sum(ha) == 0 or sum(hb) == 0:
        return 0.0
    return sum(min(x, y) for x, y in zip(ha, hb))


def compare(official_ref: str, candidate_ref: str | None) -> ImageMatch | None:
    if not candidate_ref:
        return None
    official = _cached(official_ref)
    candidate = _cached(candidate_ref)
    if official is None or candidate is None:
        return None

    straight = _shape_similarity(official, candidate)
    mirrored = _shape_similarity(ImageOps.mirror(official), candidate)
    shape = max(straight, mirrored)
    colour = _colour_similarity(official, candidate)
    score = round(0.8 * shape + 0.2 * colour, 2)

    if shape >= 0.8 and mirrored > straight + 0.1:
        kind = "mirror"
    elif shape >= 0.8 and colour < 0.6:
        kind = "recolor"
    elif shape >= 0.8:
        kind = "copy"
    elif score >= 0.5:
        kind = "similar"
    else:
        kind = "different"
    return ImageMatch(score=score, shape=round(shape, 2), colour=round(colour, 2), kind=kind)


def official_logo_ref(brand_logo_path: str | None) -> str | None:
    if not brand_logo_path:
        return None
    p = Path(settings.media_dir / brand_logo_path.removeprefix("/media/"))
    return brand_logo_path if p.exists() else None
