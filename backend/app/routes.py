from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .detection.lookalike import analyse_name
from .detection.scoring import score_detection
from .models import Brand, Detection, DetectionEvent, OfficialAsset, Publisher, Scan, Source
from .serializers import brand_out, detection_out, scan_out, source_out
from .services.scan import brand_context, is_scanning, start_scan, utcnow
from .services.search import PLATFORMS, run_search
from .validation import app_id_error, clean_handle, domain_error, handle_error, name_error

router = APIRouter(prefix="/api")

Status = Literal["open", "confirmed", "takedown_requested", "false_positive", "official"]
FALSE_POSITIVE_PENALTY = 0.15


def current_brand(db: Session) -> Brand:
    brand = db.scalar(select(Brand).order_by(Brand.updated_at.desc()).limit(1))
    if brand is None:
        raise HTTPException(404, "No brand profile yet. Complete the setup wizard.")
    return brand


def bad_request(field: str, message: str):
    raise HTTPException(422, {"field": field, "message": message})


# ---------- health ----------


@router.get("/health")
def health(db: Session = Depends(get_db)):
    version = db.execute(text("SELECT VERSION()")).scalar()
    return {"status": "ok", "database": settings.mysql_db, "mysql": version}


# ---------- brand profile ----------


@router.get("/brand")
def get_brand(db: Session = Depends(get_db)):
    return brand_out(current_brand(db))


class AccountIn(BaseModel):
    platform: str
    handle: str
    status: Literal["official", "partner"] = "official"
    displayName: str | None = None
    verified: bool = False


class AppIn(BaseModel):
    platform: Literal["google_play", "app_store"]
    packageId: str
    name: str | None = None
    publisher: str | None = None
    publisherId: str | None = None


class BrandIn(BaseModel):
    name: str
    aliases: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    domains: list[str] = Field(default_factory=list)
    description: str
    publisher: str | None = None
    accounts: list[AccountIn] = Field(default_factory=list)
    apps: list[AppIn] = Field(default_factory=list)


def _social_asset(brand: Brand, a: AccountIn) -> OfficialAsset:
    handle = clean_handle(a.handle)
    if err := handle_error(a.platform, handle):
        bad_request("handle", err)
    return OfficialAsset(
        brand_id=brand.id, kind="social", platform=a.platform, identifier=handle.lower(), handle=handle,
        canonical_id=f"{a.platform}:{handle.lower()}", display_name=a.displayName or brand.name,
        status=a.status, verified=a.verified, created_at=utcnow(),
    )


def _app_asset(brand: Brand, a: AppIn, publisher: str | None) -> OfficialAsset:
    pkg = a.packageId.strip()
    if err := app_id_error(a.platform, pkg):
        bad_request("packageId", err)
    return OfficialAsset(
        brand_id=brand.id, kind="app", platform=a.platform, identifier=pkg.lower(), handle=pkg,
        canonical_id=f"{a.platform}:{pkg}", display_name=a.name or brand.name, status="official", verified=True,
        publisher=a.publisher or publisher, publisher_id=a.publisherId, created_at=utcnow(),
    )


@router.put("/brand")
def put_brand(body: BrandIn, db: Session = Depends(get_db)):
    if err := name_error(body.name):
        bad_request("name", err)
    if len(body.description.strip()) < 50:
        bad_request("description", "Add at least 50 characters")
    for d in body.domains:
        if err := domain_error(d):
            bad_request("domains", err)
    if not body.accounts and not body.apps:
        bad_request("assets", "Add at least one official account or app")
    if body.apps and not (body.publisher or "").strip():
        bad_request("publisher", "Required when apps are listed")

    brand = current_brand(db)
    brand.name = body.name.strip()
    brand.aliases = [a.strip() for a in body.aliases if a.strip() and a.strip() != brand.name]
    brand.keywords = [k.strip() for k in body.keywords if k.strip()]
    brand.domains = [d.strip().lower() for d in body.domains]
    brand.description = body.description.strip()
    brand.updated_at = utcnow()
    if body.publisher:
        if brand.publishers:
            brand.publishers[0].name = body.publisher.strip()
        else:
            brand.publishers.append(Publisher(name=body.publisher.strip(), publisher_id=""))

    seen: set[tuple[str, str]] = set()
    assets = []
    for a in body.accounts:
        asset = _social_asset(brand, a)
        if (asset.platform, asset.identifier) not in seen:
            seen.add((asset.platform, asset.identifier))
            assets.append(asset)
    for a in body.apps:
        asset = _app_asset(brand, a, body.publisher)
        if (asset.platform, asset.identifier) not in seen:
            seen.add((asset.platform, asset.identifier))
            assets.append(asset)
    brand.assets.clear()
    db.flush()
    brand.assets.extend(assets)
    db.commit()
    db.refresh(brand)
    return brand_out(brand)


@router.post("/brand/logo")
async def upload_logo(file: UploadFile = File(...), db: Session = Depends(get_db)):
    from io import BytesIO

    from PIL import Image

    if file.content_type not in ("image/png", "image/jpeg"):
        bad_request("logo", "Use a PNG or JPG file")
    raw = await file.read()
    try:
        img = Image.open(BytesIO(raw))
    except Exception:
        bad_request("logo", "This file is not a readable image")
    if img.width < 64 or img.height < 64:
        bad_request("logo", f"Image is {img.width}×{img.height} px. Use at least 64×64 px.")
    brand = current_brand(db)
    path = settings.media_dir / "brand" / f"{brand.id}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGBA").save(path)
    brand.logo_path = f"/media/brand/{brand.id}.png"
    brand.updated_at = utcnow()
    db.commit()
    from .detection.images import _cached

    _cached.cache_clear()
    return brand_out(brand)


@router.post("/brand/accounts", status_code=201)
def add_account(body: AccountIn, db: Session = Depends(get_db)):
    brand = current_brand(db)
    asset = _social_asset(brand, body)
    db.add(asset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        bad_request("handle", "This account is already in the profile")
    _retract_alerts(db, brand.id, asset.platform, asset.identifier)
    db.refresh(brand)
    return brand_out(brand)


@router.delete("/brand/accounts/{asset_id}")
def delete_account(asset_id: int, db: Session = Depends(get_db)):
    brand = current_brand(db)
    asset = db.get(OfficialAsset, asset_id)
    if asset is None or asset.brand_id != brand.id:
        raise HTTPException(404, "Asset not found")
    db.delete(asset)
    # An asset removed from the allowlist is monitored again.
    det = db.scalar(select(Detection).where(Detection.brand_id == brand.id, Detection.platform == asset.platform, Detection.identifier == asset.identifier))
    if det and det.status == "official":
        det.status = "open"
    db.commit()
    db.refresh(brand)
    return brand_out(brand)


@router.post("/brand/apps", status_code=201)
def add_app(body: AppIn, db: Session = Depends(get_db)):
    brand = current_brand(db)
    asset = _app_asset(brand, body, brand.publishers[0].name if brand.publishers else None)
    db.add(asset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        bad_request("packageId", "This app is already in the profile")
    _retract_alerts(db, brand.id, asset.platform, asset.identifier)
    db.refresh(brand)
    return brand_out(brand)


def _retract_alerts(db: Session, brand_id: str, platform: str, identifier: str) -> None:
    det = db.scalar(select(Detection).where(Detection.brand_id == brand_id, Detection.platform == platform, Detection.identifier == identifier))
    if det:
        db.add(DetectionEvent(detection_id=det.id, at=utcnow(), action="allowlisted", from_status=det.status, to_status="official"))
        det.status = "official"
        db.commit()


# ---------- detections ----------


@router.get("/detections")
def list_detections(db: Session = Depends(get_db)):
    brand = current_brand(db)
    allow = brand_context(db, brand).allowlist
    rows = db.scalars(select(Detection).where(Detection.brand_id == brand.id)).all()
    out = [detection_out(d) for d in rows if (d.platform, d.identifier) not in allow and d.status != "official"]
    out.sort(key=lambda d: d["breakdown"]["score"], reverse=True)
    return out


@router.get("/detections/{det_id}")
def get_detection(det_id: str, db: Session = Depends(get_db)):
    brand = current_brand(db)
    d = db.get(Detection, det_id)
    if d is None or d.brand_id != brand.id:
        raise HTTPException(404, "Detection not found")
    allow = brand_context(db, brand).allowlist
    events = db.scalars(select(DetectionEvent).where(DetectionEvent.detection_id == d.id).order_by(DetectionEvent.at)).all()
    asset_id = db.scalar(
        select(OfficialAsset.id).where(OfficialAsset.brand_id == brand.id, OfficialAsset.platform == d.platform, OfficialAsset.identifier == d.identifier)
    )
    return {
        **detection_out(d),
        "allowlisted": (d.platform, d.identifier) in allow,
        "allowlistAssetId": asset_id,
        "events": [{"at": e.at.isoformat() + "Z", "action": e.action, "from": e.from_status, "to": e.to_status} for e in events],
    }


class StatusIn(BaseModel):
    status: Status


@router.patch("/detections/{det_id}")
def set_status(det_id: str, body: StatusIn, db: Session = Depends(get_db)):
    brand = current_brand(db)
    d = db.get(Detection, det_id)
    if d is None or d.brand_id != brand.id:
        raise HTTPException(404, "Detection not found")
    prev = d.status
    if body.status == "official":
        # Analyst says it is genuinely ours: add to the allowlist (Gate 1 and 2 skip it from now on).
        if d.channel == "social" and d.platform in ("instagram", "x", "facebook", "telegram"):
            exists = db.scalar(select(OfficialAsset.id).where(OfficialAsset.brand_id == brand.id, OfficialAsset.platform == d.platform, OfficialAsset.identifier == d.identifier))
            if not exists:
                db.add(OfficialAsset(brand_id=brand.id, kind="social", platform=d.platform, identifier=d.identifier, handle=d.handle,
                                     canonical_id=f"{d.platform}:{d.identifier}", display_name=d.display_name, status="official", verified=False, created_at=utcnow()))
        elif d.channel == "app" and d.platform in ("google_play", "app_store"):
            exists = db.scalar(select(OfficialAsset.id).where(OfficialAsset.brand_id == brand.id, OfficialAsset.platform == d.platform, OfficialAsset.identifier == d.identifier))
            if not exists:
                db.add(OfficialAsset(brand_id=brand.id, kind="app", platform=d.platform, identifier=d.identifier, handle=d.handle,
                                     canonical_id=f"{d.platform}:{d.handle}", display_name=d.display_name, status="official", verified=False,
                                     publisher=d.publisher, publisher_id=d.publisher_id, created_at=utcnow()))
    if body.status == "false_positive":
        d.feedback_penalty = FALSE_POSITIVE_PENALTY
    elif prev == "false_positive":
        d.feedback_penalty = 0.0
    bd = score_detection(d.channel, d.signals or {}, d.lookalike_domain, d.context_label, d.feedback_penalty)
    d.score, d.severity = bd.score, bd.severity
    d.status = body.status
    db.add(DetectionEvent(detection_id=d.id, at=utcnow(), action="status", from_status=prev, to_status=body.status))
    db.commit()
    return get_detection(det_id, db)


@router.delete("/detections/{det_id}/allowlist")
def undo_allowlist(det_id: str, db: Session = Depends(get_db)):
    brand = current_brand(db)
    d = db.get(Detection, det_id)
    if d is None or d.brand_id != brand.id:
        raise HTTPException(404, "Detection not found")
    for a in db.scalars(select(OfficialAsset).where(OfficialAsset.brand_id == brand.id, OfficialAsset.platform == d.platform, OfficialAsset.identifier == d.identifier)):
        db.delete(a)
    db.add(DetectionEvent(detection_id=d.id, at=utcnow(), action="status", from_status=d.status, to_status="open"))
    d.status = "open"
    db.commit()
    return get_detection(det_id, db)


# ---------- quick check ----------


class CheckIn(BaseModel):
    value: str = Field(min_length=1, max_length=300)


@router.post("/check")
def quick_check(body: CheckIn, db: Session = Depends(get_db)):
    brand = current_brand(db)
    raw = body.value.strip()
    h = [p for p in raw.removeprefix("@").split("/") if p]
    handle = (h[-1] if h else raw).split("?")[0].lower()
    official = db.scalar(select(OfficialAsset).where(OfficialAsset.brand_id == brand.id, OfficialAsset.identifier == handle))
    result = analyse_name(raw, [brand.name, *brand.aliases]).to_dict()
    return {
        "result": result,
        "official": {"platform": official.platform, "handle": official.handle, "status": official.status} if official else None,
    }


class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=300)
    platforms: list[str] = Field(default_factory=lambda: ["all"])


@router.post("/search")
def search(body: SearchIn, db: Session = Depends(get_db)):
    unknown = [p for p in body.platforms if p != "all" and p not in PLATFORMS]
    if unknown:
        bad_request("platforms", f"Unknown platform: {', '.join(unknown)}")
    return run_search(db, body.query, body.platforms)


# ---------- sources and scans ----------


@router.get("/sources")
def list_sources(db: Session = Depends(get_db)):
    return [source_out(s) for s in db.scalars(select(Source).order_by(Source.channel, Source.id)).all()]


class SourcePatch(BaseModel):
    simulateOutage: bool


@router.patch("/sources/{source_id}")
def patch_source(source_id: str, body: SourcePatch, db: Session = Depends(get_db)):
    s = db.get(Source, source_id)
    if s is None:
        raise HTTPException(404, "Source not found")
    s.simulate_outage = body.simulateOutage
    if body.simulateOutage:
        s.health, s.note = "unavailable", "Simulated outage. The scan continues with other sources; showing the last good results."
    else:
        s.health, s.note = "operational", "Restored. Results refresh on the next scan."
    db.commit()
    return source_out(s)


@router.post("/scans", status_code=202)
def create_scan(db: Session = Depends(get_db)):
    if is_scanning():
        raise HTTPException(409, "A scan is already running")
    brand = current_brand(db)
    return scan_out(start_scan(db, brand.id))


@router.get("/scans/latest")
def latest_scan(db: Session = Depends(get_db)):
    brand = current_brand(db)
    running = db.scalar(select(Scan).where(Scan.brand_id == brand.id, Scan.status == "running").order_by(Scan.started_at.desc()).limit(1))
    done = db.scalar(select(Scan).where(Scan.brand_id == brand.id, Scan.status != "running").order_by(Scan.started_at.desc()).limit(1))
    total = db.scalar(select(func.count()).select_from(Scan).where(Scan.brand_id == brand.id))
    return {"running": scan_out(running) if running and is_scanning() else None, "last": scan_out(done), "total": total}


@router.get("/scans/{scan_id}")
def get_scan(scan_id: str, db: Session = Depends(get_db)):
    s = db.get(Scan, scan_id)
    if s is None:
        raise HTTPException(404, "Scan not found")
    return scan_out(s)
