import csv
import io

import pytest

from tests.conftest import sign_in


def test_customer_crud_search_sort_and_archive(admin_client, records):
    client = admin_client
    data = {"name": "New Customer", "email": "NEW@EXAMPLE.COM", "company": "Studio"}
    response = client.post("/api/v1/customers", json=data)
    assert response.status_code == 201
    customer = response.json()
    assert customer["email"] == "new@example.com"
    cid = customer["id"]
    assert client.get("/api/v1/customers?search=new@&sort=name&order=asc&page_size=1").json()["total"] == 1
    assert client.post("/api/v1/customers", json=data).status_code == 409
    response = client.patch(f"/api/v1/customers/{cid}", json={**data, "name": "Updated", "status": "active"})
    assert response.json()["name"] == "Updated"
    assert client.get(f"/api/v1/customers/{cid}").json()["activity"]
    assert client.delete(f"/api/v1/customers/{cid}").status_code == 204
    assert client.get(f"/api/v1/customers/{cid}").json()["status"] == "archived"
    original = str(records["customers"][0].id)
    client.delete(f"/api/v1/customers/{original}")
    detail = client.get(f"/api/v1/customers/{original}").json()
    assert len(detail["transactions"]) == 1 and len(detail["subscriptions"]) == 1


def test_customer_validation_and_literal_search(admin_client):
    assert (
        admin_client.post("/api/v1/customers", json={"name": " ", "email": "valid@example.com"}).status_code
        == 422
    )
    assert admin_client.post("/api/v1/customers", json={"name": " ", "email": "bad"}).status_code == 422
    assert admin_client.get("/api/v1/customers?search=%25").json()["total"] == 0
    assert admin_client.get("/api/v1/customers?page_size=1000").status_code == 422
    assert admin_client.get("/api/v1/customers?sort=password_hash").status_code == 422


def test_plan_price_snapshot_and_subscription_lifecycle(admin_client, records):
    customer_id = str(records["customers"][0].id)
    plan_id = str(records["plans"][0].id)
    old_sub_id = str(records["subscriptions"][0].id)
    response = admin_client.patch(
        f"/api/v1/plans/{plan_id}", json={"name": "Growth Plus", "price_cents": 9900, "interval": "yearly"}
    )
    assert response.status_code == 200
    old = admin_client.get(f"/api/v1/subscriptions/{old_sub_id}").json()
    assert old["price_cents"] == 7900 and old["interval"] == "monthly" and old["plan_name"] == "Growth"
    created = admin_client.post(
        "/api/v1/subscriptions", json={"customer_id": customer_id, "plan_id": plan_id, "status": "trial"}
    )
    assert created.status_code == 201, created.text
    sub = created.json()
    assert sub["price_cents"] == 9900 and sub["activated_at"] is None
    sid = sub["id"]
    assert admin_client.patch(f"/api/v1/subscriptions/{sid}", json={"status": "active"}).json()[
        "activated_at"
    ]
    cancelled = admin_client.patch(f"/api/v1/subscriptions/{sid}", json={"status": "cancelled"}).json()
    assert cancelled["ends_at"] == cancelled["cancelled_at"]
    assert admin_client.patch(f"/api/v1/subscriptions/{sid}", json={"status": "active"}).status_code == 409
    assert len(admin_client.get(f"/api/v1/subscriptions/{sid}").json()["activity"]) == 3


def test_archived_customer_cannot_get_new_subscription(admin_client, records):
    cid = str(records["customers"][0].id)
    admin_client.delete(f"/api/v1/customers/{cid}")
    assert (
        admin_client.post(
            "/api/v1/subscriptions", json={"customer_id": cid, "plan_id": str(records["plans"][0].id)}
        ).status_code
        == 409
    )


def test_transaction_filters_summary_and_csv(admin_client, records):
    filters = "?start_date=2026-01-01&end_date=2026-01-31&status=paid"
    response = admin_client.get("/api/v1/transactions" + filters)
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["paid_cents"] == 7900
    assert response.json()["total"] == 1
    assert admin_client.get("/api/v1/transactions?status=failed").json()["total"] == 0
    assert admin_client.get("/api/v1/transactions/" + str(records["transactions"][0].id)).status_code == 200
    exported = admin_client.get("/api/v1/reports/transactions.csv" + filters)
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    assert len(rows) == 1 and rows[0]["amount_cents"] == "7900"
    assert rows[0]["customer"].startswith("'=")
    assert "private" not in exported.text.lower()
    assert "attachment" in exported.headers["content-disposition"]


@pytest.mark.parametrize("resource", ["customers", "subscriptions", "transactions"])
def test_tenant_resource_isolation(admin_client, records, resource):
    foreign_id = str(records[resource][1].id)
    assert admin_client.get(f"/api/v1/{resource}/{foreign_id}").status_code == 404
    listed = admin_client.get(f"/api/v1/{resource}").json()
    assert listed["total"] == 1
    assert foreign_id not in str(listed)
    if resource == "customers":
        assert admin_client.delete(f"/api/v1/customers/{foreign_id}").status_code == 404
        assert (
            admin_client.patch(
                f"/api/v1/customers/{foreign_id}", json={"name": "Hijack", "email": "hijack@example.com"}
            ).status_code
            == 404
        )
    if resource == "subscriptions":
        assert (
            admin_client.patch(
                f"/api/v1/subscriptions/{foreign_id}", json={"status": "cancelled"}
            ).status_code
            == 404
        )


def test_foreign_plan_and_customer_cannot_be_assigned(admin_client, records):
    local_cid, foreign_cid = [str(c.id) for c in records["customers"]]
    local_pid, foreign_pid = [str(p.id) for p in records["plans"]]
    for cid, pid in [(local_cid, foreign_pid), (foreign_cid, local_pid)]:
        assert (
            admin_client.post("/api/v1/subscriptions", json={"customer_id": cid, "plan_id": pid}).status_code
            == 404
        )
    assert (
        admin_client.patch(
            f"/api/v1/plans/{foreign_pid}", json={"name": "Hijack", "price_cents": 100, "interval": "monthly"}
        ).status_code
        == 404
    )


def test_viewer_can_read_and_export_but_cannot_write(client, records):
    sign_in(client, "viewer")
    cid = str(records["customers"][0].id)
    sid = str(records["subscriptions"][0].id)
    pid = str(records["plans"][0].id)
    assert client.get("/api/v1/customers").status_code == 200
    assert client.get("/api/v1/reports/transactions.csv").status_code == 200
    cases = [
        ("post", "/customers", {"name": "No", "email": "no@example.com"}),
        ("patch", f"/customers/{cid}", {"name": "No", "email": "no@example.com"}),
        ("delete", f"/customers/{cid}", None),
        ("post", "/plans", {"name": "No", "price_cents": 100, "interval": "monthly"}),
        ("patch", f"/plans/{pid}", {"name": "No", "price_cents": 100, "interval": "monthly"}),
        ("post", "/subscriptions", {"customer_id": cid, "plan_id": pid}),
        ("patch", f"/subscriptions/{sid}", {"status": "cancelled"}),
        ("patch", "/organization", {"name": "No", "timezone": "UTC"}),
    ]
    for method, path, data in cases:
        kwargs = {"json": data} if data else {}
        assert getattr(client, method)("/api/v1" + path, **kwargs).status_code == 403


def test_settings_validation_and_scoping(admin_client, records):
    assert (
        admin_client.patch(
            "/api/v1/organization", json={"name": "Renamed", "timezone": "Made/Up"}
        ).status_code
        == 422
    )
    assert (
        admin_client.patch(
            "/api/v1/organization", json={"name": "Renamed", "timezone": "Europe/Berlin"}
        ).status_code
        == 200
    )
    assert admin_client.get("/api/v1/me").json()["organization"]["name"] == "Renamed"
    assert records["orgs"][1].name == "Other tenant"


def test_metrics_respond_to_subscription_not_customer_creation(admin_client, records):
    before = admin_client.get("/api/v1/analytics/overview").json()
    customer = admin_client.post("/api/v1/customers", json={"name": "New", "email": "new@example.com"}).json()
    assert (
        admin_client.get("/api/v1/analytics/overview").json()["current"]["mrr_cents"]
        == before["current"]["mrr_cents"]
    )
    response = admin_client.post(
        "/api/v1/subscriptions", json={"customer_id": customer["id"], "plan_id": str(records["plans"][0].id)}
    )
    assert response.status_code == 201
    after = admin_client.get("/api/v1/analytics/overview").json()
    assert after["current"]["mrr_cents"] == before["current"]["mrr_cents"] + 7900
    assert after["current"]["paying_customers"] == before["current"]["paying_customers"] + 1
