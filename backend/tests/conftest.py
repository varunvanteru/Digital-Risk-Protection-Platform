import os
import sys
import time
from pathlib import Path

import pytest

# Integration tests use their own schema so the dev database is never touched.
os.environ["MYSQL_DB"] = "brandshield_test"
os.environ["SOURCE_RETRIES"] = "0"
os.environ["SOURCE_TIMEOUT_S"] = "5"
# Offline: never call the live stores to validate official apps during tests.
os.environ["VALIDATE_ASSETS"] = "0"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_drop_db_after_session = False


@pytest.fixture(scope="session")
def client():
    """
    Session-scoped FastAPI test client backed by brandshield_test.
    The DB is NOT dropped here so that other test files that also use this
    fixture (e.g. test_search.py) can run after test_api.py without crashing.
    The actual DROP runs in pytest_sessionfinish() once all tests are done.
    """
    global _drop_db_after_session
    from fastapi.testclient import TestClient

    from app.main import app

    _drop_db_after_session = True
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


def pytest_sessionfinish(session, exitstatus):  # noqa: ARG001
    """Drop the test schema after ALL tests have finished."""
    if not _drop_db_after_session:
        return
    import pymysql

    from app.config import settings

    try:
        conn = pymysql.connect(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
        )
        with conn.cursor() as cur:
            cur.execute("DROP DATABASE IF EXISTS brandshield_test")
        conn.close()
    except Exception:
        pass  # best-effort cleanup


def wait_for_scan(c, scan_id: str, timeout: float = 120) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = c.get(f"/api/scans/{scan_id}").json()
        if s["status"] != "running":
            return s
        time.sleep(0.5)
    raise AssertionError("scan did not finish")
