from app.models import Membership
from tests.conftest import PASSWORD


def test_login_never_selects_an_arbitrary_membership(client, db, records):
    db.add(Membership(user_id=records["users"][0].id, organization_id=records["orgs"][1].id, role="viewer"))
    db.commit()
    data = {"email": "admin@example.com", "password": PASSWORD}
    invalid = client.post("/api/v1/auth/login", json={**data, "password": "wrong"})
    assert invalid.status_code == 401 and "workspaces" not in invalid.json()
    selection = client.post("/api/v1/auth/login", json=data)
    assert selection.status_code == 200
    assert selection.json()["requires_workspace"] is True
    assert {item["id"] for item in selection.json()["workspaces"]} == {str(org.id) for org in records["orgs"]}
    assert "set-cookie" not in selection.headers
    assert client.get("/api/v1/me").status_code == 401
    response = client.post("/api/v1/auth/login", json={**data, "organization_id": str(records["orgs"][1].id)})
    assert response.status_code == 200
    assert response.json()["organization"]["id"] == str(records["orgs"][1].id)
    assert response.json()["role"] == "viewer"
