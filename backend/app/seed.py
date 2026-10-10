"""First-run data: the source registry and the demo brand profile."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .demo_assets import ensure_brand_logo
from .models import Brand, OfficialAsset, Publisher, Source
from .services.scan import utcnow

SOURCES = [
    # id, name, platform, channel, mode
    ("src_play", "Google Play", "google_play", "app", "live"),
    ("src_appstore", "Apple App Store", "app_store", "app", "live"),
    ("src_store_demo", "Store snapshot (demo brand)", "google_play", "app", "dataset"),
    ("src_apk", "APK mirror sites", "apk_site", "app", "dataset"),
    ("src_ig", "Instagram", "instagram", "social", "dataset"),
    ("src_x", "X", "x", "social", "dataset"),
    ("src_fb", "Facebook Pages", "facebook", "social", "dataset"),
    ("src_tg", "Telegram", "telegram", "social", "dataset"),
]

DEMO_BRAND_ID = "brd_zentrapay"


def seed(db: Session) -> None:
    for sid, name, platform, channel, mode in SOURCES:
        if db.get(Source, sid) is None:
            db.add(Source(id=sid, name=name, platform=platform, channel=channel, mode=mode, health="operational", items_last_scan=0))

    if db.scalar(select(Brand.id).limit(1)) is None:
        now = utcnow()
        brand = Brand(
            id=DEMO_BRAND_ID,
            name="ZentraPay",
            aliases=["Zentra", "Zentra Pay"],
            keywords=["zentra", "zpay"],
            domains=["zentrapay.com", "zentrapay.in"],
            description=(
                "ZentraPay lets you pay bills, send money over UPI and manage cards in one secure app. "
                "Trusted by over 2 crore Indians. ZentraPay will never ask for your OTP, PIN or password."
            ),
            logo_path=ensure_brand_logo(DEMO_BRAND_ID),
            updated_at=now,
        )
        brand.publishers = [Publisher(name="ZentraPay Technologies Pvt Ltd", publisher_id="8174492036215501734")]
        social = [
            ("instagram", "zentrapay", "ig:48213377102", "ZentraPay", "official", True),
            ("x", "ZentraPay", "x:1452208813", "ZentraPay", "official", True),
            ("facebook", "zentrapay", "fb:102938475610", "ZentraPay", "official", True),
            ("telegram", "zentrapay_official", "tg:-1001788234", "ZentraPay Updates", "official", False),
            ("instagram", "zentrapay_partner_mumbai", "ig:59011283377", "ZentraPay Partner, Mumbai", "partner", False),
        ]
        apps = [
            ("google_play", "com.zentrapay.app", "ZentraPay: UPI, Bills & Cards", "8174492036215501734"),
            ("app_store", "id1234567890", "ZentraPay", "1588120034"),
        ]
        brand.assets = [
            OfficialAsset(kind="social", platform=p, identifier=h.lower(), handle=h, canonical_id=cid, display_name=dn, status=st, verified=v, created_at=now)
            for p, h, cid, dn, st, v in social
        ] + [
            OfficialAsset(
                kind="app", platform=p, identifier=pkg.lower(), handle=pkg, canonical_id=f"{p}:{pkg}", display_name=n,
                status="official", verified=True, publisher="ZentraPay Technologies Pvt Ltd", publisher_id=pid, created_at=now,
            )
            for p, pkg, n, pid in apps
        ]
        db.add(brand)
    db.commit()
