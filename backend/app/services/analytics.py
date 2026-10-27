from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Customer, Subscription, Transaction, now_utc
from app.schemas import AnalyticsOut, MetricSnapshot, PlanMetric, TrendPoint


def cents(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def monthly_charge(subscription: Subscription) -> Decimal:
    return Decimal(subscription.price_cents) / (12 if subscription.interval == "yearly" else 1)


def active_at(subscription: Subscription, instant: datetime) -> bool:
    return bool(
        subscription.activated_at is not None
        and subscription.activated_at <= instant
        and (subscription.ends_at is None or subscription.ends_at > instant)
    )


def snapshot(subscriptions: list[Subscription], instant: datetime) -> MetricSnapshot:
    active = [s for s in subscriptions if active_at(s, instant)]
    mrr = sum((monthly_charge(s) for s in active), Decimal(0))
    customers = len({s.customer_id for s in active})
    return MetricSnapshot(
        mrr_cents=cents(mrr),
        arr_cents=cents(mrr * 12),
        active_subscriptions=len(active),
        paying_customers=customers,
        arpu_cents=cents(mrr / customers) if customers else 0,
    )


def local_midnight(value: date, timezone: str) -> datetime:
    return datetime.combine(value, time.min, ZoneInfo(timezone)).astimezone(UTC).replace(tzinfo=None)


def date_bounds(start: date | None, end: date | None, timezone: str):
    today = now_utc().replace(tzinfo=UTC).astimezone(ZoneInfo(timezone)).date()
    end = end or today
    start = start or end - timedelta(days=29)
    if start > end or (end - start).days > 730:
        raise HTTPException(422, "Choose an ordered date range of at most 731 days")
    if end > today:
        raise HTTPException(422, "Reporting end date cannot be in the future")
    return start, end, local_midnight(start, timezone), local_midnight(end + timedelta(days=1), timezone)


def calculate(db: Session, org_id: UUID, timezone: str, start: date | None, end: date | None) -> AnalyticsOut:
    start, end, lower, upper = date_bounds(start, end, timezone)
    # Partial current day snapshots use now; historical end dates use the last microsecond of the day.
    instant = min(upper - timedelta(microseconds=1), now_utc())
    previous_end = lower - timedelta(microseconds=1)
    previous_start_date = start - timedelta(days=(end - start).days + 1)
    previous_lower = local_midnight(previous_start_date, timezone)
    subscriptions = list(
        db.scalars(
            select(Subscription).where(
                Subscription.organization_id == org_id, Subscription.started_at <= instant
            )
        )
    )
    current = snapshot(subscriptions, instant)
    previous = snapshot(subscriptions, previous_end)
    starting_ids = {s.customer_id for s in subscriptions if active_at(s, previous_end)}
    ending_ids = {s.customer_id for s in subscriptions if active_at(s, instant)}
    churn = len(starting_ids - ending_ids) / len(starting_ids) * 100 if starting_ids else 0
    transactions = list(
        db.scalars(
            select(Transaction).where(
                Transaction.organization_id == org_id,
                Transaction.status == "paid",
                Transaction.timestamp >= previous_lower,
                Transaction.timestamp <= instant,
            )
        )
    )
    paid = sum(t.amount_cents for t in transactions if t.timestamp >= lower)
    previous_paid = sum(t.amount_cents for t in transactions if t.timestamp < lower)
    customers = list(
        db.scalars(
            select(Customer.created_at).where(
                Customer.organization_id == org_id, Customer.created_at <= instant
            )
        )
    )

    @dataclass
    class PlanBucket:
        subscriptions: int = 0
        mrr: Decimal = Decimal(0)
        paid: int = 0

    by_plan: dict[tuple[UUID | None, str], PlanBucket] = defaultdict(PlanBucket)
    sub_lookup = {s.id: s for s in subscriptions}
    for s in subscriptions:
        if active_at(s, instant):
            by_plan[s.plan_id, s.plan_name].subscriptions += 1
            by_plan[s.plan_id, s.plan_name].mrr += monthly_charge(s)
    for t in transactions:
        if t.timestamp >= lower:
            linked = sub_lookup.get(t.subscription_id) if t.subscription_id else None
            key = (linked.plan_id, linked.plan_name) if linked else (None, "Unassigned")
            by_plan[key].paid += t.amount_cents
    first_payment = db.scalar(
        select(func.min(Transaction.timestamp)).where(Transaction.organization_id == org_id)
    )
    dates = customers + [s.started_at for s in subscriptions] + ([first_payment] if first_payment else [])
    first_record = min(dates) if dates else None
    snapshot_available = first_record is not None and first_record <= previous_end
    revenue_available = first_record is not None and first_record <= previous_lower
    trend = []
    cursor = start
    monthly = (end - start).days > 90
    while cursor <= end:
        following = (
            (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
            if monthly
            else cursor + timedelta(days=1)
        )
        bucket_end = min(following, end + timedelta(days=1))
        a = local_midnight(cursor, timezone)
        b = local_midnight(bucket_end, timezone)
        at = min(b - timedelta(microseconds=1), instant)
        snap = snapshot(subscriptions, at)
        trend.append(
            TrendPoint(
                date=cursor.isoformat(),
                mrr_cents=snap.mrr_cents,
                paid_cents=sum(t.amount_cents for t in transactions if a <= t.timestamp < b),
                customers=sum(c <= at for c in customers),
                new_subscriptions=sum(a <= s.started_at < b for s in subscriptions),
                cancelled_subscriptions=sum(
                    s.cancelled_at is not None and a <= s.cancelled_at < b for s in subscriptions
                ),
            )
        )
        cursor = bucket_end
    return AnalyticsOut(
        history_start=first_record.replace(tzinfo=UTC).isoformat() if first_record else None,
        snapshot_comparison_available=snapshot_available,
        revenue_comparison_available=revenue_available,
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        timezone=timezone,
        snapshot_at=instant.replace(tzinfo=UTC).isoformat(),
        current=current,
        previous=previous,
        churn_percent=round(churn, 2),
        paid_cents=paid,
        previous_paid_cents=previous_paid,
        revenue_growth_percent=round((paid - previous_paid) / previous_paid * 100, 2)
        if previous_paid and revenue_available
        else None,
        new_customers=sum(lower <= c <= instant for c in customers),
        trend=trend,
        plans=[
            PlanMetric(
                plan_id=plan_id,
                name=name,
                subscriptions=p.subscriptions,
                mrr_cents=cents(p.mrr),
                paid_cents=p.paid,
            )
            for (plan_id, name), p in sorted(by_plan.items(), key=lambda item: (item[0][1], str(item[0][0])))
        ],
    )
