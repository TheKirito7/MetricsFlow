"""Reset only the explicitly named E2E database, seed it, then serve the test API."""

import logging
import os
from pathlib import Path

import uvicorn
from alembic.config import Config

from alembic import command
from app.core.config import get_settings
from app.core.database import Base, engine
from app.seed import seed


def main():
    settings = get_settings()
    portfolio = os.environ.get("PORTFOLIO_CAPTURE") == "true"
    suffix = "_portfolio" if portfolio else "_e2e"
    if settings.app_env != "development" or not (engine.url.database or "").endswith(suffix):
        raise SystemExit(
            f"Fixture setup requires development mode and a separate PostgreSQL database ending in {suffix}"
        )
    if engine.dialect.name != "postgresql":
        raise SystemExit("E2E verification requires PostgreSQL")
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    # Clear fixture records only. Preserve the schema and Alembic revision.
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
    seed()
    logging.getLogger("metricsflow").setLevel(logging.WARNING)
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8002 if portfolio else 8001,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    main()
