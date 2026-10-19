"""Create or activate the first owner account from environment variables.

Never hardcode credentials. Run once during provisioning, for example:

    OWNER_EMAIL=you@example.com OWNER_PASSWORD=... OWNER_PIN=1234 \
        python -m app.scripts.create_owner

If the email already exists, its role is set to owner, it is re-activated,
and its password and PIN are updated to the supplied values. This is the
only supported bootstrap path, because /api/v1/users itself requires an
owner.
"""
from __future__ import annotations
import os
import sys

from app.core import security as sec
from app.core.config import settings
from app.core.database import SessionLocal, init_db
from app.models import User


def _required(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        print(f"{name} is required", file=sys.stderr)
        sys.exit(2)
    return value


def main() -> int:
    email = _required("OWNER_EMAIL").lower()
    password = _required("OWNER_PASSWORD")
    pin = _required("OWNER_PIN")
    name = (os.getenv("OWNER_NAME") or "Owner").strip()[:80]
    if not pin.isdigit() or len(pin) != 4:
        print("OWNER_PIN must be exactly 4 digits", file=sys.stderr)
        return 2
    sec.validate_password(password)

    init_db()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            user.role = "owner"
            user.is_active = True
            user.name = name or user.name
            user.password_hash = sec.hash_password(password)
            user.pin_hash = sec.hash_pin(pin)
            action = "updated"
        else:
            db.add(User(store_id=settings.STORE_ID, email=email, name=name, role="owner",
                        password_hash=sec.hash_password(password), pin_hash=sec.hash_pin(pin)))
            action = "created"
        db.commit()
        print(f"owner {email} {action}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
