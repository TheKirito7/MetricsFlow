"""Explicitly simulated, tenant-scoped payments. No processor or external charge is invoked."""

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import Principal
from app.models import Subscription, Transaction, now_utc
from app.repositories.records import audit, owned
from app.schemas import SimulatedPaymentIn
from app.services.analytics import active_at


def record_payment(db: Session, principal: Principal, data: SimulatedPaymentIn) -> tuple[Transaction, bool]:
    key = str(data.idempotency_key)
    lookup = select(Transaction).where(
        Transaction.organization_id == principal.org_id, Transaction.idempotency_key == key
    )
    existing = db.scalar(lookup)
    if existing:
        if existing.subscription_id != data.subscription_id:
            raise HTTPException(409, "This idempotency key was already used for another subscription")
        return existing, False
    sub = owned(db, Subscription, data.subscription_id, principal.org_id)
    now = now_utc()
    if not active_at(sub, now):
        raise HTTPException(409, "Only an active billable subscription can receive a simulated payment")
    payment = Transaction(
        organization_id=principal.org_id,
        customer_id=sub.customer_id,
        subscription_id=sub.id,
        amount_cents=sub.price_cents,
        currency=sub.currency,
        status="paid",
        timestamp=now,
        external_reference="SIM-" + uuid4().hex[:16],
        idempotency_key=key,
    )
    try:
        with db.begin_nested():
            db.add(payment)
            db.flush()
    except IntegrityError:
        # A concurrent retry can win the unique constraint; replay only an identical operation.
        existing = db.scalar(lookup)
        if existing and existing.subscription_id == data.subscription_id:
            return existing, False
        raise HTTPException(409, "This idempotency key conflicts with another payment") from None
    audit(
        db,
        principal,
        "transaction.simulated",
        payment.id,
        subscription_id=str(sub.id),
        amount_cents=sub.price_cents,
    )
    return payment, True
