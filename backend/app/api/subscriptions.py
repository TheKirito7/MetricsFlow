from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import Principal, admin, authenticated
from app.models import AuditLog, Plan, Subscription
from app.repositories.records import audit, owned, paginate, subscription_out, subscription_query
from app.schemas import (
    AuditOut,
    Page,
    PlanIn,
    PlanOut,
    SubscriptionDetail,
    SubscriptionIn,
    SubscriptionOut,
    SubscriptionStatus,
    SubscriptionUpdate,
)
from app.services.subscriptions import create_subscription, transition

router = APIRouter(tags=["Subscriptions"])


@router.get("/plans", response_model=list[PlanOut])
def plans(principal: Principal = Depends(authenticated), db: Session = Depends(get_db)):
    return db.scalars(
        select(Plan).where(Plan.organization_id == principal.org_id).order_by(Plan.price_cents, Plan.id)
    ).all()


@router.post("/plans", response_model=PlanOut, status_code=201)
def add_plan(data: PlanIn, principal: Principal = Depends(admin), db: Session = Depends(get_db)):
    record = Plan(organization_id=principal.org_id, **data.model_dump())
    db.add(record)
    db.flush()
    audit(db, principal, "plan.created", record.id)
    return record


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def edit_plan(
    plan_id: UUID, data: PlanIn, principal: Principal = Depends(admin), db: Session = Depends(get_db)
):
    record = owned(db, Plan, plan_id, principal.org_id)
    for key, value in data.model_dump().items():
        setattr(record, key, value)
    audit(db, principal, "plan.updated", record.id, price_cents=record.price_cents)
    return record


@router.get("/subscriptions", response_model=Page[SubscriptionOut])
def subscriptions(
    status: SubscriptionStatus | None = None,
    customer_id: UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: Principal = Depends(authenticated),
    db: Session = Depends(get_db),
):
    query = subscription_query(principal.org_id)
    if status:
        query = query.where(Subscription.status == status)
    if customer_id:
        query = query.where(Subscription.customer_id == customer_id)
    rows, total = paginate(
        db, query.order_by(Subscription.started_at.desc(), Subscription.id), page, page_size
    )
    return Page(items=[subscription_out(r) for r in rows], total=total, page=page, page_size=page_size)


@router.post("/subscriptions", response_model=SubscriptionOut, status_code=201)
def add_subscription(
    data: SubscriptionIn, principal: Principal = Depends(admin), db: Session = Depends(get_db)
):
    record = create_subscription(db, principal, data)
    return subscription_out(
        db.execute(subscription_query(principal.org_id).where(Subscription.id == record.id)).one()
    )


@router.get("/subscriptions/{subscription_id}", response_model=SubscriptionDetail)
def subscription_detail(
    subscription_id: UUID, principal: Principal = Depends(authenticated), db: Session = Depends(get_db)
):
    owned(db, Subscription, subscription_id, principal.org_id)
    record = subscription_out(
        db.execute(subscription_query(principal.org_id).where(Subscription.id == subscription_id)).one()
    )
    activity = db.scalars(
        select(AuditLog)
        .where(AuditLog.organization_id == principal.org_id, AuditLog.resource_id == subscription_id)
        .order_by(AuditLog.timestamp.desc())
        .limit(50)
    ).all()
    return SubscriptionDetail(
        **record.model_dump(), activity=[AuditOut.model_validate(event) for event in activity]
    )


@router.patch("/subscriptions/{subscription_id}", response_model=SubscriptionOut)
def edit_subscription(
    subscription_id: UUID,
    data: SubscriptionUpdate,
    principal: Principal = Depends(admin),
    db: Session = Depends(get_db),
):
    record = owned(db, Subscription, subscription_id, principal.org_id)
    transition(db, principal, record, data)
    db.flush()
    return subscription_out(
        db.execute(subscription_query(principal.org_id).where(Subscription.id == record.id)).one()
    )
