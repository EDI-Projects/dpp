"""
Database connection — PostgreSQL is REQUIRED.

Set DATABASE_URL in your .env or environment. The app will not start without it.
"""

import os
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL environment variable is required. "
        "Set it in backend/.env or your environment. "
        "Example: postgresql://dpp_user:password@localhost:5432/dpp_db"
    )

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)

# Backward compat — always True now
DB_AVAILABLE = True


def get_db() -> Session:
    """FastAPI dependency — yields a session, ensures close on exit."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables. Call once at startup."""
    from .models import Base
    Base.metadata.create_all(bind=engine)
