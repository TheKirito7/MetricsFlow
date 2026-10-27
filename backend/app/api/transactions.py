import csv
import io
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import Principal, admin, authenticated
from app.models import Transaction
from app.repositories.records import owned, paginate, transaction_out, transaction_query
from app.schemas import (
    SimulatedPaymentIn,
    TransactionOut,
    TransactionPage,
    TransactionStatus,
    TransactionSummary,
)
from app.services.analytics import date_bounds
from app.services.payments import record_payment

router = APIRouter(tags=["Transactions"])


@router.post(
    "/transactions/simulate",
    response_model=TransactionOut,
    status_code=201,
    responses={
        200: {"model": TransactionOut, "description": "Identical idempotent replay; no new payment"},
        401: {"description": "Authentication required"},
        403: {"description": "Admin access and valid CSRF required; public demo is read-only"},
        404: {"description": "Subscription not found in the authenticated organization"},
        409: {"description": "Key reused for a different subscription or subscription is not billable"},
    },
)
def simulate_payment(
    data: SimulatedPaymentIn,
    response: Response,
    principal: Principal = Depends(admin),
    db: Session = Depends(get_db),
):
    payment, created = record_payment(db, principal, data)
    response.status_code = 201 if created else 200
    return transaction_out(
        db.execute(transaction_query(principal.org_id).where(Transaction.id == payment.id)).one()
    )


def filtered(principal, status, start_date, end_date, customer_id):
    statement = transaction_query(principal.org_id)
    if status:
        statement = statement.where(Transaction.status == status)
    if start_date or end_date:
        _, _, lower, upper = date_bounds(start_date, end_date, principal.organization.timezone)
        statement = statement.where(Transaction.timestamp >= lower, Transaction.timestamp < upper)
    if customer_id:
        statement = statement.where(Transaction.customer_id == customer_id)
    return statement


@router.get("/transactions", response_model=TransactionPage)
def transactions(
    status: TransactionStatus | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    customer_id: UUID | None = None,
    sort: Literal["timestamp", "amount_cents"] = "timestamp",
    order: Literal["asc", "desc"] = "desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: Principal = Depends(authenticated),
    db: Session = Depends(get_db),
):
    statement = filtered(principal, status, start_date, end_date, customer_id)
    column = getattr(Transaction, sort)
    rows, total = paginate(
        db,
        statement.order_by(column.desc() if order == "desc" else column.asc(), Transaction.id),
        page,
        page_size,
    )
    subquery = statement.with_only_columns(Transaction.status, Transaction.amount_cents).subquery()
    sums: dict[str, int] = {
        row[0]: row[1]
        for row in db.execute(
            select(subquery.c.status, func.sum(subquery.c.amount_cents)).group_by(subquery.c.status)
        ).all()
    }
    summary = TransactionSummary(
        paid_cents=sums.get("paid", 0),
        pending_cents=sums.get("pending", 0),
        failed_cents=sums.get("failed", 0),
        refunded_cents=sums.get("refunded", 0),
        count=total,
    )
    return TransactionPage(
        items=[transaction_out(r) for r in rows], total=total, page=page, page_size=page_size, summary=summary
    )


@router.get("/transactions/{transaction_id}", response_model=TransactionOut)
def transaction_detail(
    transaction_id: UUID, principal: Principal = Depends(authenticated), db: Session = Depends(get_db)
):
    owned(db, Transaction, transaction_id, principal.org_id)
    return transaction_out(
        db.execute(transaction_query(principal.org_id).where(Transaction.id == transaction_id)).one()
    )


def safe_cell(value: str) -> str:
    # Quoting alone does not prevent spreadsheet formula injection.
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")) else value


@router.get("/reports/transactions.csv")
def export_transactions(
    status: TransactionStatus | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    customer_id: UUID | None = None,
    sort: Literal["timestamp", "amount_cents"] = "timestamp",
    order: Literal["asc", "desc"] = "desc",
    principal: Principal = Depends(authenticated),
    db: Session = Depends(get_db),
):
    statement = filtered(principal, status, start_date, end_date, customer_id)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    if count > 50_000:
        raise HTTPException(422, "Narrow your filters to export at most 50,000 transactions")
    column = getattr(Transaction, sort)
    # Bounded materialization detaches the export from the request database transaction.
    rows = db.execute(
        statement.order_by(column.desc() if order == "desc" else column.asc(), Transaction.id)
    ).all()

    def generate():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            ["id", "customer", "amount_cents", "currency", "status", "timestamp_utc", "external_reference"]
        )
        yield buffer.getvalue()
        for transaction, name in rows:
            buffer.seek(0)
            buffer.truncate(0)
            writer.writerow(
                [
                    str(transaction.id),
                    safe_cell(name),
                    transaction.amount_cents,
                    transaction.currency,
                    transaction.status,
                    transaction.timestamp.isoformat() + "Z",
                    safe_cell(transaction.external_reference or ""),
                ]
            )
            yield buffer.getvalue()

    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="metricsflow-transactions.csv"',
            "Cache-Control": "no-store",
        },
    )
