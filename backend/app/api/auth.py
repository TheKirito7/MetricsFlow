import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    COOKIE_NAME,
    DUMMY_HASH,
    Principal,
    authenticated,
    digest,
    hasher,
    verify_password,
)
from app.models import AuthSession, LoginAttempt, Membership, Organization, User, now_utc
from app.schemas import LoginIn, MeOut, OrganizationOut, WorkspaceOption, WorkspaceSelection

router = APIRouter(tags=["Authentication"])


def me_response(principal: Principal) -> MeOut:
    return MeOut(
        id=principal.user.id,
        name=principal.user.name,
        email=principal.user.email,
        role="admin" if principal.membership.role == "admin" else "viewer",
        organization=OrganizationOut.model_validate(principal.organization),
        csrf_token=principal.session.csrf_token,
        session_expires_at=principal.session.expires_at,
        read_only_demo=get_settings().read_only_demo,
    )


@router.post("/auth/login", response_model=MeOut | WorkspaceSelection)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    now = now_utc()
    email = str(data.email).lower()
    ip = request.client.host if request.client else "unknown"
    keys = [digest("ip:" + ip), digest("email:" + email)]
    if db.get_bind().dialect.name == "postgresql":
        # Serialize the counters across workers without another infrastructure service.
        for key in sorted(keys):
            lock_id = int(key[:16], 16)
            if lock_id >= 2**63:
                lock_id -= 2**64
            db.execute(select(func.pg_advisory_xact_lock(lock_id)))
    db.execute(delete(LoginAttempt).where(LoginAttempt.created_at < now - timedelta(minutes=15)))
    for key in keys:
        count = (
            db.scalar(select(func.count()).select_from(LoginAttempt).where(LoginAttempt.key_hash == key)) or 0
        )
        if count >= (40 if key == keys[0] else 10):
            db.commit()
            raise HTTPException(
                429, "Too many sign-in attempts. Try again in 15 minutes", headers={"Retry-After": "900"}
            )
        db.add(LoginAttempt(key_hash=key, created_at=now))
    db.commit()  # Persist attempts even when authentication fails.
    user = db.scalar(select(User).where(User.email == email))
    valid = verify_password(data.password, user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Email or password is incorrect")
    statement = select(Membership).where(Membership.user_id == user.id).order_by(Membership.organization_id)
    if data.organization_id:
        statement = statement.where(Membership.organization_id == data.organization_id)
    memberships = list(db.scalars(statement))
    if not memberships:
        raise HTTPException(401, "No access to this organization")
    if len(memberships) > 1:
        organizations = {
            org.id: org
            for org in db.scalars(
                select(Organization).where(Organization.id.in_([m.organization_id for m in memberships]))
            )
        }
        return WorkspaceSelection(
            workspaces=[
                WorkspaceOption(
                    id=m.organization_id,
                    name=organizations[m.organization_id].name,
                    role="admin" if m.role == "admin" else "viewer",
                )
                for m in memberships
            ]
        )
    member = memberships[0]
    db.execute(delete(LoginAttempt).where(LoginAttempt.key_hash == keys[1]))
    org = db.get(Organization, member.organization_id)
    if org is None:
        raise HTTPException(401, "No access to this organization")
    if hasher.check_needs_rehash(user.password_hash):
        user.password_hash = hasher.hash(data.password)
    previous = request.cookies.get(COOKIE_NAME)
    if previous:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == digest(previous)))
    db.execute(delete(AuthSession).where(AuthSession.expires_at < now))
    token = secrets.token_urlsafe(32)
    settings = get_settings()
    session = AuthSession(
        token_hash=digest(token),
        csrf_token=secrets.token_urlsafe(32),
        membership_id=member.id,
        expires_at=now + timedelta(hours=settings.session_hours),
    )
    db.add(session)
    db.flush()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.session_hours * 3600,
        path="/",
    )
    return me_response(Principal(user, member, org, session))


@router.get("/me", response_model=MeOut)
def me(principal: Principal = Depends(authenticated)):
    return me_response(principal)


@router.post("/auth/logout", status_code=204)
def logout(response: Response, principal: Principal = Depends(authenticated), db: Session = Depends(get_db)):
    db.delete(principal.session)
    response.delete_cookie(
        COOKIE_NAME, path="/", secure=get_settings().cookie_secure, httponly=True, samesite="lax"
    )
