"""
Accuracy on the labelled test set (data/labelled_cases.json).

Every case goes through the same evaluate() used by scans and Quick check:
official verification first, then signals and scoring. Brand profiles come from
the labelled file, not the database, so results are reproducible.

A case counts as FLAGGED when it is not excluded as official and scores Medium
or above (>= 40). Positive class = fake.
"""

from __future__ import annotations

import json
from datetime import date

from .config import settings
from .connectors.base import Candidate
from .connectors.datasets import SocialDataset, StoreDataset
from .demo_assets import ensure_brand_logo
from .detection.official import normalize_publisher, package_namespace
from .detection.signals import BrandContext, evaluate

FLAG_SEVERITIES = {"critical", "high", "medium"}


def _context(b: dict) -> BrandContext:
    by_platform: dict[str, set[str]] = {}
    for a in b["apps"]:
        if a.get("publisherId"):
            by_platform.setdefault(a["platform"], set()).add(a["publisherId"])
    names = {normalize_publisher(p["name"]) for p in b["publishers"]}
    for p in b["publishers"]:
        names.update(normalize_publisher(x) for x in p.get("aliases", []))
    names.update(normalize_publisher(a.get("publisher")) for a in b["apps"])
    names.discard("")
    allow = {(a["platform"], a["id"].lower()) for a in b["apps"]} | {(s["platform"], s["handle"].lower()) for s in b["accounts"]}
    return BrandContext(
        brand_id=f"eval_{b['name'].lower()}",
        name=b["name"],
        aliases=list(dict.fromkeys([b["name"], *b["aliases"]])),
        domains=b["domains"],
        description=b["description"],
        logo_ref=ensure_brand_logo("eval_zentrapay") if b.get("logo") == "demo" else None,
        publisher_ids=set(),
        publisher_names=names,
        allowlist=allow,
        publisher_ids_by_platform=by_platform,
        official_namespaces={ns for a in b["apps"] if a["platform"] == "google_play" and (ns := package_namespace(a["id"]))},
    )


def _inline_candidate(c: dict) -> Candidate:
    return Candidate(
        source_id="eval",
        channel=c["channel"],
        platform=c["platform"],
        identifier=c["handle"].lower(),
        handle=c["handle"],
        display_name=c["display_name"],
        url="",
        bio=c.get("bio", ""),
        audience=c.get("audience", 0),
        created_on=date.fromisoformat(c["created_at"]) if c.get("created_at") else None,
        publisher=c.get("publisher"),
        publisher_id=c.get("publisher_id"),
        links=c.get("links", []),
        privacy_url=c.get("privacy_url"),
    )


def _dataset_candidates(keywords: list[str]) -> dict[str, Candidate]:
    """All curated rows a search for the brand returns, keyed 'platform:identifier'."""
    from .services.scan import CONNECTORS

    out: dict[str, Candidate] = {}
    for conn in CONNECTORS.values():
        if isinstance(conn, (SocialDataset, StoreDataset)):
            for c in conn.fetch(keywords):
                out[f"{c.platform}:{c.identifier}"] = c
    return out


def run_evaluation() -> dict:
    with open(settings.data_dir / "labelled_cases.json", encoding="utf-8") as f:
        data = json.load(f)
    today = date.fromisoformat(data["today"])
    profiles = {b["name"]: b for b in data["brands"]}
    contexts = {name: _context(b) for name, b in profiles.items()}

    items: list[tuple[str, str, str, Candidate | None]] = []  # brand, label, group, candidate (None = search did not return it)
    labels = data["dataset_labels"]
    found = _dataset_candidates([*profiles[labels["brand"]]["keywords"], labels["brand"]])
    for label in ("official", "fake", "mention", "unrelated"):
        for key in labels[label]:
            items.append((labels["brand"], label, f"Curated dataset: {label}", found.get(key)))
    for c in data["cases"]:
        items.append((c["brand"], c["label"], c["group"], _inline_candidate(c)))

    rows = []
    tp = fp = fn = tn = 0
    official_tested = official_recognised = official_flagged = 0
    for brand, label, group, cand in items:
        ctx = contexts[brand]
        if cand is None:
            # The platform search never surfaced it, so it cannot be flagged.
            outcome, status, score, severity, reason, excluded = "NOT RETURNED", "UNRELATED", 0, None, "Not returned by the search", False
            platform = name = handle = "-"
        else:
            ev = evaluate(cand, ctx, today)
            excluded = ev.excluded
            platform, name, handle, status, reason = cand.platform, cand.display_name, cand.handle, ev.status, (ev.reasons or [""])[0]
            if excluded:
                outcome, score, severity = ev.status, 0, None
            else:
                score, severity = ev.breakdown.score, ev.breakdown.severity
                outcome = "FLAGGED" if severity in FLAG_SEVERITIES else "NOT FLAGGED"
        flagged = outcome == "FLAGGED"
        fake = label == "fake"
        if fake and flagged:
            tp += 1
        elif fake:
            fn += 1
        elif flagged:
            fp += 1
        else:
            tn += 1
        if label == "official":
            official_tested += 1
            official_recognised += 1 if excluded else 0
            official_flagged += 1 if flagged else 0
        rows.append({
            "brand": brand, "label": label, "group": group, "platform": platform, "name": name, "handle": handle,
            "outcome": outcome, "status": status, "score": score, "severity": severity,
            "correct": (fake and flagged) or (not fake and not flagged), "reason": reason,
        })
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    by_brand = {}
    for b in contexts:
        rs = [r for r in rows if r["brand"] == b]
        by_brand[b] = {"cases": len(rs), "correct": sum(r["correct"] for r in rs)}
    return {
        "cases": len(rows),
        "truePositives": tp, "falsePositives": fp, "falseNegatives": fn, "trueNegatives": tn,
        "precision": round(precision, 3), "recall": round(recall, 3), "f1": round(f1, 3),
        "officialTested": official_tested, "officialRecognised": official_recognised, "officialFlagged": official_flagged,
        "mentionsFlagged": sum(1 for r in rows if r["label"] in ("mention", "unrelated") and r["outcome"] == "FLAGGED"),
        "byBrand": by_brand,
        "rows": rows,
        "definition": "Flagged = not verified official and risk score >= 40 (Medium or above). Positive class = fake.",
    }
