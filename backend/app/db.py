from collections.abc import Iterator

import pymysql
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def ensure_database() -> None:
    """
    Create the schema if it does not exist. Safe to call on every start.

    On shared hosting (e.g. Hostinger) the database is created in the control panel
    and the user may not create databases; if it already exists, that is fine.
    """
    conn = pymysql.connect(
        host=settings.mysql_host,
        port=settings.mysql_port,
        user=settings.mysql_user,
        password=settings.mysql_password,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM information_schema.schemata WHERE schema_name = %s", (settings.mysql_db,))
            if cur.fetchone() is None:
                # utf8mb4_unicode_ci exists on both MySQL and MariaDB.
                cur.execute(
                    f"CREATE DATABASE `{settings.mysql_db}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
    finally:
        conn.close()


# URL.create escapes special characters in the password (e.g. "@").
DATABASE_URL = URL.create(
    "mysql+pymysql",
    username=settings.mysql_user,
    password=settings.mysql_password,
    host=settings.mysql_host,
    port=settings.mysql_port,
    database=settings.mysql_db,
    query={"charset": "utf8mb4"},
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=1800, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
