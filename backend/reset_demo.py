"""
Reset the database to the clean ZentraPay demo state.

Drops every BrandShield table, re-creates them, seeds the demo brand and
sources, and runs one scan. Use it after manual testing with a real brand,
or before a demo. Stop the API server first.

    .venv\\Scripts\\python reset_demo.py
"""

from app.config import settings
from app.db import Base, SessionLocal, engine, ensure_database
from app.models import Scan
from app.seed import DEMO_BRAND_ID, seed
from app.services.scan import run_scan, utcnow


def main() -> None:
    ensure_database()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    # A logo uploaded for another brand overwrote the demo logo; redraw it.
    logo = settings.media_dir / "brand" / f"{DEMO_BRAND_ID}.png"
    if logo.exists():
        logo.unlink()

    with SessionLocal() as db:
        seed(db)
        scan = Scan(id="scn_reset", brand_id=DEMO_BRAND_ID, status="running", started_at=utcnow(), source_status={})
        db.add(scan)
        db.commit()
    run_scan("scn_reset", DEMO_BRAND_ID)

    with SessionLocal() as db:
        s = db.get(Scan, "scn_reset")
        print(f"Reset done. Scan {s.status}: {s.candidates} candidates, {s.new_detections} detections, {s.official_flagged} official flagged.")


if __name__ == "__main__":
    main()
