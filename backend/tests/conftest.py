import os
import uuid
from datetime import datetime

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_ENV"] = "development"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.database import Base, get_db  # noqa: E402
from app.core.security import hasher  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Customer, Membership, Organization, Plan, Subscription, Transaction, User  # noqa: E402

PASSWORD = "a-test-password-42"


@pytest.fixture
def db():
    test_url = os.environ.get("TEST_DATABASE_URL")
    if test_url:
        from sqlalchemy.engine import make_url

        if not (make_url(test_url).database or "").endswith("_test"):
            raise RuntimeError("TEST_DATABASE_URL must refer to a dedicated database ending in _test")
        engine = create_engine(test_url)
    else:
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def records(db):
    orgs = [
        Organization(name="Northstar", timezone="Europe/Lisbon"),
        Organization(name="Other tenant", timezone="UTC"),
    ]
    db.add_all(orgs)
    db.flush()
    password_hash = hasher.hash(PASSWORD)
    users = [
        User(email=f"{role}@example.com", name=role.title(), password_hash=password_hash)
        for role in ("admin", "viewer", "other")
    ]
    db.add_all(users)
    db.flush()
    for index, user in enumerate(users):
        db.add(
            Membership(
                user_id=user.id,
                organization_id=orgs[1 if index == 2 else 0].id,
                role="viewer" if index == 1 else "admin",
            )
        )
    customers = []
    plans = []
    subs = []
    txs = []
    for i, org in enumerate(orgs):
        customer = Customer(
            name="=SUM(1,2)" if i == 0 else "Private tenant customer",
            email=f"customer{i}@example.com",
            organization_id=org.id,
            created_at=datetime(2025, 1, 1),
        )
        plan = Plan(name="Growth", price_cents=7900, interval="monthly", organization_id=org.id)
        db.add_all([customer, plan])
        db.flush()
        sub = Subscription(
            organization_id=org.id,
            customer_id=customer.id,
            plan_id=plan.id,
            plan_name=plan.name,
            price_cents=plan.price_cents,
            interval=plan.interval,
            status="active",
            started_at=datetime(2025, 1, 1),
            activated_at=datetime(2025, 1, 1),
        )
        db.add(sub)
        db.flush()
        tx = Transaction(
            organization_id=org.id,
            customer_id=customer.id,
            subscription_id=sub.id,
            amount_cents=7900,
            status="paid",
            timestamp=datetime(2026, 1, 15, 12),
            external_reference="SIM-TEST",
        )
        db.add(tx)
        customers.append(customer)
        plans.append(plan)
        subs.append(sub)
        txs.append(tx)
    db.commit()
    return {
        "orgs": orgs,
        "customers": customers,
        "plans": plans,
        "subscriptions": subs,
        "transactions": txs,
        "users": users,
    }


@pytest.fixture
def client(db, records):
    def override():
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise

    app.dependency_overrides[get_db] = override
    with TestClient(
        app, headers={"Origin": "http://localhost:5173"}, raise_server_exceptions=False
    ) as client:
        yield client
    app.dependency_overrides.clear()


def sign_in(client, role="admin"):
    response = client.post("/api/v1/auth/login", json={"email": f"{role}@example.com", "password": PASSWORD})
    assert response.status_code == 200, response.text
    client.headers["X-CSRF-Token"] = response.json()["csrf_token"]
    return response.json()


@pytest.fixture
def admin_client(client):
    sign_in(client)
    return client


@pytest.fixture
def unknown_id():
    return str(uuid.uuid4())
