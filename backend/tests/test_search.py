"""Quick-check search across selected platforms."""

from app.services.search import parse_query


def test_parse_query_handles_names_and_urls():
    assert parse_query("ZentraPay").name == "ZentraPay"
    assert parse_query("@zentrapay").name == "zentrapay"
    q = parse_query("https://www.instagram.com/zentrapay/")
    assert (q.platform, q.identifier, q.name) == ("instagram", "zentrapay", "zentrapay")
    q = parse_query("x.com/ZentraPay")
    assert (q.platform, q.identifier) == ("x", "zentrapay")
    q = parse_query("https://play.google.com/store/apps/details?id=com.zentrapay.app")
    assert (q.platform, q.identifier, q.name) == ("google_play", "com.zentrapay.app", "zentrapay")
    q = parse_query("https://apps.apple.com/in/app/zentrapay/id1234567890")
    assert (q.platform, q.identifier) == ("app_store", "id1234567890")


def test_search_all_platforms(client):
    r = client.post("/api/search", json={"query": "zentrapay", "platforms": ["all"]})
    assert r.status_code == 200
    body = r.json()
    assert {p["platform"] for p in body["platforms"]} == {"instagram", "x", "facebook", "telegram", "google_play", "app_store", "apk_site"}
    assert body["reference"] == {"type": "brand", "name": "ZentraPay"}
    handles = {x["handle"] for x in body["results"]}
    assert "zentrapay_care_india" in handles and "com.zentrapay.wallet.upi" in handles
    # Official accounts are reported as skipped, never as results
    assert "zentrapay" not in handles
    assert any(o["handle"] == "zentrapay" for o in body["officialSkipped"])
    scores = [x["breakdown"]["score"] for x in body["results"]]
    assert scores == sorted(scores, reverse=True)


def test_search_only_selected_platforms(client):
    body = client.post("/api/search", json={"query": "zentrapay", "platforms": ["instagram", "telegram"]}).json()
    assert {p["platform"] for p in body["platforms"]} == {"instagram", "telegram"}
    assert {x["platform"] for x in body["results"]} <= {"instagram", "telegram"}
    assert body["results"]


def test_search_with_official_url(client):
    body = client.post("/api/search", json={"query": "https://instagram.com/zentrapay", "platforms": ["instagram"]}).json()
    assert body["pastedUrl"] == {"platform": "instagram", "identifier": "zentrapay"}
    assert all(x["handle"] != "zentrapay" for x in body["results"])


def test_search_rejects_unknown_platform(client):
    r = client.post("/api/search", json={"query": "zentrapay", "platforms": ["myspace"]})
    assert r.status_code == 422


def test_search_survives_source_outage(client):
    client.patch("/api/sources/src_x", json={"simulateOutage": True})
    body = client.post("/api/search", json={"query": "zentrapay", "platforms": ["x", "instagram"]}).json()
    status = {p["platform"]: p for p in body["platforms"]}
    assert status["x"]["ok"] is False and status["instagram"]["ok"] is True
    assert body["results"]
    client.patch("/api/sources/src_x", json={"simulateOutage": False})
