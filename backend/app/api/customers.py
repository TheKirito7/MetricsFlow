from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import Principal, admin, authenticated
from app.models import AuditLog, Customer, Subscription, Transaction
from app.repositories.records import (
    audit,
    owned,
    paginate,
    subscription_out,
    subscription_query,
    transaction_out,
    transaction_query,
)
from app.schemas import (
    AuditOut,
    CustomerDetail,
    CustomerIn,
    CustomerOut,
    CustomerStatus,
    CustomerUpdate,
    Page,
)

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.get("", response_model=Page[CustomerOut])
def list_customers(
    search: str = Query("", max_length=120),
    status: CustomerStatus | None = None,
    sort: Literal["name", "email", "created_at"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: Principal = Depends(authenticated),
    db: Session = Depends(get_db),
):
    statement = select(Customer).where(Customer.organization_id == principal.org_id)
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        statement = statement.where(
            or_(
                Customer.name.ilike(f"%{escaped}%", escape="\\"),
                Customer.email.ilike(f"%{escaped}%", escape="\\"),
            )
        )
    if status:
        statement = statement.where(Customer.status == status)
    column = getattr(Customer, sort)
    rows, total = paginate(
        db,
        statement.order_by(column.desc() if order == "desc" else column.asc(), Customer.id),
        page,
        page_size,
    )
    return Page(
        items=[CustomerOut.model_validate(row[0]) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=CustomerOut, status_code=201)
def create_customer(data: CustomerIn, principal: Principal = Depends(admin), db: Session = Depends(get_db)):
    record = Customer(organization_id=principal.org_id, **data.model_dump())
    db.add(record)
    db.flush()
    audit(db, principal, "customer.created", record.id)
    return record


@router.get("/{customer_id}", response_model=CustomerDetail)
def customer_detail(
    customer_id: UUID, principal: Principal = Depends(authenticated), db: Session = Depends(get_db)
):
    record = owned(db, Customer, customer_id, principal.org_id)
    # Detail shows the latest 50 related records; the full ledgers are separately paginated.
    subs = db.execute(
        subscription_query(principal.org_id)
        .where(Subscription.customer_id == record.id)
        .order_by(Subscription.started_at.desc())
        .limit(50)
    ).all()
    transactions = db.execute(
        transaction_query(principal.org_id)
        .where(Transaction.customer_id == record.id)
        .order_by(Transaction.timestamp.desc())
        .limit(50)
    ).all()
    activity = db.scalars(
        select(AuditLog)
        .where(AuditLog.organization_id == principal.org_id, AuditLog.resource_id == record.id)
        .order_by(AuditLog.timestamp.desc())
        .limit(50)
    ).all()
    return CustomerDetail(
        **CustomerOut.model_validate(record).model_dump(),
        subscriptions=[subscription_out(s) for s in subs],
        transactions=[transaction_out(t) for t in transactions],
        activity=[AuditOut.model_validate(event) for event in activity],
    )


@router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: UUID,
    data: CustomerUpdate,
    principal: Principal = Depends(admin),
    db: Session = Depends(get_db),
):
    record = owned(db, Customer, customer_id, principal.org_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(record, key, value)
    audit(db, principal, "customer.updated", record.id, status=record.status)
    db.flush()
    return record


@router.delete("/{customer_id}", status_code=204)
def archive_customer(customer_id: UUID, principal: Principal = Depends(admin), db: Session = Depends(get_db)):
    record = owned(db, Customer, customer_id, principal.org_id)
    record.status = "archived"
    audit(db, principal, "customer.archived", record.id)
    return Response(status_code=204)
