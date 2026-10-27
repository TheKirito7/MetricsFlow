import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.models import Customer, Subscription, Transaction
from app.services.analytics import (
    active_at,
    calculate,
    cents,
    date_bounds,
    local_midnight,
    monthly_charge,
    snapshot,
)


def sub(price=2900, interval="monthly", customer_id=None, start=datetime(2025, 1, 1), end=None, trial=False):
    return Subscription(
        id=uuid.uuid4(),
        customer_id=customer_id or uuid.uuid4(),
        plan_name="Test",
        price_cents=price,
        interval=interval,
        started_at=start,
        activated_at=None if trial else start,
        ends_at=end,
    )


def test_yearly_normalization_and_rounding_only_after_sum():
    subscriptions = [sub(price=10000, interval="yearly") for _ in range(3)]
    assert monthly_charge(subscriptions[0]) == Decimal(10000) / 12
    report = snapshot(subscriptions, datetime(2025, 2, 1))
    assert report.mrr_cents == 2500
    assert report.arr_cents == 30000
    assert report.arpu_cents == 833
    assert cents(Decimal("12.5")) == 13


def test_zero_division_and_trial_exclusion():
    assert snapshot([], datetime(2025, 2, 1)).model_dump() == {
        "mrr_cents": 0,
        "arr_cents": 0,
        "active_subscriptions": 0,
        "paying_customers": 0,
        "arpu_cents": 0,
    }
    assert snapshot([sub(trial=True)], datetime(2025, 2, 1)).mrr_cents == 0


def test_multiple_subscriptions_count_one_paying_customer():
    customer_id = uuid.uuid4()
    report = snapshot(
        [sub(customer_id=customer_id), sub(price=7900, customer_id=customer_id)], datetime(2025, 2, 1)
    )
    assert report.paying_customers == 1
    assert report.active_subscriptions == 2
    assert report.arpu_cents == 10800


def test_exclusive_cancellation_boundary_and_historical_status():
    end = datetime(2025, 3, 15, 12)
    subscription = sub(end=end)
    subscription.status = "cancelled"
    assert active_at(subscription, end - timedelta(microseconds=1))
    assert not active_at(subscription, end)
    assert not active_at(subscription, datetime(2024, 12, 31))
    assert snapshot([subscription], datetime(2025, 2, 1)).mrr_cents == 2900


def test_lisbon_daylight_saving_boundaries():
    assert local_midnight(date(2026, 10, 26), "Europe/Lisbon") - local_midnight(
        date(2026, 10, 25), "Europe/Lisbon"
    ) == timedelta(hours=25)
    assert local_midnight(date(2026, 3, 30), "Europe/Lisbon") - local_midnight(
        date(2026, 3, 29), "Europe/Lisbon"
    ) == timedelta(hours=23)
    assert local_midnight(date(2026, 6, 1), "Europe/Lisbon") == datetime(2026, 5, 31, 23)


@pytest.mark.parametrize(
    "start,end",
    [
        (date(2026, 2, 1), date(2026, 1, 1)),
        (date(2020, 1, 1), date(2026, 1, 1)),
        (date(2099, 1, 1), date(2099, 1, 1)),
    ],
)
def test_invalid_periods(start, end):
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        date_bounds(start, end, "UTC")


def test_revenue_churn_and_tenant_isolation(db, records):
    org = records["orgs"][0]
    subscription = records["subscriptions"][0]
    subscription.ends_at = datetime(2026, 1, 20)
    subscription.cancelled_at = subscription.ends_at
    subscription.status = "cancelled"
    customer = records["customers"][0]
    customer.status = "archived"
    db.add_all(
        [
            Transaction(
                organization_id=org.id,
                customer_id=customer.id,
                amount_cents=4000,
                status="paid",
                timestamp=datetime(2025, 12, 20),
            ),
            Transaction(
                organization_id=org.id,
                customer_id=customer.id,
                amount_cents=9000,
                status="failed",
                timestamp=datetime(2026, 1, 16),
            ),
            Transaction(
                organization_id=org.id,
                customer_id=customer.id,
                amount_cents=3000,
                status="refunded",
                timestamp=datetime(2026, 1, 16),
            ),
        ]
    )
    db.commit()
    report = calculate(db, org.id, "UTC", date(2026, 1, 1), date(2026, 1, 31))
    assert report.current.mrr_cents == 0
    assert report.previous.mrr_cents == 7900
    assert report.churn_percent == 100
    assert report.paid_cents == 7900
    assert report.current.paying_customers == 0
    assert all(p.plan_id != records["plans"][1].id for p in report.plans)
    foreign_report = calculate(db, records["orgs"][1].id, "UTC", date(2026, 1, 1), date(2026, 1, 31))
    assert foreign_report.current.mrr_cents == 7900
    assert foreign_report.churn_percent == 0
    assert report.previous_paid_cents == 4000
    assert report.revenue_growth_percent == 97.5
    assert sum(p.paid_cents for p in report.trend) == 7900
    assert sum(p.cancelled_subscriptions for p in report.trend) == 1


def test_churn_requires_losing_all_subscriptions(db, records):
    org = records["orgs"][0]
    first = records["subscriptions"][0]
    first.ends_at = datetime(2026, 1, 20)
    second = sub(price=2900, customer_id=first.customer_id)
    second.organization_id = org.id
    second.plan_id = first.plan_id
    second.status = "active"
    db.add(second)
    db.commit()
    report = calculate(db, org.id, "UTC", date(2026, 1, 1), date(2026, 1, 31))
    assert report.churn_percent == 0
    assert report.current.mrr_cents == 2900
    assert report.current.paying_customers == 1


def test_empty_organization_has_no_baseline_or_data(db, records):
    report = calculate(db, uuid.uuid4(), "Europe/Lisbon", date(2026, 1, 1), date(2026, 1, 31))
    assert report.revenue_growth_percent is None
    assert report.current.mrr_cents == report.churn_percent == report.paid_cents == 0
    assert len(report.trend) == 31
    assert report.plans == []


def test_paid_transaction_local_date_boundary(db, records):
    org = records["orgs"][0]
    customer = records["customers"][0]
    # June 1 local begins May 31 at 23:00 UTC in Lisbon.
    for hour, minute, amount in [(22, 59, 100), (23, 0, 200)]:
        db.add(
            Transaction(
                organization_id=org.id,
                customer_id=customer.id,
                amount_cents=amount,
                status="paid",
                timestamp=datetime(2026, 5, 31, hour, minute),
            )
        )
    db.commit()
    report = calculate(db, org.id, "Europe/Lisbon", date(2026, 6, 1), date(2026, 6, 1))
    assert report.paid_cents == 200
    assert report.previous_paid_cents == 100


def test_customer_counts_include_archived_without_affecting_mrr(db, records):
    customer = records["customers"][0]
    customer.status = "archived"
    db.add(
        Customer(
            organization_id=records["orgs"][0].id,
            name="New",
            email="jan@example.com",
            created_at=datetime(2026, 1, 14),
        )
    )
    db.commit()
    report = calculate(db, records["orgs"][0].id, "UTC", date(2026, 1, 1), date(2026, 1, 31))
    assert report.current.paying_customers == 1
    assert report.new_customers == 1
    assert report.trend[-1].customers == 2
