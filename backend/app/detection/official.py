"""
Official-asset verification. Runs BEFORE any risk signal is computed.

A candidate that is verified (or likely) official never reaches scoring. The
check is generic: it uses only the brand profile and what the stores report
about the brand's own validated apps. No brand names appear in this code.

Levels, strongest first:
  L1  exact official app ID / handle on the allowlist                 -> OFFICIAL
  L2  store / profile URL resolves to an allowlisted ID              -> OFFICIAL
  L3  published by a verified official developer account (store ID)  -> OFFICIAL
  L4  official publisher NAME (normalised) + supporting metadata,
      and no known developer ID on that store contradicts it          -> LIKELY_OFFICIAL

A publisher name that matches while the developer ID is known and different is
the opposite: a copied identity, handled as a fraud signal in signals.py.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field

# Legal-form words that do not identify a company. Meaningful words (Technologies,
# Bank, Payments) are kept, so "ZentraPay Technologies" != "ZentraPay".
LEGAL_SUFFIXES = {
    "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated", "corp", "corporation",
    "co", "company", "plc", "gmbh", "ag", "sa", "sas", "srl", "bv", "nv", "pte", "pty", "oy", "ab", "kk", "lp", "the",
}


def normalize_publisher(name: str | None) -> str:
    """'PhonePe Private Limited', 'PHONEPE PVT. LTD.' and 'PhonePe' all become 'phonepe'."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKC", name).lower().replace("&", " and ")
    s = re.sub(r"[^\w\s]", " ", s)
    tokens = [t for t in s.split() if t not in LEGAL_SUFFIXES]
    return " ".join(tokens)


def package_namespace(package_id: str | None) -> str | None:
    """com.phonepe.app.business -> com.phonepe; in.co.example.app -> in.co.example."""
    if not package_id or "." not in package_id:
        return None
    parts = package_id.lower().split(".")
    if len(parts) >= 3 and len(parts[0]) == 2 and parts[1] in {"co", "com", "org", "net", "ac", "gov"}:
        return ".".join(parts[:3])
    return ".".join(parts[:2])


@dataclass
class OfficialMatch:
    status: str  # OFFICIAL | LIKELY_OFFICIAL
    level: int
    confidence: float
    evidence: list[str] = field(default_factory=list)
    in_profile: bool = False  # already on the allowlist (vs discovered)

    def to_dict(self) -> dict:
        return asdict(self)


def verify_official(
    c, ctx, name_score: float | None = None, icon_score: float | None = None, scam_indicators: bool = False
) -> OfficialMatch | None:
    """Positive identity check. Returns None when the candidate is not shown to be official."""
    key = (c.platform, c.identifier)

    # L1: exact ID / handle
    if key in ctx.allowlist:
        what = "app ID" if c.channel == "app" else "handle"
        return OfficialMatch(
            "OFFICIAL", 1, 1.0,
            [f"Official {what} {c.handle} is on the brand allowlist", "Excluded before risk scoring"],
            in_profile=True,
        )

    # L2: the store / profile URL resolves to an allowlisted ID
    if c.url:
        from ..services.urls import identity_from_url

        ident = identity_from_url(c.url)
        if ident and ident in ctx.allowlist:
            return OfficialMatch(
                "OFFICIAL", 2, 1.0,
                [f"Store or profile URL matches an official asset ({ident[1]})", "Excluded before risk scoring"],
                in_profile=True,
            )

    if c.channel != "app":
        return None  # social profiles are official only by allowlist (badges can be bought)

    known_ids = ctx.publisher_ids_for(c.platform)

    # L3: verified developer account
    if c.publisher_id and c.publisher_id in known_ids:
        return OfficialMatch(
            "OFFICIAL", 3, 0.97,
            [
                f"Published by the official developer account on this store (ID {c.publisher_id})",
                "Developer account verified from the brand's own validated app",
                "Excluded before risk scoring",
            ],
        )

    # L4: official publisher name + supporting metadata, no contradicting developer ID.
    # A weak identity match never outweighs scam evidence (OTP/PIN/KYC asks, care-number claims).
    pub = normalize_publisher(c.publisher)
    if pub and pub in ctx.publisher_names and not scam_indicators:
        contradicted = bool(known_ids) and bool(c.publisher_id) and c.publisher_id not in known_ids
        if contradicted:
            return None  # copied publisher name under another developer account
        support: list[str] = []
        ns = package_namespace(c.identifier) if c.platform == "google_play" else None
        if ns and ns in ctx.official_namespaces:
            support.append(f"App ID shares the official namespace {ns}")
        if name_score is not None and name_score >= 0.85:
            support.append("Title carries the brand name")
        if icon_score is not None and icon_score >= 0.8:
            support.append(f"Icon matches the official icon ({round(icon_score * 100)}%)")
        if support:
            return OfficialMatch(
                "LIKELY_OFFICIAL", 4, min(0.9, 0.6 + 0.12 * len(support)),
                [f"Publisher “{c.publisher}” matches the official publisher", *support,
                 "Excluded before risk scoring; confirm and add to the profile"],
            )
    return None
