"""Database rows to the JSON shapes the frontend uses (camelCase, ISO dates in UTC)."""

from __future__ import annotations

from datetime import date, datetime

from .detection.scoring import score_detection
from .models import Brand, Detection, OfficialAsset, Scan, Source


def iso(dt: datetime | date | None) -> str | None:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.replace(microsecond=0).isoformat() + "Z"
    return dt.isoformat()


def asset_out(a: OfficialAsset) -> dict:
    return {
        "id": a.id,
        "platform": a.platform,
        "handle": a.handle,
        "canonicalId": a.canonical_id,
        "displayName": a.display_name,
        "status": a.status,
        "verified": a.verified,
    }


def app_out(a: OfficialAsset) -> dict:
    return {
        "id": a.id,
        "platform": a.platform,
        "name": a.display_name,
        "packageId": a.handle,
        "publisher": a.publisher or "",
        "publisherId": a.publisher_id or "",
    }


def brand_out(b: Brand) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "aliases": [b.name, *[a for a in b.aliases if a != b.name]],
        "keywords": b.keywords,
        "domains": b.domains,
        "description": b.description,
        "logoUrl": b.logo_path,
        "publishers": [{"name": p.name, "id": p.publisher_id} for p in b.publishers],
        "accounts": [asset_out(a) for a in b.assets if a.kind == "social"],
        "apps": [app_out(a) for a in b.assets if a.kind == "app"],
        "updatedAt": iso(b.updated_at),
    }


def detection_out(d: Detection) -> dict:
    bd = score_detection(d.channel, d.signals or {}, d.lookalike_domain, d.context_label, d.feedback_penalty)
    return {
        "id": d.id,
        "sourceId": d.source_id,
        "channel": d.channel,
        "platform": d.platform,
        "cls": d.cls,
        "displayName": d.display_name,
        "handle": d.handle,
        "url": d.url,
        "mark": d.mark,
        "iconUrl": d.icon_url,
        "bio": d.bio,
        "audience": d.audience,
        "createdAt": iso(d.created_on),
        "publisher": d.publisher,
        "publisherId": d.publisher_id,
        "links": d.links or [],
        "firstSeen": iso(d.first_seen),
        "lastSeen": iso(d.last_seen),
        "scanId": d.scan_id,
        "signals": d.signals or {},
        "reasons": d.reasons or [],
        "lookalikeDomain": d.lookalike_domain,
        "contextLabel": d.context_label,
        "status": d.status,
        "breakdown": bd.to_dict(),
    }


def source_out(s: Source) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "platform": s.platform,
        "channel": s.channel,
        "mode": s.mode,
        "health": s.health,
        "lastSuccess": iso(s.last_success),
        "latencyMs": s.latency_ms,
        "itemsLastScan": s.items_last_scan,
        "note": s.note,
        "simulateOutage": s.simulate_outage,
    }


def scan_out(s: Scan | None) -> dict | None:
    if s is None:
        return None
    return {
        "id": s.id,
        "status": s.status,
        "startedAt": iso(s.started_at),
        "finishedAt": iso(s.finished_at),
        "candidates": s.candidates,
        "officialSkipped": s.official_skipped,
        "officialFlagged": s.official_flagged,
        "newDetections": s.new_detections,
        "sources": (s.source_status or {}).get("sources", {}),
        "possiblyOfficial": (s.source_status or {}).get("possiblyOfficial", []),
    }
