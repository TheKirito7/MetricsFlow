from contextlib import contextmanager
from datetime import date

import pytest
from sqlalchemy import func, select

from app.core.config import Settings, get_settings
from app.models import Membership, User


def test_public_demo_guard_blocks_admin_business_mutations(admin_client, records, monkeypatch):
    monkeypatch.setattr(get_settings(), "read_only_demo", True)
    customer = str(records["customers"][0].id)
    plan = str(records["plans"][0].id)
    subscription = str(records["subscriptions"][0].id)
    for method, path, data in [
        ("post", "/customers", {"name": "Blocked", "email": "blocked@example.com"}),
        ("patch", "/customers/" + customer, {"name": "Blocked"}),
        ("delete", "/customers/" + customer, None),
        ("post", "/plans", {"name": "Blocked", "price_cents": 100, "interval": "monthly"}),
        ("patch", "/plans/" + plan, {"name": "Blocked", "price_cents": 100, "interval": "monthly"}),
        ("post", "/subscriptions", {"customer_id": customer, "plan_id": plan}),
        ("patch", "/subscriptions/" + subscription, {"status": "cancelled"}),
        ("post", "/transactions/simulate", {"subscription_id": subscription, "idempotency_key": customer}),
        ("patch", "/organization", {"name": "Blocked", "timezone": "UTC"}),
    ]:
        response = getattr(admin_client, method)("/api/v1" + path, **({"json": data} if data else {}))
        assert response.status_code == 403, (path, response.text)
        assert "read-only" in response.json()["detail"]
    assert admin_client.get("/api/v1/analytics/overview").status_code == 200
    assert admin_client.get("/api/v1/reports/transactions.csv").status_code == 200
    assert admin_client.get("/api/v1/me").json()["read_only_demo"] is True
    assert admin_client.post("/api/v1/auth/logout").status_code == 204


def test_public_provisioning_is_explicit_dedicated_and_viewer_only(db, monkeypatch):
    from app import seed

    config = Settings(
        _env_file=None,
        app_env="production",
        cookie_secure=True,
        read_only_demo=True,
        demo_viewer_email="demo@example.com",
        demo_password="public-viewer-password",
        seed_today=date(2026, 10, 27),
    )

    class Local:
        @staticmethod
        @contextmanager
        def begin():
            yield db
            db.commit()

    monkeypatch.setattr(seed, "get_settings", lambda: config)
    monkeypatch.setattr(seed, "SessionLocal", Local)
    with pytest.raises(SystemExit, match="restricted"):
        seed.seed()
    seed.seed(public_demo=True)
    assert set(db.scalars(select(Membership.role))) == {"viewer"}
    assert list(db.scalars(select(User.email))) == ["demo@example.com"]
    seed.seed(public_demo=True)
    assert db.scalar(select(func.count()).select_from(User)) == 1
    config.read_only_demo = False
    with pytest.raises(SystemExit, match="READ_ONLY_DEMO"):
        seed.seed(public_demo=True)


def test_openapi_documents_simulated_payment_responses(client):
    responses = client.get("/openapi.json").json()["paths"]["/api/v1/transactions/simulate"]["post"][
        "responses"
    ]
    assert {"200", "201", "401", "403", "404", "409", "422"} <= responses.keys()
    assert responses["200"]["content"]["application/json"]["schema"]["$ref"].endswith("TransactionOut")


def test_session_metadata_matches_configured_expiry(client, records, monkeypatch):
    from datetime import datetime, timedelta

    from app.models import now_utc
    from tests.conftest import PASSWORD

    monkeypatch.setattr(get_settings(), "session_hours", 2)
    response = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": PASSWORD})
    assert "max-age=7200" in response.headers["set-cookie"].lower()
    expiry = datetime.fromisoformat(response.json()["session_expires_at"])
    assert now_utc() + timedelta(hours=1, minutes=59) < expiry <= now_utc() + timedelta(hours=2)
