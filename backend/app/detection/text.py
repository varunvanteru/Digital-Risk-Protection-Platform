"""Text signals: description similarity, impersonation claims, scam behaviour, domains."""

from __future__ import annotations

import math
import re
from collections import Counter
from datetime import date
from urllib.parse import urlparse

from .lookalike import damerau

STOPWORDS = set(
    """a an and are as at be by for from has have in is it its of on or our so that the this to was we will with you your
    all any can do get just more now one up us very""".split()
)

TOKEN = re.compile(r"[a-z0-9₹]+")


def _tokens(text: str) -> list[str]:
    return [t for t in TOKEN.findall(text.lower()) if t not in STOPWORDS and len(t) > 1]


def text_similarity(a: str, b: str) -> float:
    """Cosine similarity of word counts, blended with shared 3-word phrases to catch copied sentences."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    ca, cb = Counter(ta), Counter(tb)
    dot = sum(ca[w] * cb[w] for w in ca)
    cos = dot / (math.sqrt(sum(v * v for v in ca.values())) * math.sqrt(sum(v * v for v in cb.values())))
    grams_a = {tuple(ta[i : i + 3]) for i in range(len(ta) - 2)}
    grams_b = {tuple(tb[i : i + 3]) for i in range(len(tb) - 2)}
    shared = len(grams_a & grams_b) / max(1, min(len(grams_a), len(grams_b))) if grams_a and grams_b else 0.0
    return round(min(1.0, 0.7 * cos + 0.3 * shared), 3)


CLAIM_PATTERNS = {
    "official": r"\bofficial\b",
    "support": r"\b(support|help ?desk|helpdesk)\b",
    "helpline": r"\b(helpline|customer care|care centre|care center|toll ?free)\b",
    "verified": r"\b(verified|authori[sz]ed)\b",
    "desk": r"\b(refund desk|complaint|grievance)\b",
}

CONTEXT_PATTERNS = [
    ("parody", r"\bparody\b"),
    ("fan", r"\b(unofficial|fan ?page|fan account|not affiliated)\b"),
    ("news", r"\b(news|independent coverage)\b"),
    ("review", r"\breviews?\b"),
]


def context_label(text: str) -> str | None:
    t = text.lower()
    for label, pat in CONTEXT_PATTERNS:
        if re.search(pat, t):
            return label
    return None


def claims_signal(name: str, bio: str, verified: bool) -> tuple[float, list[str]]:
    """How strongly an unverified account presents itself as the brand's own channel."""
    if verified:
        return 0.0, []
    text = f"{name} {bio}".lower()
    if re.search(r"\b(unofficial|not affiliated)\b", text):
        return 0.0, []
    hits = [k for k, pat in CLAIM_PATTERNS.items() if re.search(pat, text)]
    score = min(1.0, 0.35 * len(hits) + (0.25 if "official" in hits else 0.0))
    return round(score, 2), hits


CREDENTIAL = r"\b(otp|upi pin|pin|password|cvv|kyc|screen ?shar\w*|anydesk|teamviewer|remote access)\b"
PAYMENT = r"(registration fee|processing fee|entry fee|vip entry|pay ₹|deposit|advance fee)"
LURE = r"\b(cashback|giveaway|win|spin|guaranteed|3x|returns|blocked|limited seats|refund|reverse|instant loan|claim)\b"
OFF_PLATFORM = r"(wa\.me|whatsapp|t\.me/|\+?91[\s-]?\d{10}|\b\d{10}\b)"
SHORTENERS = {"bit.ly", "tinyurl.com", "cutt.ly", "t.ly", "rb.gy", "is.gd", "shorturl.at"}
FREE_HOSTS = ("sites.google.com", "blogspot.", "wixsite.com", "weebly.com", "000webhost", "github.io")


def domain_of(link: str) -> str:
    link = link.strip()
    if "://" not in link:
        link = "http://" + link
    return (urlparse(link).hostname or "").lower().removeprefix("www.")


def is_lookalike_domain(domain: str, official_domains: list[str], brand_cores: list[str]) -> bool:
    """A domain that is not official but borrows or misspells the brand name."""
    if not domain or domain in official_domains or any(domain.endswith("." + d) for d in official_domains):
        return False
    label = re.sub(r"[^a-z0-9]", "", domain.split(".")[0])
    for core in brand_cores:
        if len(core) < 5:
            continue
        if core in label or damerau(label, core) <= 2:
            return True
    for od in official_domains:
        if damerau(domain, od) <= 2:
            return True
    return False


def behaviour_signal(
    bio: str,
    links: list[str],
    created_on: date | None,
    audience: int,
    today: date,
    official_domains: list[str],
    brand_cores: list[str],
) -> tuple[float, list[str], bool]:
    """Scam behaviour for social profiles. Returns score, reasons and look-alike-domain flag."""
    text = f"{bio} {' '.join(links)}".lower()
    score = 0.0
    reasons: list[str] = []

    if m := re.search(CREDENTIAL, text):
        score += 0.45
        reasons.append(f"Asks for sensitive details (“{m.group(0)}”)")
    if re.search(PAYMENT, text):
        score += 0.35
        reasons.append("Asks for an upfront payment or fee")
    if m := re.search(LURE, text):
        score += 0.2
        reasons.append(f"Uses lure or urgency wording (“{m.group(0)}”)")
    if re.search(OFF_PLATFORM, text):
        score += 0.15
        reasons.append("Moves the conversation to WhatsApp, Telegram or a phone number")

    lookalike = False
    for link in links:
        d = domain_of(link)
        if d in SHORTENERS:
            score += 0.15
            reasons.append(f"Links to a URL shortener ({d})")
        elif is_lookalike_domain(d, official_domains, brand_cores):
            lookalike = True
            reasons.append(f"Links to {d}, a look-alike of an official domain")

    if created_on is not None:
        age = (today - created_on).days
        if age < 30 and audience < 500:
            score += 0.2
            reasons.append(f"Account is {age} days old with {audience} followers")

    return round(min(1.0, score), 2), reasons, lookalike


HIGH_RISK_APP = r"\b(loan|instant cash|credit line|mod|pro unlocked|hack|apk)\b"


def app_risk_signal(
    title: str,
    description: str,
    released: date | None,
    installs: int,
    privacy_url: str | None,
    sideloaded: bool,
    today: date,
) -> tuple[float, list[str]]:
    """Risk context for apps: new, tiny, high-risk category, weak privacy policy, sideloaded."""
    score = 0.0
    reasons: list[str] = []
    if released is not None:
        age = (today - released).days
        if age < 30:
            score += 0.3
            reasons.append(f"Released {age} days ago")
    if 0 < installs < 1000:
        score += 0.2
        reasons.append(f"Fewer than 1,000 installs")
    if m := re.search(HIGH_RISK_APP, f"{title} {description}".lower()):
        score += 0.3
        reasons.append(f"High-risk category or modified build (“{m.group(0)}”)")
    if privacy_url and any(h in privacy_url for h in FREE_HOSTS):
        score += 0.2
        reasons.append("Privacy policy hosted on a free site builder")
    if sideloaded:
        score += 0.3
        reasons.append("Distributed outside the official stores")
    return round(min(1.0, score), 2), reasons
