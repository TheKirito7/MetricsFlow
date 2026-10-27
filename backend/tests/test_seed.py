from contextlib import contextmanager
from datetime import UTC, date, datetime

from sqlalchemy import func, select

from app.core.config import Settings
from app.models import Customer, Subscription, Transaction
from app.services.analytics import snapshot


def test_seed_is_idempotent_has_history_and_multiple_subscription_customers(db, monkeypatch):
    from app import seed

    class Local:
        @staticmethod
        @contextmanager
        def begin():
            yield db
            db.commit()

    config = Settings(
        _env_file=None,
        database_url="sqlite://",
        demo_password="a-seed-test-password",
        seed_today=date(2026, 10, 27),
    )
    monkeypatch.setattr(seed, "get_settings", lambda: config)
    monkeypatch.setattr(seed, "SessionLocal", Local)
    seed.seed()

    def counts():
        return tuple(
            db.scalar(select(func.count()).select_from(model))
            for model in (Customer, Subscription, Transaction)
        )

    before = counts()
    assert before[0] == 320 and before[1] > 320
    active = snapshot(list(db.scalars(select(Subscription))), datetime(2026, 10, 27, 12))
    assert active.active_subscriptions > active.paying_customers > 0
    # A 12-month report needs another complete 12 months for its comparison baseline.
    assert db.scalar(select(func.min(Customer.created_at))) < datetime(2024, 10, 27)
    assert db.scalar(select(func.min(Transaction.timestamp))) < datetime(2024, 10, 27)
    assert set(db.scalars(select(Transaction.status).distinct())) == {"paid", "pending", "failed", "refunded"}
    seed.seed()
    assert counts() == before


def test_seed_defaults_to_today_and_refuses_production(monkeypatch, db):
    from app import seed

    config = Settings(_env_file=None, database_url="sqlite://", demo_password="a-seed-test-password")
    assert config.seed_today is None

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 15, 12, tzinfo=tz or UTC)

    class Local:
        @staticmethod
        @contextmanager
        def begin():
            yield db
            db.commit()

    monkeypatch.setattr(seed, "datetime", FixedDatetime)
    monkeypatch.setattr(seed, "get_settings", lambda: config)
    monkeypatch.setattr(seed, "SessionLocal", Local)
    seed.seed()
    latest = db.scalar(select(func.max(Transaction.timestamp)))
    assert latest.date() <= date(2026, 11, 15) and latest.date() > date(2026, 11, 1)
    config.app_env = "production"
    import pytest

    with pytest.raises(SystemExit, match="restricted"):
        seed.seed()
