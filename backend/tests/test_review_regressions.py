import uuid
from datetime import date, datetime

from sqlalchemy import func, insert, select

from app.models import AuthSession, Customer, Subscription, Transaction
from app.services.analytics import calculate
from tests.conftest import sign_in


def test_partial_patch_preserves_status_and_other_fields(admin_client, records):
    customer = records["customers"][0]
    admin_client.delete(f"/api/v1/customers/{customer.id}")
    result = admin_client.patch(f"/api/v1/customers/{customer.id}", json={"company": "Changed"})
    assert result.status_code == 200
    assert result.json()["status"] == "archived"
    assert result.json()["name"] == customer.name
    assert result.json()["email"] == customer.email
    result = admin_client.patch(f"/api/v1/customers/{customer.id}", json={"email": "NORMALIZED@example.com"})
    assert result.json()["email"] == "normalized@example.com"
    for field in ("name", "email", "status"):
        assert admin_client.patch(f"/api/v1/customers/{customer.id}", json={field: None}).status_code == 422
    assert (
        admin_client.patch(f"/api/v1/customers/{customer.id}", json={"company": None}).json()["company"]
        is None
    )


def test_duplicate_plan_names_are_reported_separately(admin_client, db, records):
    org = records["orgs"][0]
    old = records["plans"][0]
    created = admin_client.post(
        "/api/v1/plans", json={"name": old.name, "price_cents": 1000, "interval": "monthly"}
    )
    assert created.status_code == 201
    plan = created.json()
    db.add(
        Subscription(
            organization_id=org.id,
            customer_id=records["customers"][0].id,
            plan_id=uuid.UUID(plan["id"]),
            plan_name=plan["name"],
            price_cents=1000,
            interval="monthly",
            status="active",
            started_at=datetime(2025, 1, 1),
            activated_at=datetime(2025, 1, 1),
        )
    )
    db.commit()
    report = calculate(db, org.id, "UTC", date(2026, 1, 1), date(2026, 1, 31))
    assert len(report.plans) == 2
    assert {p.plan_id for p in report.plans} == {old.id, uuid.UUID(plan["id"])}
    assert sorted(p.mrr_cents for p in report.plans) == [1000, 7900]


def test_analytics_excludes_foreign_data_explicitly(db, records):
    org = records["orgs"][0]
    before = calculate(db, org.id, "UTC", date(2026, 1, 1), date(2026, 1, 31)).model_dump()
    foreign_sub = records["subscriptions"][1]
    foreign_sub.price_cents = 99_999_999
    records["transactions"][1].amount_cents = 88_888_888
    db.add(
        Customer(
            organization_id=records["orgs"][1].id,
            name="Foreign",
            email="foreign@example.com",
            created_at=datetime(2026, 1, 2),
        )
    )
    db.commit()
    after = calculate(db, org.id, "UTC", date(2026, 1, 1), date(2026, 1, 31)).model_dump()
    assert after == before


def test_history_availability_distinguishes_partial_comparisons(db, records):
    org = records["orgs"][0]
    report = calculate(db, org.id, "UTC", date(2024, 12, 15), date(2025, 1, 15))
    assert report.history_start is not None
    assert not report.snapshot_comparison_available
    assert not report.revenue_comparison_available
    assert report.revenue_growth_percent is None


def test_login_rotates_and_revokes_presented_session(client, db):
    sign_in(client)
    old = client.cookies.get("metricsflow_session")
    sign_in(client)
    assert old != client.cookies.get("metricsflow_session")
    assert db.scalar(select(func.count()).select_from(AuthSession)) == 1
    client.cookies.clear()
    client.cookies.set("metricsflow_session", old)
    assert client.get("/api/v1/me").status_code == 401


def test_ip_throttle_across_different_emails(client):
    for i in range(40):
        result = client.post(
            "/api/v1/auth/login", json={"email": f"absent{i}@example.com", "password": "incorrect"}
        )
        assert result.status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "one-more@example.com", "password": "incorrect"}
        ).status_code
        == 429
    )


def test_csv_export_cap_uses_filtered_count(admin_client, db, records):
    customer = records["customers"][0]
    batch = [
        {
            "id": uuid.uuid4(),
            "organization_id": customer.organization_id,
            "customer_id": customer.id,
            "amount_cents": 1,
            "currency": "EUR",
            "status": "failed",
            "timestamp": datetime(2026, 1, 2),
        }
        for _ in range(50_001)
    ]
    for offset in range(0, len(batch), 1000):
        db.execute(insert(Transaction), batch[offset : offset + 1000])
    db.commit()
    assert admin_client.get("/api/v1/reports/transactions.csv").status_code == 422
    assert admin_client.get("/api/v1/reports/transactions.csv?status=paid").status_code == 200


def test_simulated_payment_is_idempotent_and_updates_only_collected_revenue(admin_client, db, records):
    before = admin_client.get("/api/v1/analytics/overview").json()
    data = {"subscription_id": str(records["subscriptions"][0].id), "idempotency_key": str(uuid.uuid4())}
    first = admin_client.post("/api/v1/transactions/simulate", json=data)
    assert first.status_code == 201, first.text
    assert first.json()["amount_cents"] == records["subscriptions"][0].price_cents
    assert first.json()["external_reference"].startswith("SIM-")
    replay = admin_client.post("/api/v1/transactions/simulate", json=data)
    assert replay.status_code == 200 and replay.json()["id"] == first.json()["id"]
    after = admin_client.get("/api/v1/analytics/overview").json()
    assert after["paid_cents"] == before["paid_cents"] + 7900
    assert after["current"] == before["current"]
    assert (
        db.scalar(
            select(func.count())
            .select_from(Transaction)
            .where(Transaction.idempotency_key == data["idempotency_key"])
        )
        == 1
    )
    foreign = {**data, "subscription_id": str(records["subscriptions"][1].id)}
    assert admin_client.post("/api/v1/transactions/simulate", json=foreign).status_code == 409
    foreign["idempotency_key"] = str(uuid.uuid4())
    assert admin_client.post("/api/v1/transactions/simulate", json=foreign).status_code == 404


def test_viewer_and_non_billable_subscription_cannot_simulate(client, records):
    sign_in(client, "viewer")
    data = {"subscription_id": str(records["subscriptions"][0].id), "idempotency_key": str(uuid.uuid4())}
    assert client.post("/api/v1/transactions/simulate", json=data).status_code == 403
    sign_in(client)
    client.patch("/api/v1/subscriptions/" + data["subscription_id"], json={"status": "cancelled"})
    assert client.post("/api/v1/transactions/simulate", json=data).status_code == 409
