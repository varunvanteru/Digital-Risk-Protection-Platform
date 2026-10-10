"""
Look-alike name detection.

Normalise in five steps, then match three ways (exact core, edit distance /
Jaro-Winkler, containment) with guards against over-flagging. Kept in step
with frontend/src/lib/lookalike.ts; tests/test_lookalike.py pins the behaviour.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import asdict, dataclass, field
from functools import lru_cache

HOMOGLYPHS = {
    "0": "o",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "@": "a",
    "$": "s",
    # Cyrillic and Greek letters that render like Latin ones
    "а": "a",
    "е": "e",
    "о": "o",
    "р": "p",
    "с": "c",
    "у": "y",
    "х": "x",
    "і": "i",
    "ѕ": "s",
    "ο": "o",
    "α": "a",
    "ı": "i",
}

MULTI_GLYPHS = [("rn", "m"), ("vv", "w"), ("cl", "d")]

FILLER_WORDS = [
    "official", "real", "support", "care", "help", "helpline", "team", "india", "app", "pay",
    "wallet", "customer", "service", "verified", "original", "hq", "global",
    # Words scammers bolt onto a brand name
    "offer", "offers", "refund", "refunds", "kyc", "cashback", "reward", "rewards", "helpdesk", "desk",
    "loan", "loans", "career", "careers", "jobs", "update", "updates", "alert", "alerts", "bonus",
    "gift", "gifts", "deals", "services", "apps", "pvt", "ltd",
]

# Names one edit away from the demo brand that are not in the English list.
COMMON_WORDS = {"zen", "sentra", "centra", "central", "contra", "zebra", "sentry", "zentro", "centro"}


@lru_cache(maxsize=1)
def english_words() -> frozenset[str]:
    """~38k common English words (data/common_words.txt). An ordinary word is never a look-alike on its own."""
    from ..config import settings

    path = settings.data_dir / "common_words.txt"
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return frozenset()
    return frozenset(w for w in lines if w and not w.startswith("#"))


def is_ordinary_word(core: str) -> bool:
    return core in COMMON_WORDS or core in english_words()

SEPARATORS = re.compile(r"[\s._\-]+")


@dataclass
class Step:
    label: str
    output: str
    changed: bool
    note: str | None = None


@dataclass
class LookalikeResult:
    input: str
    steps: list[Step]
    core: str
    alias: str
    method: str
    score: float
    verdict: str  # match | partial | no_match
    variations: list[str] = field(default_factory=list)
    guards: list[str] = field(default_factory=list)
    explanation: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class _Candidate:
    steps: list[Step]
    core: str
    variations: list[str]


def _extract_handle(raw: str) -> str:
    s = raw.strip()
    if "/" in s:
        parts = [p for p in s.split("/") if p]
        s = parts[-1] if parts else s
    s = re.sub(r"^@", "", s).split("?")[0]
    return s


def _map_glyphs(s: str, one_as: str) -> tuple[str, int]:
    swaps = 0
    out = []
    for ch in s:
        if ch == "1":
            swaps += 1
            out.append(one_as)
            continue
        m = HOMOGLYPHS.get(ch)
        if m:
            swaps += 1
        out.append(m or ch)
    return "".join(out), swaps


def _strip_fillers(tokens: list[str], brand_tokens: set[str]) -> tuple[list[str], list[str]]:
    removed: list[str] = []
    kept: list[str] = []
    for t in tokens:
        if t in FILLER_WORDS and t not in brand_tokens:
            removed.append(t)
            continue
        changed = True
        while changed:  # fillers glued to the name, e.g. "zentrapaysupport"
            changed = False
            for f in FILLER_WORDS:
                if f in brand_tokens or t in brand_tokens:
                    continue
                if len(t) - len(f) >= 4 and t.endswith(f):
                    removed.append(f)
                    t = t[: -len(f)]
                    changed = True
                elif len(t) - len(f) >= 4 and t.startswith(f):
                    removed.append(f)
                    t = t[len(f):]
                    changed = True
        kept.append(t)
    return kept, removed


def damerau(a: str, b: str) -> int:
    """Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps)."""
    d = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        d[i][0] = i
    for j in range(len(b) + 1):
        d[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                d[i][j] = min(d[i][j], d[i - 2][j - 2] + 1)
    return d[len(a)][len(b)]


def _is_adjacent_swap(a: str, b: str) -> bool:
    if len(a) != len(b):
        return False
    diff = [i for i in range(len(a)) if a[i] != b[i]]
    return len(diff) == 2 and diff[1] == diff[0] + 1 and a[diff[0]] == b[diff[1]] and a[diff[1]] == b[diff[0]]


def jaro_winkler(a: str, b: str) -> float:
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    rng = max(0, max(len(a), len(b)) // 2 - 1)
    a_hit = [False] * len(a)
    b_hit = [False] * len(b)
    matches = 0
    for i in range(len(a)):
        lo, hi = max(0, i - rng), min(i + rng + 1, len(b))
        for j in range(lo, hi):
            if b_hit[j] or a[i] != b[j]:
                continue
            a_hit[i] = b_hit[j] = True
            matches += 1
            break
    if not matches:
        return 0.0
    k = transpositions = 0
    for i in range(len(a)):
        if not a_hit[i]:
            continue
        while not b_hit[k]:
            k += 1
        if a[i] != b[k]:
            transpositions += 1
        k += 1
    m = matches
    jaro = (m / len(a) + m / len(b) + (m - transpositions / 2) / m) / 3
    prefix = 0
    while prefix < 4 and prefix < len(a) and prefix < len(b) and a[prefix] == b[prefix]:
        prefix += 1
    return jaro + prefix * 0.1 * (1 - jaro)


def _normalise(raw: str, brand_tokens: set[str], one_as: str, multi: bool, strip: bool = True) -> _Candidate:
    steps: list[Step] = []
    variations: list[str] = []

    handle = _extract_handle(raw)
    nfkc = unicodedata.normalize("NFKC", handle)
    s1 = nfkc.lower()
    steps.append(Step("Lowercase + Unicode NFKC", s1, s1 != handle, "Styled Unicode letters converted" if nfkc != handle else None))
    if nfkc != handle:
        variations.append("Styled Unicode letters")

    s2, swaps = _map_glyphs(s1, one_as)
    if multi:
        for frm, to in MULTI_GLYPHS:
            if frm in s2:
                s2 = s2.replace(frm, to)
                swaps += 1
    steps.append(
        Step(
            "Homoglyph and leetspeak map",
            s2,
            swaps > 0,
            f"{swaps} look-alike character{'s' if swaps > 1 else ''} replaced" if swaps else None,
        )
    )
    if swaps:
        variations.append("Homoglyph / leetspeak")

    tokens = [t for t in SEPARATORS.split(s2) if t]
    joined = "".join(tokens)
    steps.append(
        Step(
            "Remove separators",
            " · ".join(tokens),
            joined != s2,
            f"{len(tokens)} token{'s' if len(tokens) > 1 else ''}" if joined != s2 else None,
        )
    )
    if joined != s2:
        variations.append("Spacing / separators")

    kept, removed = _strip_fillers(tokens, brand_tokens) if strip else (tokens, [])
    core = "".join(kept)
    steps.append(Step("Strip filler words", core, bool(removed), f"Removed: {', '.join(removed)}" if removed else None))
    if removed:
        variations.append("Added words")

    return _Candidate(steps, core, variations)


def _match(raw: str, cand: _Candidate, alias: str) -> LookalikeResult:
    core = cand.core
    variations = list(cand.variations)
    guards: list[str] = []
    long_enough = len(alias) >= 6
    method = "No match"
    score = 0.0

    if not core:
        method = "Nothing left after normalisation"
    elif core == alias:
        method = "Exact match after normalisation"
        score = 0.95 if variations else 1.0
    else:
        dist = damerau(core, alias)
        jw = jaro_winkler(core, alias)
        if long_enough and dist > 1 and alias in core:
            rest = core.replace(alias, "", 1)
            method = "Contains brand name plus other text"
            score = 0.6
            guards.append(f'Extra text "{rest}" is not a known filler word, so this is only a partial match')
        elif len(alias) >= 5 and dist == 1:
            swap = _is_adjacent_swap(core, alias)
            method = "Character swap (edit distance 1)" if swap else "One letter changed, missing or doubled"
            variations.append("Character swap" if swap else "Missing / doubled letter")
            score = (0.9 if swap else 0.88) if long_enough else 0.85
        elif long_enough and jw >= 0.92:
            method = f"Jaro-Winkler {jw:.2f}"
            variations.append("Close spelling")
            score = 0.88
        else:
            method = f"Jaro-Winkler {jw:.2f}, edit distance {dist}"
            score = max(0.0, min(0.55, ((jw - 0.7) / 0.3) * 0.55))
        if len(alias) < 5 and dist > 0:
            guards.append(f'"{alias}" is shorter than 5 letters, so only an exact match counts')
            score = min(score, 0.3)

    if core != alias and is_ordinary_word(core):
        guards.append(f'"{core}" is an ordinary word or name, so name similarity alone stays Low')
        score = min(score, 0.3)

    verdict = "match" if score >= 0.85 else "partial" if score >= 0.6 else "no_match"
    explanation = {
        "match": "Strong look-alike. On a live profile this needs one more signal (logo, claims, publisher or scam behaviour) to reach High.",
        "partial": "Shares the brand name but with unrelated text. Shown for review, not flagged on name alone.",
        "no_match": "Not a look-alike of the brand name.",
    }[verdict]

    return LookalikeResult(
        input=raw,
        steps=cand.steps,
        core=core,
        alias=alias,
        method=method,
        score=round(score, 2),
        verdict=verdict,
        variations=[] if verdict == "no_match" else list(dict.fromkeys(variations)),
        guards=guards,
        explanation=explanation,
    )


def analyse_name(raw: str, aliases: list[str]) -> LookalikeResult:
    brand_tokens: set[str] = set()
    alias_cores: list[str] = []
    for a in aliases:
        toks = [t for t in SEPARATORS.split(a.lower()) if t]
        brand_tokens.update(toks)
        core = "".join(toks)
        if core and core not in alias_cores:
            alias_cores.append(core)

    candidates = [
        _normalise(raw, brand_tokens, "l", False),
        _normalise(raw, brand_tokens, "i", False),
        _normalise(raw, brand_tokens, "l", True),
        # Fillers kept: "pay.tm" must still read as "paytm" even though "pay" is a filler word.
        _normalise(raw, brand_tokens, "l", False, strip=False),
    ]

    best: LookalikeResult | None = None
    for cand in candidates:
        for alias in alias_cores:
            r = _match(raw, cand, alias)
            if best is None or r.score > best.score:
                best = r
    assert best is not None
    return best


WORD = re.compile(r"[^\W_]+", re.UNICODE)


def name_similarity(names: list[str], aliases: list[str]) -> tuple[float, LookalikeResult]:
    """
    Best look-alike score across several names (handle, display name, app title).
    Long titles like "ZentraPay Wallet - UPI & Bills" are also scanned in windows
    of 1 to 3 words, so the brand name is found inside a longer title.
    """
    names = [n for n in names if n and n.strip()]
    results = [analyse_name(n, aliases) for n in names]
    best = max(results, key=lambda r: r.score)
    if best.score >= 0.85:
        return best.score, best

    for n in names:
        words = WORD.findall(n)
        if len(words) < 2:
            continue
        for size in (1, 2, 3):
            for i in range(len(words) - size + 1):
                window = " ".join(words[i : i + size])
                r = analyse_name(window, aliases)
                if r.score >= 0.88:
                    r.input = n
                    r.score = 0.85
                    r.method = f'Brand look-alike "{window}" inside a longer name'
                    r.variations = list(dict.fromkeys([*r.variations, "Added words"]))
                    return r.score, r
    return best.score, best
