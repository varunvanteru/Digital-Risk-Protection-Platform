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
    ("src_store_demo", "Store snapshot (simulated)", "google_play", "app", "dataset"),
    ("src_apk", "APK mirror sites", "apk_site", "app", "dataset"),
    ("src_ig", "Instagram", "instagram", "social", "dataset"),
    ("src_x", "X", "x", "social", "dataset"),
    ("src_fb", "Facebook Pages", "facebook", "social", "dataset"),
    ("src_tg", "Telegram", "telegram", "social", "dataset"),
    ("src_wa", "WhatsApp Channels", "whatsapp", "social", "dataset"),
    ("src_threads", "Threads", "threads", "social", "dataset"),
    ("src_li", "LinkedIn", "linkedin", "social", "dataset"),
    ("src_snap", "Snapchat", "snapchat", "social", "dataset"),
    ("src_yt", "YouTube", "youtube", "social", "dataset"),
    ("src_sc", "ShareChat", "sharechat", "social", "dataset"),
    ("src_moj", "Moj", "moj", "social", "dataset"),
    ("src_josh", "Josh", "josh", "social", "dataset"),
    ("src_pin", "Pinterest", "pinterest", "social", "dataset"),
    ("src_reddit", "Reddit", "reddit", "social", "dataset"),
    ("src_quora", "Quora", "quora", "social", "dataset"),
    ("src_discord", "Discord", "discord", "social", "dataset"),
]

DEMO_BRAND_ID = "brd_zentrapay"


def seed(db: Session) -> None:
    for sid, name, platform, channel, mode in SOURCES:
        src = db.get(Source, sid)
        if src is None:
            db.add(Source(id=sid, name=name, platform=platform, channel=channel, mode=mode, health="operational", items_last_scan=0))
        else:
            src.name, src.mode = name, mode

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
            is_active=True,
            updated_at=now,
        )
        brand.publishers = [Publisher(name="ZentraPay Technologies Pvt Ltd", publisher_id="8174492036215501734")]
        social = [
            ("instagram", "zentrapay", "ig:48213377102", "ZentraPay", "official", True),
            ("x", "ZentraPay", "x:1452208813", "ZentraPay", "official", True),
            ("facebook", "zentrapay", "fb:102938475610", "ZentraPay", "official", True),
            ("telegram", "zentrapay_official", "tg:-1001788234", "ZentraPay Updates", "official", False),
            ("instagram", "zentrapay_partner_mumbai", "ig:59011283377", "ZentraPay Partner, Mumbai", "partner", False),
            ("youtube", "zentrapay", "yt:UCzentrapay", "ZentraPay", "official", True),
            ("linkedin", "zentrapay", "li:zentrapay", "ZentraPay", "official", True),
            ("whatsapp", "0029VaZentraPay01", "wa:0029VaZentraPay01", "ZentraPay", "official", True),
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
    db.flush()

    seed_phonepe_demo(db)

    # Exactly one active brand.
    brands = db.scalars(select(Brand).order_by(Brand.updated_at.desc())).all()
    if brands and not any(b.is_active for b in brands):
        (next((b for b in brands if b.id == DEMO_BRAND_ID), brands[0])).is_active = True
    db.commit()


PHONEPE_ID = "brd_phonepe"


def seed_phonepe_demo(db: Session) -> None:
    """
    A real-brand demo profile, entered the way a customer would: the main app on each
    store and the publisher name, nothing else. Variants (business, investing apps)
    are NOT listed; the engine must find them through store validation.
    """
    if db.scalar(select(Brand.id).where(Brand.name == "PhonePe")) is not None:
        return
    now = utcnow()
    brand = Brand(
        id=PHONEPE_ID,
        name="PhonePe",
        legal_name="PhonePe Private Limited",
        aliases=["Phone Pe"],
        keywords=["phonepe"],
        domains=["phonepe.com"],
        description=(
            "PhonePe is a digital payments app for UPI money transfers, bill payments, mobile recharges, "
            "insurance and investments. PhonePe never asks for your UPI PIN or OTP."
        ),
        logo_path=None,  # filled from the verified official app icon on first validation
        is_active=False,
        updated_at=now,
    )
    brand.publishers = [Publisher(name="PhonePe Private Limited", publisher_id="", aliases=["PhonePe"])]
    brand.assets = [
        OfficialAsset(kind="app", platform="google_play", identifier="com.phonepe.app", handle="com.phonepe.app",
                      canonical_id="google_play:com.phonepe.app", display_name="PhonePe", status="official",
                      verified=True, publisher="PhonePe Private Limited", created_at=now),
        OfficialAsset(kind="app", platform="app_store", identifier="id1170055821", handle="id1170055821",
                      canonical_id="app_store:id1170055821", display_name="PhonePe", status="official",
                      verified=True, publisher="PhonePe Private Limited", created_at=now),
    ]
    db.add(brand)
    db.flush()
