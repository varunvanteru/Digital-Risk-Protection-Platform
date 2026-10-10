"""
Minimal forward migration: add columns that exist on the models but not yet in
the database. create_all() only creates missing tables, never missing columns.
Only additive changes are handled; nothing is dropped or altered.
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

from .db import Base

log = logging.getLogger("brandshield.migrate")


def add_missing_columns(engine: Engine) -> list[str]:
    added: list[str] = []
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            have = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in have:
                    continue
                ddl = CreateColumn(column).compile(dialect=engine.dialect)
                conn.execute(text(f"ALTER TABLE `{table.name}` ADD COLUMN {ddl}"))
                added.append(f"{table.name}.{column.name}")
    for name in added:
        log.info("added column %s", name)
    return added
