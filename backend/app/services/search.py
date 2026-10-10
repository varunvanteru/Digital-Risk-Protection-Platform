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
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..connectors.base import Candidate, SourceUnavailable
from ..detection.lookalike import analyse_name, name_similarity
from ..detection.signals import BrandContext, evaluate, is_relevant
from ..models import Brand, Detection, Source
from .scan import CONNECTORS, _fetch_with_retries, _prefetch_images, brand_context, utcnow

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

HOSTS = {
    "instagram.com": "instagram",
    "facebook.com": "facebook",
    "fb.com": "facebook",
    "whatsapp.com": "whatsapp",
    "x.com": "x",
    "twitter.com": "x",
    "threads.net": "threads",
    "threads.com": "threads",
    "linkedin.com": "linkedin",
    "t.me": "telegram",
    "telegram.me": "telegram",
    "snapchat.com": "snapchat",
    "youtube.com": "youtube",
    "sharechat.com": "sharechat",
    "mojapp.in": "moj",
    "myjosh.in": "josh",
    "share.myjosh.in": "josh",
    "pinterest.com": "pinterest",
    "in.pinterest.com": "pinterest",
    "reddit.com": "reddit",
    "quora.com": "quora",
    "discord.gg": "discord",
    "discord.com": "discord",
    "play.google.com": "google_play",
    "apps.apple.com": "app_store",
}

# Path words that come before the handle, e.g. linkedin.com/company/<h>, reddit.com/user/<h>
PATH_PREFIXES = {"company", "in", "add", "profile", "user", "u", "r", "c", "channel", "invite", "user-profile"}

@dataclass
class ParsedQuery:
    raw: str
    name: str  # what we search for
    platform: str | None  # platform of a pasted URL
    identifier: str | None  # handle / package id of a pasted URL


def parse_query(raw: str) -> ParsedQuery:
    s = raw.strip()
    looks_like_url = "://" in s or re.match(r"^(www\.)?[a-z0-9-]+\.[a-z]{2,}/", s, re.I)
    if looks_like_url:
        u = urlparse(s if "://" in s else "https://" + s)
        host = (u.hostname or "").lower().removeprefix("www.").removeprefix("m.")
        if host not in HOSTS and host.count(".") > 1:
            host = host.split(".", 1)[1]  # e.g. in.pinterest.com, mobile subdomains
        platform = HOSTS.get(host)
        if platform == "google_play":
            pkg = parse_qs(u.query).get("id", [""])[0]
            if pkg:
                # com.zentrapay.app -> "zentrapay": the most distinctive segment
                parts = [p for p in pkg.split(".") if p not in {"com", "in", "app", "android", "org", "net", "co"}]
                return ParsedQuery(s, parts[0] if parts else pkg, platform, pkg.lower())
        segments = [p for p in u.path.split("/") if p]
        if platform not in ("app_store", "google_play"):
            segments = [p for p in segments if p.lower() not in PATH_PREFIXES]
        if platform == "app_store":
            app_id = next((p for p in segments if re.fullmatch(r"id\d+", p)), None)
            name = next((p for p in segments if p not in {"app", app_id} and not re.fullmatch(r"[a-z]{2}", p)), app_id or s)
            return ParsedQuery(s, name.replace("-", " "), platform, app_id)
        if segments:
            handle = segments[0].removeprefix("@")
            return ParsedQuery(s, handle, platform, handle.lower())
    handle = s.removeprefix("@")
    return ParsedQuery(s, handle, None, None)


def _reference(db: Session, q: ParsedQuery) -> tuple[BrandContext, Brand | None]:
    """Compare against the registered brand when the query is that brand; otherwise against the query itself."""
    brand = db.scalar(select(Brand).order_by(Brand.updated_at.desc()).limit(1))
    if brand is not None:
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
    today = utcnow().date()
    keywords = list(dict.fromkeys([q.name, *ctx.aliases]))

    source_ids = list(dict.fromkeys(sid for p in wanted for sid in PLATFORM_SOURCES[p]))
    sources = {s.id: s for s in db.scalars(select(Source).where(Source.id.in_(source_ids))).all()}

    status: dict[str, dict] = {p: {"platform": p, "ok": False, "found": 0, "sources": []} for p in wanted}
    candidates: list[Candidate] = []

    # Own executor for the fan-out: each task waits on the shared pool, so sharing it could deadlock.
    outer = ThreadPoolExecutor(max_workers=max(1, len(source_ids)), thread_name_prefix="search")
    futures = {outer.submit(_fetch_with_retries, sources[sid], keywords): sid for sid in source_ids if sid in sources}
    for fut in as_completed(futures):
        sid = futures[fut]
        src = sources[sid]
        try:
            items, latency, _ = fut.result()
            ok, error = True, None
        except SourceUnavailable as e:
            items, latency, ok, error = [], None, False, str(e)
        for p in wanted:
            if sid in PLATFORM_SOURCES[p]:
                status[p]["sources"].append({"id": sid, "name": src.name, "mode": src.mode, "ok": ok, "error": error, "latencyMs": latency})
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
        if key in ctx.allowlist or (c.channel == "app" and c.publisher_id and c.publisher_id in ctx.publisher_ids):
            official.append({"platform": c.platform, "handle": c.handle, "displayName": c.display_name, "url": c.url})
            continue
        ev = evaluate(c, ctx, today)
        if not is_relevant(ev.signals):
            continue
        status[c.platform]["found"] += 1
        results.append(
            {
                "platform": c.platform,
                "channel": c.channel,
                "cls": ev.cls,
                "displayName": c.display_name,
                "handle": c.handle,
                "url": c.url,
                "mark": ev.mark,
                "iconUrl": c.image,
                "publisher": c.publisher,
                "audience": c.audience,
                "reasons": ev.reasons,
                "signals": ev.signals,
                "breakdown": ev.breakdown.to_dict(),
                "detectionId": tracked.get(key),
            }
        )

    results.sort(key=lambda r: r["breakdown"]["score"], reverse=True)
    return {
        "query": raw,
        "searchedFor": q.name,
        "pastedUrl": {"platform": q.platform, "identifier": q.identifier} if q.platform else None,
        "reference": {"type": "brand", "name": brand.name} if brand else {"type": "query", "name": ctx.name},
        "platforms": [status[p] for p in wanted],
        "results": results,
        "officialSkipped": official,
        "nameAnalysis": analyse_name(q.name, ctx.aliases).to_dict(),
    }
