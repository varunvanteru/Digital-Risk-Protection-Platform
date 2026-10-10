"""
Scan orchestration.

For each enabled source: fetch with a timeout and retries, Gate 1 (allowlist
by ID, official developer ID), evaluate signals, keep relevant candidates,
Gate 2 (re-check the allowlist from the database), then upsert detections.
A failing source is recorded and skipped; the scan always finishes.
"""

from __future__ import annotations

import logging
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..connectors.base import Candidate, SourceUnavailable
from ..connectors.datasets import SocialDataset, StoreDataset
from ..connectors.stores import AppStoreLive, GooglePlayLive
from ..db import SessionLocal
from ..detection.images import _cached, official_logo_ref
from ..detection.lookalike import name_similarity
from ..detection.scoring import score_detection
from ..detection.signals import BrandContext, evaluate, is_relevant
from ..models import Brand, Detection, OfficialAsset, Scan, Source

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
    "src_reddit": SocialDataset("src_reddit", "reddit"),
    "src_quora": SocialDataset("src_quora", "quora"),
    "src_discord": SocialDataset("src_discord", "discord"),
}

_scan_lock = threading.Lock()
_pool = ThreadPoolExecutor(max_workers=24, thread_name_prefix="source")


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def brand_context(db: Session, brand: Brand) -> BrandContext:
    assets = db.scalars(select(OfficialAsset).where(OfficialAsset.brand_id == brand.id)).all()
    pub_ids = {p.publisher_id for p in brand.publishers if p.publisher_id}
    pub_ids |= {a.publisher_id for a in assets if a.publisher_id}
    return BrandContext(
        brand_id=brand.id,
        name=brand.name,
        aliases=list(dict.fromkeys([brand.name, *brand.aliases])),
        domains=[d.lower() for d in brand.domains],
        description=brand.description,
        logo_ref=official_logo_ref(brand.logo_path),
        publisher_ids=pub_ids,
        publisher_names={p.name.lower() for p in brand.publishers},
        allowlist={(a.platform, a.identifier) for a in assets},
    )


def _fetch_with_retries(source: Source, keywords: list[str]) -> tuple[list[Candidate], int, int]:
    """Returns candidates, latency in ms and how many retries were needed."""
    connector = CONNECTORS[source.id]
    last_error: Exception | None = None
    for attempt in range(settings.source_retries + 1):
        if source.simulate_outage:
            raise SourceUnavailable("Simulated outage")
        start = time.perf_counter()
        future = _pool.submit(connector.fetch, keywords)
        try:
            items = future.result(timeout=settings.source_timeout_s)
            return items, round((time.perf_counter() - start) * 1000), attempt
        except FutureTimeout:
            last_error = SourceUnavailable(f"Timed out after {settings.source_timeout_s:.0f} s")
        except Exception as e:
            last_error = e
        time.sleep(0.5 * (attempt + 1))
    raise SourceUnavailable(str(last_error) if last_error else "Unknown error")


def _prefetch_images(cands: list[Candidate]) -> None:
    """Download remote icons in parallel so scoring is not bound by sequential HTTP."""
    remote = [c.image for c in cands if c.image and c.image.startswith("http")]
    if remote:
        list(_pool.map(_cached, remote))


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
    ctx = brand_context(db, brand)
    keywords = list(dict.fromkeys([*(brand.keywords or []), brand.name]))
    today = utcnow().date()
    status: dict[str, dict] = {}
    possibly_official: list[dict] = []
    totals = {"candidates": 0, "skipped": 0, "new": 0}

    for source in db.scalars(select(Source).order_by(Source.id)).all():
        if source.id not in CONNECTORS:
            continue
        try:
            items, latency, retries = _fetch_with_retries(source, keywords)
        except SourceUnavailable as e:
            source.health = "unavailable"
            source.note = f"{e}. Showing the last good results."
            source.latency_ms = None
            status[source.id] = {"ok": False, "error": str(e)}
            db.commit()
            continue

        source.health = "degraded" if retries else "operational"
        source.note = f"Succeeded after {retries} retr{'y' if retries == 1 else 'ies'}" if retries else None
        source.latency_ms = latency
        source.last_success = utcnow()
        source.items_last_scan = len(items)
        totals["candidates"] += len(items)

        connector = CONNECTORS[source.id]
        if hasattr(connector, "enrich"):
            # Live Play results: fetch detail (publisher ID, dates) only for plausible matches.
            for c in items:
                if name_similarity([c.display_name, c.handle], ctx.aliases)[0] >= 0.6:
                    connector.enrich(c)
        _prefetch_images(items)

        kept = 0
        for c in items:
            # Gate 1: allowlist by canonical ID, and apps from an official developer ID.
            if (c.platform, c.identifier) in ctx.allowlist:
                totals["skipped"] += 1
                continue
            if c.channel == "app" and c.publisher_id and c.publisher_id in ctx.publisher_ids:
                totals["skipped"] += 1
                possibly_official.append(
                    {"platform": c.platform, "name": c.display_name, "packageId": c.handle, "publisher": c.publisher, "publisherId": c.publisher_id}
                )
                continue

            ev = evaluate(c, ctx, today)
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
        status[source.id] = {"ok": True, "items": len(items), "kept": kept, "latencyMs": latency, "retries": retries}
        db.commit()

    allow = brand_context(db, brand).allowlist
    flagged = db.scalars(select(Detection).where(Detection.brand_id == brand.id)).all()
    scan.official_flagged = sum(1 for d in flagged if (d.platform, d.identifier) in allow and d.status != "official")
    scan.candidates = totals["candidates"]
    scan.official_skipped = totals["skipped"]
    scan.new_detections = totals["new"]
    scan.source_status = {"sources": status, "possiblyOfficial": possibly_official}


def _upsert(db: Session, brand_id: str, scan_id: str, c: Candidate, ev) -> bool:
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
