from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import AuditLog, Customer, Subscription, Transaction
from app.schemas import SubscriptionOut, TransactionOut


def owned(db: Session, model, resource_id: UUID, org_id: UUID):
    record = db.scalar(select(model).where(model.id == resource_id, model.organization_id == org_id))
    if record is None:
        raise HTTPException(404, "Record not found")
    return record


def audit(db: Session, principal, action: str, resource_id: UUID, **details):
    db.add(
        AuditLog(
            organization_id=principal.org_id,
            actor_id=principal.user.id,
            action=action,
            resource_id=resource_id,
            details=details,
        )
    )


def paginate(db: Session, statement, page: int, page_size: int):
    total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    return db.execute(statement.offset((page - 1) * page_size).limit(page_size)).all(), total


def subscription_query(org_id: UUID):
    return (
        select(Subscription, Customer.name)
        .join(Customer, Subscription.customer_id == Customer.id)
        .where(Subscription.organization_id == org_id, Customer.organization_id == org_id)
    )


def subscription_out(row) -> SubscriptionOut:
    record, customer_name = row
    values = {
        field: getattr(record, field) for field in SubscriptionOut.model_fields if field != "customer_name"
    }
    return SubscriptionOut(**values, customer_name=customer_name)


def transaction_query(org_id: UUID):
    return (
        select(Transaction, Customer.name)
        .join(Customer, Transaction.customer_id == Customer.id)
        .where(Transaction.organization_id == org_id, Customer.organization_id == org_id)
    )


def transaction_out(row) -> TransactionOut:
    record, customer_name = row
    values = {
        field: getattr(record, field) for field in TransactionOut.model_fields if field != "customer_name"
    }
    return TransactionOut(**values, customer_name=customer_name)
