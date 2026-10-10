import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    mysql_host: str = os.getenv("MYSQL_HOST", "localhost")
    mysql_port: int = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user: str = os.getenv("MYSQL_USER", "root")
    mysql_password: str = os.getenv("MYSQL_PASSWORD", "")
    mysql_db: str = os.getenv("MYSQL_DB", "brandshield")
    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
    )
    # Per-source network budget, from the design doc: 10 s timeout, 2 retries.
    source_timeout_s: float = float(os.getenv("SOURCE_TIMEOUT_S", "10"))
    source_retries: int = int(os.getenv("SOURCE_RETRIES", "2"))
    # Validate official apps against the live stores (developer ID, icon). Off in offline tests.
    validate_assets: bool = os.getenv("VALIDATE_ASSETS", "1") == "1"
    # Extra CA certificate (PEM) for networks that inspect HTTPS, e.g. a FortiGate firewall.
    ca_bundle: str | None = os.getenv("CA_BUNDLE") or None
    # Shared with the Node.js server, which is what gets deployed (frontend/ is the app root).
    data_dir: Path = BASE_DIR.parent / "frontend" / "data"
    media_dir: Path = BASE_DIR / "media"


settings = Settings()
