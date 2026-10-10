"""Turn a raw candidate into signal values (0..1) and plain-English reasons."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from ..connectors.base import Candidate
from .images import compare
from .lookalike import name_similarity
from .scoring import Breakdown, score_detection
from .text import app_risk_signal, behaviour_signal, claims_signal, context_label, domain_of, is_lookalike_domain, text_similarity


@dataclass
class BrandContext:
    brand_id: str
    name: str
    aliases: list[str]
    domains: list[str]
    description: str
    logo_ref: str | None
    publisher_ids: set[str]
    publisher_names: set[str]
    allowlist: set[tuple[str, str]]  # (platform, identifier)

    @property
    def cores(self) -> list[str]:
        return [re.sub(r"[^a-z0-9]", "", a.lower()) for a in self.aliases]


@dataclass
class Evaluation:
    signals: dict[str, float]
    reasons: list[str]
    lookalike_domain: bool
    context_label: str | None
    mark: str
    cls: str
    breakdown: Breakdown
    name_detail: dict = field(default_factory=dict)


def is_relevant(sig: dict[str, float]) -> bool:
    """Drop search noise: keep only candidates that resemble the brand somehow."""
    return sig.get("name", 0) >= 0.6 or sig.get("logo", 0) >= 0.6 or sig.get("text", 0) >= 0.5


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


def evaluate(c: Candidate, ctx: BrandContext, today: date) -> Evaluation:
    is_app = c.channel == "app"
    reasons: list[str] = []
    sig: dict[str, float] = {}

    # Name
    names = [c.display_name, c.handle]
    sig["name"], nres = name_similarity(names, ctx.aliases)
    if reason := _name_reason(nres, "Title" if is_app else "Name"):
        reasons.append(reason)

    # Logo / icon
    mark = c.mark
    m = compare(ctx.logo_ref, c.image) if ctx.logo_ref else None
    sig["logo"] = m.score if m else 0.0
    what = "Icon" if is_app else "Profile picture"
    if m and m.score >= 0.5:
        if m.kind == "mirror":
            reasons.append(f"{what} is a mirrored copy of the official logo ({_pct(m.score)}% similar)")
        elif m.kind == "recolor":
            reasons.append(f"{what} is the official logo with the colour changed ({_pct(m.score)}% similar)")
        else:
            reasons.append(f"{what} is {_pct(m.score)}% similar to the official logo")
        if mark == "unrelated" and m.kind in ("copy", "mirror", "recolor"):
            mark = m.kind

    # Publisher (apps only)
    if is_app:
        official_id = bool(c.publisher_id) and c.publisher_id in ctx.publisher_ids
        sig["publisher"] = 0.0 if official_id else 1.0
        if not official_id and c.publisher:
            if c.publisher.lower() in ctx.publisher_names:
                reasons.append(f"Uses the official publisher name “{c.publisher}” under a different developer ID")
            elif sig["name"] >= 0.6 or sig["logo"] >= 0.6:
                reasons.append(f"Publisher “{c.publisher}” is not an official publisher")

    # Description / bio
    sig["text"] = text_similarity(c.bio, ctx.description)
    if sig["text"] >= 0.5:
        reasons.append(f"{'Description' if is_app else 'Bio'} is {_pct(sig['text'])}% similar to the official description")

    # Impersonation claims
    sig["claims"], hits = claims_signal(c.display_name, c.bio, c.verified)
    if sig["claims"] >= 0.5:
        reasons.append(f"Presents itself as an official channel ({', '.join(hits)}) but is not on the allowlist")

    # Behaviour / risk context
    lookalike = False
    if is_app:
        sig["behaviour"], extra = app_risk_signal(
            c.display_name, c.bio, c.created_on, c.audience, c.privacy_url, c.platform == "apk_site", today
        )
        lookalike = any(is_lookalike_domain(domain_of(l), ctx.domains, ctx.cores) for l in c.links)
    else:
        sig["behaviour"], extra, lookalike = behaviour_signal(
            c.bio, c.links, c.created_on, c.audience, today, ctx.domains, ctx.cores
        )
    reasons.extend(extra)

    label = context_label(c.bio)
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
    elif c.platform in ("facebook", "telegram"):
        cls = "fake_page"
    else:
        cls = "impersonation"

    return Evaluation(
        signals=sig,
        reasons=reasons or ["Resembles the brand on one weak signal only"],
        lookalike_domain=lookalike,
        context_label=label,
        mark=mark,
        cls=cls,
        breakdown=bd,
        name_detail=nres.to_dict(),
    )
