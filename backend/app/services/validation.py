"""
Official-asset validation against the live stores.

For every official app in a brand profile, ask its store who publishes it and
record the developer account ID, store title, publisher name and icon. That
turns one known app into a verified developer identity, which is how official
variants (same company, different app) are recognised later, for any brand.

Results are stored on the asset, so they survive restarts and are reused when
the store is unreachable (previous values kept, note says so).
"""

from __future__ import annotations

import logging
from datetime import timedelta

import httpx
from google_play_scraper import app as play_app
from google_play_scraper.exceptions import NotFoundError
from sqlalchemy.orm import Session

from ..config import settings
from ..models import Brand
from ..tls import tls_context
from .scan import _pool, utcnow

log = logging.getLogger("brandshield.validation")

MAX_AGE = timedelta(hours=24)


def _lookup_play(package_id: str) -> dict | None:
    """Store facts about a Play app, or None if the store says it does not exist."""
    try:
        d = play_app(package_id, lang="en", country="in")
    except NotFoundError:
        return None
    return {
        "publisher_id": str(d.get("developerId") or "") or None,
        "publisher": d.get("developer"),
        "store_title": d.get("title"),
        "icon_url": d.get("icon"),
        "note": "Confirmed on Google Play",
    }


def _lookup_app_store(track_id: str) -> dict | None:
    with httpx.Client(timeout=settings.source_timeout_s, verify=tls_context()) as client:
        r = client.get("https://itunes.apple.com/lookup", params={"id": track_id.removeprefix("id"), "country": "in"})
        r.raise_for_status()
        results = r.json().get("results", [])
    if not results:
        return None
    it = results[0]
    return {
        "publisher_id": str(it.get("artistId") or "") or None,
        "publisher": it.get("sellerName") or it.get("artistName"),
        "store_title": it.get("trackName"),
        "icon_url": it.get("artworkUrl512") or it.get("artworkUrl100"),
        "note": "Confirmed on the App Store",
    }


LOOKUPS = {"google_play": _lookup_play, "app_store": _lookup_app_store}


def validate_brand_assets(db: Session, brand: Brand, force: bool = False) -> dict:
    """Validate official apps. Skips assets verified in the last 24 h unless forced."""
    summary = {"verified": 0, "not_found": 0, "unavailable": 0, "skipped": 0}
    if not settings.validate_assets:
        return {**summary, "disabled": True}
    now = utcnow()
    for a in brand.assets:
        lookup = LOOKUPS.get(a.platform)
        if a.kind != "app" or lookup is None:
            continue
        if not force and a.validated_at and now - a.validated_at < MAX_AGE and a.validation_status == "verified":
            summary["skipped"] += 1
            continue
        try:
            facts = _pool.submit(lookup, a.handle).result(timeout=max(20.0, settings.source_timeout_s))
        except Exception as e:  # network, firewall, rate limit: keep previous values, say so
            if a.validation_status != "verified":
                a.validation_status = "unavailable"
            a.validation_note = f"Store unreachable ({type(e).__name__}); using last known details"
            summary["unavailable"] += 1
            log.info("validation of %s %s failed: %s", a.platform, a.handle, e)
            continue
        a.validated_at = now
        if facts is None:
            a.validation_status, a.validation_note = "not_found", "Not found on the store"
            summary["not_found"] += 1
            continue
        a.publisher_id = facts["publisher_id"] or a.publisher_id
        a.publisher = facts["publisher"] or a.publisher
        a.store_title = facts["store_title"] or a.store_title
        a.icon_url = facts["icon_url"] or a.icon_url
        a.validation_status, a.validation_note = "verified", facts["note"]
        summary["verified"] += 1

    # No logo uploaded: use the verified official app icon as the brand's reference image.
    if not brand.logo_path:
        icon = next((a.icon_url for a in brand.assets if a.kind == "app" and a.icon_url and a.validation_status == "verified"), None)
        if icon:
            from ..detection.images import load_image

            img = load_image(icon)
            if img is not None:
                path = settings.media_dir / "brand" / f"{brand.id}.png"
                path.parent.mkdir(parents=True, exist_ok=True)
                img.save(path)
                brand.logo_path = f"/media/brand/{brand.id}.png"
    db.commit()
    return summary
