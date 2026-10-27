"""Privately provision an organization's first administrator, without public registration."""

import argparse
from getpass import getpass
from zoneinfo import ZoneInfo

from pydantic import EmailStr, TypeAdapter
from sqlalchemy import select

from app.core.database import SessionLocal
from app.core.security import hasher
from app.models import Membership, Organization, User


def provision(email: str, name: str, organization: str, timezone: str, password: str):
    email = str(TypeAdapter(EmailStr).validate_python(email)).lower()
    ZoneInfo(timezone)
    if not name.strip() or len(name) > 120 or not organization.strip() or len(organization) > 120:
        raise ValueError("Names must be between 1 and 120 characters")
    if len(password) < 14 or len(password) > 128:
        raise ValueError("Use a password between 14 and 128 characters")
    with SessionLocal.begin() as db:
        if db.scalar(select(User).where(User.email == email)):
            raise ValueError("This email already exists; no records were changed")
        user = User(email=email, name=name.strip(), password_hash=hasher.hash(password))
        org = Organization(name=organization.strip(), timezone=timezone, currency="EUR")
        db.add_all([user, org])
        db.flush()
        db.add(Membership(user_id=user.id, organization_id=org.id, role="admin"))
    print("Organization and administrator created.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--organization", required=True)
    parser.add_argument("--timezone", default="Europe/Lisbon")
    args = parser.parse_args()
    password = getpass("Administrator password (14–128 characters): ")
    if password != getpass("Confirm password: "):
        raise SystemExit("Passwords do not match")
    try:
        provision(args.email, args.name, args.organization, args.timezone, password)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
