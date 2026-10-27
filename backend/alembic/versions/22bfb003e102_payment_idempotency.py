"""Persist organization-scoped simulated payment idempotency keys."""

import sqlalchemy as sa

from alembic import op

revision = "22bfb003e102"
down_revision = "c280fdeb5b5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("transactions") as batch:
        batch.add_column(sa.Column("idempotency_key", sa.String(36), nullable=True))
        batch.create_unique_constraint(
            "uq_transaction_org_idempotency", ["organization_id", "idempotency_key"]
        )


def downgrade() -> None:
    with op.batch_alter_table("transactions") as batch:
        batch.drop_constraint("uq_transaction_org_idempotency", type_="unique")
        batch.drop_column("idempotency_key")
