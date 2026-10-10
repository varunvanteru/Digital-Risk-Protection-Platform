from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    aliases: Mapped[list] = mapped_column(JSON, default=list)
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    domains: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    logo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    publishers: Mapped[list["Publisher"]] = relationship(back_populates="brand", cascade="all, delete-orphan")
    assets: Mapped[list["OfficialAsset"]] = relationship(back_populates="brand", cascade="all, delete-orphan")


class Publisher(Base):
    __tablename__ = "publishers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    publisher_id: Mapped[str] = mapped_column(String(80), default="")

    brand: Mapped[Brand] = relationship(back_populates="publishers")


class OfficialAsset(Base):
    """Allowlist entry. Matched by canonical identifier, never by display name."""

    __tablename__ = "official_assets"
    __table_args__ = (UniqueConstraint("brand_id", "platform", "identifier", name="uq_asset"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(10))  # social | app
    platform: Mapped[str] = mapped_column(String(20))
    identifier: Mapped[str] = mapped_column(String(160))  # lowercase handle or package / track id
    handle: Mapped[str] = mapped_column(String(160))  # as entered, for display
    canonical_id: Mapped[str] = mapped_column(String(160))
    display_name: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(12), default="official")  # official | partner
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    publisher: Mapped[str | None] = mapped_column(String(120), nullable=True)
    publisher_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)

    brand: Mapped[Brand] = relationship(back_populates="assets")


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    platform: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(10))
    mode: Mapped[str] = mapped_column(String(10))  # live | dataset
    health: Mapped[str] = mapped_column(String(12), default="operational")
    last_success: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    items_last_scan: Mapped[int] = mapped_column(Integer, default=0)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Demo control: force the connector to fail so the UI can show graceful degradation.
    simulate_outage: Mapped[bool] = mapped_column(Boolean, default=False)


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[str] = mapped_column(String(30), primary_key=True)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(12), default="running")  # running | done | failed
    started_at: Mapped[datetime] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    candidates: Mapped[int] = mapped_column(Integer, default=0)
    official_skipped: Mapped[int] = mapped_column(Integer, default=0)
    official_flagged: Mapped[int] = mapped_column(Integer, default=0)
    new_detections: Mapped[int] = mapped_column(Integer, default=0)
    source_status: Mapped[dict] = mapped_column(JSON, default=dict)


class Detection(Base):
    __tablename__ = "detections"
    __table_args__ = (UniqueConstraint("brand_id", "platform", "identifier", name="uq_detection"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    brand_id: Mapped[str] = mapped_column(ForeignKey("brands.id", ondelete="CASCADE"))
    source_id: Mapped[str] = mapped_column(String(30))
    channel: Mapped[str] = mapped_column(String(10))
    platform: Mapped[str] = mapped_column(String(20))
    identifier: Mapped[str] = mapped_column(String(160))
    cls: Mapped[str] = mapped_column(String(20))
    display_name: Mapped[str] = mapped_column(String(200))
    handle: Mapped[str] = mapped_column(String(160))
    url: Mapped[str] = mapped_column(String(500))
    mark: Mapped[str] = mapped_column(String(12), default="unrelated")
    icon_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    audience: Mapped[int] = mapped_column(Integer, default=0)
    created_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    publisher: Mapped[str | None] = mapped_column(String(160), nullable=True)
    publisher_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    links: Mapped[list] = mapped_column(JSON, default=list)
    first_seen: Mapped[datetime] = mapped_column(DateTime)
    last_seen: Mapped[datetime] = mapped_column(DateTime)
    scan_id: Mapped[str] = mapped_column(String(30))
    signals: Mapped[dict] = mapped_column(JSON, default=dict)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    lookalike_domain: Mapped[bool] = mapped_column(Boolean, default=False)
    context_label: Mapped[str | None] = mapped_column(String(12), nullable=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    severity: Mapped[str] = mapped_column(String(10), default="low")
    status: Mapped[str] = mapped_column(String(20), default="open")
    feedback_penalty: Mapped[float] = mapped_column(Float, default=0.0)


class DetectionEvent(Base):
    __tablename__ = "detection_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    detection_id: Mapped[str] = mapped_column(ForeignKey("detections.id", ondelete="CASCADE"))
    at: Mapped[datetime] = mapped_column(DateTime)
    action: Mapped[str] = mapped_column(String(30))
    from_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
