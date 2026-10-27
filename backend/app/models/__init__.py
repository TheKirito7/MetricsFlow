import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import get_settings
from app.core.database import Base


def now_utc() -> datetime:
    """Database timestamps are timezone-naive UTC, converted at reporting boundaries."""
    configured = get_settings().test_now
    instant = configured.astimezone(UTC) if configured and configured.tzinfo else configured
    return instant.replace(tzinfo=None) if instant else datetime.now(UTC).replace(tzinfo=None)


class Identity:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Organization(Identity, Base):
    __tablename__ = "organizations"
    name: Mapped[str] = mapped_column(String(120))
    timezone: Mapped[str] = mapped_column(String(60), default="Europe/Lisbon")
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    __table_args__ = (CheckConstraint("currency = 'EUR'", name="org_eur"),)


class User(Identity, Base):
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))


class Membership(Identity, Base):
    __tablename__ = "memberships"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))
    __table_args__ = (
        UniqueConstraint("user_id", "organization_id"),
        CheckConstraint("role in ('admin','viewer')", name="membership_role"),
    )


class AuthSession(Identity, Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    membership_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("memberships.id"))
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class LoginAttempt(Identity, Base):
    __tablename__ = "login_attempts"
    key_hash: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)


class TenantRecord(Identity):
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)


class Customer(TenantRecord, Base):
    __tablename__ = "customers"
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254))
    company: Mapped[str | None] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(12), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc)
    __table_args__ = (
        UniqueConstraint("organization_id", "email"),
        CheckConstraint("status in ('active','archived')", name="customer_status"),
        Index("ix_customers_org_created", "organization_id", "created_at"),
    )


class Plan(TenantRecord, Base):
    __tablename__ = "plans"
    name: Mapped[str] = mapped_column(String(80))
    price_cents: Mapped[int] = mapped_column(Integer)
    interval: Mapped[str] = mapped_column(String(10))
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    __table_args__ = (
        CheckConstraint("price_cents > 0", name="plan_positive"),
        CheckConstraint("interval in ('monthly','yearly')", name="plan_interval"),
        CheckConstraint("currency = 'EUR'", name="plan_eur"),
    )


class Subscription(TenantRecord, Base):
    __tablename__ = "subscriptions"
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plans.id"))
    plan_name: Mapped[str] = mapped_column(String(80))
    price_cents: Mapped[int] = mapped_column(Integer)
    interval: Mapped[str] = mapped_column(String(10))
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    status: Mapped[str] = mapped_column(String(12), default="active")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    __table_args__ = (
        CheckConstraint("price_cents > 0", name="subscription_positive"),
        CheckConstraint("status in ('trial','active','cancelled','expired')", name="subscription_status"),
        CheckConstraint("interval in ('monthly','yearly')", name="subscription_interval"),
        CheckConstraint("currency = 'EUR'", name="subscription_eur"),
        CheckConstraint("ends_at is null or ends_at >= started_at", name="subscription_dates"),
        Index("ix_subscriptions_org_dates", "organization_id", "activated_at", "ends_at"),
    )


class Transaction(TenantRecord, Base):
    __tablename__ = "transactions"
    idempotency_key: Mapped[str | None] = mapped_column(String(36))
    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id"), index=True)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("subscriptions.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    status: Mapped[str] = mapped_column(String(10))
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    external_reference: Mapped[str | None] = mapped_column(String(120))
    __table_args__ = (
        UniqueConstraint("organization_id", "idempotency_key", name="uq_transaction_org_idempotency"),
        CheckConstraint("amount_cents >= 0", name="transaction_amount"),
        CheckConstraint("status in ('pending','paid','failed','refunded')", name="transaction_status"),
        CheckConstraint("currency = 'EUR'", name="transaction_eur"),
        Index("ix_transactions_org_time_status", "organization_id", "timestamp", "status"),
    )


class AuditLog(TenantRecord, Base):
    __tablename__ = "audit_logs"
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80))
    resource_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
