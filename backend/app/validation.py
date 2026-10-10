"""Input rules for the brand profile. Mirrors frontend/src/lib/validation.ts."""

import re

HANDLE_RULES = {
    "instagram": (re.compile(r"^[a-z0-9._]{1,30}$", re.I), "Up to 30 letters, numbers, periods or underscores"),
    "x": (re.compile(r"^[a-z0-9_]{1,15}$", re.I), "Up to 15 letters, numbers or underscores"),
    "facebook": (re.compile(r"^[a-z0-9.]{5,50}$", re.I), "5 to 50 letters, numbers or periods"),
    "telegram": (re.compile(r"^[a-z0-9_]{5,32}$", re.I), "5 to 32 letters, numbers or underscores"),
}

PLATFORM_LABEL = {"instagram": "Instagram", "x": "X", "facebook": "Facebook", "telegram": "Telegram"}

DOMAIN = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)(\.[a-z0-9-]{1,63})+$", re.I)
PACKAGE = re.compile(r"^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$", re.I)
TRACK_ID = re.compile(r"^id\d{6,12}$")


def clean_handle(raw: str) -> str:
    return raw.strip().removeprefix("@").removeprefix("/")


def handle_error(platform: str, handle: str) -> str | None:
    if platform not in HANDLE_RULES:
        return f"Unsupported platform “{platform}”"
    if not handle:
        return "Enter a handle"
    pattern, rule = HANDLE_RULES[platform]
    if not pattern.match(handle):
        return f"Not a valid {PLATFORM_LABEL[platform]} handle. {rule}."
    return None


def app_id_error(platform: str, app_id: str) -> str | None:
    if platform == "google_play" and PACKAGE.match(app_id):
        return None
    if platform == "app_store" and TRACK_ID.match(app_id):
        return None
    return "Use a Play package name (com.brand.app) or an App Store ID (id1234567890)"


def domain_error(d: str) -> str | None:
    return None if DOMAIN.match(d.strip()) else f"“{d}” is not a valid domain"


def name_error(name: str) -> str | None:
    n = name.strip()
    if not n:
        return "Enter the brand name"
    if not 2 <= len(n) <= 60:
        return "Use 2 to 60 characters"
    return None
