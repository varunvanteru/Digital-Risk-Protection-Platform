"""
Images under media/ (brand logos, demo avatars), mirrored into MySQL.

Free hosting tiers give the API a temporary disk that is wiped on every restart.
Each image is written to disk as before and also stored in `media_files`; at
startup, missing files are written back with their original modification time,
which the names of derived demo avatars depend on.
"""

from __future__ import annotations

import logging
import os

from PIL import Image
from sqlalchemy import select

from .config import settings
from .db import SessionLocal
from .models import MediaFile

log = logging.getLogger(__name__)


def save_image(rel: str, img: Image.Image) -> str:
    """Save `img` as PNG at media/<rel>, keep a database copy, and return its "/media/..." path."""
    path = settings.media_dir / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    try:
        with SessionLocal() as db:
            db.merge(MediaFile(path=rel, data=path.read_bytes(), mtime=path.stat().st_mtime))
            db.commit()
    except Exception as e:  # the disk copy still serves this process
        log.warning("Could not store %s in the database: %s", rel, e)
    return f"/media/{rel}"


def restore_media() -> int:
    """Write back files missing from disk. Returns how many were restored."""
    restored = 0
    with SessionLocal() as db:
        for row in db.scalars(select(MediaFile)):
            path = settings.media_dir / row.path
            if path.exists():
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(row.data)
            os.utime(path, (row.mtime, row.mtime))
            restored += 1
    return restored
