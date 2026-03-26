import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.getenv("DATABASE_URL")

engine = None
SessionLocal = None

if DATABASE_URL:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
else:
    print("WARNING: DATABASE_URL not set. Running in in-memory mode (data will be lost on restart).")


def get_db() -> Session:
    """FastAPI dependency — yields a session, ensures rollback on exception."""
    if not SessionLocal:
        raise RuntimeError("DATABASE_URL environment variable is required")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables. Call once at startup."""
    if not engine:
        return
    from .models import Base
    Base.metadata.create_all(bind=engine)
