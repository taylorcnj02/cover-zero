"""Endpoints for reading NFL schedules from the database."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter()


@router.get("/games", response_model=list[dict[str, Any]])
def list_games(
    season: int | None = Query(default=None, ge=1999, le=2100),
    week: int | None = Query(default=None, ge=1, le=22),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """Return schedule rows for a season and week, defaulting to latest data."""
    try:
        if season is None:
            season = db.execute(
                text("SELECT MAX(season) FROM schedules")
            ).scalar_one_or_none()
            if season is None:
                raise HTTPException(
                    status_code=503,
                    detail="No schedule data is loaded. Run scripts/load_data.py first.",
                )

        if week is None:
            week = db.execute(
                text("SELECT MAX(week) FROM schedules WHERE season = :season"),
                {"season": season},
            ).scalar_one_or_none()
            if week is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"No schedule weeks were found for season {season}.",
                )

        rows = db.execute(
            text(
                """
                SELECT *
                FROM schedules
                WHERE season = :season AND week = :week
                ORDER BY gameday, gametime, game_id
                """
            ),
            {"season": season, "week": week},
        ).mappings().all()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "The schedules table is unavailable. Start the database and run "
                "scripts/load_data.py."
            ),
        ) from exc

    return [dict(row) for row in rows]
