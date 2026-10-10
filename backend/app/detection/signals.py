"""
Assess one candidate against a brand: official verification first, then risk.

    candidate -> verify_official()  -> OFFICIAL / LIKELY_OFFICIAL  (stop: never scored)
              -> signals + scoring  -> SUSPICIOUS / LOOKALIKE / MENTION
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from ..connectors.base import Candidate
from .images import ImageMatch, compare
from .lookalike import name_similarity
from .official import OfficialMatch, normalize_publisher, verify_official
from .scoring import Breakdown, score_detection
from .text import (
    APP_DESCRIPTION_CLAIMS,
    credential_ask,
    OFF_PLATFORM,
    app_risk_signal,
    behaviour_signal,
    claims_signal,
    context_label,
    domain_of,
    is_lookalike_domain,
    text_similarity,
)

PAGE_PLATFORMS = ("facebook", "telegram", "whatsapp", "linkedin", "youtube", "pinterest", "discord", "quora")


@dataclass
class BrandContext:
    brand_id: str
    name: str
    aliases: list[str]
    domains: list[str]
    description: str
    logo_ref: str | None
    publisher_ids: set[str]  # developer IDs not tied to one store
    publisher_names: set[str]  # normalised (official.normalize_publisher)
    allowlist: set[tuple[str, str]]  # (platform, identifier)
    publisher_ids_by_platform: dict[str, set[str]] = field(default_factory=dict)
    official_namespaces: set[str] = field(default_factory=set)
    official_icons: list[str] = field(default_factory=list)

    @property
    def cores(self) -> list[str]:
        return [re.sub(r"[^a-z0-9]", "", a.lower()) for a in self.aliases]

    def publisher_ids_for(self, platform: str) -> set[str]:
        return self.publisher_ids_by_platform.get(platform, set()) | self.publisher_ids

    def has_publisher_info(self, platform: str) -> bool:
        return bool(self.publisher_ids_for(platform) or self.publisher_names)


@dataclass
class Evaluation:
    status: str  # OFFICIAL | LIKELY_OFFICIAL | SUSPICIOUS | LOOKALIKE | MENTION
    signals: dict[str, float]
    reasons: list[str]
    lookalike_domain: bool
    context_label: str | None
    mark: str
    cls: str
    breakdown: Breakdown | None  # None for official assets: they are never scored
    official: OfficialMatch | None = None
    checks: dict = field(default_factory=dict)
    name_detail: dict = field(default_factory=dict)

    @property
    def excluded(self) -> bool:
        return self.official is not None


def is_relevant(sig: dict[str, float]) -> bool:
    """Drop search noise: keep only candidates that resemble the brand somehow."""
    return sig.get("name", 0) >= 0.6 or sig.get("logo", 0) >= 0.6 or sig.get("text", 0) >= 0.5


def status_for(severity: str) -> str:
    return {"critical": "SUSPICIOUS", "high": "SUSPICIOUS", "medium": "LOOKALIKE"}.get(severity, "MENTION")


def _pct(x: float) -> int:
    return round(x * 100)


def _name_reason(r, label: str) -> str | None:
    if r.score < 0.6:
        return None
    if r.method.startswith("Brand look-alike"):
        return f"{label} “{r.input}” contains a look-alike of the brand name"
    if r.method.startswith("Exact"):
        if not r.variations:
            return f"{label} is exactly “{r.input}”"
        return f"{label} “{r.input}” normalises to “{r.core}” ({', '.join(v.lower() for v in r.variations)})"
    if r.method.startswith("Character swap"):
        return f"{label} “{r.input}” swaps two letters of “{r.alias}”"
    if r.method.startswith("One letter"):
        return f"{label} “{r.input}” is one letter away from “{r.alias}”"
    if r.method.startswith("Contains"):
        return f"{label} “{r.input}” contains “{r.alias}” with unrelated words"
    return f"{label} “{r.input}” closely resembles “{r.alias}”"


def _best_icon_match(c: Candidate, ctx: BrandContext) -> ImageMatch | None:
    """Compare with the brand logo and with the icons of its validated official apps."""
    refs = [r for r in [ctx.logo_ref, *ctx.official_icons] if r]
    best: ImageMatch | None = None
    for ref in dict.fromkeys(refs):
        m = compare(ref, c.image)
        if m and (best is None or m.score > best.score):
            best = m
    return best


def evaluate(c: Candidate, ctx: BrandContext, today: date) -> Evaluation:
    is_app = c.channel == "app"
    mark = c.mark

    # Identity inputs needed by verification (cheap, and reused by scoring)
    name_score, nres = name_similarity([c.display_name, c.handle], ctx.aliases)
    icon = _best_icon_match(c, ctx)
    icon_score = icon.score if icon else 0.0

    # ---- 1. Official-asset verification. Official candidates stop here. ----
    scam_text = f"{c.display_name} {c.bio}"
    scam_indicators = bool(credential_ask(scam_text) or APP_DESCRIPTION_CLAIMS.search(scam_text))
    official = verify_official(c, ctx, name_score=name_score, icon_score=icon_score, scam_indicators=scam_indicators)
    if official is not None:
        return Evaluation(
            status=official.status,
            signals={"name": round(name_score, 3), "logo": round(icon_score, 3)},
            reasons=official.evidence,
            lookalike_domain=False,
            context_label=None,
            mark="official",
            cls="official",
            breakdown=None,
            official=official,
            checks={"officialIdMatch": official.level <= 2, "officialDeveloperMatch": official.level == 3,
                    "publisherMatch": True if official.level >= 3 else None,
                    "nameSimilarity": round(name_score, 2), "iconSimilarity": round(icon_score, 2)},
            name_detail=nres.to_dict(),
        )

    # ---- 2. Risk signals (only for candidates that are not official) ----
    reasons: list[str] = []
    sig: dict[str, float] = {"name": name_score}
    if reason := _name_reason(nres, "Title" if is_app else "Name"):
        reasons.append(reason)

    sig["logo"] = icon_score
    what = "Icon" if is_app else "Profile picture"
    if icon and icon.score >= 0.5:
        if icon.kind == "mirror":
            reasons.append(f"{what} is a mirrored copy of the official logo ({_pct(icon.score)}% similar)")
        elif icon.kind == "recolor":
            reasons.append(f"{what} is the official logo with the colour changed ({_pct(icon.score)}% similar)")
        else:
            reasons.append(f"{what} is {_pct(icon.score)}% similar to the official logo")
        if mark == "unrelated" and icon.kind in ("copy", "mirror", "recolor"):
            mark = icon.kind

    publisher_match: bool | None = None
    copied_identity = False
    if is_app:
        ids = ctx.publisher_ids_for(c.platform)
        name_ok = bool(c.publisher) and normalize_publisher(c.publisher) in ctx.publisher_names
        if not ctx.has_publisher_info(c.platform) or not (c.publisher or c.publisher_id):
            # Unknown is not a mismatch: no official publisher on record to compare with.
            sig["publisher"] = 0.0
        elif ids and c.publisher_id and c.publisher_id not in ids:
            sig["publisher"] = 1.0
            publisher_match = False
            if name_ok:
                copied_identity = True
                reasons.append(
                    f"Uses the official publisher name “{c.publisher}” under a different developer account ({c.publisher_id})"
                )
            elif sig["name"] >= 0.6 or sig["logo"] >= 0.6:
                reasons.append(f"Publisher “{c.publisher}” is not an official publisher")
        elif name_ok:
            sig["publisher"] = 0.0
            publisher_match = True
        else:
            sig["publisher"] = 1.0
            publisher_match = False
            if sig["name"] >= 0.6 or sig["logo"] >= 0.6:
                reasons.append(f"Publisher “{c.publisher}” is not an official publisher")

    sig["text"] = text_similarity(c.bio, ctx.description) if ctx.description else 0.0
    if sig["text"] >= 0.5:
        reasons.append(f"{'Description' if is_app else 'Bio'} is {_pct(sig['text'])}% similar to the official description")

    sig["claims"], hits = claims_signal(c.display_name, c.bio, c.verified, scope="app" if is_app else "profile")
    if copied_identity:
        # The official company name under someone else's developer account is a direct claim to be the brand.
        sig["claims"] = 1.0
        hits = [*hits, "official publisher name"]
    if sig["claims"] >= 0.5:
        reasons.append(f"Presents itself as an official channel ({', '.join(hits)}) but is not on the allowlist")

    lookalike = False
    if is_app:
        sig["behaviour"], extra = app_risk_signal(
            c.display_name, c.bio, c.created_on, c.audience, c.privacy_url, c.platform == "apk_site", today
        )
        if ctx.domains:  # a look-alike needs a known original
            lookalike = any(is_lookalike_domain(domain_of(link), ctx.domains, ctx.cores) for link in c.links)
            if lookalike:
                extra.append("Links to a look-alike of an official domain")
    else:
        sig["behaviour"], extra, lookalike = behaviour_signal(
            c.bio, c.links, c.created_on, c.audience, today, ctx.domains, ctx.cores
        )
    reasons.extend(extra)

    # Fan / news / review labels: profile bios, but only app titles (store descriptions mention "reviews").
    label = context_label(c.display_name if is_app else c.bio)
    if label and not reasons:
        reasons.append(f"Mentions the brand but is labelled as {label}")
    elif label:
        reasons.append(f"Openly labelled as {label}, so it is not treated as impersonation")

    sig = {k: round(v, 3) for k, v in sig.items()}
    bd = score_detection(c.channel, sig, lookalike, label)

    if bd.severity == "low":
        cls = "low_risk"
    elif is_app:
        cls = "lookalike_app"
    elif sig["behaviour"] >= 0.6:
        cls = "scam"
    elif c.platform in PAGE_PLATFORMS:
        cls = "fake_page"
    else:
        cls = "impersonation"

    contact_text = f"{c.bio} {' '.join(c.links)}".lower()
    checks = {
        "officialIdMatch": False,
        "officialDeveloperMatch": False,
        "publisherMatch": publisher_match,
        "nameSimilarity": round(sig["name"], 2),
        "iconSimilarity": round(sig["logo"], 2),
        "descriptionSimilarity": round(sig["text"], 2),
        "suspiciousKeywords": hits,
        "contactMismatch": bool(re.search(OFF_PLATFORM, contact_text)) or lookalike,
    }

    return Evaluation(
        status=status_for(bd.severity),
        signals=sig,
        reasons=reasons or ["Resembles the brand on one weak signal only"],
        lookalike_domain=lookalike,
        context_label=label,
        mark=mark,
        cls=cls,
        breakdown=bd,
        checks=checks,
        name_detail=nres.to_dict(),
    )
