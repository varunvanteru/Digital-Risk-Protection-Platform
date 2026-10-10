"""Live app-store connectors. Both work without API keys."""

from __future__ import annotations

import re
from datetime import date, datetime

import httpx
from google_play_scraper import app as play_app
from google_play_scraper import search as play_search

from ..config import settings
from ..tls import tls_context
from .base import Candidate, SourceUnavailable


def _parse_play_date(s: str | None) -> date | None:
    if not s:
        return None
    for fmt in ("%b %d, %Y", "%d %b %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


class GooglePlayLive:
    """Google Play search via google-play-scraper, then app detail for publisher ID and release date."""

    source_id = "src_play"
    # Play search pages are slow under load; give this connector its own budget.
    timeout_s = 25.0

    def __init__(self, country: str = "in", hits: int = 30):
        self.country = country
        self.hits = hits

    def _page_ids(self, keyword: str) -> list[str]:
        """App IDs in the order the Play search page links them (the featured result comes first)."""
        r = httpx.get(
            "https://play.google.com/store/search",
            params={"q": keyword, "c": "apps", "hl": "en", "gl": self.country},
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=settings.source_timeout_s,
            verify=tls_context(),
            follow_redirects=True,
        )
        r.raise_for_status()
        return list(dict.fromkeys(re.findall(r"/store/apps/details\?id=([A-Za-z0-9_.]+)", r.text)))

    def fetch(self, keywords: list[str]) -> list[Candidate]:
        seen: dict[str, dict] = {}
        try:
            for kw in keywords:
                results = play_search(kw, lang="en", country=self.country, n_hits=self.hits)
                missing = [r for r in results if not r.get("appId")]
                if missing:
                    # The scraper drops the ID of the featured top result, usually the brand's main app.
                    # Recover it from the page's own links; enrich() later confirms the title matches.
                    try:
                        known = {r["appId"] for r in results if r.get("appId")}
                        spare = [i for i in self._page_ids(kw) if i not in known and i not in seen]
                        for r, app_id in zip(missing, spare):
                            r["appId"], r["_recovered"] = app_id, True
                    except Exception:
                        pass  # keep the rest of the results
                for r in results:
                    if r.get("appId"):
                        seen.setdefault(r["appId"], r)
        except Exception as e:  # network, parsing or rate limiting
            raise SourceUnavailable(f"Google Play search failed: {type(e).__name__}") from e

        return [
            Candidate(
                source_id=self.source_id,
                channel="app",
                platform="google_play",
                identifier=app_id.lower(),
                handle=app_id,
                display_name=r.get("title") or app_id,
                url=f"https://play.google.com/store/apps/details?id={app_id}",
                bio=(r.get("description") or "")[:2000],
                publisher=r.get("developer"),
                image=r.get("icon"),
            )
            for app_id, r in seen.items()
        ]

    def enrich(self, c: Candidate) -> None:
        """App detail: publisher ID, installs, release date, privacy policy. Called only for relevant hits."""
        try:
            d = play_app(c.handle, lang="en", country=self.country)
        except Exception:
            return  # search fields are enough to score
        if d.get("title") and c.display_name and d["title"].strip().lower() != c.display_name.strip().lower():
            # A recovered ID that points at a different app: trust the store's own record for this ID.
            c.display_name = d["title"]
            c.image = d.get("icon") or c.image
        c.bio = (d.get("description") or c.bio)[:2000]
        c.audience = int(d.get("realInstalls") or d.get("minInstalls") or 0)
        c.created_on = _parse_play_date(d.get("released"))
        c.publisher = d.get("developer") or c.publisher
        c.publisher_id = str(d.get("developerId") or "") or None
        c.privacy_url = d.get("privacyPolicy")
        c.links = [u for u in [d.get("privacyPolicy"), d.get("developerWebsite")] if u]
        c.image = d.get("icon") or c.image


class AppStoreLive:
    """Apple App Store via the public iTunes Search API."""

    source_id = "src_appstore"

    def __init__(self, country: str = "in", limit: int = 25):
        self.country = country
        self.limit = limit

    def fetch(self, keywords: list[str]) -> list[Candidate]:
        seen: dict[int, dict] = {}
        try:
            with httpx.Client(timeout=settings.source_timeout_s, verify=tls_context()) as client:
                for kw in keywords:
                    r = client.get(
                        "https://itunes.apple.com/search",
                        params={"term": kw, "country": self.country, "entity": "software", "limit": self.limit},
                    )
                    r.raise_for_status()
                    for item in r.json().get("results", []):
                        seen.setdefault(item["trackId"], item)
        except Exception as e:
            raise SourceUnavailable(f"App Store search failed: {type(e).__name__}") from e

        out = []
        for track_id, it in seen.items():
            released = it.get("releaseDate")
            out.append(
                Candidate(
                    source_id=self.source_id,
                    channel="app",
                    platform="app_store",
                    identifier=f"id{track_id}",
                    handle=f"id{track_id}",
                    display_name=it.get("trackName", ""),
                    url=it.get("trackViewUrl") or f"https://apps.apple.com/app/id{track_id}",
                    bio=(it.get("description") or "")[:2000],
                    audience=int(it.get("userRatingCount") or 0),
                    created_on=date.fromisoformat(released[:10]) if released else None,
                    publisher=it.get("sellerName") or it.get("artistName"),
                    publisher_id=str(it.get("artistId") or "") or None,
                    links=[u for u in [it.get("sellerUrl")] if u],
                    image=it.get("artworkUrl512") or it.get("artworkUrl100"),
                    mark="unrelated",
                )
            )
        return out
