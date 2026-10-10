"""Curated datasets for sources without open APIs (social platforms, APK sites)."""

from __future__ import annotations

import json
from datetime import date, datetime

from ..config import settings
from ..demo_assets import ensure_avatar
from ..detection.lookalike import name_similarity
from .base import Candidate

SOCIAL_URL = {
    "instagram": "https://instagram.com/{h}",
    "x": "https://x.com/{h}",
    "facebook": "https://facebook.com/{h}",
    "telegram": "https://t.me/{h}",
    "whatsapp": "https://whatsapp.com/channel/{h}",
    "threads": "https://www.threads.net/@{h}",
    "linkedin": "https://www.linkedin.com/company/{h}",
    "snapchat": "https://www.snapchat.com/add/{h}",
    "youtube": "https://www.youtube.com/@{h}",
    "sharechat": "https://sharechat.com/profile/{h}",
    "moj": "https://mojapp.in/@{h}",
    "josh": "https://share.myjosh.in/profile/{h}",
    "pinterest": "https://www.pinterest.com/{h}",
    "reddit": "https://www.reddit.com/user/{h}",
    "quora": "https://www.quora.com/profile/{h}",
    "discord": "https://discord.gg/{h}",
}

STORE_URL = {
    "google_play": "https://play.google.com/store/apps/details?id={h}",
    "app_store": "https://apps.apple.com/app/{h}",
}


def _load(name: str) -> list[dict]:
    with open(settings.data_dir / name, encoding="utf-8") as f:
        return json.load(f)


def _dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None) if s else None


def _matches(names: list[str], text: str, keywords: list[str]) -> bool:
    """Datasets answer a fuzzy keyword search, the way platform search boxes do."""
    t = text.lower()
    if any(k.lower() in t for k in keywords):
        return True
    return name_similarity(names, keywords)[0] >= 0.5


class SocialDataset:
    def __init__(self, source_id: str, platform: str):
        self.source_id = source_id
        self.platform = platform

    def fetch(self, keywords: list[str]) -> list[Candidate]:
        out = []
        for p in _load("social_profiles.json"):
            if p["platform"] != self.platform:
                continue
            if not _matches([p["handle"], p["display_name"]], f"{p['handle']} {p['display_name']} {p['bio']}", keywords):
                continue
            out.append(
                Candidate(
                    source_id=self.source_id,
                    channel="social",
                    platform=p["platform"],
                    identifier=p["handle"].lower(),
                    handle=p["handle"],
                    display_name=p["display_name"],
                    url=SOCIAL_URL[p["platform"]].format(h=p["handle"]),
                    bio=p["bio"],
                    audience=p["followers"],
                    created_on=date.fromisoformat(p["created_at"]),
                    links=p["links"],
                    verified=p["verified"],
                    image=ensure_avatar(p["avatar"], f"{p['platform']}-{p['handle']}", p["display_name"]),
                    mark=p["avatar"],
                    first_seen=_dt(p.get("first_seen")),
                    seed_status=p.get("status"),
                )
            )
        return out


class StoreDataset:
    def __init__(self, source_id: str, filename: str):
        self.source_id = source_id
        self.filename = filename

    def fetch(self, keywords: list[str]) -> list[Candidate]:
        out = []
        for a in _load(self.filename):
            if not _matches([a["title"], a["package_id"]], f"{a['package_id']} {a['title']} {a['description']}", keywords):
                continue
            out.append(
                Candidate(
                    source_id=self.source_id,
                    channel="app",
                    platform=a["platform"],
                    identifier=a["package_id"].lower(),
                    handle=a["package_id"],
                    display_name=a["title"],
                    url=a.get("url") or STORE_URL[a["platform"]].format(h=a["package_id"]),
                    bio=a["description"],
                    audience=a["installs"],
                    created_on=date.fromisoformat(a["released"]),
                    publisher=a["publisher"],
                    publisher_id=a["publisher_id"],
                    links=[a["privacy_url"]] if a.get("privacy_url") else [],
                    image=ensure_avatar(a["avatar"], f"{a['platform']}-{a['package_id']}", a["title"]),
                    mark=a["avatar"],
                    privacy_url=a.get("privacy_url"),
                    first_seen=_dt(a.get("first_seen")),
                    seed_status=a.get("status"),
                )
            )
        return out
