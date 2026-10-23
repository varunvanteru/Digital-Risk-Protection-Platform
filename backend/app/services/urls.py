"""Resolve profile and store URLs to (platform, identifier). Shared by Quick check and verification."""

from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

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
    "quora.com": "quora",
    "discord.gg": "discord",
    "discord.com": "discord",
    "play.google.com": "google_play",
    "apps.apple.com": "app_store",
}

# Path words that come before the handle, e.g. linkedin.com/company/<h>, youtube.com/c/<h>
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


def identity_from_url(url: str) -> tuple[str, str] | None:
    """('google_play', 'com.brand.app') for a Play URL, ('instagram', 'brand') for a profile, else None."""
    q = parse_query(url)
    if q.platform and q.identifier:
        return q.platform, q.identifier
    return None
