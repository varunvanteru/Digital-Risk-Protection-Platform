import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, update

from .config import settings
from .db import Base, SessionLocal, engine, ensure_database
from .models import Scan
from .routes import router
from .seed import seed
from .services.scan import start_scan
from .tls import install_default_context

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    install_default_context()
    ensure_database()
    Base.metadata.create_all(engine)
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    with SessionLocal() as db:
        seed(db)
        # A scan interrupted by a restart can never finish; close it out.
        db.execute(update(Scan).where(Scan.status == "running").values(status="failed"))
        db.commit()
        if db.scalar(select(Scan.id).limit(1)) is None:
            from .routes import current_brand

            start_scan(db, current_brand(db).id)
    yield


app = FastAPI(title="BrandShield API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")
