"""Risk score from signal values. Weights and rules from the design doc."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

WEIGHTS: dict[str, dict[str, float]] = {
    "social": {"name": 0.30, "logo": 0.25, "text": 0.10, "claims": 0.15, "behaviour": 0.20},
    "app": {"name": 0.25, "logo": 0.25, "text": 0.15, "claims": 0.10, "behaviour": 0.05, "publisher": 0.20},
}

# Publisher mismatch is true for every non-official app, so it never counts
# as the second strong signal on its own.
CONTEXT_ONLY = {"publisher"}


@dataclass
class Part:
    key: str
    value: float
    weight: float
    contribution: float


@dataclass
class Breakdown:
    score: int
    severity: str
    parts: list[Part]
    boosts: list[dict] = field(default_factory=list)
    cap: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


def severity_of(score: int) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    return "low"


def score_detection(
    channel: str,
    signals: dict[str, float],
    lookalike_domain: bool = False,
    context_label: str | None = None,
    feedback_penalty: float = 0.0,
) -> Breakdown:
    weights = WEIGHTS[channel]
    parts = [
        Part(k, round(float(signals.get(k, 0.0)), 3), w, round(float(signals.get(k, 0.0)) * w, 4))
        for k, w in weights.items()
    ]
    total = sum(p.contribution for p in parts)
    boosts: list[dict] = []

    s = signals
    identity = s.get("name", 0) >= 0.8 or s.get("logo", 0) >= 0.8
    posing = s.get("claims", 0) >= 0.5 if channel == "social" else s.get("publisher", 0) >= 0.5
    if identity and posing:
        boosts.append(
            {
                "label": "Strong name or logo match while claiming to be official"
                if channel == "social"
                else "Strong name or icon match from a different publisher",
                "amount": 0.15,
            }
        )
        total += 0.15
    if channel == "social" and s.get("name", 0) >= 0.8 and s.get("behaviour", 0) >= 0.8:
        boosts.append({"label": "Uses the brand name to run a scam", "amount": 0.10})
        total += 0.10
    if lookalike_domain:
        boosts.append({"label": "Links to a look-alike of an official domain", "amount": 0.10})
        total += 0.10
    # The penalty applies after the 100-point ceiling, so it always lowers the score.
    capped = min(1.0, total)
    if feedback_penalty:
        boosts.append({"label": "Marked as a false positive by an analyst", "amount": -feedback_penalty})
        capped -= feedback_penalty

    score = round(100 * max(0.0, capped))
    cap = None
    strong = sum(1 for p in parts if p.value > 0.5 and p.key not in CONTEXT_ONLY)
    if strong <= 1 and score > 39:
        score, cap = 39, "Only one signal is strong, so the score is capped at Low"
    if context_label and score > 39:
        score, cap = 39, f"Openly labelled as {context_label}, so the score is capped at Low"

    return Breakdown(score=score, severity=severity_of(score), parts=parts, boosts=boosts, cap=cap)
