import pytest
from sqlalchemy import select

from app.bootstrap import provision
from app.models import Membership, Organization, User


def test_provision_validates_and_creates_a_private_admin(db, monkeypatch):
    from contextlib import contextmanager

    class LocalSession:
        @staticmethod
        @contextmanager
        def begin():
            yield db
            db.commit()

    monkeypatch.setattr("app.bootstrap.SessionLocal", LocalSession)
    with pytest.raises(ValueError, match="password"):
        provision("owner@example.com", "Owner", "Acme", "UTC", "weak")
    provision("owner@example.com", "Owner", "Acme", "UTC", "a-strong-bootstrap-password")
    assert db.scalar(select(User)).email == "owner@example.com"
    assert db.scalar(select(Organization)).name == "Acme"
    assert db.scalar(select(Membership)).role == "admin"
    with pytest.raises(ValueError, match="already exists"):
        provision("owner@example.com", "Other", "Duplicate", "UTC", "a-strong-bootstrap-password")
