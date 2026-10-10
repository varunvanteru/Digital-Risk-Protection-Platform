from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Protocol


@dataclass
class Candidate:
    """One account or app returned by a source, before any scoring."""

    source_id: str
    channel: str  # social | app
    platform: str
    identifier: str  # lowercase handle, package name or track id; used for allowlist and dedupe
    handle: str
    display_name: str
    url: str
    bio: str = ""
    audience: int = 0
    created_on: date | None = None
    publisher: str | None = None
    publisher_id: str | None = None
    links: list[str] = field(default_factory=list)
    verified: bool = False
    image: str | None = None  # media path or remote URL of avatar / icon
    mark: str = "unrelated"  # avatar variant label for the UI fallback
    privacy_url: str | None = None
    first_seen: datetime | None = None  # only set by datasets that carry history
    seed_status: str | None = None


class Connector(Protocol):
    source_id: str

    def fetch(self, keywords: list[str]) -> list[Candidate]: ...


class SourceUnavailable(Exception):
    pass
