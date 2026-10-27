from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Customer, Plan, Subscription, now_utc
from app.repositories.records import audit, owned
from app.schemas import SubscriptionIn, SubscriptionUpdate


def create_subscription(db: Session, principal, data: SubscriptionIn) -> Subscription:
    customer = owned(db, Customer, data.customer_id, principal.org_id)
    if customer.status == "archived":
        raise HTTPException(409, "Restore this customer before assigning a subscription")
    plan = owned(db, Plan, data.plan_id, principal.org_id)
    now = now_utc()
    sub = Subscription(
        organization_id=principal.org_id,
        customer_id=customer.id,
        plan_id=plan.id,
        plan_name=plan.name,
        price_cents=plan.price_cents,
        interval=plan.interval,
        currency=plan.currency,
        status=data.status,
        started_at=now,
        activated_at=now if data.status == "active" else None,
    )
    db.add(sub)
    db.flush()
    audit(
        db,
        principal,
        "subscription.created",
        sub.id,
        customer_id=str(customer.id),
        plan=plan.name,
        status=data.status,
    )
    return sub


def transition(db: Session, principal, sub: Subscription, data: SubscriptionUpdate):
    allowed = {"trial": {"active", "cancelled", "expired"}, "active": {"cancelled", "expired"}}
    if data.status not in allowed.get(sub.status, set()):
        raise HTTPException(409, f"Cannot change a {sub.status} subscription to {data.status}")
    now = now_utc()
    if data.status == "active":
        sub.activated_at = now
    else:
        sub.ends_at = now
        if data.status == "cancelled":
            sub.cancelled_at = now
    before = sub.status
    sub.status = data.status
    audit(
        db,
        principal,
        "subscription." + data.status,
        sub.id,
        previous=before,
        customer_id=str(sub.customer_id),
        effective_at=now.isoformat() + "Z",
    )
