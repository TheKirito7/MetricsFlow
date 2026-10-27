"""These assertions exercise real PostgreSQL locking/unique constraints, not SQLite stand-ins."""

import os
import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.main import app
from app.models import AuditLog, Transaction
from tests.conftest import sign_in

pytestmark = [
    pytest.mark.postgres,
    pytest.mark.skipif(
        not os.getenv("TEST_DATABASE_URL"), reason="Requires TEST_DATABASE_URL pointing to PostgreSQL"
    ),
]


def independent_sessions(db):
    engine = db.get_bind()

    def dependency():
        with Session(engine, expire_on_commit=False) as session:
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise

    return dependency


def test_postgres_login_advisory_lock_prevents_limit_races(client, db):
    app.dependency_overrides[get_db] = independent_sessions(db)

    def attempt(index):
        with TestClient(
            app, headers={"Origin": "http://localhost:5173"}, client=("203.0.113.88", 12000 + index)
        ) as worker:
            return worker.post(
                "/api/v1/auth/login", json={"email": "locked@example.com", "password": "incorrect-password"}
            ).status_code

    with ThreadPoolExecutor(max_workers=4) as pool:
        statuses = list(pool.map(attempt, range(16)))
    assert statuses.count(401) == 10
    assert statuses.count(429) == 6


def test_postgres_simultaneous_payment_retries_create_one_row_and_event(client, db, records):
    me = sign_in(client)
    token = client.cookies.get("metricsflow_session")
    app.dependency_overrides[get_db] = independent_sessions(db)
    key = str(uuid.uuid4())
    data = {"subscription_id": str(records["subscriptions"][0].id), "idempotency_key": key}

    def attempt(_):
        with TestClient(
            app,
            headers={
                "Origin": "http://localhost:5173",
                "X-CSRF-Token": me["csrf_token"],
                "Cookie": f"metricsflow_session={token}",
            },
        ) as worker:
            result = worker.post("/api/v1/transactions/simulate", json=data)
            return result.status_code, result.json()

    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(attempt, range(8)))
    assert [status for status, _ in results].count(201) == 1
    assert all(status in (200, 201) for status, _ in results), results
    assert len({body["id"] for _, body in results}) == 1
    assert (
        db.scalar(select(func.count()).select_from(Transaction).where(Transaction.idempotency_key == key))
        == 1
    )
    assert (
        db.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.action == "transaction.simulated")
        )
        == 1
    )
