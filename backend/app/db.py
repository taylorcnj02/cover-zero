"""SQLAlchemy engine and database session setup."""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Iterator[Session]:
    # A SQLAlchemy session groups database work for one request; always close it.
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
