from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

from app.core.config import get_settings

Name = Annotated[str, StringConstraints(min_length=1, max_length=120, strip_whitespace=True)]
CustomerStatus = Literal["active", "archived"]
SubscriptionStatus = Literal["trial", "active", "cancelled", "expired"]
TransactionStatus = Literal["pending", "paid", "failed", "refunded"]
Interval = Literal["monthly", "yearly"]


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)
    organization_id: UUID | None = None

    @field_validator("email")
    @classmethod
    def login_email(cls, value: str) -> str:
        try:
            return validate_email(
                value, check_deliverability=False, test_environment=get_settings().app_env == "development"
            ).normalized
        except EmailNotValidError as exc:
            raise ValueError("Enter a valid email address") from exc


class OrganizationOut(Output):
    id: UUID
    name: str
    timezone: str
    currency: str


class MeOut(BaseModel):
    id: UUID
    email: str
    name: str
    role: Literal["admin", "viewer"]
    organization: OrganizationOut
    csrf_token: str
    session_expires_at: datetime
    read_only_demo: bool


class WorkspaceOption(BaseModel):
    id: UUID
    name: str
    role: Literal["admin", "viewer"]


class WorkspaceSelection(BaseModel):
    requires_workspace: Literal[True] = True
    workspaces: list[WorkspaceOption]


class SettingsIn(BaseModel):
    name: Name
    timezone: str

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use an IANA timezone such as Europe/Lisbon") from exc
        return value


class CustomerIn(BaseModel):
    name: Name
    email: EmailStr
    company: str | None = Field(default=None, max_length=160)

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str) -> str:
        return value.lower()


class CustomerUpdate(BaseModel):
    name: Name | None = None
    email: EmailStr | None = None
    company: str | None = Field(default=None, max_length=160)
    status: CustomerStatus | None = None

    @field_validator("name", "email", "status")
    @classmethod
    def non_nullable_fields(cls, value):
        if value is None:
            raise ValueError("This field cannot be null")
        return value

    @field_validator("email")
    @classmethod
    def lower_updated_email(cls, value):
        return value.lower()


class SimulatedPaymentIn(BaseModel):
    subscription_id: UUID
    idempotency_key: UUID


class CustomerOut(Output):
    id: UUID
    organization_id: UUID
    name: str
    email: str
    company: str | None
    status: CustomerStatus
    created_at: datetime
    updated_at: datetime


class PlanIn(BaseModel):
    name: Annotated[str, StringConstraints(min_length=1, max_length=80, strip_whitespace=True)]
    price_cents: int = Field(gt=0, le=100_000_000)
    interval: Interval


class PlanOut(Output):
    id: UUID
    name: str
    price_cents: int
    interval: Interval
    currency: str


class SubscriptionIn(BaseModel):
    customer_id: UUID
    plan_id: UUID
    status: Literal["active", "trial"] = "active"


class SubscriptionUpdate(BaseModel):
    status: Literal["active", "cancelled", "expired"]


class SubscriptionOut(Output):
    id: UUID
    customer_id: UUID
    customer_name: str
    plan_id: UUID
    plan_name: str
    price_cents: int
    interval: Interval
    status: SubscriptionStatus
    started_at: datetime
    activated_at: datetime | None
    ends_at: datetime | None
    cancelled_at: datetime | None


class TransactionOut(Output):
    id: UUID
    customer_id: UUID
    customer_name: str
    subscription_id: UUID | None
    amount_cents: int
    currency: str
    status: TransactionStatus
    timestamp: datetime
    external_reference: str | None


class AuditOut(Output):
    id: UUID
    action: str
    timestamp: datetime
    details: dict


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class CustomerDetail(CustomerOut):
    subscriptions: list[SubscriptionOut]
    transactions: list[TransactionOut]
    activity: list[AuditOut]


class SubscriptionDetail(SubscriptionOut):
    activity: list[AuditOut]


class TransactionSummary(BaseModel):
    paid_cents: int
    pending_cents: int
    failed_cents: int
    refunded_cents: int
    count: int


class TransactionPage(Page[TransactionOut]):
    summary: TransactionSummary


class MetricSnapshot(BaseModel):
    mrr_cents: int
    arr_cents: int
    active_subscriptions: int
    paying_customers: int
    arpu_cents: int


class TrendPoint(BaseModel):
    date: str
    mrr_cents: int
    paid_cents: int
    customers: int
    new_subscriptions: int
    cancelled_subscriptions: int


class PlanMetric(BaseModel):
    plan_id: UUID | None
    name: str
    subscriptions: int
    mrr_cents: int
    paid_cents: int


class AnalyticsOut(BaseModel):
    history_start: str | None
    snapshot_comparison_available: bool
    revenue_comparison_available: bool
    start_date: str
    end_date: str
    timezone: str
    snapshot_at: str
    current: MetricSnapshot
    previous: MetricSnapshot
    churn_percent: float
    paid_cents: int
    previous_paid_cents: int
    revenue_growth_percent: float | None
    new_customers: int
    trend: list[TrendPoint]
    plans: list[PlanMetric]
