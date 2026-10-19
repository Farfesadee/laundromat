"""Idempotent migration for customer email/password and Google identity.

`Base.metadata.create_all` creates new tables (including login_codes) but does
not add columns to an existing customers table. Run this once after deploying
the new code, before the first customer query:

    python -m app.scripts.migrate_customer_auth

It is safe to run more than once and works on both PostgreSQL and SQLite.
"""
from __future__ import annotations

from sqlalchemy import inspect, text

from app.core.database import Base, engine
from app import models  # noqa: F401  (register models with Base.metadata)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    columns = {column["name"] for column in inspect(engine).get_columns("customers")}
    with engine.begin() as conn:
        if "password_hash" not in columns:
            conn.execute(text("ALTER TABLE customers ADD COLUMN password_hash VARCHAR"))
        if "google_sub" not in columns:
            conn.execute(text("ALTER TABLE customers ADD COLUMN google_sub VARCHAR"))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_google_sub "
            "ON customers (google_sub)"
        ))
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_customers_email_lower_unique "
            "ON customers (lower(email)) WHERE email IS NOT NULL AND email <> ''"
        ))
    print("Customer auth migration complete.")


if __name__ == "__main__":
    main()
