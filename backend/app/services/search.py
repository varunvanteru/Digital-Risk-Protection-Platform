"""
On-demand search (Quick check).

The analyst names a brand, or pastes an official profile / app URL, and picks
platforms. Each selected source is searched in parallel with the same timeout,
retry, allowlist and scoring rules as a full scan. Results are returned, not
stored; any that are already tracked carry their detection id.
"""

from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..connectors.base import Candidate, SourceUnavailable
from ..detection.lookalike import analyse_name, name_similarity
from ..detection.signals import BrandContext, evaluate, is_relevant
from ..models import Brand, Detection, Source
from .scan import CONNECTORS, _fetch_with_retries, _prefetch_images, brand_context, official_entry, source_state, utcnow
from .urls import ParsedQuery, parse_query  # noqa: F401  (parse_query re-exported for callers and tests)

SOCIAL_SOURCES = {
    "instagram": "src_ig",
    "facebook": "src_fb",
    "whatsapp": "src_wa",
    "x": "src_x",
    "threads": "src_threads",
    "linkedin": "src_li",
    "telegram": "src_tg",
    "snapchat": "src_snap",
    "youtube": "src_yt",
    "sharechat": "src_sc",
    "moj": "src_moj",
    "josh": "src_josh",
    "pinterest": "src_pin",
    "reddit": "src_reddit",
    "quora": "src_quora",
    "discord": "src_discord",
}

# Which sources answer for which platform. The demo store snapshot holds both Play and App Store items.
PLATFORM_SOURCES = {
    **{p: [sid] for p, sid in SOCIAL_SOURCES.items()},
    "google_play": ["src_play", "src_store_demo"],
    "app_store": ["src_appstore", "src_store_demo"],
    "apk_site": ["src_apk"],
}
PLATFORMS = list(PLATFORM_SOURCES)

def _reference(db: Session, q: ParsedQuery) -> tuple[BrandContext, Brand | None]:
    """
    Compare against the registered brand the query refers to (any brand, active first);
    otherwise against the typed name alone, with nothing known to be official.
    """
    brands = db.scalars(select(Brand).order_by(Brand.is_active.desc(), Brand.updated_at.desc())).all()
    for brand in brands:
        ctx = brand_context(db, brand)
        is_official_url = q.platform is not None and (q.platform, q.identifier) in ctx.allowlist
        if is_official_url or name_similarity([q.name], ctx.aliases)[0] >= 0.85:
            return ctx, brand
    allow = {(q.platform, q.identifier)} if q.platform and q.identifier else set()
    words = re.sub(r"[_.\-]+", " ", q.name).strip()
    return (
        BrandContext(
            brand_id="adhoc",
            name=words,
            aliases=list(dict.fromkeys([words, q.name])),
            domains=[],
            description="",
            logo_ref=None,
            publisher_ids=set(),
            publisher_names=set(),
            allowlist=allow,
        ),
        None,
    )


def run_search(db: Session, raw: str, platforms: list[str]) -> dict:
    q = parse_query(raw)
    wanted = PLATFORMS if not platforms or "all" in platforms else [p for p in PLATFORMS if p in platforms]
    ctx, brand = _reference(db, q)
    if brand is not None:
        # Make sure official apps are validated (cached for 24 h) before judging candidates.
        from .validation import validate_brand_assets

        validate_brand_assets(db, brand)
        ctx = brand_context(db, brand)
    today = utcnow().date()
    keywords = list(dict.fromkeys([q.name, *ctx.aliases]))

    source_ids = list(dict.fromkeys(sid for p in wanted for sid in PLATFORM_SOURCES[p]))
    sources = {s.id: s for s in db.scalars(select(Source).where(Source.id.in_(source_ids))).all()}

    status: dict[str, dict] = {p: {"platform": p, "ok": False, "found": 0, "official": 0, "sources": []} for p in wanted}
    candidates: list[Candidate] = []

    # Own executor for the fan-out: each task waits on the shared pool, so sharing it could deadlock.
    outer = ThreadPoolExecutor(max_workers=max(1, len(source_ids)), thread_name_prefix="search")
    futures = {outer.submit(_fetch_with_retries, sources[sid], keywords): sid for sid in source_ids if sid in sources}
    for fut in as_completed(futures):
        sid = futures[fut]
        src = sources[sid]
        cached_at = None
        try:
            items, latency, _, cached_at = fut.result()
            ok, error = True, None
        except SourceUnavailable as e:
            items, latency, ok, error = [], None, False, str(e)
        state = source_state(src, ok, cached_at)
        for p in wanted:
            if sid in PLATFORM_SOURCES[p]:
                status[p]["sources"].append({
                    "id": sid, "name": src.name, "mode": src.mode, "state": state, "ok": ok, "error": error,
                    "latencyMs": latency, "cachedAt": cached_at.isoformat() + "Z" if cached_at else None,
                })
        candidates.extend(c for c in items if c.platform in wanted)

    outer.shutdown(wait=False)
    for p in wanted:
        status[p]["ok"] = any(s["ok"] for s in status[p]["sources"])

    play = CONNECTORS["src_play"]
    for c in candidates:
        if c.source_id == "src_play" and name_similarity([c.display_name, c.handle], ctx.aliases)[0] >= 0.6:
            play.enrich(c)
    _prefetch_images(candidates)

    tracked = {
        (d.platform, d.identifier): d.id
        for d in db.scalars(select(Detection).where(Detection.brand_id == (brand.id if brand else ""))).all()
    }

    results, official = [], []
    seen: set[tuple[str, str]] = set()
    for c in candidates:
        key = (c.platform, c.identifier)
        if key in seen:
            continue
        seen.add(key)
        ev = evaluate(c, ctx, today)
        # Official assets were verified before scoring and are reported separately, with zero risk.
        if ev.excluded:
            status[c.platform]["official"] += 1
            official.append(official_entry(c, ev))
            continue
        if not is_relevant(ev.signals):
            continue
        status[c.platform]["found"] += 1
        results.append(
            {
                "status": ev.status,
                "riskScore": ev.breakdown.score,
                "excluded": False,
                "platform": c.platform,
                "channel": c.channel,
                "cls": ev.cls,
                "displayName": c.display_name,
                "handle": c.handle,
                "url": c.url,
                "mark": ev.mark,
                "iconUrl": c.image,
                "publisher": c.publisher,
                "publisherId": c.publisher_id,
                "audience": c.audience,
                "reasons": ev.reasons,
                "signals": ev.signals,
                "checks": ev.checks,
                "breakdown": ev.breakdown.to_dict(),
                "detectionId": tracked.get(key),
            }
        )

    results.sort(key=lambda r: r["breakdown"]["score"], reverse=True)
    official.sort(key=lambda o: (o["level"], o["platform"]))
    return {
        "query": raw,
        "searchedFor": q.name,
        "pastedUrl": {"platform": q.platform, "identifier": q.identifier} if q.platform else None,
        "reference": {"type": "brand", "name": brand.name, "id": brand.id} if brand else {"type": "query", "name": ctx.name},
        "platforms": [status[p] for p in wanted],
        "results": results,
        "official": official,
        # Kept for older clients: same entries, short form.
        "officialSkipped": [{"platform": o["platform"], "handle": o["handle"], "displayName": o["displayName"], "url": o["url"]} for o in official],
        "nameAnalysis": analyse_name(q.name, ctx.aliases).to_dict(),
    }