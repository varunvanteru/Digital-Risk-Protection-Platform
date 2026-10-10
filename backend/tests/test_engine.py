"""Unit tests for the detection engine. No database or network."""

from datetime import date
from types import SimpleNamespace

import pytest

from app.demo_assets import _variant, draw_logo
from app.detection import images
from app.detection.lookalike import analyse_name, name_similarity
from app.detection.scoring import score_detection, severity_of
from app.detection.text import behaviour_signal, claims_signal, context_label, is_lookalike_domain, text_similarity

ALIASES = ["ZentraPay", "Zentra", "Zentra Pay"]


@pytest.mark.parametrize(
    "name, verdict, variation",
    [
        ("z3ntra.pay_official", "match", "Homoglyph / leetspeak"),
        ("zentrapay_support_india", "match", "Added words"),
        ("zentra.pay", "match", "Spacing / separators"),
        ("zentarpay", "match", "Character swap"),
        ("zentrapayy", "match", "Missing / doubled letter"),
        ("zentrаpay", "match", "Homoglyph / leetspeak"),  # Cyrillic a
        ("instagram.com/zentrapay_care_india", "match", "Added words"),
    ],
)
def test_lookalikes_are_caught(name, verdict, variation):
    r = analyse_name(name, ALIASES)
    assert r.verdict == verdict
    assert variation in r.variations


@pytest.mark.parametrize("name", ["Zentro Foods", "sentra", "paytm", "chai_and_code"])
def test_ordinary_names_are_not_flagged(name):
    assert analyse_name(name, ALIASES).verdict == "no_match"


def test_unrelated_words_are_only_partial():
    r = analyse_name("zentrafitness", ALIASES)
    assert r.verdict == "partial"
    assert r.guards


def test_brand_inside_long_app_title():
    score, r = name_similarity(["ZentraPay Wallet - UPI & Bills"], ALIASES)
    assert score == 0.85
    assert "inside a longer name" in r.method


def test_severity_bands():
    assert [severity_of(s) for s in (80, 79, 60, 59, 40, 39)] == ["critical", "high", "high", "medium", "medium", "low"]


def test_single_strong_signal_is_capped_low():
    # Uncapped this would be 55: one strong signal plus several middling ones.
    bd = score_detection("social", {"name": 1.0, "logo": 0.45, "claims": 0.45, "behaviour": 0.35})
    assert bd.score == 39 and bd.cap


def test_brand_lookalike_with_scam_behaviour_is_flagged():
    # e.g. "Zentra Rewards: spin and win cashback" from a 2-week-old account
    bd = score_detection("social", {"name": 0.95, "logo": 0.07, "behaviour": 0.4})
    assert bd.severity == "medium"
    assert "Brand look-alike name with scam behaviour" in {b["label"] for b in bd.boosts}
    # ... but an openly labelled fan or news account is still capped
    assert score_detection("social", {"name": 0.95, "behaviour": 0.4}, context_label="fan").score == 39


def test_publisher_mismatch_alone_does_not_lift_a_name_match():
    bd = score_detection("app", {"name": 0.85, "publisher": 1.0, "logo": 0.2})
    assert bd.severity == "low"


def test_fan_label_caps_score():
    bd = score_detection("social", {"name": 0.95, "logo": 0.99, "text": 0.6}, context_label="fan")
    assert bd.score == 39


def test_boosts_apply():
    bd = score_detection("social", {"name": 0.9, "logo": 0.9, "claims": 0.8, "behaviour": 0.9}, lookalike_domain=True)
    labels = {b["label"] for b in bd.boosts}
    assert "Links to a look-alike of an official domain" in labels
    assert bd.score == 100


def test_text_similarity_spots_copied_description():
    official = "ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app."
    assert text_similarity(official.replace("ZentraPay", "ZentraPay Wallet"), official) > 0.7
    assert text_similarity("Home workouts and diet plans.", official) < 0.1


def test_claims_and_context():
    score, hits = claims_signal("ZentraPay Care", "Official helpline 24x7", verified=False)
    assert score >= 0.9 and "official" in hits
    assert claims_signal("ZentraPay", "Official account", verified=True)[0] == 0
    assert context_label("Unofficial fan page, not affiliated") == "fan"


def test_scam_behaviour():
    score, reasons, lookalike = behaviour_signal(
        "DM your registered number and OTP for an instant refund. wa.me/9198",
        ["zentrapay-refund.xyz"],
        date(2026, 10, 4),
        112,
        date(2026, 10, 10),
        ["zentrapay.com", "zentrapay.in"],
        ["zentrapay", "zentra"],
    )
    assert score >= 0.8
    assert lookalike
    assert any("days old" in r for r in reasons)


def test_lookalike_domains():
    official = ["zentrapay.com", "zentrapay.in"]
    assert is_lookalike_domain("zentrapaay.in", official, ["zentrapay"])
    assert not is_lookalike_domain("zentrapay.in", official, ["zentrapay"])
    assert not is_lookalike_domain("anydesk.com", official, ["zentrapay"])


def test_logo_similarity_on_pixels(tmp_path, monkeypatch):
    monkeypatch.setattr(images, "settings", SimpleNamespace(media_dir=tmp_path, source_timeout_s=5))
    for name, img in {
        "official": draw_logo(),
        "copy": _variant("copy", "x"),
        "mirror": _variant("mirror", "x"),
        "other": _variant("unrelated", "Chai and Code"),
    }.items():
        img.save(tmp_path / f"{name}.png")
    images._cached.cache_clear()
    copy = images.compare("/media/official.png", "/media/copy.png")
    mirror = images.compare("/media/official.png", "/media/mirror.png")
    other = images.compare("/media/official.png", "/media/other.png")
    assert copy.score >= 0.9 and copy.kind == "copy"
    assert mirror.score >= 0.9 and mirror.kind == "mirror"
    assert other.score < 0.5
    images._cached.cache_clear()


# Real Indian brands that are commonly impersonated; found in manual testing.
REAL_BRANDS = {
    "PhonePe": ["PhonePe", "Phone Pe"],
    "Paytm": ["Paytm"],
    "Flipkart": ["Flipkart"],
    "Swiggy": ["Swiggy"],
    "Zomato": ["Zomato"],
    "IRCTC": ["IRCTC", "IRCTC Rail Connect"],
    "SBI": ["SBI", "YONO", "YONO SBI", "State Bank of India"],
}


@pytest.mark.parametrize(
    "brand, name",
    [
        ("PhonePe", "ph0nepe"), ("PhonePe", "phonepe_support_india"), ("PhonePe", "phonpe"),
        ("Paytm", "paytrn"), ("Paytm", "pay.tm"), ("Paytm", "paytym"),
        ("Flipkart", "fl1pkart"), ("Flipkart", "flipkart.offers"), ("Flipkart", "filpkart"),
        ("Swiggy", "swigy"), ("Zomato", "zomato_refunds"), ("Zomato", "z0mato"),
        ("IRCTC", "irctc_helpline"), ("IRCTC", "irtc"),
        ("SBI", "yono_sbi_kyc"), ("SBI", "sbi.customer.care"), ("SBI", "statebankofindia_help"),
    ],
)
def test_real_brand_lookalikes_are_caught(brand, name):
    assert analyse_name(name, REAL_BRANDS[brand]).verdict == "match"


@pytest.mark.parametrize(
    "brand, name",
    [("PhonePe", "phone"), ("PhonePe", "iphone"), ("Zomato", "tomato"), ("Swiggy", "swing"),
     ("Flipkart", "flipboard"), ("Paytm", "paytime"), ("SBI", "yoga"), ("IRCTC", "ircon")],
)
def test_ordinary_words_are_not_flagged_for_real_brands(brand, name):
    assert analyse_name(name, REAL_BRANDS[brand]).verdict == "no_match"