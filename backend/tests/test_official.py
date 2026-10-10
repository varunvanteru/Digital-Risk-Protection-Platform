"""
Allowlist-first regression tests: official assets are verified before scoring and
never flagged; impersonation is still detected. No brand-specific code is involved:
each brand is just a profile.
"""

import json
from datetime import date

import pytest

from app.config import settings
from app.connectors.base import Candidate
from app.demo_assets import _variant, ensure_avatar
from app.detection import signals as signals_mod
from app.detection.lookalike import analyse_name
from app.detection.official import normalize_publisher, package_namespace
from app.detection.signals import BrandContext, evaluate
from app.evaluation import _context

TODAY = date(2026, 10, 10)


@pytest.fixture(scope="module")
def profiles():
    with open(settings.data_dir / "labelled_cases.json", encoding="utf-8") as f:
        data = json.load(f)
    return {b["name"]: _context(b) for b in data["brands"]}


def app(handle, title, publisher=None, publisher_id=None, bio="", platform="google_play", **kw):
    return Candidate(
        source_id="t", channel="app", platform=platform, identifier=handle.lower(), handle=handle, display_name=title,
        url="", bio=bio, publisher=publisher, publisher_id=publisher_id, **kw,
    )


def social(handle, name, bio="", platform="instagram", **kw):
    return Candidate(source_id="t", channel="social", platform=platform, identifier=handle.lower(), handle=handle,
                     display_name=name, url="", bio=bio, **kw)


def flagged(ev):
    return not ev.excluded and ev.breakdown.severity in {"critical", "high", "medium"}


# ---- publisher normalisation (generic) ----

@pytest.mark.parametrize("name", ["PhonePe Private Limited", "PHONEPE PRIVATE LIMITED", "PhonePe Pvt. Ltd.", "PhonePe Pvt Ltd", "PhonePe"])
def test_publisher_variants_normalise_alike(name):
    assert normalize_publisher(name) == "phonepe"


def test_meaningful_publisher_words_are_kept():
    assert normalize_publisher("ZentraPay Technologies Pvt Ltd") == "zentrapay technologies"
    assert normalize_publisher("HDFC Bank Ltd.") == "hdfc bank"


def test_package_namespace():
    assert package_namespace("com.phonepe.app.business") == "com.phonepe"
    assert package_namespace("in.co.example.app") == "in.co.example"


# ---- TEST 1: official app ID ----

def test_1_official_app_id_is_official(profiles):
    ev = evaluate(app("com.phonepe.app", "PhonePe UPI, Payment, Recharge", "PhonePe", "TEST-PLAY-DEV-PHONEPE"), profiles["PhonePe"], TODAY)
    assert ev.status == "OFFICIAL" and ev.official.level == 1 and ev.breakdown is None


# ---- TEST 2: official publisher + official metadata ----

def test_2_official_publisher_and_metadata(profiles):
    ev = evaluate(app("com.phonepe.insurance", "PhonePe Insurance", "PhonePe Pvt. Ltd.", None), profiles["PhonePe"], TODAY)
    assert ev.status in {"OFFICIAL", "LIKELY_OFFICIAL"}
    assert ev.excluded


# ---- TEST 3: official variant (same developer account) ----

def test_3_official_variant_same_developer(profiles):
    ev = evaluate(app("com.phonepe.stockbroking", "PhonePe Invest (Share.Market)", "PhonePe", "TEST-PLAY-DEV-PHONEPE",
                      bio="Invest in stocks. Read reviews."), profiles["PhonePe"], TODAY)
    assert ev.status == "OFFICIAL" and ev.official.level == 3


# ---- TEST 4: fake app with a similar name ----

def test_4_fake_similar_name(profiles):
    ev = evaluate(app("com.quickhelp.phonepay.refund", "Phone Pe Refund Help", "QuickHelp Apps", "4440009998887776",
                      bio="Share your UPI PIN with our agent to reverse it.", created_on=date(2026, 9, 20), audience=1000),
                  profiles["PhonePe"], TODAY)
    assert flagged(ev) and ev.status in {"SUSPICIOUS", "LOOKALIKE"}


# ---- TEST 5: fake app with a similar icon ----

def test_5_fake_similar_icon(profiles):
    ctx = profiles["ZentraPay"]
    image = ensure_avatar("copy", "test-icon-copy", "x")
    ev = evaluate(app("com.example.payfast", "PayFast Wallet", "PayFast Ltd", "123", image=image,
                      bio="ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app."),
                  ctx, TODAY)
    assert ev.signals["logo"] >= 0.9
    assert flagged(ev)


# ---- TEST 6: customer-care keywords ----

def test_6_customer_care_keywords(profiles):
    ev = evaluate(app("com.fastsupport.phonepecare", "PhonePe Customer Care - Fast Support", "Fast Support Apps", "555",
                      bio="Get the PhonePe customer care number and helpline support instantly. Toll free number for refunds.",
                      created_on=date(2026, 9, 25), audience=500), profiles["PhonePe"], TODAY)
    assert flagged(ev) and ev.status == "SUSPICIOUS"
    assert ev.checks["publisherMatch"] is False


# ---- TEST 7: unrelated app that mentions the brand ----

def test_7_mention_is_not_flagged(profiles):
    ev = evaluate(app("com.fincompare.upicompare", "Compare PhonePe Payments", "FinCompare Labs", "333",
                      bio="Compare UPI apps like PhonePe, Google Pay and Paytm side by side. Not affiliated with any payment provider.",
                      created_on=date(2023, 4, 2), audience=50000), profiles["PhonePe"], TODAY)
    assert not flagged(ev) and ev.status == "MENTION"


# ---- TESTS 8 and 9: homoglyph and leetspeak ----

def test_8_unicode_homoglyph_is_lookalike():
    assert analyse_name("PhonеPe", ["PhonePe"]).verdict == "match"  # Cyrillic e


def test_9_leetspeak_is_lookalike():
    assert analyse_name("Ph0nePe", ["PhonePe"]).verdict == "match"


# ---- TEST 10: official app containing the brand name ----

def test_10_official_app_with_brand_in_title_is_not_flagged(profiles):
    """The exact reported case: 'PhonePe Business: Merchant App' scored 75 / High before the fix."""
    ev = evaluate(app("id1463742453", "PhonePe Business: Merchant App", "PHONEPE PRIVATE LIMITED", "TEST-APPLE-PHONEPE",
                      platform="app_store", bio="Accept payments. 24x7 support. Verified settlements.",
                      links=["https://www.phonepe.com/business-solutions"]), profiles["PhonePe"], TODAY)
    assert ev.excluded and ev.status == "OFFICIAL"


def test_10b_unregistered_brand_is_not_treated_as_wrong_publisher():
    """With nothing known to be official, 'unknown publisher' must not count as 'different publisher'."""
    blank = BrandContext(brand_id="adhoc", name="PhonePe", aliases=["PhonePe"], domains=[], description="", logo_ref=None,
                         publisher_ids=set(), publisher_names=set(), allowlist=set())
    ev = evaluate(app("id1463742453", "PhonePe Business: Merchant App", "PHONEPE PRIVATE LIMITED", "1",
                      platform="app_store", bio="Accept payments. 24x7 support. Verified settlements.",
                      links=["https://www.phonepe.com/business-solutions"]), blank, TODAY)
    assert ev.signals["publisher"] == 0.0
    assert ev.signals["claims"] < 0.5
    assert not ev.lookalike_domain
    assert not flagged(ev)


# ---- TESTS 11 and 12: social handles ----

def test_11_official_social_handle(profiles):
    ev = evaluate(social("phonepe", "PhonePe", "Official PhonePe account."), profiles["PhonePe"], TODAY)
    assert ev.status == "OFFICIAL"


def test_12_fake_social_handle(profiles):
    ev = evaluate(social("phonepe_support_help", "PhonePe Customer Support",
                         "Official PhonePe helpline. Share your registered number and OTP to get your refund. wa.me/919900112233",
                         links=["wa.me/919900112233", "phonepe-refund.in"], created_on=date(2026, 10, 6), audience=85),
                  profiles["PhonePe"], TODAY)
    assert flagged(ev) and ev.breakdown.severity == "critical"


# ---- TEST 13: official assets never reach scoring ----

def test_13_official_never_enters_scoring(profiles, monkeypatch):
    def boom(*a, **kw):
        raise AssertionError("risk scoring called for an official asset")

    monkeypatch.setattr(signals_mod, "score_detection", boom)
    for c in [
        app("com.phonepe.app", "PhonePe", "PhonePe", "TEST-PLAY-DEV-PHONEPE"),
        app("com.phonepe.app.business", "PhonePe Business", "PhonePe", "TEST-PLAY-DEV-PHONEPE"),
        social("phonepe", "PhonePe"),
    ]:
        assert evaluate(c, profiles["PhonePe"], TODAY).excluded


def test_copied_publisher_name_with_different_developer_is_fraud(profiles):
    ev = evaluate(app("com.phonepe.kyc.verify", "PhonePe KYC Verify", "PhonePe Private Limited", "9990001112223334",
                      bio="Complete your PhonePe KYC to avoid account block. Enter the OTP you receive to verify.",
                      created_on=date(2026, 10, 3), audience=100), profiles["PhonePe"], TODAY)
    assert not ev.excluded and flagged(ev)
    assert any("different developer account" in r for r in ev.reasons)


# ---- TEST 14: source unavailable -> cache, labelled as cached ----

def test_14_live_source_falls_back_to_cache(client, monkeypatch):
    from app.models import Source
    from app.services import scan as scan_mod

    class Flaky:
        source_id = "src_play"
        fail = False

        def fetch(self, keywords):
            if self.fail:
                raise ConnectionError("store unreachable")
            return [app("com.cached.example", "Cached Example", "X", "1")]

    flaky = Flaky()
    monkeypatch.setitem(scan_mod.CONNECTORS, "src_play", flaky)
    src = Source(id="src_play", name="Google Play", platform="google_play", channel="app", mode="live", simulate_outage=False)

    items, latency, _, cached_at = scan_mod._fetch_with_retries(src, ["cachetest"])
    assert cached_at is None and scan_mod.source_state(src, True, cached_at) == "live"

    flaky.fail = True
    items, latency, _, cached_at = scan_mod._fetch_with_retries(src, ["cachetest"])
    assert cached_at is not None and latency is None
    assert [c.identifier for c in items] == ["com.cached.example"]
    assert scan_mod.source_state(src, True, cached_at) == "cached"  # never reported as live


def test_simulated_sources_are_never_called_live(client):
    for s in client.get("/api/sources").json():
        if s["mode"] == "dataset":
            assert s["state"] in {"simulated", "down"}


# ---- accuracy gate ----

def test_accuracy_panel_official_assets_never_flagged(client):
    r = client.get("/api/accuracy").json()
    assert r["officialTested"] >= 15
    assert r["officialFlagged"] == 0
    assert r["officialRecognised"] == r["officialTested"]
    assert r["mentionsFlagged"] == 0
    assert r["precision"] >= 0.95 and r["recall"] >= 0.85
