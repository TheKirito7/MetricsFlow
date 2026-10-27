import hashlib
import secrets
from dataclasses import dataclass

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.models import AuthSession, Membership, Organization, User, now_utc

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash(secrets.token_urlsafe(24))
COOKIE_NAME = "metricsflow_session"


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return hasher.verify(hashed, password)
    except (VerificationError, InvalidHashError):
        return False


@dataclass
class Principal:
    user: User
    membership: Membership
    organization: Organization
    session: AuthSession

    @property
    def org_id(self):
        return self.organization.id


def authenticated(request: Request, db: Session = Depends(get_db)) -> Principal:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Please sign in to continue")
    row = db.execute(
        select(AuthSession, Membership, User, Organization)
        .join(Membership, AuthSession.membership_id == Membership.id)
        .join(User, Membership.user_id == User.id)
        .join(Organization, Membership.organization_id == Organization.id)
        .where(AuthSession.token_hash == digest(token), AuthSession.expires_at > now_utc())
    ).first()
    if not row:
        raise HTTPException(401, "Your session expired. Please sign in again")
    session, membership, user, org = row
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), session.csrf_token):
            raise HTTPException(403, "Invalid CSRF token. Refresh and try again")
    return Principal(user, membership, org, session)


def admin(principal: Principal = Depends(authenticated)) -> Principal:
    if get_settings().read_only_demo:
        raise HTTPException(
            403, "This public demo is read-only. Run MetricsFlow locally to try admin workflows"
        )
    if principal.membership.role != "admin":
        raise HTTPException(403, "Administrator permissions required")
    return principal
