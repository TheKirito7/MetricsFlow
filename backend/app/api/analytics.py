from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import Principal, admin, authenticated
from app.repositories.records import audit
from app.schemas import AnalyticsOut, OrganizationOut, SettingsIn
from app.services.analytics import calculate

router = APIRouter(tags=["Analytics and organization"])


@router.get("/analytics/overview", response_model=AnalyticsOut)
@router.get("/analytics/revenue", response_model=AnalyticsOut)
@router.get("/analytics/customers", response_model=AnalyticsOut)
@router.get("/analytics/subscriptions", response_model=AnalyticsOut)
def analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    principal: Principal = Depends(authenticated),
    db: Session = Depends(get_db),
):
    return calculate(db, principal.org_id, principal.organization.timezone, start_date, end_date)


@router.patch("/organization", response_model=OrganizationOut)
def settings(data: SettingsIn, principal: Principal = Depends(admin), db: Session = Depends(get_db)):
    principal.organization.name = data.name
    principal.organization.timezone = data.timezone
    audit(db, principal, "organization.updated", principal.org_id, timezone=data.timezone)
    return principal.organization
