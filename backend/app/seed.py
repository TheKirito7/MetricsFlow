"""Development-only deterministic seed. Run migrations first; never mutates an existing demo."""

import argparse
import calendar
import random
import uuid
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.security import hasher
from app.models import AuditLog, Customer, Membership, Organization, Plan, Subscription, Transaction, User

NAMESPACE = uuid.UUID("a67df730-1c0b-499c-992d-08d74bebce83")


def seed_id(value: str):
    return uuid.uuid5(NAMESPACE, value)


def add_months(value: datetime, months: int):
    total = value.year * 12 + value.month - 1 + months
    year, month = divmod(total, 12)
    return value.replace(
        year=year, month=month + 1, day=min(value.day, calendar.monthrange(year, month + 1)[1])
    )


def seed(*, public_demo: bool = False):
    config = get_settings()
    if public_demo and not (config.app_env == "production" and config.read_only_demo):
        raise SystemExit("Public demo provisioning requires production mode and READ_ONLY_DEMO=true")
    if not public_demo and config.app_env != "development":
        raise SystemExit("Demo seeding is restricted to APP_ENV=development")
    if not config.demo_password or len(config.demo_password) < 12:
        raise SystemExit("Set DEMO_PASSWORD to a development-only password of at least 12 characters")
    today = config.seed_today or datetime.now(UTC).date()
    reference = datetime.combine(today, time(9))
    org_id = seed_id("northstar")
    rng = random.Random(42)
    with SessionLocal.begin() as db:
        if public_demo and db.scalar(select(Organization.id).where(Organization.id != org_id).limit(1)):
            raise SystemExit("Public demo provisioning requires a dedicated demo database")
        if db.get(Organization, org_id):
            added = seed_additional_subscriptions(db, org_id, reference)
            print(f"Demo preserved; added {added} missing supplemental subscriptions.")
            return
        org = Organization(id=org_id, name="Northstar Studio", timezone="Europe/Lisbon", currency="EUR")
        db.add(org)
        db.flush()
        for role, email, name in [
            ("admin", config.demo_admin_email, "Alex Morgan"),
            ("viewer", config.demo_viewer_email, "Jamie Chen"),
        ]:
            if public_demo and role != "viewer":
                continue
            user = db.scalar(select(User).where(User.email == email.lower()))
            if user is None:
                user = User(
                    id=seed_id(role),
                    email=email.lower(),
                    name=name,
                    password_hash=hasher.hash(config.demo_password),
                )
                db.add(user)
                db.flush()
            db.add(
                Membership(
                    id=seed_id(role + "membership"), user_id=user.id, organization_id=org_id, role=role
                )
            )
        plan_specs = [
            ("Launch", 2900, "monthly"),
            ("Growth", 7900, "monthly"),
            ("Scale", 19900, "monthly"),
            ("Growth Annual", 79000, "yearly"),
        ]
        plans = [
            Plan(
                id=seed_id("plan" + str(i)),
                organization_id=org_id,
                name=name,
                price_cents=price,
                interval=interval,
            )
            for i, (name, price, interval) in enumerate(plan_specs)
        ]
        db.add_all(plans)
        db.flush()
        first = [
            "Sofia",
            "Oliver",
            "Emma",
            "Lucas",
            "Amelia",
            "Noah",
            "Mia",
            "Leo",
            "Isabel",
            "Theo",
            "Clara",
            "Felix",
            "Eva",
            "Hugo",
            "Ada",
            "Liam",
        ]
        last = [
            "Silva",
            "Andersen",
            "Martin",
            "Weber",
            "Costa",
            "Dubois",
            "Jensen",
            "Rossi",
            "Meyer",
            "Taylor",
            "Novak",
            "Berg",
            "Pereira",
            "Walsh",
            "Moreau",
            "Klein",
        ]
        companies = [
            "Orbit",
            "Forma",
            "Layers",
            "Fable",
            "Outline",
            "Acme",
            "Prism",
            "Studio",
            "Beacon",
            "Arc",
        ]
        for i in range(320):
            created = reference - timedelta(days=round((1 - (i / 320) ** 0.7) * 1095) + rng.randint(0, 3))
            created = min(created, reference)
            name = first[i % len(first)] + " " + last[(i // len(first)) % len(last)]
            customer = Customer(
                id=seed_id("customer" + str(i)),
                organization_id=org_id,
                name=name,
                email=f"{name.lower().replace(' ', '.')}.{i + 1}@example.com",
                company=f"{companies[i % 10]} {['Labs', 'Studio', 'Technologies', 'Design'][i % 4]}",
                created_at=created,
                updated_at=created,
                status="archived" if i % 47 == 0 else "active",
            )
            db.add(customer)
            db.flush()
            plan = rng.choices(plans, weights=[30, 42, 18, 10])[0]
            status = "active"
            end = None
            if i % 7 == 0 and (reference - created).days > 50:
                status = "cancelled"
                end = min(created + timedelta(days=rng.randint(40, 210)), reference - timedelta(days=1))
            elif i > 305 and i % 3 == 0:
                status = "trial"
            elif i % 37 == 0:
                status = "expired"
                end = min(created + timedelta(days=30), reference)
            sub = Subscription(
                id=seed_id("subscription" + str(i)),
                organization_id=org_id,
                customer_id=customer.id,
                plan_id=plan.id,
                plan_name=plan.name,
                price_cents=plan.price_cents,
                interval=plan.interval,
                status=status,
                started_at=created,
                activated_at=None if status == "trial" else created,
                ends_at=end,
                cancelled_at=end if status == "cancelled" else None,
            )
            db.add(sub)
            db.flush()
            db.add(
                AuditLog(
                    organization_id=org_id,
                    action="customer.created",
                    resource_id=customer.id,
                    timestamp=created,
                    details={"source": "development seed"},
                )
            )
            db.add(
                AuditLog(
                    organization_id=org_id,
                    action="subscription.created",
                    resource_id=sub.id,
                    timestamp=created,
                    details={"customer_id": str(customer.id), "plan": plan.name},
                )
            )
            if end:
                db.add(
                    AuditLog(
                        organization_id=org_id,
                        action="subscription." + status,
                        resource_id=sub.id,
                        timestamp=end,
                        details={"customer_id": str(customer.id)},
                    )
                )
            bill_at = created
            bill_number = 0
            while status != "trial" and bill_at <= reference and (end is None or bill_at < end):
                roll = rng.random()
                tx_status = "paid" if roll < 0.91 else ("failed" if roll < 0.97 else "refunded")
                if (reference - bill_at).days < 3 and roll > 0.8:
                    tx_status = "pending"
                db.add(
                    Transaction(
                        id=seed_id(f"transaction-{i}-{bill_number}"),
                        organization_id=org_id,
                        customer_id=customer.id,
                        subscription_id=sub.id,
                        amount_cents=plan.price_cents,
                        currency="EUR",
                        status=tx_status,
                        timestamp=bill_at,
                        external_reference=f"SIM-{i + 1:04}-{bill_number + 1:03}",
                    )
                )
                bill_number += 1
                bill_at = add_months(created, bill_number * (12 if plan.interval == "yearly" else 1))
        seed_additional_subscriptions(db, org_id, reference)
        print(
            "Seeded Northstar Studio: 320 customers, 4 plans, multiple-subscription accounts and ledger history."
        )


def seed_additional_subscriptions(db, org_id: uuid.UUID, reference: datetime) -> int:
    """Add deterministic secondary products without changing any existing customer or billing records."""
    added = 0
    for i in range(0, 300, 11):
        sub_id = seed_id(f"secondary-subscription-{i}")
        if db.get(Subscription, sub_id):
            continue
        customer = db.get(Customer, seed_id("customer" + str(i)))
        plan = db.get(Plan, seed_id("plan" + str((i // 11 + 1) % 4)))
        if not customer or not plan:
            continue
        start = customer.created_at + timedelta(days=21 + i % 20)
        if start > reference:
            continue
        end = start + timedelta(days=75) if i % 3 == 0 else None
        if end and end > reference:
            end = None
        sub = Subscription(
            id=sub_id,
            organization_id=org_id,
            customer_id=customer.id,
            plan_id=plan.id,
            plan_name=plan.name,
            price_cents=plan.price_cents,
            interval=plan.interval,
            status="cancelled" if end else "active",
            started_at=start,
            activated_at=start,
            ends_at=end,
            cancelled_at=end,
        )
        db.add(sub)
        db.flush()
        db.add(
            AuditLog(
                organization_id=org_id,
                action="subscription.created",
                resource_id=sub.id,
                timestamp=start,
                details={"source": "supplemental development seed", "customer_id": str(customer.id)},
            )
        )
        if end:
            db.add(
                AuditLog(
                    organization_id=org_id,
                    action="subscription.cancelled",
                    resource_id=sub.id,
                    timestamp=end,
                    details={"customer_id": str(customer.id)},
                )
            )
        index = 0
        bill_at = start
        while bill_at <= reference and (end is None or bill_at < end):
            db.add(
                Transaction(
                    id=seed_id(f"secondary-payment-{i}-{index}"),
                    organization_id=org_id,
                    customer_id=customer.id,
                    subscription_id=sub.id,
                    amount_cents=sub.price_cents,
                    currency="EUR",
                    status="paid",
                    timestamp=bill_at,
                    external_reference=f"SIM-ADD-{i}-{index}",
                )
            )
            index += 1
            bill_at = add_months(start, index * (12 if sub.interval == "yearly" else 1))
        added += 1
    return added


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    seed()
