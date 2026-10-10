"""Live connectors, run against recorded responses (no network)."""

import httpx
import pytest

from app.connectors import stores
from app.connectors.base import SourceUnavailable

ITUNES = {
    "resultCount": 1,
    "results": [
        {
            "trackId": 6450011223,
            "trackName": "Zentra Pay: Rewards",
            "sellerName": "Rewardly Labs",
            "artistId": 1690023344,
            "artworkUrl512": "https://is1-ssl.mzstatic.com/x.png",
            "description": "Earn rewards on every Zentra Pay transaction.",
            "releaseDate": "2026-09-22T07:00:00Z",
            "userRatingCount": 41,
            "trackViewUrl": "https://apps.apple.com/in/app/id6450011223",
        }
    ],
}


def test_app_store_parses_results(monkeypatch):
    real_client = httpx.Client

    def fake_client(**kwargs):
        kwargs.pop("verify", None)
        return real_client(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=ITUNES)), **kwargs)

    monkeypatch.setattr(stores.httpx, "Client", fake_client)
    [c] = stores.AppStoreLive().fetch(["zentra"])
    assert c.identifier == "id6450011223"
    assert c.publisher == "Rewardly Labs" and c.publisher_id == "1690023344"
    assert c.created_on.isoformat() == "2026-09-22"


def test_app_store_failure_is_reported(monkeypatch):
    real_client = httpx.Client

    def fake_client(**kwargs):
        kwargs.pop("verify", None)
        return real_client(transport=httpx.MockTransport(lambda req: httpx.Response(503)), **kwargs)

    monkeypatch.setattr(stores.httpx, "Client", fake_client)
    with pytest.raises(SourceUnavailable):
        stores.AppStoreLive().fetch(["zentra"])


def test_google_play_search_and_enrich(monkeypatch):
    monkeypatch.setattr(
        stores,
        "play_search",
        lambda q, **kw: [{"appId": "com.zentrapay.wallet.upi", "title": "ZentraPay Wallet", "developer": "ZP Tech Apps", "icon": "https://x/icon.png"}],
    )
    monkeypatch.setattr(
        stores,
        "play_app",
        lambda app_id, **kw: {
            "description": "Pay bills over UPI",
            "realInstalls": 812,
            "released": "Oct 1, 2026",
            "developer": "ZP Tech Apps",
            "developerId": "6630011920045123",
            "privacyPolicy": "https://sites.google.com/view/zptech",
            "icon": "https://x/icon.png",
        },
    )
    conn = stores.GooglePlayLive()
    [c] = conn.fetch(["zentra"])
    assert c.identifier == "com.zentrapay.wallet.upi"
    conn.enrich(c)
    assert c.publisher_id == "6630011920045123"
    assert c.audience == 812
    assert c.created_on.isoformat() == "2026-10-01"


def test_google_play_failure_is_reported(monkeypatch):
    def boom(*a, **kw):
        raise ConnectionError("blocked")

    monkeypatch.setattr(stores, "play_search", boom)
    with pytest.raises(SourceUnavailable):
        stores.GooglePlayLive().fetch(["zentra"])
