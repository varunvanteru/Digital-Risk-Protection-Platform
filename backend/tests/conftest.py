import os
import sys
import time
from pathlib import Path

import pytest

# Integration tests use their own schema so the dev database is never touched.
os.environ["MYSQL_DB"] = "brandshield_test"
os.environ["SOURCE_RETRIES"] = "0"
os.environ["SOURCE_TIMEOUT_S"] = "5"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(scope="session")
def client():
    import pymysql
    from fastapi.testclient import TestClient

    from app.config import settings
    from app.main import app

    with TestClient(app) as c:
        # Startup kicks off the first scan in the background; wait for it.
        deadline = time.time() + 120
        while time.time() < deadline:
            latest = c.get("/api/scans/latest").json()
            if latest["last"] and not latest["running"]:
                break
            time.sleep(0.5)
        yield c

    from app.db import engine

    engine.dispose()
    conn = pymysql.connect(host=settings.mysql_host, port=settings.mysql_port, user=settings.mysql_user, password=settings.mysql_password)
    with conn.cursor() as cur:
        cur.execute("DROP DATABASE IF EXISTS brandshield_test")
    conn.close()


def wait_for_scan(c, scan_id: str, timeout: float = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = c.get(f"/api/scans/{scan_id}").json()
        if s["status"] != "running":
            return s
        time.sleep(0.5)
    raise AssertionError("scan did not finish")
