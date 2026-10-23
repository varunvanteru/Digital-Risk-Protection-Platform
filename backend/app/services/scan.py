"""
Scan orchestration. Allowlist-first:

  1. validate the brand's official apps against their stores (cached 24 h)
  2. build the allowlist and verified identities (IDs, developer accounts, publishers)
  3. collect candidates from every source (live stores fall back to cache, labelled)
  4. official-asset verification: OFFICIAL / LIKELY_OFFICIAL candidates stop here
  5. risk signals and scoring for everything else
  6. Gate 2: re-check the allowlist in the database, then upsert detections

A failing source is recorded and skipped; the scan always finishes.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import asdict
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..connectors.base import Candidate, SourceUnavailable
from ..connectors.datasets import SocialDataset, StoreDataset
from ..connectors.stores import AppStoreLive, GooglePlayLive
from ..db import SessionLocal
from ..detection.images import _cached, official_logo_ref
from ..detection.lookalike import name_similarity
from ..detection.official import normalize_publisher, normalize_title, package_namespace
from ..detection.scoring import score_detection
from ..detection.signals import BrandContext, Evaluation, evaluate, is_relevant
from ..models import Brand, Detection, DetectionEvent, OfficialAsset, Scan, Source, SourceCache

log = logging.getLogger("brandshield.scan")

CONNECTORS = {
    "src_play": GooglePlayLive(),
    "src_appstore": AppStoreLive(),
    "src_store_demo": StoreDataset("src_store_demo", "store_snapshot.json"),
    "src_apk": StoreDataset("src_apk", "apk_sites.json"),
    "src_ig": SocialDataset("src_ig", "instagram"),
    "src_x": SocialDataset("src_x", "x"),
    "src_fb": SocialDataset("src_fb", "facebook"),
    "src_tg": SocialDataset("src_tg", "telegram"),
    "src_wa": SocialDataset("src_wa", "whatsapp"),
    "src_threads": SocialDataset("src_threads", "threads"),
    "src_li": SocialDataset("src_li", "linkedin"),
    "src_snap": SocialDataset("src_snap", "snapchat"),
    "src_yt": SocialDataset("src_yt", "youtube"),
    "src_sc": SocialDataset("src_sc", "sharechat"),
    "src_moj": SocialDataset("src_moj", "moj"),
    "src_josh": SocialDataset("src_josh", "josh"),
    "src_pin": SocialDataset("src_pin", "pinterest"),
    "src_quora": SocialDataset("src_quora", "quora"),
    "src_discord": SocialDataset("src_discord", "discord"),
}
LIVE_SOURCES = {"src_play", "src_appstore"}

_scan_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=24, thread_name_prefix="source")


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def brand_context(db: Session, brand: Brand) -> BrandContext:
    """Everything the engine knows about what is genuinely the brand's."""
    assets = db.scalars(select(OfficialAsset).where(OfficialAsset.brand_id == brand.id)).all()
    by_platform: dict[str, set[str]] = {}
    for a in assets:
        if a.kind == "app" and a.publisher_id:
            by_platform.setdefault(a.platform, set()).add(a.publisher_id)
    names: set[str] = set()
    for p in brand.publishers:
        names.add(normalize_publisher(p.name))
        names.update(normalize_publisher(x) for x in (p.aliases or []))
    if brand.legal_name:
        names.add(normalize_publisher(brand.legal_name))
    # Publisher names the stores report for the brand's own validated apps are trustworthy too.
    names.update(normalize_publisher(a.publisher) for a in assets if a.kind == "app" and a.publisher and a.validation_status == "verified")
    names.discard("")
    return BrandContext(
        brand_id=brand.id,
        name=brand.name,
        aliases=list(dict.fromkeys([brand.name, *brand.aliases])),
        domains=[d.lower() for d in brand.domains],
        description=brand.description,
        logo_ref=official_logo_ref(brand.logo_path),
        publisher_ids={p.publisher_id for p in brand.publishers if p.publisher_id},
        publisher_names=names,
        allowlist={(a.platform, a.identifier) for a in assets},
        publisher_ids_by_platform=by_platform,
        official_namespaces={ns for a in assets if a.platform == "google_play" and (ns := package_namespace(a.identifier))},
        official_icons=[a.icon_url for a in assets if a.kind == "app" and a.icon_url],
        official_titles={
            normalize_title(a.store_title)
            for a in assets
            if a.kind == "app" and a.store_title and a.validation_status == "verified"
        },
    )


# ---------- live-source cache ----------

def _cache_key(source_id: str, keywords: list[str]) -> str:
    return f"{source_id}|{'|'.join(sorted(k.lower() for k in keywords))}"[:255]


def _encode(c: Candidate) -> dict:
    d = asdict(c)
    for k in ("created_on", "first_seen"):
        if d[k] is not None:
            d[k] = d[k].isoformat()
    return d


def _decode(d: dict) -> Candidate:
    d = dict(d)
    if d.get("created_on"):
        d["created_on"] = date.fromisoformat(d["created_on"])
    if d.get("first_seen"):
        d["first_seen"] = datetime.fromisoformat(d["first_seen"])
    return Candidate(**d)


def _save_cache(source_id: str, keywords: list[str], items: list[Candidate]) -> None:
    with SessionLocal() as db:
        key = _cache_key(source_id, keywords)
        row = db.scalar(select(SourceCache).where(SourceCache.source_id == source_id, SourceCache.query_key == key))
        if row is None:
            row = SourceCache(source_id=source_id, query_key=key)
            db.add(row)
        row.fetched_at = utcnow()
        row.payload = [_encode(c) for c in items]
        db.commit()


def _load_cache(source_id: str, keywords: list[str]) -> tuple[list[Candidate], datetime] | None:
    with SessionLocal() as db:
        row = db.scalar(
            select(SourceCache).where(SourceCache.source_id == source_id, SourceCache.query_key == _cache_key(source_id, keywords))
        )
        if row is None:
            return None
        return [_decode(d) for d in row.payload], row.fetched_at


def _fetch_with_retries(source: Source, keywords: list[str]) -> tuple[list[Candidate], int | None, int, datetime | None]:
    """
    Returns candidates, latency in ms, retries needed, and cached_at (set only when
    a live source failed and its last good results were served from cache).
    """
    connector = CONNECTORS[source.id]
    last_error: Exception | None = None
    for attempt in range(settings.source_retries + 1):
        if source.simulate_outage:
            last_error = SourceUnavailable("Simulated outage")
            break
        start = time.perf_counter()
        future = _pool.submit(connector.fetch, keywords)
        try:
            items = future.result(timeout=getattr(connector, "timeout_s", settings.source_timeout_s))
            if source.id in LIVE_SOURCES:
                _save_cache(source.id, keywords, items)
            return items, round((time.perf_counter() - start) * 1000), attempt, None
        except FutureTimeout:
            last_error = SourceUnavailable(f"Timed out after {getattr(connector, 'timeout_s', settings.source_timeout_s):.0f} s")
        except Exception as e:
            last_error = e
        time.sleep(0.5 * (attempt + 1))

    if source.id in LIVE_SOURCES and not source.simulate_outage:
        cached = _load_cache(source.id, keywords)
        if cached:
            return cached[0], None, settings.source_retries, cached[1]
    raise SourceUnavailable(str(last_error) if last_error else "Unknown error")


def _prefetch_images(cands: list[Candidate]) -> None:
    """Download remote icons in parallel so scoring is not bound by sequential HTTP."""
    remote = [c.image for c in cands if c.image and c.image.startswith("http")]
    if remote:
        list(_pool.map(_cached, remote))


def source_state(source: Source, ok: bool, cached_at: datetime | None) -> str:
    if not ok:
        return "down"
    if cached_at is not None:
        return "cached"
    return "live" if source.mode == "live" else "simulated"


def official_entry(c: Candidate, ev: Evaluation) -> dict:
    o = ev.official
    return {
        "platform": c.platform,
        "channel": c.channel,
        "handle": c.handle,
        "displayName": c.display_name,
        "url": c.url,
        "iconUrl": c.image,
        "publisher": c.publisher,
        "publisherId": c.publisher_id,
        "status": o.status,
        "level": o.level,
        "confidence": o.confidence,
        "evidence": o.evidence,
        "inProfile": o.in_profile,
        "riskScore": 0,
        "excluded": True,
        "checks": ev.checks,
    }


# ---------- scan ----------

def run_scan(scan_id: str, brand_id: str) -> None:
    with _scan_lock, SessionLocal() as db:
        scan = db.get(Scan, scan_id)
        brand = db.get(Brand, brand_id)
        if scan is None or brand is None:
            return
        try:
            _run(db, scan, brand)
            scan.status = "done"
        except Exception:
            log.exception("scan %s failed", scan_id)
            scan.status = "failed"
        scan.finished_at = utcnow()
        db.commit()


def _run(db: Session, scan: Scan, brand: Brand) -> None:
    from .validation import validate_brand_assets

    validation = validate_brand_assets(db, brand)
    ctx = brand_context(db, brand)
    keywords = list(dict.fromkeys([*(brand.keywords or []), brand.name]))
    today = utcnow().date()
    status: dict[str, dict] = {}
    official_found: list[dict] = []
    totals = {"candidates": 0, "skipped": 0, "new": 0}

    for source in db.scalars(select(Source).order_by(Source.id)).all():
        if source.id not in CONNECTORS:
            continue
        try:
            items, latency, retries, cached_at = _fetch_with_retries(source, keywords)
        except SourceUnavailable as e:
            source.health, source.state = "unavailable", "down"
            source.note = f"{e}. Showing the last good results."
            source.latency_ms = None
            status[source.id] = {"ok": False, "state": "down", "error": str(e)}
            db.commit()
            continue

        source.state = source_state(source, True, cached_at)
        if cached_at is not None:
            source.health = "degraded"
            source.note = f"Live search failed; using cached results from {cached_at:%d %b %H:%M} UTC"
            source.latency_ms = None
        else:
            source.health = "degraded" if retries else "operational"
            source.note = f"Succeeded after {retries} retr{'y' if retries == 1 else 'ies'}" if retries else None
            source.latency_ms = latency
            source.last_success = utcnow()
        source.items_last_scan = len(items)
        totals["candidates"] += len(items)

        connector = CONNECTORS[source.id]
        if hasattr(connector, "enrich") and cached_at is None:
            # Live Play results: fetch detail (developer ID, dates) only for plausible matches.
            for c in items:
                if name_similarity([c.display_name, c.handle], ctx.aliases)[0] >= 0.6:
                    connector.enrich(c)
        _prefetch_images(items)

        kept = 0
        for c in items:
            ev = evaluate(c, ctx, today)

            # Official-asset exclusion: verified official candidates never reach scoring or storage as threats.
            if ev.excluded:
                totals["skipped"] += 1
                official_found.append(official_entry(c, ev))
                _retract_if_tracked(db, brand.id, c)
                continue
            if not is_relevant(ev.signals):
                continue

            # Gate 2: the profile may have changed during the scan.
            if db.scalar(
                select(OfficialAsset.id).where(
                    OfficialAsset.brand_id == brand.id,
                    OfficialAsset.platform == c.platform,
                    OfficialAsset.identifier == c.identifier,
                )
            ):
                totals["skipped"] += 1
                continue

            kept += 1
            if _upsert(db, brand.id, scan.id, c, ev):
                totals["new"] += 1
        status[source.id] = {
            "ok": True, "state": source.state, "items": len(items), "kept": kept, "latencyMs": latency,
            "retries": retries, "cachedAt": cached_at.isoformat() + "Z" if cached_at else None,
        }
        db.commit()

    allow = brand_context(db, brand).allowlist
    flagged = db.scalars(select(Detection).where(Detection.brand_id == brand.id)).all()
    scan.official_flagged = sum(1 for d in flagged if (d.platform, d.identifier) in allow and d.status != "official")
    scan.candidates = totals["candidates"]
    scan.official_skipped = totals["skipped"]
    scan.new_detections = totals["new"]
    unique_official = list({(o["platform"], o["handle"].lower()): o for o in official_found}.values())
    scan.source_status = {
        "sources": status,
        "officialFound": unique_official,
        # Verified official but not yet listed in the profile: offer to add them.
        "possiblyOfficial": [
            {"platform": o["platform"], "name": o["displayName"], "packageId": o["handle"], "publisher": o["publisher"],
             "publisherId": o["publisherId"], "status": o["status"], "evidence": o["evidence"]}
            for o in unique_official if not o["inProfile"] and o["channel"] == "app"
        ],
        "validation": validation,
    }


def _retract_if_tracked(db: Session, brand_id: str, c: Candidate) -> None:
    """A detection created before an asset was known to be official is closed, with an audit event."""
    d = db.scalar(
        select(Detection).where(Detection.brand_id == brand_id, Detection.platform == c.platform, Detection.identifier == c.identifier)
    )
    if d is not None and d.status != "official":
        db.add(DetectionEvent(detection_id=d.id, at=utcnow(), action="verified_official", from_status=d.status, to_status="official"))
        d.status = "official"


def _upsert(db: Session, brand_id: str, scan_id: str, c: Candidate, ev: Evaluation) -> bool:
    now = utcnow()
    d = db.scalar(
        select(Detection).where(
            Detection.brand_id == brand_id, Detection.platform == c.platform, Detection.identifier == c.identifier
        )
    )
    created = d is None
    if created:
        d = Detection(
            id=f"det_{uuid.uuid4().hex[:10]}",
            brand_id=brand_id,
            platform=c.platform,
            identifier=c.identifier,
            first_seen=c.first_seen or now,
            status=c.seed_status or "open",
            feedback_penalty=0.0,
        )
        db.add(d)

    bd = ev.breakdown
    assert bd is not None  # only non-official candidates are stored
    if d.feedback_penalty:
        bd = score_detection(c.channel, ev.signals, ev.lookalike_domain, ev.context_label, d.feedback_penalty)

    d.source_id = c.source_id
    d.channel = c.channel
    d.cls = ev.cls
    d.display_name = c.display_name[:200]
    d.handle = c.handle
    d.url = c.url[:500]
    d.mark = ev.mark
    d.icon_url = c.image
    d.bio = c.bio
    d.audience = c.audience
    d.created_on = c.created_on
    d.publisher = c.publisher
    d.publisher_id = c.publisher_id
    d.links = c.links
    d.last_seen = now
    d.scan_id = scan_id
    d.signals = ev.signals
    d.reasons = ev.reasons
    d.checks = ev.checks
    d.lookalike_domain = ev.lookalike_domain
    d.context_label = ev.context_label
    d.score = bd.score
    d.severity = bd.severity
    return created


def start_scan(db: Session, brand_id: str) -> Scan:
    scan = Scan(id=f"scn_{uuid.uuid4().hex[:8]}", brand_id=brand_id, status="running", started_at=utcnow(), source_status={})
    db.add(scan)
    db.commit()
    threading.Thread(target=run_scan, args=(scan.id, brand_id), daemon=True, name=f"scan-{scan.id}").start()
    return scan


def is_scanning() -> bool:
    return _scan_lock.locked()
