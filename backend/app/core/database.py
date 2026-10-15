"""Sync SQLAlchemy engine (SQLite by default, Postgres via DATABASE_URL)."""
from __future__ import annotations
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.core.config import settings

url = settings.DATABASE_URL
# Allow running from repo root or backend/ : normalise sqlite relative path to backend/
if url.startswith("sqlite") and not url.startswith("sqlite:////"):
    # sqlite:///./spinease.db -> place next to backend/
    db_file = url.split("sqlite:///")[-1]
    if not os.path.isabs(db_file):
        here = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        # here == backend/
        url = f"sqlite:///{os.path.join(here, os.path.basename(db_file))}"

connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
engine = create_engine(url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    import app.models  # noqa: F401  (register tables)
    Base.metadata.create_all(bind=engine)
