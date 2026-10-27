from datetime import timedelta

from sqlalchemy import select

from app.models import AuthSession, now_utc
from tests.conftest import PASSWORD, sign_in


def test_auth_session_cookie_csrf_and_logout(client, db):
    assert client.get("/api/v1/me").status_code == 401
    me = sign_in(client)
    assert me["role"] == "admin"
    assert client.get("/api/v1/me").json()["email"] == "admin@example.com"
    raw = client.cookies.get("metricsflow_session")
    session = db.scalar(select(AuthSession))
    assert session.token_hash != raw
    assert session.expires_at > now_utc() + timedelta(hours=7)
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert client.get("/api/v1/me").status_code == 401


def test_cookie_flags(client):
    response = client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": PASSWORD})
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie and "max-age=28800" in cookie


def test_csrf_and_origin_checks(admin_client):
    data = {"name": "New", "email": "new@example.com"}
    assert (
        admin_client.post("/api/v1/customers", json=data, headers={"X-CSRF-Token": "bad"}).status_code == 403
    )
    assert (
        admin_client.post(
            "/api/v1/customers", json=data, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert admin_client.post("/api/v1/customers", json=data).status_code == 201


def test_expired_session(client, db):
    sign_in(client)
    session = db.scalar(select(AuthSession))
    session.expires_at = now_utc() - timedelta(seconds=1)
    db.commit()
    assert client.get("/api/v1/customers").status_code == 401


def test_login_rate_limit_and_generic_error(client):
    for _ in range(10):
        response = client.post(
            "/api/v1/auth/login", json={"email": "absent@example.com", "password": "wrong"}
        )
        assert response.status_code == 401
        assert response.json()["detail"] == "Email or password is incorrect"
    response = client.post("/api/v1/auth/login", json={"email": "absent@example.com", "password": "wrong"})
    assert response.status_code == 429
    assert response.headers["Retry-After"] == "900"


def test_membership_cannot_be_selected_arbitrarily(client, records):
    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": PASSWORD,
            "organization_id": str(records["orgs"][1].id),
        },
    )
    assert response.status_code == 401


def test_invalid_password_and_validation_do_not_echo_secrets(client):
    secret = "super-secret" * 20
    response = client.post("/api/v1/auth/login", json={"email": "not-email", "password": secret})
    assert response.status_code == 422 and secret not in response.text
