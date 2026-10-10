"""End-to-end tests against MySQL (schema brandshield_test, dropped afterwards)."""

from conftest import wait_for_scan


def test_health_reports_mysql(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "brandshield_test"
    assert body["mysql"].startswith("8.")


def test_first_scan_finds_impersonators_and_never_flags_official(client):
    last = client.get("/api/scans/latest").json()["last"]
    assert last["status"] == "done"
    assert last["officialFlagged"] == 0
    assert last["officialSkipped"] >= 7

    brand = client.get("/api/brand").json()
    official = {(a["platform"], a["handle"].lower()) for a in brand["accounts"]} | {
        (a["platform"], a["packageId"].lower()) for a in brand["apps"]
    }
    dets = client.get("/api/detections").json()
    assert dets, "expected detections from the demo sources"
    assert not {(d["platform"], d["handle"].lower()) for d in dets} & official

    handles = {d["handle"] for d in dets}
    for expected in ("zentrapay_care_india", "zentarpay", "z3ntra.pay_official", "com.zentrapay.wallet.upi"):
        assert expected in handles
    # Ordinary look-alike names are screened out, not stored
    assert "sentra_motors" not in handles and "zentrofoods" not in handles


def test_possibly_official_app_is_reported_not_flagged(client):
    last = client.get("/api/scans/latest").json()["last"]
    assert any(p["packageId"] == "com.zentrapay.business" for p in last["possiblyOfficial"])
    assert all(d["handle"] != "com.zentrapay.business" for d in client.get("/api/detections").json())


def test_scores_are_consistent_with_breakdown(client):
    for d in client.get("/api/detections").json():
        bd = d["breakdown"]
        assert 0 <= bd["score"] <= 100
        assert bd["severity"] in {"critical", "high", "medium", "low"}
        assert d["reasons"]


def test_account_validation(client):
    r = client.post("/api/brand/accounts", json={"platform": "x", "handle": "this_handle_is_far_too_long"})
    assert r.status_code == 422
    assert "X handle" in r.json()["detail"]["message"]
    r = client.post("/api/brand/accounts", json={"platform": "instagram", "handle": "@zentrapay"})
    assert r.status_code == 422  # duplicate


def test_allowlisting_retracts_an_alert(client):
    det = next(d for d in client.get("/api/detections").json() if d["handle"] == "zentrapayy")
    r = client.post("/api/brand/accounts", json={"platform": "instagram", "handle": "zentrapayy"})
    assert r.status_code == 201
    assert det["id"] not in {d["id"] for d in client.get("/api/detections").json()}
    detail = client.get(f"/api/detections/{det['id']}").json()
    assert detail["allowlisted"] is True
    # Undo puts it back under monitoring
    client.delete(f"/api/detections/{det['id']}/allowlist")
    assert det["id"] in {d["id"] for d in client.get("/api/detections").json()}


def test_status_changes_and_false_positive_penalty(client):
    det = next(d for d in client.get("/api/detections").json() if d["status"] == "open" and d["breakdown"]["score"] >= 40)
    before = det["breakdown"]["score"]
    after = client.patch(f"/api/detections/{det['id']}", json={"status": "false_positive"}).json()
    assert after["status"] == "false_positive"
    assert after["breakdown"]["score"] < before
    reopened = client.patch(f"/api/detections/{det['id']}", json={"status": "open"}).json()
    assert reopened["breakdown"]["score"] == before
    assert [e["to"] for e in reopened["events"]][-2:] == ["false_positive", "open"]


def test_status_persists_across_rescans(client):
    det = next(d for d in client.get("/api/detections").json() if d["status"] == "open")
    client.patch(f"/api/detections/{det['id']}", json={"status": "confirmed"})
    scan = client.post("/api/scans").json()
    wait_for_scan(client, scan["id"])
    again = client.get(f"/api/detections/{det['id']}").json()
    assert again["status"] == "confirmed"


def test_source_outage_does_not_stop_a_scan(client):
    client.patch("/api/sources/src_ig", json={"simulateOutage": True})
    scan = client.post("/api/scans").json()
    done = wait_for_scan(client, scan["id"])
    assert done["status"] == "done"
    assert done["sources"]["src_ig"]["ok"] is False
    assert done["sources"]["src_x"]["ok"] is True
    # Last good Instagram results are still listed
    assert any(d["platform"] == "instagram" for d in client.get("/api/detections").json())
    client.patch("/api/sources/src_ig", json={"simulateOutage": False})


def test_quick_check(client):
    r = client.post("/api/check", json={"value": "z3ntra.pay_official"}).json()
    assert r["result"]["verdict"] == "match" and r["official"] is None
    r = client.post("/api/check", json={"value": "@zentrapay"}).json()
    assert r["official"]["status"] == "official"


def test_brand_update_validation(client):
    r = client.put("/api/brand", json={"name": "Z", "description": "short", "accounts": []})
    assert r.status_code == 422


def test_switching_brand_starts_clean_and_restores(client):
    original = client.get("/api/brand").json()
    assert client.get("/api/detections").json()

    r = client.put(
        "/api/brand",
        json={
            "name": "Fourcrest Solutions",
            "aliases": ["Fourcrest"],
            "keywords": ["fourcrest"],
            "domains": ["fourcrestsolutions.in"],
            "description": "Fourcrest Solutions builds software products and digital services for businesses in India.",
            "accounts": [{"platform": "linkedin", "handle": "fourcrest-solutions", "status": "official"}],
            "apps": [],
        },
    )
    assert r.status_code == 200 and r.json()["name"] == "Fourcrest Solutions"
    # Detections and scans of the previous brand are gone
    assert client.get("/api/detections").json() == []
    assert client.get("/api/scans/latest").json()["last"] is None

    # Restore the demo brand for the remaining tests
    body = {
        "name": original["name"],
        "aliases": [a for a in original["aliases"] if a != original["name"]],
        "keywords": original["keywords"],
        "domains": original["domains"],
        "description": original["description"],
        "publisher": original["publishers"][0]["name"],
        "accounts": [{"platform": a["platform"], "handle": a["handle"], "status": a["status"], "verified": a["verified"]} for a in original["accounts"]],
        "apps": [{"platform": a["platform"], "packageId": a["packageId"], "name": a["name"], "publisherId": a["publisherId"]} for a in original["apps"]],
    }
    assert client.put("/api/brand", json=body).status_code == 200
    scan = client.post("/api/scans").json()
    from conftest import wait_for_scan

    assert wait_for_scan(client, scan["id"])["officialFlagged"] == 0
    assert client.get("/api/detections").json()